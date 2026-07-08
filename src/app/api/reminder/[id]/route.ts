import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

function reminderTenantWhere(id: string, institutionId: string | null | undefined, role: string) {
  return {
    id,
    ...(role !== "SUPERADMIN"
      ? {
          OR: [
            { patient: { institutionId } },
            { plan: { patient: { institutionId } } },
          ],
        }
      : {}),
  };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("appointments:write");
    if (auth.error) return auth.error;
    if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

    const body = await req.json();
    const existing = await (prisma as any).reminder.findFirst({
      where: reminderTenantWhere(params.id, auth.user.institutionId, auth.user.role),
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Hatırlatma bulunamadı" }, { status: 404 });

    const r = await (prisma as any).reminder.update({
      where: { id: params.id },
      data: {
        ...(body.note !== undefined ? { note: String(body.note) } : {}),
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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
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
