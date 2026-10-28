import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

/** Süperadmin › Faturalar › "Ödeme bilgisi": kliniklerin göreceği IBAN ve açıklama. */
export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  const config = await prisma.platformBillingConfig.findUnique({ where: { id: 1 } });
  return NextResponse.json({ paymentInstructions: config?.paymentInstructions ?? "" });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { paymentInstructions?: unknown } | null;
  const paymentInstructions = typeof body?.paymentInstructions === "string" ? body.paymentInstructions.trim() : "";
  if (paymentInstructions.length > 1_000) {
    return NextResponse.json({ message: "Ödeme bilgisi en fazla 1000 karakter olabilir" }, { status: 400 });
  }
  await prisma.platformBillingConfig.upsert({
    where: { id: 1 },
    update: { paymentInstructions },
    create: { id: 1, paymentInstructions },
  });
  await writeAudit(auth.user.id, "SUPERADMIN_BILLING_CONFIG_UPDATE", "Kliniklere gösterilen ödeme bilgisi güncellendi");
  return NextResponse.json({ paymentInstructions });
}
