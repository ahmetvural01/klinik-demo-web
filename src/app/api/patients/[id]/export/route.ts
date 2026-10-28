import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { hasBranchPermission, requireActiveBranch } from "@/lib/branch-context";
import { getPermissionMap } from "@/lib/role-permission-store";

type Params = { params: Promise<{ id: string }> };

/**
 * Dışa aktarılan her bölüm, hasta dosyasında o bölümü görmek için gereken
 * okuma yetkisine bağlıdır (GET /api/patients/[id] ile aynı kural + belge ve
 * takip uçlarının kendi yetkileri). Önceden uç yalnız `patients:read`
 * istiyordu: muayene kayıtlarını göremeyen bir rol "Yapılan tedaviler"i PDF
 * olarak indirebiliyordu (KVKK — en az yetki ilkesi). Planlanan tedaviler
 * muayene kayıtlarının içindedir (ayrı tedavi planı kaldırıldı).
 */
const SECTION_PERMISSIONS = {
  appointments: "appointments:read",
  waitlistEntries: "appointments:read",
  examinations: "examinations:read",
  payments: "payments:read",
  prescriptions: "prescriptions:read",
  labOrders: "lab:read",
  taksitPlanlari: "installments:read",
  consents: "documents:read",
  followUps: "hastatracking:read",
} as const;

/**
 * KVKK m.11 (ilgili kişinin erişim/taşınabilirlik hakkı) için hastanın sistemde
 * tutulan verilerini tek bir dosyada dışa aktarır. Erişim audit log'a yazılır.
 */
export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("patients:read");
  if (auth.error) return auth.error;
  // Hasta dosyası yalnız aktif şubedeki hastayı ve o şubenin kayıtlarını
  // gösterir; dışa aktarım da aynı sınırla yapılır (önceden yalnız kurum
  // kontrol ediliyor, diğer şubelerin kayıtları da dosyaya giriyordu).
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
  const inBranch = { branchId: branch.branchId };

  // Rol yetki haritası bir kez okunur; her bölüm bellekte değerlendirilir
  // (hasEffectivePermission ile aynı kural: ghost/süperadmin tam yetkili, aksi
  // halde rol yetkisi VE aktif şubenin izin listesi).
  const permissionMap = await getPermissionMap();
  const rolePermissions = permissionMap[auth.user.role as Role] || [];
  const allow = (permission: string) => Boolean(
    auth.user.ghost
    || auth.user.role === "SUPERADMIN"
    || ((rolePermissions.includes("*") || rolePermissions.includes(permission)) && hasBranchPermission(auth.user.branchContext, permission)),
  );
  const can = Object.fromEntries(
    Object.entries(SECTION_PERMISSIONS).map(([section, permission]) => [section, allow(permission)]),
  ) as Record<keyof typeof SECTION_PERMISSIONS, boolean>;
  const canReadDocuments = allow("documents:read");
  const canReadXray = allow("xray:read");
  const documentCategories = [
    ...(canReadDocuments ? (["BELGE"] as const) : []),
    ...(canReadXray ? (["RONTGEN", "FOTOGRAF"] as const) : []),
  ];

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      homeBranchId: branch.branchId,
    },
    include: {
      appointments: can.appointments ? {
        where: inBranch,
        include: { doctor: { select: { id: true, fullName: true } } },
        orderBy: { startAt: "desc" },
      } : false,
      examinations: can.examinations ? {
        where: inBranch,
        include: { doctor: { select: { id: true, fullName: true } } },
        orderBy: { diagnosedAt: "desc" },
      } : false,
      payments: can.payments ? {
        where: { status: "ACTIVE", ...inBranch },
        include: {
          doctor: { select: { id: true, fullName: true } },
          pos: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      } : false,
      prescriptions: can.prescriptions ? {
        where: inBranch,
        include: { doctor: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: "desc" },
      } : false,
      labOrders: can.labOrders ? {
        where: inBranch,
        include: {
          doctor: { select: { id: true, fullName: true } },
          firma: { select: { id: true, name: true } },
          trips: { orderBy: { order: "asc" } },
          invoices: { where: { status: "ACTIVE" }, orderBy: { issuedAt: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      } : false,
      taksitPlanlari: can.taksitPlanlari ? {
        where: inBranch,
        include: {
          doctor: { select: { id: true, fullName: true } },
          taksitler: { orderBy: { vadeDate: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      } : false,
      documents: documentCategories.length > 0 ? {
        where: { archivedAt: null, category: { in: [...documentCategories] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, category: true, fileName: true, mimeType: true, fileSize: true, toothNo: true, note: true, createdAt: true },
      } : false,
      consents: can.consents ? {
        orderBy: { signedAt: "desc" },
        select: { id: true, title: true, category: true, status: true, signerName: true, signedAt: true, voidedAt: true, voidReason: true },
      } : false,
      followUps: can.followUps ? { where: inBranch, orderBy: { createdAt: "desc" } } : false,
      waitlistEntries: can.waitlistEntries ? { where: inBranch, orderBy: { createdAt: "desc" } } : false,
    },
  });

  if (!patient) {
    return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
  }

  // Bu uç, hastanın kendi verisini talep etmesi için değil, personelin onun
  // adına bir dışa aktarma yapması için kullanılıyor — panelde telefonu
  // görmesine izin verilmeyen bir rol (DOKTOR/ASISTAN), bu endpoint'i
  // kullanarak maskelemeyi bypass edemesin.
  // Etkin izin (rol + aktif şube), yukarıda bir kez okunan haritadan.
  const hidePhone = !allow("patients:phone");
  // Hasta dosyasıyla aynı kural: telefonu göremeyen rol TC numarasını da göremez.
  const patientForExport = hidePhone ? { ...patient, phone: "***", tcNo: patient.tcNo ? "***" : patient.tcNo } : patient;
  // Yetkisi olmayan bölümler yanıtta hiç bulunmaz; istemci bu listeyle
  // yalnız okunabilen bölümleri gösterir.
  const includedSections = [
    ...Object.entries(can).filter(([, allowed]) => allowed).map(([section]) => section),
    ...(documentCategories.length > 0 ? ["documents"] : []),
  ];

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    exportedBy: auth.user.fullName || auth.user.id,
    legalBasis: "KVKK m.11 — ilgili kişinin veri erişim/taşınabilirlik talebi",
    note: "Belgeler/röntgenler dosya içeriği hariç meta veri olarak listelenmiştir; dosyaların kendisi panelden ilgili hastanın belge sekmesinden indirilebilir.",
    includedSections,
    patient: patientForExport,
  };

  if (
    patient.institutionId
    && auth.user.role !== "SUPERADMIN"
    && !auth.user.ghostSession
  ) {
    await prisma.patientAccessLog.create({
      data: {
        institutionId: patient.institutionId,
        patientId: patient.id,
        userId: auth.user.id,
        action: "VERI_DISA_AKTARMA",
        purpose: "Hasta/KVKK veri erişim talebi",
        route: request.nextUrl.pathname,
        ip: (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "")
          .split(",")[0]
          .trim()
          .slice(0, 100) || null,
      },
    });
  }
  await writeAudit(auth.user.id, "PATIENT_DATA_EXPORT", `${patient.fullName} hastasının verileri dışa aktarıldı (KVKK erişim talebi)`);

  const fileDate = new Date().toISOString().slice(0, 10);
  const safeName = patient.fullName.replace(/[^\p{L}\p{N}]+/gu, "-");

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="hasta-verisi-${safeName}-${fileDate}.json"`,
      "Cache-Control": "private, max-age=0, no-cache",
    },
  });
}
