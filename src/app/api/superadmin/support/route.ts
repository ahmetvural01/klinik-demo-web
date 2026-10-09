import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 30;

// Talep durumu: yanıt bekleyen (answer boş ve kapatılmamış), yanıtlanan
// (answer dolu, kapatılmamış), kapatılan (status CLOSED). Filtre ve sayaçlar
// sunucuda hesaplanır; önceden ilk 30 kayıt içinde tarayıcıda süzülüyordu,
// daha eski açık talepler hiçbir filtrede görünmüyordu.
function statusWhere(status: string): Prisma.SupportTicketWhereInput {
  if (status === "open") return { answer: null, status: { not: "CLOSED" } };
  if (status === "answered") return { answer: { not: null }, status: { not: "CLOSED" } };
  if (status === "closed") return { status: "CLOSED" };
  return {};
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";
  const q = (searchParams.get("q") || "").trim();
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);

  const search: Prisma.SupportTicketWhereInput = q
    ? {
        OR: [
          { subject: { contains: q, mode: "insensitive" } },
          { message: { contains: q, mode: "insensitive" } },
          { institution: { name: { contains: q, mode: "insensitive" } } },
          { user: { fullName: { contains: q, mode: "insensitive" } } },
        ],
      }
    : {};
  const where: Prisma.SupportTicketWhereInput = { AND: [statusWhere(status), search] };

  const [total, tickets, open, answered, closed] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: status === "open" ? "asc" : "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { fullName: true, role: true, email: true, institution: { select: { id: true, name: true } } } },
        institution: { select: { id: true, name: true } },
      },
    }),
    prisma.supportTicket.count({ where: { AND: [statusWhere("open"), search] } }),
    prisma.supportTicket.count({ where: { AND: [statusWhere("answered"), search] } }),
    prisma.supportTicket.count({ where: { AND: [statusWhere("closed"), search] } }),
  ]);

  return NextResponse.json({
    tickets: tickets.map((ticket) => ({
      ...ticket,
      // Talebin kurum bağı boşsa kullanıcının kliniği gösterilir (ham kimlik değil).
      institution: ticket.institution ?? ticket.user?.institution ?? null,
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: { open, answered, closed },
  });
}

/**
 * PATCH { id, answer } → yanıt kaydeder. PATCH { id, action: "close" | "reopen" }
 * → talebi kapatır / yeniden açar (kayıt silinmez; önceden tek seçenek kalıcı
 * silmeydi).
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json().catch(() => null) as { id?: unknown; answer?: unknown; action?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ message: "Talep seçilmedi" }, { status: 400 });
  const existing = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true, subject: true, institution: { select: { name: true } } } });
  if (!existing) return NextResponse.json({ message: "Destek talebi bulunamadı" }, { status: 404 });
  const label = `${existing.institution?.name ? `${existing.institution.name} / ` : ""}${existing.subject}`;

  if (body?.action === "close" || body?.action === "reopen") {
    const closing = body.action === "close";
    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: closing ? { status: "CLOSED", closedAt: new Date(), closedById: auth.user.id } : { status: "OPEN", closedAt: null, closedById: null },
    });
    await writeAudit(auth.user.id, "SUPERADMIN_SUPPORT_STATUS", `Destek talebi ${closing ? "kapatıldı" : "yeniden açıldı"}: ${label}`);
    return NextResponse.json(ticket);
  }

  const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
  if (!answer) return NextResponse.json({ message: "Yanıt metnini yazın" }, { status: 400 });
  if (answer.length > 5000) return NextResponse.json({ message: "Yanıt en fazla 5000 karakter olabilir" }, { status: 400 });

  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: { answer },
  });

  await writeAudit(auth.user.id, "SUPERADMIN_SUPPORT_ANSWER", `Destek talebi yanıtlandı: ${label}`);
  return NextResponse.json(ticket);
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ message: "id zorunlu" }, { status: 400 });

  const existing = await prisma.supportTicket.findUnique({ where: { id }, select: { subject: true, user: { select: { fullName: true } } } });
  await prisma.supportTicket.delete({ where: { id } });
  await writeAudit(auth.user.id, "SUPERADMIN_SUPPORT_DELETE", `Destek talebi silindi: ${existing?.subject || id} / ${existing?.user?.fullName || "-"}`);
  return NextResponse.json({ ok: true });
}
