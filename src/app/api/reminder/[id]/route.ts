import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";

function reminderTenantWhere(id: string, institutionId: string | null | undefined, role: string, branchId: string | null) {
  return {
    id,
    ...(institutionId || role !== "SUPERADMIN"
      ? {
          OR: [
            { patient: { institutionId, ...(branchId ? { homeBranchId: branchId } : {}) } },
            { plan: { institutionId, ...(branchId ? { branchId } : {}) } },
          ],
        }
      : {}),
  };
}

const USER_REMINDER_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  AKTIF: new Set(["AKTIF", "TAMAMLANDI"]),
  BASARISIZ: new Set(["BASARISIZ", "AKTIF"]),
  GONDERILIYOR: new Set(["GONDERILIYOR"]),
  TAMAMLANDI: new Set(["TAMAMLANDI"]),
  IPTAL: new Set(["IPTAL"]),
};

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("appointments:write");
    if (auth.error) return auth.error;
    if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
    }
    const existing = await (prisma as any).reminder.findFirst({
      where: reminderTenantWhere(params.id, auth.user.institutionId, auth.user.role, branch.branchId),
      select: { id: true, institutionId: true, branchId: true, status: true },
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
    const nextStatus = body.status ?? existing.status;
    if (!USER_REMINDER_TRANSITIONS[existing.status]?.has(nextStatus)) {
      return NextResponse.json({ error: "Bu hatırlatma durum geçişine izin verilmiyor" }, { status: 409 });
    }
    if (["TAMAMLANDI", "IPTAL"].includes(existing.status)
        && (body.note !== undefined || body.reminderDate !== undefined)) {
      return NextResponse.json({ error: "Sonuçlanmış hatırlatma değiştirilemez" }, { status: 409 });
    }

    const changed = await (prisma as any).reminder.updateMany({
      where: { id: existing.id, institutionId: existing.institutionId, branchId: existing.branchId, status: existing.status },
      data: {
        ...(body.note !== undefined ? { note: body.note.trim() } : {}),
        ...(body.reminderDate !== undefined ? { reminderDate: new Date(body.reminderDate) } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      }
    });
    if (changed.count !== 1) {
      return NextResponse.json({ error: "Hatırlatma başka bir işlem tarafından değiştirildi; listeyi yenileyin" }, { status: 409 });
    }
    const r = await (prisma as any).reminder.findUnique({
      where: { id_institutionId_branchId: { id: existing.id, institutionId: existing.institutionId, branchId: existing.branchId } },
    });
    await writeAudit(auth.user.id, "REMINDER_UPDATE", `Hatırlatma güncellendi (${params.id})`);
    return NextResponse.json(r);
  } catch {
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
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

    const existing = await (prisma as any).reminder.findFirst({
      where: reminderTenantWhere(params.id, auth.user.institutionId, auth.user.role, branch.branchId),
      select: { id: true, institutionId: true, branchId: true, status: true },
    });
    if (!existing) return NextResponse.json({ error: "Hatırlatma bulunamadı" }, { status: 404 });

    if (["TAMAMLANDI", "IPTAL"].includes(existing.status)) {
      return existing.status === "IPTAL"
        ? NextResponse.json({ ok: true, alreadyCancelled: true })
        : NextResponse.json({ error: "Tamamlanmış hatırlatma iptal edilemez" }, { status: 409 });
    }
    const changed = await (prisma as any).reminder.updateMany({
      where: { id: existing.id, institutionId: existing.institutionId, branchId: existing.branchId, status: existing.status },
      data: { status: "IPTAL", nextAttemptAt: null },
    });
    if (changed.count !== 1) {
      return NextResponse.json({ error: "Hatırlatma başka bir işlem tarafından değiştirildi; listeyi yenileyin" }, { status: 409 });
    }
    await writeAudit(auth.user.id, "REMINDER_CANCEL", `Hatırlatma iptal edildi (${params.id})`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
