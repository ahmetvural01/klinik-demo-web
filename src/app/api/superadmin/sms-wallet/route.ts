import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const wallet = await prisma.platformSmsWallet.findUnique({ where: { id: 1 } }) || { id: 1, availableBalance: 0 };

  const [purchases, institutions] = await Promise.all([
    prisma.platformSmsPurchase.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.institution.findMany({
      select: {
        id: true,
        name: true,
        isActive: true,
        smsBalance: true,
      },
      orderBy: [{ smsBalance: "desc" }, { name: "asc" }],
    }),
  ]);

  return NextResponse.json({
    wallet,
    totals: {
      totalAssignedToClinics: institutions.reduce((sum, i) => sum + i.smsBalance, 0),
      clinicCountWithSms: institutions.filter((i) => i.smsBalance > 0).length,
    },
    institutions,
    purchases: purchases.map((p) => ({
      ...p,
      unitCost: p.unitCost ? Number(p.unitCost) : null,
      totalCost: p.totalCost ? Number(p.totalCost) : null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = await request.json() as {
    quantity?: number;
    unitCost?: number;
    provider?: string;
    note?: string;
  };

  const quantity = Number(body.quantity ?? 0);
  const unitCost = body.unitCost == null ? null : Number(body.unitCost);
  const provider = (body.provider || "").trim();
  const note = (body.note || "").trim();

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5000000) {
    return NextResponse.json({ message: "SMS adedi 1 ile 5.000.000 arasında tam sayı olmalı" }, { status: 400 });
  }

  if (unitCost != null && (Number.isNaN(unitCost) || unitCost < 0 || unitCost > 100)) {
    return NextResponse.json({ message: "Geçersiz birim maliyet" }, { status: 400 });
  }

  if (!provider) {
    return NextResponse.json({ message: "Sağlayıcıyı seçin" }, { status: 400 });
  }

  if (!note || note.length < 3 || note.length > 500) {
    return NextResponse.json({ message: "Not zorunlu (3-500 karakter): ör. sağlayıcı fatura veya sipariş no" }, { status: 400 });
  }

  const totalCost = unitCost == null ? null : Number((unitCost * quantity).toFixed(2));

  const result = await prisma.$transaction(async (tx) => {
    const wallet = await tx.platformSmsWallet.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, availableBalance: 0 },
    });

    const updatedWallet = await tx.platformSmsWallet.update({
      where: { id: wallet.id },
      data: { availableBalance: { increment: quantity } },
    });

    const purchase = await tx.platformSmsPurchase.create({
      data: {
        walletId: wallet.id,
        quantity,
        unitCost,
        totalCost,
        provider,
        note,
      },
    });

    return { updatedWallet, purchase };
  });

  await writeAudit(
    auth.user.id,
    "PLATFORM_SMS_PURCHASE",
    `Platforma ${quantity.toLocaleString("tr-TR")} SMS stok eklendi. Sağlayıcı: ${provider}. Not: ${note.slice(0, 120)}`
  );

  return NextResponse.json({
    message: `${quantity.toLocaleString("tr-TR")} SMS platform stokuna eklendi`,
    availableBalance: result.updatedWallet.availableBalance,
    purchaseId: result.purchase.id,
  });
}
