import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { clinicTaskCreateSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("dashboard:read");
    if (auth.error) return auth.error;

    if (!auth.user.institutionId) {
      return NextResponse.json({ message: "Kurum baglantisi bulunamadi" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const patientId = sp.get("patientId") || undefined;
    const assignedToId = sp.get("assignedToId") || undefined;
    const scope = sp.get("scope") || "";
    const status = sp.get("status") || undefined;
    const q = (sp.get("q") || "").trim();
    const take = Math.max(1, Math.min(200, Number(sp.get("take") || 100) || 100));

    const tasks = await prisma.clinicTask.findMany({
      where: {
        institutionId: auth.user.institutionId,
        patientId,
        assignedToId,
        assignees: scope === "mine" ? { some: { userId: auth.user.id } } : undefined,
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
        assignedTo: { select: { id: true, fullName: true } },
        assignees: { include: { user: { select: { id: true, fullName: true, role: true } } } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take,
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("[clinic-tasks GET] fallback:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("dashboard:read");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum baglantisi bulunamadi" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = clinicTaskCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz görev verisi" }, { status: 400 });
  }

  const p = parsed.data;

  const requestedAssignees = Array.from(new Set([...(p.assignedToIds || []), ...(p.assignedToId ? [p.assignedToId] : [])].filter(Boolean)));
  if (requestedAssignees.length) {
    const assignees = await prisma.user.findMany({
      where: { id: { in: requestedAssignees }, institutionId: auth.user.institutionId },
      select: { id: true },
    });
    if (assignees.length !== requestedAssignees.length) {
      return NextResponse.json({ message: "Atanan personellerden bazi kayitlar kurumda bulunamadi" }, { status: 400 });
    }
  }

  let task;
  try {
    task = await prisma.clinicTask.create({
      data: {
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
        assignedTo: { select: { id: true, fullName: true } },
        assignees: { include: { user: { select: { id: true, fullName: true, role: true } } } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  } catch (error) {
    console.error("[clinic-tasks POST] fallback:", error);
    return NextResponse.json({ message: "Görev oluşturulamadı" }, { status: 503 });
  }

  await writeAudit(auth.user.id, "CLINIC_TASK_CREATE", `${task.title} (oncelik:${task.priority}, durum:${task.status})`);

  return NextResponse.json(task, { status: 201 });
}
