import { NextRequest, NextResponse } from "next/server";
import { Prisma, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatZodError, patientSchema } from "@/lib/validators";
import { requireAuth, withApiTiming, writeAudit } from "@/lib/api";
import { hasBranchPermission, requireActiveBranch, type BranchContext } from "@/lib/branch-context";
import { getPermissionMap } from "@/lib/role-permission-store";
import { turkeyTodayStartUtc } from "@/lib/tz";
import { getClientIpFromHeaders } from "@/lib/edge-rate-limit";
import { canMessageOnWhatsapp } from "@/lib/whatsapp-consent";

type Params = { params: Promise<{ id: string }> };

const FIELD_LABELS: Record<string, string> = {
  fullName: "Ad Soyad",
  phone: "Telefon",
  preferredContactChannel: "İletişim Tercihi",
  whatsappOptInAt: "WhatsApp İzni",
  profession: "Meslek",
  birthDate: "Doğum Tarihi",
  address: "Adres",
  insurance: "Sigorta",
  referrer: "Yönlendiren",
  notes: "Not",
  surgeries: "Ameliyat",
  medications: "İlaç",
  otherDiseases: "Diğer Hastalık",
  bloodType: "Kan Grubu",
  discountRate: "İndirim Oranı",
  gender: "Cinsiyet",
  hasAllergy: "Alerji",
  hasHepatitis: "Hepatit",
  hasKidney: "Böbrek Rahatsızlığı",
  hasDiabetes: "Diyabet",
  hasHeart: "Kalp Rahatsızlığı",
  hasBloodIssue: "Kan Hastalığı",
  hasContagiousDisease: "Bulaşıcı Hastalık",
  contagiousDiseaseNote: "Bulaşıcı Hastalık Notu",
};

const TOOTH_STATUS_LABELS: Record<string, string> = {
  saglikli: "Sağlıklı",
  cukur: "Çürük",
  dolgu: "Dolgu",
  cekilen: "Çekilen",
  kaplik: "Kaplık",
  kanal: "Kanal",
  eksik: "Eksik",
};

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Var" : "Yok";
  if (typeof value === "number") return String(value);
  return String(value);
}

function formatFieldValue(fieldKey: string, value: unknown): string {
  if (fieldKey === "birthDate") {
    if (!value) return "-";
    if (value instanceof Date) return value.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("tr-TR");
  }
  return normalizeValue(value);
}

function summarizeToothChart(chart: string | null | undefined): string {
  if (!chart) return "Diş şeması kaydı yok";
  try {
    const parsed = JSON.parse(chart) as Record<string, string>;
    const counts: Record<string, number> = {};
    Object.values(parsed || {}).forEach((status) => {
      if (!status) return;
      counts[status] = (counts[status] || 0) + 1;
    });

    const ordered = Object.keys(TOOTH_STATUS_LABELS)
      .filter((key) => (counts[key] || 0) > 0)
      .map((key) => `${TOOTH_STATUS_LABELS[key]}: ${counts[key]}`);

    return ordered.length > 0 ? ordered.join(", ") : "İşaretli diş kaydı yok";
  } catch {
    return "Diş şeması okunamadı";
  }
}

function buildPatientUpdateAuditDetail(
  actorName: string,
  patientName: string,
  existing: Record<string, unknown>,
  updated: Record<string, unknown>
): string {
  const beforeParts: string[] = [];
  const afterParts: string[] = [];

  Object.keys(FIELD_LABELS).forEach((key) => {
    const before = formatFieldValue(key, existing[key]);
    const after = formatFieldValue(key, updated[key]);
    if (before !== after) {
      beforeParts.push(`${FIELD_LABELS[key]}: ${before}`);
      afterParts.push(`${FIELD_LABELS[key]}: ${after}`);
    }
  });

  const toothBefore = summarizeToothChart(existing.toothChart as string | null | undefined);
  const toothAfter = summarizeToothChart(updated.toothChart as string | null | undefined);
  if (toothBefore !== toothAfter) {
    beforeParts.push(`Diş şeması: ${toothBefore}`);
    afterParts.push(`Diş şeması: ${toothAfter}`);
  }

  const beforeText = beforeParts.length > 0 ? beforeParts.join(" | ") : "Belirgin alan değişikliği yok";
  const afterText = afterParts.length > 0 ? afterParts.join(" | ") : "Belirgin alan değişikliği yok";

  return [
    `${actorName} tarafından ${patientName} hastası güncellendi.`,
    `Değişiklik öncesi: ${beforeText}`,
    `Değişiklik sonrası: ${afterText}`,
  ].join("\n");
}

/**
 * Rol→izin haritası istek başına BİR kez okunur; ek izinler bellekte
 * hesaplanır. Önceden hasta dosyası isteği haritayı 7 `hasEffectivePermission`
 * ve 1 `shouldHidePatientPhoneForRole` çağrısıyla sekiz kez daha
 * veritabanından okuyordu (performans denetimi HD9). Kurallar aynıdır:
 * etkin izin = gizli oturum / SUPERADMIN ya da rol izni + aktif şube izni
 * (src/lib/api.ts hasEffectivePermission). Telefon/TC gizleme de etkin izne
 * bakar: şube erişiminden "Telefon ve TC görme" kapatılan kişiye API'de
 * telefon ve TC açık dönüyordu (KVKK).
 */
async function resolvePermissions(user: { role: string; ghost?: boolean; branchContext: BranchContext }) {
  const permissionMap = await getPermissionMap();
  const rolePermissions = permissionMap[user.role as Role] ?? [];
  const roleHas = (permission: string) => rolePermissions.includes("*") || rolePermissions.includes(permission);
  const effective = (permission: string) => Boolean(
    user.ghost || user.role === "SUPERADMIN" || (roleHas(permission) && hasBranchPermission(user.branchContext, permission)),
  );
  return {
    effective,
    hidePhone: !user.role || !effective("patients:phone"),
  };
}

/** Kişisel/sağlık alanları — hasta formu (?fields=profile) bunları ve notları okur. */
const PROFILE_SELECT = {
  id: true,
  institutionId: true,
  tcNo: true,
  isForeigner: true,
  phoneCountryCode: true,
  fullName: true,
  phone: true,
  preferredContactChannel: true,
  whatsappOptInAt: true,
  whatsappOptOutAt: true,
  communicationConsentSource: true,
  profession: true,
  address: true,
  gender: true,
  birthDate: true,
  insurance: true,
  referrer: true,
  discountRate: true,
  surgeries: true,
  medications: true,
  otherDiseases: true,
  hasAllergy: true,
  hasHepatitis: true,
  hasKidney: true,
  hasDiabetes: true,
  hasHeart: true,
  hasBloodIssue: true,
  hasContagiousDisease: true,
  contagiousDiseaseNote: true,
  bloodType: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PatientSelect;

export const GET = withApiTiming("patients-detail", async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("patients:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const permissions = await resolvePermissions(auth.user);
  const where = {
    id: params.id,
    archivedAt: null,
    ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    homeBranchId: branch.branchId,
  };

  // Hasta formu yalnız kişisel ve sağlık alanlarını kullanır; tüm geçmişi
  // (randevu, tedavi, tahsilat, lab, taksit) çekmesine gerek yok (HL4).
  // Erişim yine KVKK erişim kaydına yazılır (aşağıda).
  if (request.nextUrl.searchParams.get("fields") === "profile") {
    // Notlar formda yalnız düzeltme/silme için gösterilir (ekleme hasta dosyasında).
    const profile = await prisma.patient.findFirst({ where, select: { ...PROFILE_SELECT, notes: true } });
    if (!profile) return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
    await logPatientAccess(request, auth.user, profile);
    return NextResponse.json(permissions.hidePhone ? maskContact(profile) : profile);
  }

  const canReadAppointments = permissions.effective("appointments:read");
  const canReadExaminations = permissions.effective("examinations:read");
  const canReadPayments = permissions.effective("payments:read");
  const canReadPrescriptions = permissions.effective("prescriptions:read");
  const canReadLab = permissions.effective("lab:read");
  const canReadInstallments = permissions.effective("installments:read");
  const canReadMessaging = permissions.effective("sms:read");

  const patient = await prisma.patient.findFirst({
    where,
    select: {
      ...PROFILE_SELECT,
      notes: true,
      toothChart: true,
      smsPreference: canReadMessaging ? {
        select: {
          status: true,
          firstConsentAt: true,
          lastRejectionAt: true,
          lastRequestSentAt: true,
          lastRequestAttemptAt: true,
          lastRequestError: true,
        },
      } : false,
      smsConsentTokens: canReadMessaging ? {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { purpose: true, expiresAt: true, usedAt: true, resultStatus: true },
      } : false,
      appointments: canReadAppointments ? {
        where: { branchId: branch.branchId },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          type: true,
          status: true,
          // Randevu detayı penceresi not ve tedavi alanını gösteriyordu ama bu
          // alanlar hiç dönmediği için pencere hep boş kalıyordu.
          note: true,
          clinicUnit: { select: { name: true, code: true } },
          doctor: { select: { id: true, fullName: true } },
        },
        orderBy: { startAt: "desc" },
      } : false,
      examinations: canReadExaminations ? {
        where: { branchId: branch.branchId },
        select: {
          id: true,
          treatmentName: true,
          toothNo: true,
          amount: true,
          status: true,
          diagnosedAt: true,
          note: true,
          doctorId: true,
          doctor: { select: { id: true, fullName: true } },
        },
        orderBy: { diagnosedAt: "desc" },
      } : false,
      payments: canReadPayments ? {
        where: { status: "ACTIVE", branchId: branch.branchId },
        select: {
          id: true,
          amount: true,
          method: true,
          description: true,
          createdAt: true,
          doctorId: true,
          posId: true,
          doctor: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: "desc" },
      } : false,
      prescriptions: canReadPrescriptions ? {
        where: { branchId: branch.branchId },
        // status: iptal edilmiş reçete listede "İptal edildi" görünsün ve
        // ikinci kez iptal düğmesi çıkmasın (önceden alan dönmüyordu).
        select: { id: true, drugs: true, note: true, status: true, createdAt: true, doctor: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: "desc" },
      } : false,
      labOrders: canReadLab ? {
        where: { branchId: branch.branchId },
        select: {
          id: true,
          labName: true,
          labType: true,
          teeth: true,
          notes: true,
          status: true,
          price: true,
          invoiceNo: true,
          createdAt: true,
          doctor: { select: { id: true, fullName: true } },
          // Hasta dosyasındaki lab listesi işin hangi adımda olduğunu (lab'da
          // mı, geldi mi, gecikti mi) gösterir ve Laboratuvar sayfasıyla aynı
          // eylemleri (gönder, geldi, fatura, hastaya takıldı) her işi ayrıca
          // okumadan açabilir.
          firmaId: true,
          trips: {
            select: { id: true, order: true, description: true, sentAt: true, expectedAt: true, receivedAt: true, sentNote: true, receivedNote: true },
            orderBy: { order: "asc" },
          },
          invoices: {
            where: { status: "ACTIVE" },
            select: { id: true, item: true, amount: true, invoiceNo: true, issuedAt: true, note: true },
            orderBy: { issuedAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" }
      } : false,
      taksitPlanlari: canReadInstallments ? {
        where: { branchId: branch.branchId },
        select: {
          id: true,
          baslik: true,
          toplamBorc: true,
          pesnat: true,
          taksitSayisi: true,
          period: true,
          startDate: true,
          notes: true,
          status: true,
          createdAt: true,
          doctor: { select: { id: true, fullName: true } },
          taksitler: {
            select: { id: true, siraNo: true, vadeDate: true, tutar: true, odenen: true, kalan: true, status: true },
            orderBy: { vadeDate: "asc" },
          },
        },
        orderBy: { createdAt: "desc" }
      } : false,
    }
  });

  if (!patient) {
    return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
  }

  // Vadesi geçmiş BEKLIYOR taksitler yalnızca /api/taksit-plani/mark-gecikti
  // tarandıktan SONRA DB'de gerçekten GECIKTI olur (bkz. o route'taki aynı not
  // ve /api/taksit-plani/route.ts) — hasta kartındaki taksit listesi de aynı
  // canlı türetilmiş durumu göstermeli, aksi halde iki ekran aynı taksit için
  // farklı durum gösterebilir.
  const todayStart = turkeyTodayStartUtc();
  (patient as any).taksitPlanlari = ((patient as any).taksitPlanlari || []).map((plan: any) => ({
    ...plan,
    taksitler: (plan.taksitler || []).map((t: any) =>
      t.status === "BEKLIYOR" && new Date(t.vadeDate).getTime() < todayStart.getTime()
        ? { ...t, status: "GECIKTI" }
        : t
    ),
  }));

  await logPatientAccess(request, auth.user, patient);

  // DOKTOR ve ASISTAN telefon numaralarını ve TC kimlik numarasını göremez
  // (bkz. patients/route.ts — aynı gerekçe: TC no telefondan daha az hassas
  // sayılıp maskesiz bırakılamaz).
  if (permissions.hidePhone) {
    return NextResponse.json(maskContact(patient));
  }

  return NextResponse.json(patient);
});

function maskContact<T extends { phone: string; tcNo: string | null }>(patient: T): T {
  return { ...patient, phone: "***", tcNo: patient.tcNo ? "***" : patient.tcNo };
}

/** Aynı kişinin aynı hastayı bu süre içinde yeniden açması ikinci kayıt yazmaz. */
const ACCESS_LOG_DEDUPE_MS = 10 * 60_000;

/**
 * KVKK: hasta kaydının görüntülenmesi erişim kaydına yazılır (sessiz
 * yenileme ve süperadmin hariç). Aynı kişi aynı hastayı 10 dakika içinde
 * yeniden açarsa ikinci kayıt yazılmaz: kısa bir oturumda tek hastaya 20+
 * "Dosya görüntüleme" düşüyor, gerçek erişimler gürültüde kayboluyordu.
 */
async function logPatientAccess(
  request: NextRequest,
  user: { id: string; role: string; ghostSession?: boolean },
  patient: { id: string; institutionId: string | null },
) {
  if (
    !patient.institutionId
    || user.role === "SUPERADMIN"
    || user.ghostSession
    || request.headers.get("x-silent-refresh") === "1"
  ) return;
  const recent = await prisma.patientAccessLog.findFirst({
    where: {
      institutionId: patient.institutionId,
      patientId: patient.id,
      userId: user.id,
      action: "DOSYA_GORUNTULEME",
      createdAt: { gte: new Date(Date.now() - ACCESS_LOG_DEDUPE_MS) },
    },
    select: { id: true },
  });
  if (recent) return;
  await prisma.patientAccessLog.create({
    data: {
      institutionId: patient.institutionId,
      patientId: patient.id,
      userId: user.id,
      action: "DOSYA_GORUNTULEME",
      purpose: request.headers.get("x-access-purpose")?.slice(0, 250) || "Klinik hizmet sunumu",
      route: request.nextUrl.pathname,
      ip: getClientIpFromHeaders(request.headers).slice(0, 100) || null,
    },
  });
}

/** Boş metin "" yerine boş (null) yazılsın; dolu metin olduğu gibi kalır. */
function emptyToNull<T>(value: T): T | null {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

/** Doğrulama hatasını kullanıcıya Türkçe ve alan adıyla verir. */
const FIELD_ERROR_HINTS: Record<string, string> = {
  fullName: "Ad soyad en az 3 harf olmalı.",
  gender: "Cinsiyet seçin.",
  birthDate: "Geçerli bir doğum tarihi girin.",
  discountRate: "İndirim oranı 0 ile 100 arasında tam sayı olmalı.",
  contagiousDiseaseNote: "En fazla 200 karakter yazılabilir.",
  profession: "Meslek en fazla 120 karakter olabilir.",
  phoneCountryCode: "Geçerli bir ülke kodu seçin.",
};

export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("patients:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Hasta bilgileri okunamadı." }, { status: 400 });
  }
  // İzinler kayıt okumasıyla paralel: yanıtta telefon/TC maskesi gerekir.
  const [existing, permissions] = await Promise.all([
    prisma.patient.findFirst({
      where: {
        id: params.id,
        archivedAt: null,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        homeBranchId: branch.branchId,
      },
    }),
    resolvePermissions(auth.user),
  ]);

  if (!existing) {
    return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
  }

  // Düzenleme formu notları yalnız DÜZELTME için gönderir ve açıldığı andaki
  // metni (`notesBase`) ekler: form açıkken hasta dosyasından not eklendiyse
  // bütün metin geri yazılıp o not silinmesin (denetim D3 / canlı H11).
  if (typeof body.notes === "string" && typeof body.notesBase === "string" && body.notesBase !== (existing.notes ?? "")) {
    return NextResponse.json({
      message: "Notlar siz düzenlerken değişti (yeni not eklenmiş). Pencereyi kapatıp yeniden açın.",
      fieldErrors: { notes: "Notlar bu arada değişti." },
    }, { status: 409 });
  }

  // Gövdede OLMAYAN alan mevcut değerini korur (ör. hasta dosyasından yalnız
  // not eklenirken, ya da telefonu/TC'yi göremeyen rol formu kaydederken);
  // boş metin ("") alanı temizler.
  const normalizeOptional = (value: unknown, fallback: string | null | undefined) => {
    if (value === null) return undefined;
    return typeof value === "string" ? value : (fallback ?? undefined);
  };

  const parsed = patientSchema.safeParse({
    tcNo: body.tcNo === null ? null : (typeof body.tcNo === "string" ? body.tcNo : existing.tcNo),
    isForeigner: typeof body.isForeigner === "boolean" ? body.isForeigner : existing.isForeigner,
    phoneCountryCode: typeof body.phoneCountryCode === "string" ? body.phoneCountryCode : existing.phoneCountryCode,
    fullName: typeof body.fullName === "string" ? body.fullName : existing.fullName,
    phone: typeof body.phone === "string" ? body.phone : existing.phone,
    preferredContactChannel: typeof body.preferredContactChannel === "string"
      ? body.preferredContactChannel
      : existing.preferredContactChannel,
    whatsappConsent: typeof body.whatsappConsent === "boolean"
      ? body.whatsappConsent
      : canMessageOnWhatsapp(existing),
    communicationConsentSource: normalizeOptional(
      body.communicationConsentSource,
      existing.communicationConsentSource,
    ),
    profession: normalizeOptional(body.profession, existing.profession),
    address: normalizeOptional(body.address, existing.address),
    gender: typeof body.gender === "string" ? body.gender : existing.gender,
    birthDate: body.birthDate === null ? undefined : (typeof body.birthDate === "string" ? body.birthDate : (existing.birthDate ? existing.birthDate.toISOString() : undefined)),
    insurance: normalizeOptional(body.insurance, existing.insurance),
    referrer: normalizeOptional(body.referrer, existing.referrer),
    discountRate: typeof body.discountRate === "number" ? body.discountRate : existing.discountRate,
    notes: normalizeOptional(body.notes, existing.notes),
    surgeries: normalizeOptional(body.surgeries, existing.surgeries),
    medications: normalizeOptional(body.medications, existing.medications),
    otherDiseases: normalizeOptional(body.otherDiseases, existing.otherDiseases),
    hasAllergy: typeof body.hasAllergy === "boolean" ? body.hasAllergy : existing.hasAllergy,
    hasHepatitis: typeof body.hasHepatitis === "boolean" ? body.hasHepatitis : existing.hasHepatitis,
    hasKidney: typeof body.hasKidney === "boolean" ? body.hasKidney : existing.hasKidney,
    hasDiabetes: typeof body.hasDiabetes === "boolean" ? body.hasDiabetes : existing.hasDiabetes,
    hasHeart: typeof body.hasHeart === "boolean" ? body.hasHeart : existing.hasHeart,
    hasBloodIssue: typeof body.hasBloodIssue === "boolean" ? body.hasBloodIssue : existing.hasBloodIssue,
    hasContagiousDisease: typeof body.hasContagiousDisease === "boolean" ? body.hasContagiousDisease : existing.hasContagiousDisease,
    contagiousDiseaseNote: normalizeOptional(body.contagiousDiseaseNote, existing.contagiousDiseaseNote),
    bloodType: normalizeOptional(body.bloodType, existing.bloodType),
    toothChart: normalizeOptional(body.toothChart, existing.toothChart),
  });

  if (!parsed.success) {
    // POST ile aynı biçim (alan: ileti) — önceden Zod nesneleri dönüyor, form
    // bunları "[object Object]" olarak gösteriyordu (denetim D4).
    return NextResponse.json({
      message: "Hasta bilgileri geçersiz",
      errors: formatZodError(parsed.error),
      fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => {
        const field = String(issue.path[0] ?? "veri");
        return [field, issue.code === "custom" ? issue.message : FIELD_ERROR_HINTS[field] || issue.message];
      })),
    }, { status: 400 });
  }
  const fullName = parsed.data.fullName.trim();
  if (fullName.length < 3) {
    return NextResponse.json({
      message: "Hasta bilgileri geçersiz",
      errors: ["fullName: Ad soyad en az 3 harf olmalı."],
      fieldErrors: { fullName: "Ad soyad en az 3 harf olmalı." },
    }, { status: 400 });
  }
  // İndirim oranı hasta düzenleme yetkisiyle değil finans yetkisiyle değişir:
  // oran geçmiş tedavileri de kapsadığı için hasta düzenleyen herkes borcu
  // geriye dönük düşürebiliyordu (hakediş indirimsiz tutardan hesaplanır).
  // Sessizce yok sayılmaz; kullanıcı neden kaydedilmediğini görür.
  const discountChanged = parsed.data.discountRate !== existing.discountRate;
  if (discountChanged && !permissions.effective("finance:write")) {
    return NextResponse.json({
      message: "İndirim oranını değiştirme yetkiniz yok.",
      fieldErrors: { discountRate: "İndirim oranını finans ya da yönetici değiştirir." },
    }, { status: 403 });
  }
  // POST'ta zaten yakalanan P2002 (mükerrer TC No) burada hiç yakalanmıyordu —
  // bir kaydı düzenlerken TC no yanlışlıkla başka bir hastayla çakışırsa ham
  // Prisma hatası kullanıcıya sızıyordu (bkz. denetim raporu).
  let patient;
  const { whatsappConsent, ...patientData } = parsed.data;
  // Formda boşaltılan isteğe bağlı alan gerçekten temizlenir ("" → boş);
  // pasaportsuz yabancı hastada TC boş (null) kalır — "" benzersiz indekste
  // değer sayılıp ikinci TC'siz yabancı hastayı engelliyordu (denetim C4).
  const updateData = {
    ...patientData,
    fullName,
    tcNo: emptyToNull(patientData.tcNo ?? null),
    profession: emptyToNull(patientData.profession),
    address: emptyToNull(patientData.address),
    insurance: emptyToNull(patientData.insurance),
    referrer: emptyToNull(patientData.referrer),
    notes: emptyToNull(patientData.notes),
    surgeries: emptyToNull(patientData.surgeries),
    medications: emptyToNull(patientData.medications),
    otherDiseases: emptyToNull(patientData.otherDiseases),
    contagiousDiseaseNote: emptyToNull(patientData.contagiousDiseaseNote),
    bloodType: emptyToNull(patientData.bloodType),
    birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
  };
  try {
    const consentChanged = whatsappConsent !== canMessageOnWhatsapp(existing);
    patient = await prisma.patient.update({
      where: { id: params.id },
      data: {
        ...updateData,
        ...(consentChanged && whatsappConsent
          ? {
              whatsappOptInAt: new Date(),
              whatsappOptOutAt: null,
              communicationConsentSource: parsed.data.communicationConsentSource || "Hasta düzenleme formu",
            }
          : {}),
        ...(consentChanged && !whatsappConsent
          ? {
              whatsappOptOutAt: new Date(),
              preferredContactChannel: parsed.data.preferredContactChannel === "WHATSAPP"
                ? "SMS"
                : parsed.data.preferredContactChannel,
            }
          : {}),
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({
        message: "Bu TC kimlik numarasıyla kayıtlı bir hasta zaten var.",
        fieldErrors: { tcNo: "Bu TC kimlik numarasıyla kayıtlı başka bir hasta var." },
      }, { status: 409 });
    }
    throw error;
  }

  const auditDetail = buildPatientUpdateAuditDetail(
    auth.user.fullName || "Personel",
    patient.fullName,
    existing as unknown as Record<string, unknown>,
    {
      ...existing,
      ...updateData,
      whatsappOptInAt: patient.whatsappOptInAt,
    } as Record<string, unknown>
  );

  await writeAudit(auth.user.id, "PATIENT_UPDATE", auditDetail);
  if (discountChanged) {
    // Borcu doğrudan değiştiren karar ayrı satırda izlenir (kim, kimin, kaçtan kaça).
    await writeAudit(
      auth.user.id,
      "PATIENT_DISCOUNT_UPDATE",
      `${patient.fullName}: indirim oranı %${existing.discountRate} → %${parsed.data.discountRate}`,
    );
  }
  // Telefonu/TC'yi göremeyen rol (ör. ASISTAN) kaydedebildiği için yanıt da
  // GET ile aynı maskeyi taşır; önceden güncel kaydın tamamı açık dönüyordu.
  return NextResponse.json(permissions.hidePhone ? maskContact(patient) : patient);
}

/**
 * Arşiv gerekçesi `x-archive-reason` başlığında gelir. Başlıklarda Türkçe
 * harf (ş, ğ, ı) taşınamadığı için ekran değeri URI-kodlu gönderir; kodsuz
 * eski değerler de olduğu gibi kabul edilir.
 */
function readArchiveReason(request: NextRequest): string {
  const raw = request.headers.get("x-archive-reason") || "";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Kodlanmamış değer: olduğu gibi kullanılır.
  }
  return decoded.trim().slice(0, 500) || "Kullanıcı talebiyle hasta kartı arşivlendi.";
}

export async function DELETE(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("patients:delete");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const existing = await prisma.patient.findFirst({
    where: {
      id: params.id,
      archivedAt: null,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      homeBranchId: branch.branchId,
    },
    select: { id: true, fullName: true },
  });

  if (!existing) {
    return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
  }

  const reason = readArchiveReason(request);
  const archivedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.appointment.updateMany({
      where: {
        patientId: params.id,
        startAt: { gte: archivedAt },
        status: { notIn: ["IPTAL", "TAMAMLANDI"] },
      },
      data: { status: "IPTAL", note: "Hasta kartı arşivlendiği için iptal edildi." },
    });
    await tx.reminder.updateMany({
      where: { patientId: params.id, status: { in: ["AKTIF", "GONDERILIYOR"] } },
      data: {
        status: "TAMAMLANDI",
        nextAttemptAt: null,
        lastError: "Hasta kartı arşivlendiği için bildirim iptal edildi.",
      },
    });
    await tx.patient.update({
      where: { id: params.id },
      data: {
        archivedAt,
        archivedById: auth.user.id,
        archiveReason: reason,
        whatsappOptOutAt: archivedAt,
      },
    });
  });

  await writeAudit(auth.user.id, "PATIENT_ARCHIVE", `${existing.fullName} arşivlendi. Gerekçe: ${reason}`);
  return NextResponse.json({ ok: true, archived: true });
}

/**
 * Arşivden geri alma (`{ action: "restore" }`). Arşivlenen hastanın TC'si
 * aynı şubede yeni kaydı engelliyor, arşiv ise hiçbir ekranda görünmüyordu:
 * geri gelen hasta sisteme hiç kaydedilemiyordu (denetim A3, canlı test
 * 08b). Yetki arşivlemeyle aynıdır (patients:delete). Arşivlenirken iptal
 * edilen randevular ve kapatılan hatırlatmalar geri AÇILMAZ; WhatsApp
 * tercihi değişmez (personel hasta formundan açabilir).
 *
 * Not ekleme (`{ appendNote: "metin" }`, patients:write): not sunucuda
 * damgalanıp ("[tarih saat - kişi] metin") en güncel notların sonuna eklenir.
 * Önceden hasta dosyası önce bütün kaydı okuyup sonra bütün not metnini geri
 * yazıyordu; arada başkasının eklediği not silinebiliyordu.
 */
export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  const body = await request.json().catch(() => null);
  if (body && typeof body === "object" && typeof (body as { appendNote?: unknown }).appendNote === "string") {
    return appendPatientNote(params.id, (body as { appendNote: string }).appendNote);
  }
  const auth = await requireAuth("patients:delete");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  if (!body || typeof body !== "object" || (body as { action?: unknown }).action !== "restore") {
    return NextResponse.json({ message: "Geçersiz işlem." }, { status: 400 });
  }

  const tenant = {
    ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    homeBranchId: branch.branchId,
  };
  const restored = await prisma.patient.updateMany({
    where: { id: params.id, archivedAt: { not: null }, ...tenant },
    data: { archivedAt: null, archivedById: null, archiveReason: null },
  });
  if (restored.count !== 1) {
    return NextResponse.json({ message: "Arşivde böyle bir hasta bulunamadı." }, { status: 404 });
  }
  const patient = await prisma.patient.findFirst({
    where: { id: params.id, ...tenant },
    select: { id: true, fullName: true, tcNo: true, phone: true, phoneCountryCode: true, birthDate: true, gender: true },
  });
  if (!patient) return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });

  await writeAudit(
    auth.user.id,
    "PATIENT_RESTORE",
    `${patient.fullName} arşivden geri alındı. Arşivlenirken iptal edilen randevular ve hatırlatmalar geri açılmadı.`,
  );
  const { hidePhone } = await resolvePermissions(auth.user);
  return NextResponse.json(hidePhone ? maskContact(patient) : patient);
}

const NOTE_STAMP_DATE = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Istanbul" });
const NOTE_STAMP_TIME = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const MAX_APPENDED_NOTE = 2000;

async function appendPatientNote(patientId: string, rawText: string) {
  const auth = await requireAuth("patients:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const text = rawText.replace(/\r\n/g, "\n").trim();
  if (!text) return NextResponse.json({ message: "Not boş olamaz.", fieldErrors: { appendNote: "Not yazın." } }, { status: 400 });
  if (text.length > MAX_APPENDED_NOTE) {
    return NextResponse.json({ message: `Not en fazla ${MAX_APPENDED_NOTE} karakter olabilir.` }, { status: 400 });
  }
  const where = {
    id: patientId,
    archivedAt: null,
    ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    homeBranchId: branch.branchId,
  };
  const now = new Date();
  const line = `[${NOTE_STAMP_DATE.format(now)} ${NOTE_STAMP_TIME.format(now)} - ${(auth.user.fullName || "").trim() || "Personel"}] ${text}`;

  // Notlar şifreli saklandığı için veritabanında birleştirilemez: en güncel
  // metin okunur, kayıt arada değişmediyse (updatedAt) yazılır; değiştiyse
  // yeniden denenir. Böylece aynı anda eklenen iki nottan biri kaybolmaz.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await prisma.patient.findFirst({ where, select: { id: true, fullName: true, notes: true, updatedAt: true } });
    if (!current) return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
    const existingNotes = (current.notes || "").replace(/\s+$/, "");
    const written = await prisma.patient.updateMany({
      where: { ...where, updatedAt: current.updatedAt },
      data: { notes: existingNotes ? `${existingNotes}\n${line}` : line },
    });
    if (written.count === 1) {
      await writeAudit(auth.user.id, "PATIENT_UPDATE", `${auth.user.fullName || "Personel"} tarafından ${current.fullName} hastasına not eklendi.`);
      return NextResponse.json({ ok: true, note: line });
    }
  }
  return NextResponse.json({ message: "Hasta kaydı bu sırada değişti; not kaydedilmedi. Yeniden deneyin." }, { status: 409 });
}
