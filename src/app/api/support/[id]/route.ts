import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

function supportTenantWhere(id: string, role: string, institutionId: string | null | undefined) {
  return {
    id,
    ...(role !== "SUPERADMIN" ? { institutionId } : {}),
  };
}

export async function GET(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("support:read");
  if (auth.error) return auth.error;

  const ticket = await prisma.supportTicket.findFirst({
    where: supportTenantWhere(params.id, auth.user.role, auth.user.institutionId),
    include: { user: { select: { id: true, fullName: true, role: true, institutionId: true } } }
  });

  if (!ticket) {
    return NextResponse.json({ message: "Destek kaydı bulunamadı" }, { status: 404 });
  }

  return NextResponse.json(ticket);
}

export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("support:write");
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const existing = await prisma.supportTicket.findFirst({
    where: supportTenantWhere(params.id, auth.user.role, auth.user.institutionId),
  });
  if (!existing) {
    return NextResponse.json({ message: "Destek kaydı bulunamadı" }, { status: 404 });
  }

  // "answer" alanı yalnızca destek ekibinin (süperadmin) resmi yanıtını
  // temsil eder — önceden aynı kurumdaki herhangi bir kullanıcı bu alanı
  // kendi isteğiyle doldurup talebin resmi olarak yanıtlanmış gibi
  // görünmesini sağlayabiliyordu (bkz. denetim raporu).
  if (body.answer !== undefined && auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yanıt alanını yalnızca destek ekibi düzenleyebilir." }, { status: 403 });
  }
  const subject = body.subject !== undefined ? String(body.subject).trim() : undefined;
  const message = body.message !== undefined ? String(body.message).trim() : undefined;
  const answer = body.answer !== undefined ? String(body.answer).trim() : undefined;
  if (subject !== undefined && (!subject || subject.length > 120)) {
    return NextResponse.json({ message: "Konu 1-120 karakter olmalıdır." }, { status: 400 });
  }
  if (message !== undefined && (!message || message.length > 5_000)) {
    return NextResponse.json({ message: "Mesaj 1-5000 karakter olmalıdır." }, { status: 400 });
  }
  if (answer !== undefined && (!answer || answer.length > 10_000)) {
    return NextResponse.json({ message: "Yanıt 1-10000 karakter olmalıdır." }, { status: 400 });
  }
  if (subject === undefined && message === undefined && answer === undefined) {
    return NextResponse.json({ message: "Güncellenecek alan bulunamadı." }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.update({
    where: { id: params.id },
    data: {
      ...(subject !== undefined && { subject }),
      ...(message !== undefined && { message }),
      ...(answer !== undefined && { answer }),
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

  pushDiff("Konu", existing.subject, ticket.subject);
  pushDiff("Mesaj", existing.message, ticket.message);
  pushDiff("Yanıt", existing.answer, ticket.answer);

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından destek talebi güncellendi.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

  await writeAudit(auth.user.id, "SUPPORT_UPDATE", detail);
  return NextResponse.json(ticket);
}

export async function DELETE(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("support:write");
  if (auth.error) return auth.error;

  const existing = await prisma.supportTicket.findFirst({
    where: supportTenantWhere(params.id, auth.user.role, auth.user.institutionId),
    select: { id: true, subject: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "Destek kaydı bulunamadı" }, { status: 404 });
  }

  const ticket = await prisma.supportTicket.delete({ where: { id: params.id } });
  await writeAudit(auth.user.id, "SUPPORT_DELETE", `Destek talebi silindi (${ticket.subject})`);

  return NextResponse.json({ ok: true });
}
