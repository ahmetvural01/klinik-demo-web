import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/api";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { formatZodError, publicBookingSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers);
  const rate = checkRateLimit(`public-booking:${ip}`, 5, 15 * 60_000);
  if (!rate.ok) {
    return NextResponse.json({ error: "Çok fazla talep gönderildi. Lütfen daha sonra tekrar deneyin." }, { status: 429 });
  }

  try {
    const body = await req.json();
    const parsed = publicBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error)[0] || "Geçersiz veri" }, { status: 400 });
    }
    const { kurum, fullName, phone, tcNo, doctorId, preferredFrom, note } = parsed.data;

    const preferredDate = new Date(preferredFrom);
    if (preferredDate < new Date()) return NextResponse.json({ error: "Geçmiş bir tarih seçilemez" }, { status: 400 });

    const institution = await prisma.institution.findFirst({
      where: { name: { equals: kurum, mode: "insensitive" }, isActive: true },
      select: { id: true, ownerId: true },
    });
    if (!institution) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });

    if (doctorId) {
      const doctor = await prisma.user.findFirst({ where: { id: doctorId, institutionId: institution.id, isActive: true }, select: { id: true } });
      if (!doctor) return NextResponse.json({ error: "Doktor bulunamadı" }, { status: 404 });
    }

    const request = await prisma.bookingRequest.create({
      data: {
        institutionId: institution.id,
        doctorId,
        fullName,
        phone,
        tcNo,
        preferredFrom: preferredDate,
        note,
      },
    });
    const auditUserId = institution.ownerId || (await prisma.user.findFirst({
      where: { institutionId: institution.id, isActive: true, role: { in: ["YONETICI", "BANKO", "SUPERADMIN"] } },
      select: { id: true },
    }))?.id;
    if (auditUserId) {
      await writeAudit(auditUserId, "PUBLIC_BOOKING_REQUEST_CREATE", `Online randevu talebi: ${fullName} / ${phone} / ${preferredDate.toLocaleString("tr-TR")}`);
    }

    return NextResponse.json({ ok: true, id: request.id }, { status: 201 });
  } catch (error) {
    console.error("[public booking POST]", error);
    return NextResponse.json({ error: "Talep gönderilemedi" }, { status: 503 });
  }
}
