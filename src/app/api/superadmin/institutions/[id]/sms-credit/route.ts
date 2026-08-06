import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// POST /api/superadmin/institutions/[id]/sms-credit - SMS kredisi ekle/çıkar
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json();
  const amount = Number(body.amount);
  if (!amount || isNaN(amount)) return NextResponse.json({ message: "Geçersiz miktar" }, { status: 400 });
  if (!Number.isInteger(amount)) return NextResponse.json({ message: "Miktar tam sayi olmali" }, { status: 400 });
  if (Math.abs(amount) > 5_000_000) return NextResponse.json({ message: "Tek işlemde en fazla 5.000.000 SMS düzenlenebilir" }, { status: 400 });

  const institution = await prisma.institution.findUnique({ where: { id: params.id } });
  if (!institution) return NextResponse.json({ message: "Klinik bulunamadı" }, { status: 404 });

  const result = await prisma.$transaction(async (tx) => {
    const wallet = await tx.platformSmsWallet.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, availableBalance: 0 },
    });
    // Cüzdan ve klinik satırlarını aynı sırada kilitle. Eşzamanlı iki kredi
    // düzenlemesi artık eski bakiyeyi okuyup negatif/lost-update üretemez.
    await tx.$queryRaw`SELECT "id" FROM "PlatformSmsWallet" WHERE "id" = ${wallet.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Institution" WHERE "id" = ${params.id} FOR UPDATE`;
    const [currentWallet, currentInstitution] = await Promise.all([
      tx.platformSmsWallet.findUniqueOrThrow({ where: { id: wallet.id } }),
      tx.institution.findUniqueOrThrow({ where: { id: params.id } }),
    ]);

    if (amount > 0) {
      if (currentWallet.availableBalance < amount) {
        return { error: `Platform stok yetersiz. Mevcut: ${currentWallet.availableBalance}, Istek: ${amount}` };
      }

      const [updatedInstitution, updatedWallet] = await Promise.all([
        tx.institution.update({
          where: { id: params.id },
          data: { smsBalance: { increment: amount } },
        }),
        tx.platformSmsWallet.update({
          where: { id: wallet.id },
          data: { availableBalance: { decrement: amount } },
        }),
      ]);

      return {
        appliedAmount: amount,
        institutionBalance: updatedInstitution.smsBalance,
        walletBalance: updatedWallet.availableBalance,
      };
    }

    const removable = Math.min(currentInstitution.smsBalance, Math.abs(amount));
    const [updatedInstitution, updatedWallet] = await Promise.all([
      tx.institution.update({
        where: { id: params.id },
        data: { smsBalance: { decrement: removable } },
      }),
      tx.platformSmsWallet.update({
        where: { id: wallet.id },
        data: { availableBalance: { increment: removable } },
      }),
    ]);

    return {
      appliedAmount: -removable,
      institutionBalance: updatedInstitution.smsBalance,
      walletBalance: updatedWallet.availableBalance,
    };
  });

  if ("error" in result) {
    return NextResponse.json({ message: result.error }, { status: 400 });
  }

  await writeAudit(
    auth.user.id,
    "SMS_CREDIT_ADJUST",
    `${institution.name} SMS duzenleme: ${result.appliedAmount > 0 ? "+" : ""}${result.appliedAmount}`,
  );

  return NextResponse.json({
    smsBalance: result.institutionBalance,
    platformAvailableBalance: result.walletBalance,
    appliedAmount: result.appliedAmount,
  });
}
