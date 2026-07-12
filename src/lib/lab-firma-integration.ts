import {
  applyFirmaIslemIntegration,
  reverseFirmaIslemIntegration,
  type IntegrationSummary,
} from "@/lib/firma-integration";

type TxClient = any;
const LAB_SOURCE_PREFIX = "[SISTEM:LAB_FATURA:";

type LabFirmaInput = {
  tx: TxClient;
  userId: string;
  institutionId?: string | null;
  labName: string;
  labType?: string | null;
  patientName?: string | null;
  item: string;
  amount: number;
  invoiceNo?: string | null;
  issuedAt?: Date | string | null;
  note?: string | null;
  labOrderId?: string | null;
  labInvoiceId?: string | null;
  // LabOrder.firmaId zaten biliniyorsa (sipariş oluşturulurken zaten bir Firma
  // seçilmiş demektir) isimle yeniden arama/oluşturma yapılmaz — doğrudan bu
  // kayıt kullanılır. Bkz. denetim raporu Tema 3.
  firmaId?: string | null;
};

export type LabFirmaIntegrationResult = {
  firmaId: string;
  firmaName: string;
  islemId: string;
  createdFirma: boolean;
  summary: IntegrationSummary;
};

function labSourceToken(input: {
  labInvoiceId?: string | null;
  labOrderId?: string | null;
  invoiceNo?: string | null;
  item?: string | null;
  amount?: number | null;
}) {
  const key = input.labInvoiceId
    ? `INVOICE:${input.labInvoiceId}`
    : `ORDER:${input.labOrderId || "unknown"}:${input.invoiceNo || "no-invoice"}:${input.item || "lab"}:${Number(input.amount || 0)}`;
  return `${LAB_SOURCE_PREFIX}${key}]`;
}

const LAB_FIRMA_SELECT = { id: true, name: true, institutionId: true, paymentTerms: true, customPaymentDays: true } as const;

async function findOrCreateLabFirma(tx: TxClient, labName: string, institutionId?: string | null, firmaId?: string | null) {
  // firmaId zaten biliniyorsa (LabOrder.firmaId) doğrudan onu kullan — isimle
  // yeniden arama yapmaya, dolayısıyla yanlış eşleşme/çakışma riskine gerek yok.
  if (firmaId) {
    const byId = await tx.firma.findUnique({ where: { id: firmaId }, select: LAB_FIRMA_SELECT });
    if (byId) return { firma: byId, created: false };
  }

  const name = labName.trim();
  const scope = institutionId ? { institutionId } : {};

  const exact = await tx.firma.findFirst({
    where: {
      ...scope,
      isActive: true,
      kategori: "LAB",
      name: { equals: name, mode: "insensitive" },
    },
    select: LAB_FIRMA_SELECT,
  });
  if (exact) return { firma: exact, created: false };

  const partial = await tx.firma.findFirst({
    where: {
      ...scope,
      isActive: true,
      kategori: "LAB",
      name: { contains: name, mode: "insensitive" },
    },
    select: LAB_FIRMA_SELECT,
  });
  if (partial) return { firma: partial, created: false };

  // Aktif eşleşme yok — ama pasifleştirilmiş aynı isimde bir firma olabilir.
  // Öyleyse yeni satır oluşturmaya çalışıp @@unique([institutionId, name])
  // çakışmasıyla tüm işlemi çökertmek yerine, mevcut kaydı yeniden aktive et
  // (bkz. denetim raporu Tema 4).
  const inactive = await tx.firma.findFirst({
    where: { ...scope, isActive: false, name: { equals: name, mode: "insensitive" } },
    select: LAB_FIRMA_SELECT,
  });
  if (inactive) {
    const reactivated = await tx.firma.update({
      where: { id: inactive.id },
      data: { isActive: true, kategori: "LAB" },
      select: LAB_FIRMA_SELECT,
    });
    return { firma: reactivated, created: false };
  }

  const created = await tx.firma.create({
    data: {
      institutionId: institutionId || null,
      name,
      kategori: "LAB",
      paymentTerms: "NET_30",
      notes: "Laboratuvar faturası üzerinden otomatik oluşturuldu.",
    },
    select: LAB_FIRMA_SELECT,
  });

  return { firma: created, created: true };
}

export async function applyLabInvoiceFirmaIntegration(input: LabFirmaInput): Promise<LabFirmaIntegrationResult | null> {
  const labName = input.labName?.trim();
  if (!labName || !input.item?.trim() || !Number(input.amount)) return null;

  const transactionDate = input.issuedAt ? new Date(input.issuedAt) : new Date();
  const { firma, created } = await findOrCreateLabFirma(input.tx, labName, input.institutionId, input.firmaId);
  const patientPart = input.patientName ? ` - ${input.patientName}` : "";
  const sourceToken = labSourceToken(input);

  const existing = await input.tx.firmaIslem.findFirst({
    where: {
      status: "AKTIF",
      aciklama: { contains: sourceToken },
    },
    select: { id: true },
  });

  if (existing) {
    return {
      firmaId: firma.id,
      firmaName: firma.name,
      islemId: existing.id,
      createdFirma: false,
      summary: { stockApplied: false, expenseApplied: false, notes: ["mevcut laboratuvar fatura entegrasyonu korundu"] },
    };
  }

  const refs = [
    sourceToken,
    input.labOrderId ? `Lab Sipariş: ${input.labOrderId}` : "",
    input.labInvoiceId ? `Lab Fatura Kaydı: ${input.labInvoiceId}` : "",
    input.note || "",
  ].filter(Boolean).join(" | ");

  const islem = await input.tx.firmaIslem.create({
    data: {
      firmaId: firma.id,
      tarih: transactionDate,
      islemTipi: "HIZMET",
      urunHizmet: `Lab: ${input.item || input.labType || "Laboratuvar hizmeti"}${patientPart}`,
      aciklama: refs || null,
      tutar: Number(input.amount),
      faturaNo: input.invoiceNo || null,
      dueDate: null,
      status: "AKTIF",
      kdvOrani: 0,
    },
  });

  const summary = await applyFirmaIslemIntegration({
    tx: input.tx,
    userId: input.userId,
    firma,
    islem: {
      ...islem,
      tutar: Number(islem.tutar),
      kdvOrani: Number(islem.kdvOrani),
    },
  });

  return {
    firmaId: firma.id,
    firmaName: firma.name,
    islemId: islem.id,
    createdFirma: created,
    summary,
  };
}

export async function reverseLabInvoiceFirmaIntegration(
  tx: TxClient,
  userId: string,
  input: {
    labInvoiceId?: string | null;
    labOrderId?: string | null;
    invoiceNo?: string | null;
    item?: string | null;
    amount?: number | null;
  },
) {
  const sourceToken = labSourceToken(input);
  const islemler = await tx.firmaIslem.findMany({
    where: {
      status: "AKTIF",
      aciklama: { contains: sourceToken },
    },
    select: { id: true },
  });

  for (const islem of islemler) {
    await tx.firmaIslem.update({
      where: { id: islem.id },
      data: { status: "IPTAL" },
    });
    await reverseFirmaIslemIntegration(tx, userId, islem.id);
  }

  return { reversedCount: islemler.length };
}
