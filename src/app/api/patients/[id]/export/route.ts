import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { shouldHidePatientPhoneForRole } from "@/lib/patient-visibility-server";
import { requireActiveBranch } from "@/lib/branch-context";

type Params = { params: Promise<{ id: string }> };

/**
 * KVKK m.11 (ilgili kişinin erişim/taşınabilirlik hakkı) için hastanın sistemde
 * tutulan tüm verilerini tek bir dosyada dışa aktarır. Erişim audit log'a yazılır.
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

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      homeBranchId: branch.branchId,
    },
    include: {
      appointments: {
        where: inBranch,
        include: { doctor: { select: { id: true, fullName: true } } },
        orderBy: { startAt: "desc" },
      },
      examinations: {
        where: inBranch,
        include: { doctor: { select: { id: true, fullName: true } } },
        orderBy: { diagnosedAt: "desc" },
      },
      payments: {
        where: { status: "ACTIVE", ...inBranch },
        include: {
          doctor: { select: { id: true, fullName: true } },
          pos: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      prescriptions: {
        where: inBranch,
        include: { doctor: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: "desc" },
      },
      labOrders: {
        where: inBranch,
        include: {
          doctor: { select: { id: true, fullName: true } },
          firma: { select: { id: true, name: true } },
          trips: { orderBy: { order: "asc" } },
          invoices: { where: { status: "ACTIVE" }, orderBy: { issuedAt: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      },
      taksitPlanlari: {
        where: inBranch,
        include: {
          doctor: { select: { id: true, fullName: true } },
          taksitler: { orderBy: { vadeDate: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      },
      treatmentPlans: {
        where: inBranch,
        include: {
          doctor: { select: { id: true, fullName: true } },
          steps: { orderBy: { order: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      },
      documents: {
        where: { archivedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, category: true, fileName: true, mimeType: true, fileSize: true, toothNo: true, note: true, createdAt: true },
      },
      consents: {
        orderBy: { signedAt: "desc" },
        select: { id: true, title: true, category: true, status: true, signerName: true, signedAt: true, voidedAt: true, voidReason: true },
      },
      followUps: { where: inBranch, orderBy: { createdAt: "desc" } },
      waitlistEntries: { where: inBranch, orderBy: { createdAt: "desc" } },
    },
  });

  if (!patient) {
    return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
  }

  // Bu uç, hastanın kendi verisini talep etmesi için değil, personelin onun
  // adına bir dışa aktarma yapması için kullanılıyor — panelde telefonu
  // görmesine izin verilmeyen bir rol (DOKTOR/ASISTAN), bu endpoint'i
  // kullanarak maskelemeyi bypass edemesin.
  const hidePhone = await shouldHidePatientPhoneForRole(auth.user.role);
  // Hasta dosyasıyla aynı kural: telefonu göremeyen rol TC numarasını da göremez.
  const patientForExport = hidePhone ? { ...patient, phone: "***", tcNo: patient.tcNo ? "***" : patient.tcNo } : patient;

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    exportedBy: auth.user.fullName || auth.user.id,
    legalBasis: "KVKK m.11 — ilgili kişinin veri erişim/taşınabilirlik talebi",
    note: "Belgeler/röntgenler dosya içeriği hariç meta veri olarak listelenmiştir; dosyaların kendisi panelden ilgili hastanın belge sekmesinden indirilebilir.",
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
