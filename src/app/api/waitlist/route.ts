import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import type { WaitlistStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  try {
    const entries = await prisma.waitlist.findMany({
      where: {
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        ...(status ? { status: status as WaitlistStatus } : { status: { not: "IPTAL" as WaitlistStatus } }),
      },
      orderBy: { createdAt: "asc" },
      include: {
        patient: { select: { id: true, fullName: true, phone: true } },
        doctor: { select: { id: true, fullName: true } },
      },
    });
    return NextResponse.json(entries);
  } catch (error) {
    console.error("[waitlist GET]", error);
    return NextResponse.json({ message: "Bekleme listesi yüklenemedi." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { patientId, doctorId, preferredFrom, preferredTo, note } = body;
    if (!patientId) return NextResponse.json({ error: "Hasta seçimi zorunlu" }, { status: 400 });

    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      select: { id: true },
    });
    if (!patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });

    const entry = await prisma.waitlist.create({
      data: {
        institutionId: auth.user.institutionId || null,
        patientId,
        doctorId: doctorId || null,
        createdById: auth.user.id,
        preferredFrom: preferredFrom ? new Date(preferredFrom) : null,
        preferredTo: preferredTo ? new Date(preferredTo) : null,
        note: note || null,
      },
      include: {
        patient: { select: { id: true, fullName: true, phone: true } },
        doctor: { select: { id: true, fullName: true } },
      },
    });

    await writeAudit(auth.user.id, "WAITLIST_CREATE", `Bekleme listesine eklendi: ${entry.patient.fullName}`);
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("[waitlist POST]", error);
    return NextResponse.json({ error: "Bekleme listesine eklenemedi" }, { status: 503 });
  }
}
