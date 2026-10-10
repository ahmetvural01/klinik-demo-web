import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { prescriptionSchema } from "@/lib/validators";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { effectiveDoctorWhere } from "@/lib/hakedis";
import { requireActiveBranch } from "@/lib/branch-context";

export const GET = withApiTiming("prescriptions", async function GET(request: NextRequest) {
  const auth = await requireAuth("prescriptions:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const patientId = request.nextUrl.searchParams.get("patientId");

  const prescriptions = await prisma.prescription.findMany({
    where: {
      ...(patientId ? { patientId } : {}),
      institutionId: auth.user.institutionId as string,
      branchId: branch.branchId,
    },
    orderBy: { createdAt: "desc" },
    // patientId verilmeden (kurum geneli) çağrılırsa tek istek tüm reçete
    // geçmişini döndürmesin diye güvenlik sınırı.
    take: patientId ? undefined : 500,
  });

  return NextResponse.json(prescriptions);
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth("prescriptions:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok || !auth.user.institutionId) return NextResponse.json({ message: branch.ok ? "Kurum bilgisi bulunamadı" : branch.message }, { status: 403 });

  const rawRequestKey = request.headers.get("Idempotency-Key")?.trim() || null;
  if (rawRequestKey && (rawRequestKey.length < 8 || rawRequestKey.length > 180)) {
    return NextResponse.json({ message: "İşlem anahtarı geçersiz" }, { status: 400 });
  }
  const requestKey = rawRequestKey;

  const body = await request.json().catch(() => null);
  const parsed = prescriptionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz reçete verisi" }, { status: 400 });
  }
  // Ortak şemada uzunluk sınırı yok; tek istekle sınırsız metin yazılamasın.
  if (parsed.data.drugs.length > 20_000 || (parsed.data.note?.length ?? 0) > 5_000) {
    return NextResponse.json({ message: "Reçete metni çok uzun" }, { status: 400 });
  }

  // Aynı işlem anahtarıyla tekrar gelen istek (çift tıklama, ağ yeniden denemesi)
  // ikinci reçete açmaz; ilk kayıt döner. Anahtar gönderilmezse eski davranış.
  if (requestKey) {
    const existing = await prisma.prescription.findFirst({
      where: { requestKey, institutionId: auth.user.institutionId, branchId: branch.branchId },
    });
    if (existing) {
      const { requestKey: _existingKey, ...publicPrescription } = existing;
      return NextResponse.json({ ...publicPrescription, duplicateRequest: true }, { status: 200 });
    }
  }

  const patient = await prisma.patient.findFirst({
    where: { id: parsed.data.patientId, institutionId: auth.user.institutionId, homeBranchId: branch.branchId, archivedAt: null },
    select: { id: true },
  });
  if (!patient) {
    return NextResponse.json({ message: "Hasta bu şubede bulunamadı" }, { status: 404 });
  }

  // Reçete yasal belgedir ve imza satırına seçilen hekim basılır: doktor
  // reçeteyi yalnız kendi adına yazar (görünmez destek oturumu hariç).
  // Yönetici, asistan ve banko hekim seçerek yazabilir.
  const doctorSelf = auth.user.role === "DOKTOR" && !auth.user.ghost;
  if (doctorSelf && parsed.data.doctorId && parsed.data.doctorId !== auth.user.id) {
    return NextResponse.json({ message: "Yalnız kendi adınıza reçete yazabilirsiniz." }, { status: 403 });
  }
  const resolvedDoctorId = doctorSelf ? auth.user.id : parsed.data.doctorId || auth.user.id;
  const doctor = await prisma.user.findFirst({
    where: { id: resolvedDoctorId, ...effectiveDoctorWhere(auth.user.institutionId, branch.branchId) },
    select: { id: true },
  });
  if (!doctor) {
    return NextResponse.json({ message: "Doktor bu şubenin kapsamı dışında" }, { status: 403 });
  }

  let prescription;
  try {
    prescription = await prisma.prescription.create({
      data: {
        ...parsed.data,
        institutionId: auth.user.institutionId,
        branchId: branch.branchId,
        doctorId: resolvedDoctorId,
        requestKey,
      }
    });
  } catch (error) {
    // Aynı anahtarla eşzamanlı iki istek: benzersiz kısıt ikinciyi reddeder, ilk kayıt döner.
    if (requestKey && error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      const existing = await prisma.prescription.findFirst({
        where: { requestKey, institutionId: auth.user.institutionId, branchId: branch.branchId },
      });
      if (existing) {
        const { requestKey: _existingKey, ...publicPrescription } = existing;
        return NextResponse.json({ ...publicPrescription, duplicateRequest: true }, { status: 200 });
      }
    }
    throw error;
  }

  await writeAudit(auth.user.id, "PRESCRIPTION_CREATE", `Reçete oluşturuldu`);
  const { requestKey: _createdKey, ...publicPrescription } = prescription;
  return NextResponse.json(publicPrescription, { status: 201 });
}
