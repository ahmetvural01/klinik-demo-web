// Laboratuvar API uçlarının ortak parçaları: yanıtta hangi ilişkilerin
// döneceği, iç alanların (requestKey) temizlenmesi, telefon gizleme ve iş
// kapanınca açık "Lab prova randevusu" takiplerinin kapatılması. Önceden her
// uç bunları ayrı yazıyordu; bazı uçlar (gönderim/geliş) hasta telefonunu
// gizleme kuralına bakmadan döndürüyordu.
import type { Prisma } from "@prisma/client";
import { shouldHidePatientPhoneForRole, shouldHidePatientPhoneForUser } from "@/lib/patient-visibility-server";
import { labSourceToken } from "@/lib/lab-firma-integration";
import { BusinessRuleError } from "@/lib/public-error";

export const LAB_ORDER_INCLUDE = {
  invoices: { where: { status: "ACTIVE" }, orderBy: { issuedAt: "asc" } },
  patient: { select: { id: true, fullName: true, phone: true } },
  doctor: { select: { id: true, fullName: true } },
  trips: { orderBy: { order: "asc" } },
  // "Dönüş gecikti — laboratuvarı arayın" derken numara ekranda olsun (firma
  // kartındaki telefon; firma ekranı yetkisi gerektirmez, yalnız numara döner).
  firma: { select: { phone: true } },
} satisfies Prisma.LabOrderInclude;

type LabOrderViewer = Parameters<typeof shouldHidePatientPhoneForUser>[0];

/**
 * Yanıttan iç işlem anahtarlarını çıkarır; kullanıcı telefonu göremiyorsa maskeler.
 * Oturum kullanıcısı (auth.user) verilir: rol matrisi + kişiye özel şube izni
 * (Personel › Şube erişimi) birlikte uygulanır. Yalnız rol adı verilirse eski
 * (yalnız rol) kural geçerlidir.
 */
export async function toPublicLabOrder(order: Record<string, unknown> | null | undefined, viewer?: LabOrderViewer | string | null): Promise<Record<string, unknown> | null> {
  if (!order) return null;
  const { requestKey: _requestKey, ...rest } = order;
  const invoices = Array.isArray(rest.invoices)
    ? rest.invoices.map((invoice: unknown) => {
        if (!invoice || typeof invoice !== "object") return invoice;
        const { requestKey: _invoiceRequestKey, ...publicInvoice } = invoice as Record<string, unknown>;
        return publicInvoice;
      })
    : rest.invoices;
  let patient: unknown = rest.patient;
  const hidePhone = !viewer
    ? false
    : typeof viewer === "string" ? await shouldHidePatientPhoneForRole(viewer) : await shouldHidePatientPhoneForUser(viewer);
  if (hidePhone && patient && typeof patient === "object") {
    patient = { ...(patient as Record<string, unknown>), phone: "***" };
  }
  return { ...rest, invoices, patient };
}

/**
 * İş hastaya takıldığında veya iptal edildiğinde bu işe bağlı açık Hasta
 * Takip kayıtlarını (lab prova randevusu araması) kapatır. Önceden iş bitse
 * de takip açık kalıyor, personel provası çoktan yapılmış hastayı aramaya
 * devam ediyordu.
 */
export async function closeOpenLabFollowUps(tx: Prisma.TransactionClient, labOrderId: string, resolutionNote: string) {
  return tx.patientFollowUp.updateMany({
    where: { labOrderId, status: "ACIK" },
    data: { status: "KAPALI", closedAt: new Date(), resolutionNote },
  });
}

type DebtGuardInvoice = {
  id: string;
  amount: Prisma.Decimal | number;
  labOrder: { branchId: string; firmaId: string | null };
};

/**
 * Lab faturası tutarı düşürülürken/iptal edilirken firma bakiyesi eksiye
 * düşmesin (laboratuvara ödemesi yapılmış borç sessizce silinmesin). Önceden
 * yalnız elle fatura düzeltme/iptalde çağrılıyordu; iş iptali ve yeniden
 * yapımda faturalar bu kontrol olmadan geri alınıyordu.
 */
export async function assertDebtReductionAllowed(tx: Prisma.TransactionClient, invoice: DebtGuardInvoice, nextAmount: number) {
  const reduction = Math.max(0, Number(invoice.amount) - nextAmount);
  if (reduction <= 0) return;

  const source = await tx.firmaIslem.findFirst({
    where: {
      status: "AKTIF",
      branchId: invoice.labOrder.branchId,
      aciklama: { contains: labSourceToken({ labInvoiceId: invoice.id }) },
    },
    select: { firmaId: true },
  });
  const firmaId = source?.firmaId || invoice.labOrder.firmaId;
  if (!firmaId) return;

  await tx.$queryRaw`SELECT "id" FROM "Firma" WHERE "id" = ${firmaId} FOR UPDATE`;
  const rows = await tx.firmaIslem.groupBy({
    by: ["islemTipi"],
    where: { firmaId, branchId: invoice.labOrder.branchId, status: "AKTIF" },
    _sum: { tutar: true },
  });
  const balance = Math.round(rows.reduce((sum: number, row) => {
    const amount = Number(row._sum.tutar || 0);
    return sum + (row.islemTipi === "ODEME" ? -amount : amount);
  }, 0) * 100) / 100;

  if (balance - reduction < 0) {
    throw new BusinessRuleError(
      "Bu düzeltme firma bakiyesini eksiye düşürür. Önce bu faturaya ilişkin firma ödemesini düzeltin veya iptal edin.",
      409,
    );
  }
}
