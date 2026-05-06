import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { patientFollowUpEventUpdateSchema } from "@/lib/validators";

type Params = { params: { id: string; eventId: string } };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth("appointments:write");
    if (auth.error) return auth.error;

    const event = await prisma.patientFollowUpEvent.findFirst({
      where: { id: params.eventId, followUpId: params.id },
      include: {
        followUp: {
          select: {
            id: true,
            patient: { select: { fullName: true } },
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ message: "Surec notu bulunamadi" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = patientFollowUpEventUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ message: "Gecersiz surec notu guncellemesi" }, { status: 400 });
    }

    const updated = await prisma.patientFollowUpEvent.update({
      where: { id: params.eventId },
      data: {
        occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
        channel: parsed.data.channel === undefined ? undefined : (parsed.data.channel?.trim() || null),
        summary: parsed.data.summary?.trim(),
        detail: parsed.data.detail === undefined ? undefined : (parsed.data.detail?.trim() || null),
        patientResponse: parsed.data.patientResponse === undefined ? undefined : (parsed.data.patientResponse?.trim() || null),
        nextStep: parsed.data.nextStep === undefined ? undefined : (parsed.data.nextStep?.trim() || null),
        updatedById: auth.user.id,
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        updatedBy: { select: { id: true, fullName: true } },
      },
    });

    await writeAudit(auth.user.id, "PATIENT_FOLLOW_UP_EVENT_UPDATE", `${event.followUp.patient.fullName} surec notu guncellendi`);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ message: "Surec notu su an guncellenemiyor. Veritabani baglantisini kontrol edin." }, { status: 503 });
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth("appointments:write");
    if (auth.error) return auth.error;

    const event = await prisma.patientFollowUpEvent.findFirst({
      where: { id: params.eventId, followUpId: params.id },
      include: {
        followUp: {
          select: {
            patient: { select: { fullName: true } },
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ message: "Surec notu bulunamadi" }, { status: 404 });
    }

    await prisma.patientFollowUpEvent.delete({ where: { id: params.eventId } });
    await writeAudit(auth.user.id, "PATIENT_FOLLOW_UP_EVENT_DELETE", `${event.followUp.patient.fullName} surec notu silindi`);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Surec notu su an silinemiyor. Veritabani baglantisini kontrol edin." }, { status: 503 });
  }
}
