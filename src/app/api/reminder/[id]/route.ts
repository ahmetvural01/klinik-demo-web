import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

function reminderTenantWhere(id: string, institutionId: string | null | undefined, role: string) {
  return {
    id,
    ...(institutionId || role !== "SUPERADMIN"
      ? {
          OR: [
            { patient: { institutionId } },
            { plan: { patient: { institutionId } } },
          ],
        }
      : {}),
  };
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("appointments:write");
    if (auth.error) return auth.error;
    if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
    }
    const existing = await (prisma as any).reminder.findFirst({
      where: reminderTenantWhere(params.id, auth.user.institutionId, auth.user.role),
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Hatırlatma bulunamadı" }, { status: 404 });

    const validStatuses = new Set(["AKTIF", "TAMAMLANDI"]);
    if (body.status !== undefined && (typeof body.status !== "string" || !validStatuses.has(body.status))) {
      return NextResponse.json({ error: "Geçersiz hatırlatma durumu" }, { status: 400 });
    }
    if (body.reminderDate !== undefined && (typeof body.reminderDate !== "string" || Number.isNaN(new Date(body.reminderDate).getTime()))) {
      return NextResponse.json({ error: "Geçersiz hatırlatma tarihi" }, { status: 400 });
    }
    if (body.note !== undefined && (typeof body.note !== "string" || body.note.trim().length < 1 || body.note.trim().length > 1000)) {
      return NextResponse.json({ error: "Not 1-1000 karakter olmalıdır" }, { status: 400 });
    }
    if (body.note === undefined && body.reminderDate === undefined && body.status === undefined) {
      return NextResponse.json({ error: "Güncellenecek alan bulunamadı" }, { status: 400 });
    }

    const r = await (prisma as any).reminder.update({
      where: { id: params.id },
      data: {
        ...(body.note !== undefined ? { note: body.note.trim() } : {}),
        ...(body.reminderDate !== undefined ? { reminderDate: new Date(body.reminderDate) } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      }
    });
    await writeAudit(auth.user.id, "REMINDER_UPDATE", `Hatırlatma güncellendi (${params.id})`);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("appointments:write");
    if (auth.error) return auth.error;
    if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

    const existing = await (prisma as any).reminder.findFirst({
      where: reminderTenantWhere(params.id, auth.user.institutionId, auth.user.role),
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Hatırlatma bulunamadı" }, { status: 404 });

    await (prisma as any).reminder.delete({ where: { id: params.id } });
    await writeAudit(auth.user.id, "REMINDER_DELETE", `Hatırlatma silindi (${params.id})`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
