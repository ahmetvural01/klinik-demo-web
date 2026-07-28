import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { shouldHidePatientPhone } from "@/lib/patient-visibility";

type Params = { params: Promise<{ id: string }> };

/**
 * KVKK m.11 (ilgili kişinin erişim/taşınabilirlik hakkı) için hastanın sistemde
 * tutulan tüm verilerini tek bir dosyada dışa aktarır. Erişim audit log'a yazılır.
 */
export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("patients:read");
  if (auth.error) return auth.error;

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
    include: {
      appointments: {
        include: { doctor: { select: { id: true, fullName: true } } },
        orderBy: { startAt: "desc" },
      },
      examinations: {
        include: { doctor: { select: { id: true, fullName: true } } },
        orderBy: { diagnosedAt: "desc" },
      },
      payments: {
        where: { status: "ACTIVE" },
        include: {
          doctor: { select: { id: true, fullName: true } },
          pos: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      prescriptions: {
        include: { doctor: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: "desc" },
      },
      labOrders: {
        include: {
          doctor: { select: { id: true, fullName: true } },
          firma: { select: { id: true, name: true } },
          trips: { orderBy: { order: "asc" } },
          invoices: { orderBy: { issuedAt: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      },
      taksitPlanlari: {
        include: {
          doctor: { select: { id: true, fullName: true } },
          taksitler: { orderBy: { vadeDate: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      },
      treatmentPlans: {
        include: {
          doctor: { select: { id: true, fullName: true } },
          steps: { orderBy: { order: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      },
      documents: {
        orderBy: { createdAt: "desc" },
        select: { id: true, category: true, fileName: true, mimeType: true, fileSize: true, toothNo: true, note: true, createdAt: true },
      },
      consents: {
        orderBy: { signedAt: "desc" },
        select: { id: true, title: true, category: true, status: true, signerName: true, signedAt: true, voidedAt: true, voidReason: true },
      },
      followUps: { orderBy: { createdAt: "desc" } },
      waitlistEntries: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!patient) {
    return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
  }

  // Bu uç, hastanın kendi verisini talep etmesi için değil, personelin onun
  // adına bir dışa aktarma yapması için kullanılıyor — panelde telefonu
  // görmesine izin verilmeyen bir rol (DOKTOR/ASISTAN), bu endpoint'i
  // kullanarak maskelemeyi bypass edemesin.
  const hidePhone = shouldHidePatientPhone(auth.user.role);
  const patientForExport = hidePhone ? { ...patient, phone: "***" } : patient;

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
    && !auth.user.ghost
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
