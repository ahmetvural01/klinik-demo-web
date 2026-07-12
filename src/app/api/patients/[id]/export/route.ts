import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

type Params = { params: { id: string } };

/**
 * KVKK m.11 (ilgili kişinin erişim/taşınabilirlik hakkı) için hastanın sistemde
 * tutulan tüm verilerini tek bir dosyada dışa aktarır. Erişim audit log'a yazılır.
 */
export async function GET(_: NextRequest, { params }: Params) {
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

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    exportedBy: auth.user.fullName || auth.user.id,
    legalBasis: "KVKK m.11 — ilgili kişinin veri erişim/taşınabilirlik talebi",
    note: "Belgeler/röntgenler dosya içeriği hariç meta veri olarak listelenmiştir; dosyaların kendisi panelden ilgili hastanın belge sekmesinden indirilebilir.",
    patient,
  };

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
