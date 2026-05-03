import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

type Params = { params: { id: string } };

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;

  await prisma.payment.delete({ where: { id: params.id } });
  await writeAudit(auth.user.id, "PAYMENT_DELETE", `Ödeme silindi (${params.id})`);

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const existing = await prisma.payment.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ message: "Ödeme bulunamadı" }, { status: 404 });
  }

  const payment = await prisma.payment.update({
    where: { id: params.id },
    data: {
      amount: body.amount !== undefined ? Number(body.amount) : undefined,
      method: body.method,
      description: body.description,
    }
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

  pushDiff("Tutar", Number(existing.amount), Number(payment.amount));
  pushDiff("Yöntem", existing.method, payment.method);
  pushDiff("Açıklama", existing.description, payment.description);

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından ödeme kaydı güncellendi.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

  await writeAudit(auth.user.id, "PAYMENT_UPDATE", detail);
  return NextResponse.json(payment);
}
