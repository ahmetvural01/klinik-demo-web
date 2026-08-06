import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import type { WaitlistStatus } from "@prisma/client";
import { effectiveDoctorWhere } from "@/lib/hakedis";

const VALID_WAITLIST_STATUSES = new Set(["BEKLIYOR", "ARANDI", "YERLESTIRILDI", "IPTAL"]);

export async function GET(req: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  if (status && !VALID_WAITLIST_STATUSES.has(status)) {
    return NextResponse.json({ error: "Geçersiz bekleme listesi durumu" }, { status: 400 });
  }

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
  if (!auth.user.institutionId) return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  const institutionId = auth.user.institutionId;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
    }
    const { patientId, doctorId, preferredFrom, preferredTo, note } = body;
    if (typeof patientId !== "string" || !patientId) return NextResponse.json({ error: "Hasta seçimi zorunlu" }, { status: 400 });
    if (doctorId !== undefined && doctorId !== null && (typeof doctorId !== "string" || !doctorId)) {
      return NextResponse.json({ error: "Doktor seçimi geçersiz" }, { status: 400 });
    }
    if (note !== undefined && note !== null && (typeof note !== "string" || note.length > 1000)) {
      return NextResponse.json({ error: "Not geçersiz" }, { status: 400 });
    }

    const fromDate = preferredFrom ? new Date(preferredFrom) : null;
    const toDate = preferredTo ? new Date(preferredTo) : null;
    if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime())) || (fromDate && toDate && fromDate > toDate)) {
      return NextResponse.json({ error: "Tercih edilen tarih aralığı geçersiz" }, { status: 400 });
    }

    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        archivedAt: null,
        institutionId,
      },
      select: { id: true },
    });
    if (!patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });

    if (doctorId) {
      const doctor = await prisma.user.findFirst({
        where: {
          id: doctorId,
          ...effectiveDoctorWhere(institutionId),
        },
        select: { id: true },
      });
      if (!doctor) return NextResponse.json({ error: "Doktor bulunamadı veya aktif değil" }, { status: 404 });
    }

    // Çift form gönderimi/tekrar tıklama, aynı hasta için aynı doktora
    // mükerrer bekleme kaydı oluşturabiliyordu (bkz. denetim raporu) — aynı
    // hasta+doktor için zaten açık (BEKLIYOR/ARANDI) bir kayıt varsa reddet.
    const entry = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Patient" WHERE id = ${patientId} FOR UPDATE`;
      const existingActive = await tx.waitlist.findFirst({
        where: { patientId, doctorId: doctorId || null, status: { in: ["BEKLIYOR", "ARANDI"] }, institutionId },
        select: { id: true },
      });
      if (existingActive) throw new Error("ACTIVE_WAITLIST_EXISTS");

      return tx.waitlist.create({
        data: {
          institutionId,
          patientId,
          doctorId: doctorId || null,
          createdById: auth.user.id,
          preferredFrom: fromDate,
          preferredTo: toDate,
          note: note?.trim() || null,
        },
        include: {
          patient: { select: { id: true, fullName: true, phone: true } },
          doctor: { select: { id: true, fullName: true } },
        },
      });
    });

    await writeAudit(auth.user.id, "WAITLIST_CREATE", `Bekleme listesine eklendi: ${entry.patient.fullName}`);
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "ACTIVE_WAITLIST_EXISTS") {
      return NextResponse.json({ error: "Bu hasta için zaten açık bir bekleme listesi kaydı var." }, { status: 409 });
    }
    console.error("[waitlist POST]", error);
    return NextResponse.json({ error: "Bekleme listesine eklenemedi" }, { status: 503 });
  }
}
