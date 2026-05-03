import { NextRequest, NextResponse } from "next/server";
import { paymentSchema } from "@/lib/validators";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

type Params = { params: { id: string } };

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

export async function GET(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("finance:read");
  if (auth.error) return auth.error;

  const payment = await prisma.payment.findUnique({
    where: { id: params.id },
    include: { patient: true }
  });

  if (!payment) {
    return NextResponse.json({ message: "Ödeme bulunamadı" }, { status: 404 });
  }

  return NextResponse.json(payment);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAuth("finance:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const parsed = paymentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz ödeme verisi" }, { status: 400 });
  }

  const existing = await prisma.payment.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ message: "Ödeme bulunamadı" }, { status: 404 });
  }

  const payment = await prisma.payment.update({
    where: { id: params.id },
    data: parsed.data
  });

  const beforeParts: string[] = [];
  const afterParts: string[] = [];
  const pushDiff = (label: string, before: unknown, after: unknown) => {
    const b = fmt(before);
    const a = fmt(after);
    if (b !== a) {
      beforeParts.push(`${label}: ${b}`);
      afterParts.push(`${label}: ${a}`);
    }
  };

  pushDiff("Tutar", Number(existing.amount), Number(parsed.data.amount));
  pushDiff("Yöntem", existing.method, parsed.data.method);
  pushDiff("Açıklama", existing.description, parsed.data.description);
  pushDiff("Hasta", existing.patientId, parsed.data.patientId);
  pushDiff("Doktor", existing.doctorId, parsed.data.doctorId);
  pushDiff("POS", existing.posId, parsed.data.posId);

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından ödeme kaydı güncellendi.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

  await writeAudit(auth.user.id, "PAYMENT_UPDATE", detail);
  return NextResponse.json(payment);
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("finance:write");
  if (auth.error) return auth.error;

  const payment = await prisma.payment.delete({ where: { id: params.id } });
  await writeAudit(auth.user.id, "PAYMENT_DELETE", `${payment.amount.toString()} ödeme silindi`);

  return NextResponse.json({ ok: true });
}
