import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyAuth, withApiTiming } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { effectiveDoctorWhere } from "@/lib/hakedis";

/**
 * GET /api/muhasebe/doktorlar
 * Tahsilat, taksit planı ve hakediş formlarındaki doktor listesi.
 *
 * Personel listesi (/api/staff) staff:read ister; varsayılan MUHASEBE rolünde
 * bu izin yok, bu yüzden muhasebeci tahsilat formunda (doktor zorunlu) hiç
 * doktor seçemiyor ve tahsilat kaydedemiyordu. Bu uç yalnız şubede hekim
 * sayılan kişilerin adını döner (telefon, oran, rol ayrıntısı yok) ve sunucunun
 * tahsilat/hakediş doğrulamasında kabul ettiği kuralla aynı listeyi verir.
 */
export const GET = withApiTiming("muhasebe-doktorlar", async function GET() {
  try {
    const auth = await requireAnyAuth(["staff:read", "finance:read", "payments:write", "installments:write", "earnings:read"]);
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
    if (!auth.user.institutionId) return NextResponse.json({ message: "Kurum bağlamı bulunamadı." }, { status: 403 });

    const doctors = await prisma.user.findMany({
      where: effectiveDoctorWhere(auth.user.institutionId, branch.branchId),
      select: { id: true, fullName: true, role: true, isActive: true, profile: { select: { hideAsDoctor: true } } },
      orderBy: { fullName: "asc" },
    });
    return NextResponse.json(doctors);
  } catch (error) {
    console.error("[muhasebe doktorlar GET]", error);
    return NextResponse.json({ message: "Doktor listesi yüklenemedi." }, { status: 503 });
  }
});
