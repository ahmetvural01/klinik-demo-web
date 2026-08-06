import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { clinicTaskCreateSchema } from "@/lib/validators";
import { can } from "@/lib/rbac";
import type { Role } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("clinictasks:read");
    if (auth.error) return auth.error;

    if (!auth.user.institutionId) {
      return NextResponse.json({ message: "Kurum bağlantısı bulunamadı." }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const patientId = sp.get("patientId") || undefined;
    const assignedToId = sp.get("assignedToId") || undefined;
    const scope = sp.get("scope") || "";
    const status = sp.get("status") || undefined;
    const q = (sp.get("q") || "").trim();
    const take = Math.max(1, Math.min(500, Number(sp.get("take") || 100) || 100));
    if (!["", "mine", "all"].includes(scope)) {
      return NextResponse.json({ message: "Geçersiz görev kapsamı" }, { status: 400 });
    }
    if (scope === "all" && !(await can(auth.user.role as Role, "clinictasks:read-all"))) {
      return NextResponse.json({ message: "Tüm kurum görevlerini görüntüleme yetkiniz yok" }, { status: 403 });
    }
    if (status && !new Set(["ACIK", "BEKLEMEDE", "TAMAMLANDI", "IPTAL"]).has(status)) {
      return NextResponse.json({ message: "Geçersiz görev durumu" }, { status: 400 });
    }

    const tasks = await prisma.clinicTask.findMany({
      where: {
        institutionId: auth.user.institutionId,
        patientId,
        AND: [
          ...(scope === "mine" ? [{
            OR: [
              { assignedToId: auth.user.id },
              { assignees: { some: { userId: auth.user.id } } },
            ],
          }] : []),
          ...(assignedToId ? [{
            OR: [
              { assignedToId },
              { assignees: { some: { userId: assignedToId } } },
            ],
          }] : []),
        ],
        status: status as any,
        OR: q
          ? [
              { title: { contains: q, mode: "insensitive" } },
              { details: { contains: q, mode: "insensitive" } },
              { vendorName: { contains: q, mode: "insensitive" } },
              { patient: { fullName: { contains: q, mode: "insensitive" } } },
            ]
          : undefined,
      },
      include: {
        patient: { select: { id: true, fullName: true, phone: true } },
        assignedTo: { select: { id: true, fullName: true, isActive: true } },
        assignees: { include: { user: { select: { id: true, fullName: true, role: true, isActive: true } } } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take,
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("[clinic-tasks GET] fallback:", error);
    return NextResponse.json({ message: "Görevler yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("clinictasks:write");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bağlantısı bulunamadı." }, { status: 403 });
  }

  const requestKey = request.headers.get("Idempotency-Key")?.trim() || null;
  if (requestKey && (requestKey.length < 8 || requestKey.length > 180)) {
    return NextResponse.json({ message: "İşlem anahtarı geçersiz" }, { status: 400 });
  }
  if (requestKey) {
    const existingTask = await prisma.clinicTask.findUnique({
      where: { requestKey },
      include: {
        patient: { select: { id: true, fullName: true, phone: true } },
        assignedTo: { select: { id: true, fullName: true, isActive: true } },
        assignees: { include: { user: { select: { id: true, fullName: true, role: true, isActive: true } } } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (existingTask) {
      if (existingTask.institutionId !== auth.user.institutionId) {
        return NextResponse.json({ message: "İşlem anahtarı başka bir kuruma ait" }, { status: 409 });
      }
      return NextResponse.json(existingTask);
    }
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const parsed = clinicTaskCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz görev verisi" }, { status: 400 });
  }

  const p = parsed.data;

  if (p.patientId) {
    const patient = await prisma.patient.findFirst({
      where: { id: p.patientId, institutionId: auth.user.institutionId, archivedAt: null },
      select: { id: true },
    });
    if (!patient) {
      return NextResponse.json({ message: "Hasta bu kuruma bağlı değil veya arşivlenmiş" }, { status: 400 });
    }
  }
  if (p.dueAt && p.remindAt && new Date(p.remindAt) > new Date(p.dueAt)) {
    return NextResponse.json({ message: "Hatırlatma zamanı son tarihten sonra olamaz" }, { status: 400 });
  }
  if (p.dueAt && new Date(p.dueAt).getTime() < Date.now() - 5 * 60 * 1000) {
    return NextResponse.json({ message: "Yeni görevin son tarihi geçmişte olamaz" }, { status: 400 });
  }

  const requestedAssignees = Array.from(new Set([...(p.assignedToIds || []), ...(p.assignedToId ? [p.assignedToId] : [])].filter(Boolean)));
  if (requestedAssignees.length) {
    // isActive kontrolü yoktu — pasifleştirilmiş (işten ayrılmış) bir
    // personele hâlâ yeni görev atanabiliyordu (bkz. denetim raporu).
    const assignees = await prisma.user.findMany({
      where: { id: { in: requestedAssignees }, institutionId: auth.user.institutionId, isActive: true },
      select: { id: true },
    });
    if (assignees.length !== requestedAssignees.length) {
      return NextResponse.json({ message: "Atanan personellerden bazıları kurumda bulunamadı veya artık aktif değil." }, { status: 400 });
    }
  }

  let task;
  try {
    task = await prisma.clinicTask.create({
      data: {
        requestKey,
        institutionId: auth.user.institutionId,
        patientId: p.patientId || null,
        title: p.title,
        details: p.details || null,
        vendorName: p.vendorName || null,
        type: p.type,
        priority: p.priority,
        status: p.status,
        dueAt: p.dueAt ? new Date(p.dueAt) : null,
        remindAt: p.remindAt ? new Date(p.remindAt) : null,
        assignedToId: requestedAssignees[0] || null,
        assignees: requestedAssignees.length ? {
          create: requestedAssignees.map((userId) => ({ userId })),
        } : undefined,
        createdById: auth.user.id,
        completedAt: p.status === "TAMAMLANDI" ? new Date() : null,
      },
      include: {
        patient: { select: { id: true, fullName: true, phone: true } },
        assignedTo: { select: { id: true, fullName: true, isActive: true } },
        assignees: { include: { user: { select: { id: true, fullName: true, role: true, isActive: true } } } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  } catch (error) {
    if (requestKey && error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      const concurrent = await prisma.clinicTask.findUnique({
        where: { requestKey },
        include: {
          patient: { select: { id: true, fullName: true, phone: true } },
          assignedTo: { select: { id: true, fullName: true, isActive: true } },
          assignees: { include: { user: { select: { id: true, fullName: true, role: true, isActive: true } } } },
          createdBy: { select: { id: true, fullName: true } },
        },
      });
      if (concurrent?.institutionId === auth.user.institutionId) return NextResponse.json(concurrent);
    }
    console.error("[clinic-tasks POST] fallback:", error);
    return NextResponse.json({ message: "Görev oluşturulamadı" }, { status: 503 });
  }

  await writeAudit(auth.user.id, "CLINIC_TASK_CREATE", `${task.title} (oncelik:${task.priority}, durum:${task.status})`);

  return NextResponse.json(task, { status: 201 });
}
