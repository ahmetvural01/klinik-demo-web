import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { patientFollowUpEventCreateSchema } from "@/lib/validators";

type Params = { params: { id: string } };

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth("appointments:read");
    if (auth.error) return auth.error;

    const institutionDoctors = auth.user.institutionId
      ? await prisma.user.findMany({
          where: { institutionId: auth.user.institutionId, role: "DOKTOR", isActive: true },
          select: { id: true },
        })
      : [];
    const doctorIds = institutionDoctors.map((doctor) => doctor.id);

    const followUp = await prisma.patientFollowUp.findUnique({
      where: { id: params.id },
      select: { id: true, doctorId: true, appointment: { select: { doctorId: true } }, createdBy: { select: { institutionId: true } } },
    });

    if (!followUp) {
      return NextResponse.json({ message: "Takip kaydı bulunamadı" }, { status: 404 });
    }

    if (auth.user.institutionId && doctorIds.length > 0) {
      const followUpDoctorId = followUp.doctorId || followUp.appointment?.doctorId || null;
      const sameInstitution = followUp.createdBy.institutionId === auth.user.institutionId || (followUpDoctorId ? doctorIds.includes(followUpDoctorId) : false);
      if (!sameInstitution) {
        return NextResponse.json({ message: "Takip kaydı kurum kapsamı dışında" }, { status: 403 });
      }
    }

    const events = await prisma.patientFollowUpEvent.findMany({
      where: { followUpId: params.id },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        updatedBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 500,
    });

    return NextResponse.json(events);
  } catch {
    return NextResponse.json({ message: "Veritabanı bağlantısı kurulamadı. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth("appointments:write");
    if (auth.error) return auth.error;

    const institutionDoctors = auth.user.institutionId
      ? await prisma.user.findMany({
          where: { institutionId: auth.user.institutionId, role: "DOKTOR", isActive: true },
          select: { id: true },
        })
      : [];
    const doctorIds = institutionDoctors.map((doctor) => doctor.id);

    const followUp = await prisma.patientFollowUp.findUnique({
      where: { id: params.id },
      include: {
        patient: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, institutionId: true } },
        appointment: { select: { doctorId: true } },
      },
    });

    if (!followUp) {
      return NextResponse.json({ message: "Takip kaydı bulunamadı" }, { status: 404 });
    }

    if (auth.user.institutionId && doctorIds.length > 0) {
      const followUpDoctorId = followUp.doctorId || followUp.appointment?.doctorId || null;
      const sameInstitution = followUp.createdBy.institutionId === auth.user.institutionId || (followUpDoctorId ? doctorIds.includes(followUpDoctorId) : false);
      if (!sameInstitution) {
        return NextResponse.json({ message: "Takip kaydı kurum kapsamı dışında" }, { status: 403 });
      }
    }

    const body = await request.json();
    const parsed = patientFollowUpEventCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ message: "Geçersiz süreç notu" }, { status: 400 });
    }

    const actorUser = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { id: true },
    });
    const actorUserId = actorUser?.id || followUp.createdBy.id;

    const event = await prisma.patientFollowUpEvent.create({
      data: {
        followUpId: followUp.id,
        patientId: followUp.patientId,
        occurredAt: new Date(parsed.data.occurredAt),
        channel: parsed.data.channel?.trim() || null,
        summary: parsed.data.summary.trim(),
        detail: parsed.data.detail?.trim() || null,
        patientResponse: parsed.data.patientResponse?.trim() || null,
        nextStep: parsed.data.nextStep?.trim() || null,
        createdById: actorUserId,
        updatedById: actorUserId,
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        updatedBy: { select: { id: true, fullName: true } },
      },
    });

    await writeAudit(actorUserId, "PATIENT_FOLLOW_UP_EVENT_CREATE", `${followUp.patient.fullName} için süreç notu eklendi`);
    return NextResponse.json(event, { status: 201 });
  } catch {
    return NextResponse.json({ message: "Süreç notu şu an kaydedilemiyor. Veritabanı bağlantısını kontrol edin." }, { status: 503 });
  }
}
