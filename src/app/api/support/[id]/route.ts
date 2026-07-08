import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

type Params = { params: { id: string } };

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

function supportTenantWhere(id: string, role: string, institutionId: string | null | undefined) {
  return {
    id,
    ...(role !== "SUPERADMIN" ? { user: { institutionId } } : {}),
  };
}

export async function GET(_: NextRequest, { params }: Params) {
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

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAuth("support:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const existing = await prisma.supportTicket.findFirst({
    where: supportTenantWhere(params.id, auth.user.role, auth.user.institutionId),
  });
  if (!existing) {
    return NextResponse.json({ message: "Destek kaydı bulunamadı" }, { status: 404 });
  }

  const ticket = await prisma.supportTicket.update({
    where: { id: params.id },
    data: {
      subject: body.subject,
      message: body.message,
      answer: body.answer
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

export async function DELETE(_: NextRequest, { params }: Params) {
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
