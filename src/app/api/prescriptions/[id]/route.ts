import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { getClientIpFromHeaders } from "@/lib/edge-rate-limit";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("prescriptions:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }
  const institutionId = auth.user.institutionId;

  const prescription = await prisma.prescription.findFirst({
    where: {
      id: params.id,
      institutionId,
      branchId: branch.branchId,
    },
    // Reçeteyi yazan hekimin adı imza alanında basılır (önceden hiç dönmüyordu).
    include: { doctor: { select: { id: true, fullName: true } } },
  });

  if (!prescription) {
    return NextResponse.json({ message: "Reçete bulunamadı" }, { status: 404 });
  }
  // İç işlem anahtarı (çift kayıt koruması) yanıtta dönmez — oluşturma ucuyla aynı.
  const { requestKey: _requestKey, ...publicPrescription } = prescription;

  if (request.nextUrl.searchParams.get("print") !== "1") {
    return NextResponse.json(publicPrescription);
  }

  // Yazdırma görünümü: reçete + yalnız kâğıda basılan hasta alanları + klinik
  // künyesi tek yanıtta. Önceden sayfa hastanın TÜM dosyasını (randevu, ödeme,
  // lab geçmişi) ve logolu ayar kaydını çekiyordu; ayar ucu settings:read
  // istediği için hekim/asistan çıktısında "Klinik / Açık adres bilgisi
  // girilmemiş" basılıyordu. Künye yalnız ad, adres ve telefondur.
  const [patient, setting, institution, hideSensitive] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: prescription.patientId, institutionId, homeBranchId: branch.branchId, archivedAt: null },
      select: { id: true, fullName: true, tcNo: true, isForeigner: true, birthDate: true, gender: true, phone: true },
    }),
    prisma.setting.findUnique({
      where: { institutionId },
      select: { institutionName: true, institutionAddress: true, institutionPhone: true },
    }),
    prisma.institution.findUnique({
      where: { id: institutionId },
      select: { name: true, address: true, phone: true },
    }),
    hasEffectivePermission(auth.user, "patients:phone").then((allowed) => !allowed),
  ]);

  if (!patient) {
    return NextResponse.json({ message: "Reçetenin hastası bu şubede bulunamadı" }, { status: 404 });
  }

  // KVKK: hasta dosyası görüntülemesiyle aynı erişim kaydı (amaç: reçete yazdırma).
  // Hasta dosyasındaki gibi aynı kişi aynı hastanın reçetesini 10 dakika içinde
  // yeniden açarsa ikinci kayıt yazılmaz (her açılış yeni satır yazıyordu).
  const recentAccess = auth.user.role !== "SUPERADMIN" && !auth.user.ghostSession
    ? await prisma.patientAccessLog.findFirst({
      where: {
        institutionId,
        patientId: patient.id,
        userId: auth.user.id,
        action: "DOSYA_GORUNTULEME",
        purpose: "Reçete yazdırma",
        createdAt: { gte: new Date(Date.now() - 10 * 60_000) },
      },
      select: { id: true },
    })
    : null;
  if (auth.user.role !== "SUPERADMIN" && !auth.user.ghostSession && !recentAccess) {
    await prisma.patientAccessLog.create({
      data: {
        institutionId,
        patientId: patient.id,
        userId: auth.user.id,
        action: "DOSYA_GORUNTULEME",
        purpose: "Reçete yazdırma",
        route: request.nextUrl.pathname,
        ip: getClientIpFromHeaders(request.headers).slice(0, 100) || null,
      },
    });
  }

  return NextResponse.json({
    prescription: publicPrescription,
    clinic: {
      // Ayarlar ekranındaki "Klinik adı/adresi/telefonu" önce; yoksa kurum kaydı
      // (GET /api/settings ile aynı öncelik).
      name: setting?.institutionName || institution?.name || "",
      address: setting?.institutionAddress ?? institution?.address ?? "",
      phone: setting?.institutionPhone || institution?.phone || "",
    },
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      // Telefonu göremeyen rol T.C. numarasını da göremez (hasta dosyasıyla aynı
      // kural). Maskeli değer kâğıda basılmasın diye null döner; tcHidden ile
      // ekran "boş bırakıldı" der.
      tcNo: hideSensitive ? null : patient.tcNo || null,
      tcHidden: hideSensitive && Boolean(patient.tcNo),
      isForeigner: patient.isForeigner,
      birthDate: patient.birthDate,
      gender: patient.gender,
      phone: hideSensitive ? null : patient.phone || null,
    },
  });
}

export async function DELETE(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("prescriptions:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const existing = await prisma.prescription.findFirst({
    where: {
      id: params.id,
      institutionId: auth.user.institutionId as string,
      branchId: branch.branchId,
    },
    select: { id: true, status: true, doctorId: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "Reçete bulunamadı" }, { status: 404 });
  }
  // Doktor yalnız kendi yazdığı reçeteyi iptal eder (yazma kuralıyla aynı).
  if (auth.user.role === "DOKTOR" && !auth.user.ghost && existing.doctorId !== auth.user.id) {
    return NextResponse.json({ message: "Yalnız kendi yazdığınız reçeteyi iptal edebilirsiniz." }, { status: 403 });
  }

  if (existing.status !== "VOID") {
    await prisma.prescription.update({
      where: {
        id_institutionId_branchId: {
          id: existing.id,
          institutionId: auth.user.institutionId as string,
          branchId: branch.branchId,
        },
      },
      data: {
        status: "VOID",
        voidedAt: new Date(),
        voidedById: auth.user.id,
        voidReason: "Kullanıcı tarafından iptal edildi.",
      },
    });
  }
  await writeAudit(auth.user.id, "PRESCRIPTION_VOID", "Reçete iptal edildi; klinik geçmişi korundu.");
  return NextResponse.json({ ok: true, status: "VOID" });
}
