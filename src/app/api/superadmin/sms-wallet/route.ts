import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { testProviderBalance } from "@/lib/sms";

function parseSmsCount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,]/g, "").trim();
  if (!cleaned) return null;

  // "12.345" -> 12345, "12345" -> 12345, "12345,67" -> 12345
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    const normalized = cleaned.replace(/\./g, "").split(",")[0];
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const normalized = cleaned.replace(/,/g, ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const wallet = await prisma.platformSmsWallet.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, availableBalance: 0 },
  });

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

  // Aktif sağlayıcı varsa bakiye çekip platform stokunu otomatik senkronla.
  const activeProvider = await prisma.smsProviderConfig.findFirst({
    where: { isActive: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  let providerSync: {
    providerCode?: string;
    providerBalance?: number;
    ok: boolean;
    message?: string;
  } = { ok: false, message: "Aktif saglayici yok" };

  let effectiveWallet = wallet;

  if (activeProvider) {
    const balanceResult = await testProviderBalance(activeProvider.id);
    const parsedProviderBalance = parseSmsCount(balanceResult.balance || balanceResult.raw);

    if (balanceResult.success && parsedProviderBalance != null) {
      const allocatedToClinics = institutions.reduce((sum, i) => sum + i.smsBalance, 0);
      const computedAvailable = Math.max(0, parsedProviderBalance - allocatedToClinics);

      effectiveWallet = await prisma.platformSmsWallet.update({
        where: { id: wallet.id },
        data: { availableBalance: computedAvailable },
      });

      providerSync = {
        ok: true,
        providerCode: activeProvider.code,
        providerBalance: parsedProviderBalance,
        message: `Saglayici bakiyesi ile senkronlandi. Kliniklere ayrilan: ${allocatedToClinics}`,
      };
    } else {
      providerSync = {
        ok: false,
        providerCode: activeProvider.code,
        message: balanceResult.error || "Saglayici bakiyesi okunamadi",
      };
    }
  }

  return NextResponse.json({
    wallet: effectiveWallet,
    providerSync,
    totals: {
      totalAssignedToClinics: institutions.reduce((sum, i) => sum + i.smsBalance, 0),
      totalProviderBalance: providerSync.ok ? providerSync.providerBalance || 0 : effectiveWallet.availableBalance + institutions.reduce((sum, i) => sum + i.smsBalance, 0),
      totalSystemSms: effectiveWallet.availableBalance + institutions.reduce((sum, i) => sum + i.smsBalance, 0),
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
    return NextResponse.json({ message: "Gecersiz SMS adedi" }, { status: 400 });
  }

  if (unitCost != null && (Number.isNaN(unitCost) || unitCost < 0 || unitCost > 100)) {
    return NextResponse.json({ message: "Gecersiz birim maliyet" }, { status: 400 });
  }

  if (!provider) {
    return NextResponse.json({ message: "Saglayici zorunludur" }, { status: 400 });
  }

  if (!note || note.length < 3 || note.length > 500) {
    return NextResponse.json({ message: "Not alani zorunlu (3-500 karakter)" }, { status: 400 });
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
    `Platforma ${quantity} SMS stok kaydi eklendi. Saglayici: ${provider}`
  );

  return NextResponse.json({
    message: `${quantity.toLocaleString("tr-TR")} SMS platform stokuna eklendi`,
    availableBalance: result.updatedWallet.availableBalance,
    purchaseId: result.purchase.id,
  });
}
