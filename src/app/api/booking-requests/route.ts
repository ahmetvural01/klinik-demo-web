import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import type { BookingRequestStatus } from "@prisma/client";
import { requireActiveBranch } from "@/lib/branch-context";
import { shouldHidePatientPhoneForUser } from "@/lib/patient-visibility-server";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const validStatuses = new Set(["BEKLIYOR", "ONAYLANDI", "REDDEDILDI", "IPTAL"]);
  if (status && !validStatuses.has(status)) {
    return NextResponse.json({ error: "Geçersiz randevu talebi durumu" }, { status: 400 });
  }

  try {
    const requests = await prisma.bookingRequest.findMany({
      where: {
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        branchId: branch.branchId,
        ...(status ? { status: status as BookingRequestStatus } : { status: "BEKLIYOR" as BookingRequestStatus }),
      },
      // En yakın tercih tarihi en üstte (önceden en yeni gelen üstteydi; en
      // acil talep listenin dibinde kalıyordu).
      orderBy: [{ preferredFrom: "asc" }, { createdAt: "asc" }],
      include: { doctor: { select: { id: true, fullName: true } } },
      // Geçmiş (onaylanan/reddedilen) talepler için üst sınır; bekleyenler zaten az.
      take: status && status !== "BEKLIYOR" ? 200 : undefined,
    });
    // Hasta listesi ve bekleme listesiyle aynı kural: telefon görme yetkisi
    // olmayan role talep sahibinin telefonu/TC'si gönderilmez. Önceden yalnız
    // arayüz gizliyordu, yanıt maskesizdi (KVKK). Hasta eşleştirmesi sunucuda
    // yapılır (GET /api/booking-requests/[id]).
    if (await shouldHidePatientPhoneForUser(auth.user)) {
      return NextResponse.json(requests.map((request) => ({ ...request, phone: "", tcNo: request.tcNo ? "***" : request.tcNo })));
    }
    return NextResponse.json(requests);
  } catch (error) {
    console.error("[booking-requests GET]", error);
    return NextResponse.json({ message: "Online randevu talepleri yüklenemedi." }, { status: 503 });
  }
}
