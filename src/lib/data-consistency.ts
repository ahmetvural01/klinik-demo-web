import { prisma } from "@/lib/prisma";
import { LAB_SOURCE_PREFIX } from "@/lib/lab-firma-integration";

export type ConsistencySeverity = "critical" | "warning" | "info";

export type ConsistencyIssue = {
  id: string;
  severity: ConsistencySeverity;
  area: string;
  title: string;
  detail: string;
  count: number;
  action: string;
  href?: string;
};

export type ConsistencyPayload = {
  generatedAt: string;
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
    score: number;
  };
  issues: ConsistencyIssue[];
};

const addIssue = (
  issues: ConsistencyIssue[],
  input: Omit<ConsistencyIssue, "count"> & { count: number },
) => {
  if (input.count <= 0) return;
  issues.push(input);
};

function paymentInstitutionScope(institutionId?: string | null) {
  if (!institutionId) return {};
  return {
    OR: [
      { patient: { institutionId } },
      { doctor: { institutionId } },
    ],
  };
}

// LAB_FATURA entegrasyon token'ı için bkz. src/lib/lab-firma-integration.ts —
// aciklama alanında serbest metin olarak tutulan token, gerçek bir foreign key
// değil; prefix tek kaynaktan (LAB_SOURCE_PREFIX) alınır, format değişirse
// burada da otomatik güncellenir.
const LAB_INVOICE_TOKEN_PREFIX = `${LAB_SOURCE_PREFIX}INVOICE:`;

async function countUnlinkedLabInvoices(institutionId?: string | null) {
  const invoices = await prisma.labOrderInvoice.findMany({
    where: {
      labOrder: {
        status: { not: "IPTAL" },
        ...(institutionId ? { patient: { institutionId } } : {}),
        firmaId: { not: null },
      },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 250,
  });

  if (invoices.length === 0) return 0;

  // 250 ayrı sorgu yerine (N+1) TEK bir sorgu ile bu tip token'ları içeren tüm
  // aktif firma hareketlerini çekip eşleşmeyi bellekte yapıyoruz.
  const movements = await prisma.firmaIslem.findMany({
    where: {
      status: "AKTIF",
      aciklama: { contains: LAB_INVOICE_TOKEN_PREFIX },
    },
    select: { aciklama: true },
  });
  const linkedInvoiceIds = new Set(
    movements
      .map((m: { aciklama: string | null }) => {
        const raw = m.aciklama || "";
        const start = raw.indexOf(LAB_INVOICE_TOKEN_PREFIX);
        if (start === -1) return null;
        const end = raw.indexOf("]", start);
        if (end === -1) return null;
        return raw.slice(start + LAB_INVOICE_TOKEN_PREFIX.length, end);
      })
      .filter((id: string | null): id is string => Boolean(id)),
  );

  return invoices.filter((invoice: { id: string }) => !linkedInvoiceIds.has(invoice.id)).length;
}

export async function buildDataConsistencyReport(institutionId?: string | null): Promise<ConsistencyPayload> {
  const paymentScope = paymentInstitutionScope(institutionId);

  const [
    paymentMissingPatient,
    paymentMissingDoctor,
    paymentFullyOrphaned,
    paymentCardNoPos,
    labMissingFirma,
    labFirmaNotLab,
    labInvoiceOrderMissingFirma,
    purchaseItemNoMovement,
    negativeStock,
    taksitPaidMismatch,
    taksitOpenMismatch,
    openLabWithoutTrip,
    labInvoiceNoFirmaMovement,
  ] = await Promise.all([
    prisma.payment.count({
      where: {
        patientId: null,
        ...paymentScope,
      },
    }),
    prisma.payment.count({
      where: {
        doctorId: null,
        ...(institutionId ? { patient: { institutionId } } : {}),
      },
    }),
    // Payment tablosunda doğrudan institutionId kolonu yok — hasta VEYA doktor
    // ilişkisinden biri üzerinden kuruma bağlanıyor. patientId VE doctorId ikisi
    // birden null ise bu kaydın hangi kuruma ait olduğu hiçbir şekilde tespit
    // edilemez (yukarıdaki iki kontrol de bu satırı kaçırır). Bu yüzden kurum
    // bazlı taramaya değil, yalnızca platform geneli (superadmin) görünümüne
    // dahil ediyoruz — /api/kasa artık böyle bir kayıt oluşturulmasını
    // engelliyor, bu sayaç yalnızca eski/legacy kayıtları yakalamak için var.
    institutionId
      ? Promise.resolve(0)
      : prisma.payment.count({ where: { patientId: null, doctorId: null } }),
    prisma.payment.count({
      where: {
        method: { in: ["KREDI_KARTI", "MAIL_ORDER"] },
        posId: null,
        ...paymentScope,
      },
    }),
    prisma.labOrder.count({
      where: {
        status: { not: "IPTAL" },
        firmaId: null,
        ...(institutionId ? { patient: { institutionId } } : {}),
      },
    }),
    prisma.labOrder.count({
      where: {
        status: { not: "IPTAL" },
        firmaId: { not: null },
        firma: { kategori: { not: "LAB" } },
        ...(institutionId ? { patient: { institutionId } } : {}),
      },
    }),
    prisma.labOrderInvoice.count({
      where: {
        labOrder: {
          status: { not: "IPTAL" },
          firmaId: null,
          ...(institutionId ? { patient: { institutionId } } : {}),
        },
      },
    }),
    prisma.purchaseItem.count({
      where: {
        stockMovementId: null,
        purchase: {
          status: "AKTIF",
          ...(institutionId ? { institutionId } : {}),
        },
      },
    }),
    prisma.stockItem.count({
      where: {
        isActive: true,
        quantity: { lt: 0 },
        ...(institutionId ? { institutionId } : {}),
      },
    }),
    prisma.taksit.count({
      where: {
        status: "ODENDI",
        kalan: { gt: 0 },
        ...(institutionId ? { plan: { patient: { institutionId } } } : {}),
      },
    }),
    prisma.taksit.count({
      where: {
        status: { in: ["BEKLIYOR", "GECIKTI"] },
        kalan: { lte: 0 },
        ...(institutionId ? { plan: { patient: { institutionId } } } : {}),
      },
    }),
    prisma.labOrder.count({
      where: {
        status: "DEVAM_EDIYOR",
        trips: { none: {} },
        ...(institutionId ? { patient: { institutionId } } : {}),
      },
    }),
    countUnlinkedLabInvoices(institutionId),
  ]);

  const issues: ConsistencyIssue[] = [];

  addIssue(issues, {
    id: "payment-missing-patient",
    severity: "critical",
    area: "Muhasebe",
    title: "Hastaya bağlı olmayan tahsilat",
    detail: "Tahsilatın hasta ile ilişkisi kopuksa hasta finansı, alacak ve dışa aktarma raporları eksik görünür.",
    count: paymentMissingPatient,
    action: "Tahsilat kayıtlarını hasta ile eşleştirin.",
    href: "/muhasebe",
  });

  addIssue(issues, {
    id: "payment-missing-doctor",
    severity: "warning",
    area: "Hakediş",
    title: "Doktor bilgisi olmayan tahsilat",
    detail: "Doktor seçilmemiş tahsilatlar hakediş hesabına eksik yansıyabilir.",
    count: paymentMissingDoctor,
    action: "Tahsilat düzenleme ekranından doktor bilgisini tamamlayın.",
    href: "/muhasebe?tab=defter",
  });

  addIssue(issues, {
    id: "payment-fully-orphaned",
    severity: "critical",
    area: "Muhasebe",
    title: "Ne hastaya ne doktora bağlı tahsilat (platform geneli)",
    detail: "Bu kayıtların hangi kuruma ait olduğu tespit edilemiyor; eski/legacy veri olabilir. Yeni kayıt oluşumu /api/kasa üzerinden artık engellendi.",
    count: paymentFullyOrphaned,
    action: "Veritabanından ilgili kaydı bulup manuel olarak bir hasta/doktor ile ilişkilendirin veya silin.",
    href: "/superadmin/audit",
  });

  addIssue(issues, {
    id: "payment-card-no-pos",
    severity: "warning",
    area: "Kasa",
    title: "POS seçilmeden alınan kart/mail order tahsilatı",
    detail: "Kart ve mail order tahsilatlarında POS seçimi yoksa gün sonu POS mutabakatı zayıflar.",
    count: paymentCardNoPos,
    action: "İlgili tahsilatlarda POS cihazı seçin.",
    href: "/muhasebe?tab=defter",
  });

  addIssue(issues, {
    id: "lab-missing-firma",
    severity: "critical",
    area: "Laboratuvar",
    title: "Firmaya bağlanmamış laboratuvar işi",
    detail: "Laboratuvar işi firma kartına bağlı değilse fatura, borç ve ödeme takibi kopar.",
    count: labMissingFirma,
    action: "Laboratuvar işini firma kartındaki laboratuvar kaydıyla eşleştirin.",
    href: "/lab",
  });

  addIssue(issues, {
    id: "lab-firma-not-lab",
    severity: "critical",
    area: "Laboratuvar",
    title: "Laboratuvar işi yanlış firma türüne bağlı",
    detail: "Lab işi yalnızca laboratuvar olarak işaretli firmalara bağlı olmalı.",
    count: labFirmaNotLab,
    action: "Firma kartında türü Laboratuvar yapın veya işi doğru firmaya taşıyın.",
    href: "/firma",
  });

  addIssue(issues, {
    id: "lab-invoice-missing-firma",
    severity: "critical",
    area: "Firma Cari",
    title: "Firma bağlantısı olmayan lab faturası",
    detail: "Fatura girilmiş ama laboratuvar firma bağlantısı yok; bu borç firmaya yansımayabilir.",
    count: labInvoiceOrderMissingFirma,
    action: "Lab işi firma kartına bağlandıktan sonra faturayı tekrar kontrol edin.",
    href: "/lab",
  });

  addIssue(issues, {
    id: "lab-invoice-no-firma-movement",
    severity: "warning",
    area: "Firma Cari",
    title: "Cari hareketi oluşmamış lab faturası",
    detail: "Son 250 lab faturası içinde firma ekstresine yansımayan kayıt bulundu.",
    count: labInvoiceNoFirmaMovement,
    action: "Fatura kaydını açıp firma hareketini yeniden oluşturun.",
    href: "/lab",
  });

  addIssue(issues, {
    id: "purchase-item-no-stock-movement",
    severity: "critical",
    area: "Stok",
    title: "Stok girişine bağlanmamış satın alma satırı",
    detail: "Satın alınan ürün stok hareketine bağlı değilse stok miktarı ve ortalama maliyet hatalı olur.",
    count: purchaseItemNoMovement,
    action: "Satın alma kaydını kontrol edip stok girişini tamamlayın.",
    href: "/firma",
  });

  addIssue(issues, {
    id: "negative-stock",
    severity: "warning",
    area: "Stok",
    title: "Negatif stok",
    detail: "Stok miktarı sıfırın altına düşmüş kartlar var; tüketim veya giriş kayıtları kontrol edilmeli.",
    count: negativeStock,
    action: "Stok geçmişinden giriş/çıkış hareketlerini doğrulayın.",
    href: "/stok",
  });

  addIssue(issues, {
    id: "installment-paid-mismatch",
    severity: "warning",
    area: "Taksit",
    title: "Ödendi görünen ama kalan bakiyesi olan taksit",
    detail: "Taksit durumu ile kalan tutar uyumsuz.",
    count: taksitPaidMismatch,
    action: "Taksit planında ödeme durumunu yeniden hesaplatın veya düzeltin.",
    href: "/muhasebe?tab=alacak",
  });

  addIssue(issues, {
    id: "installment-open-mismatch",
    severity: "warning",
    area: "Taksit",
    title: "Açık görünen ama kalan bakiyesi olmayan taksit",
    detail: "Tahsil edilmiş taksit açık kalmış olabilir.",
    count: taksitOpenMismatch,
    action: "Taksit durumunu kapalı olarak güncelleyin.",
    href: "/muhasebe?tab=alacak",
  });

  addIssue(issues, {
    id: "lab-open-without-trip",
    severity: "info",
    area: "Laboratuvar",
    title: "Süreç adımı olmayan açık laboratuvar işi",
    detail: "Açık lab işinin gönderim/geliş adımı yok; hasta takipte ne beklendiği anlaşılmayabilir.",
    count: openLabWithoutTrip,
    action: "İşe ilk gönderim adımını ekleyin veya durumu kapatın.",
    href: "/lab",
  });

  const critical = issues.filter((issue) => issue.severity === "critical").length;
  const warning = issues.filter((issue) => issue.severity === "warning").length;
  const info = issues.filter((issue) => issue.severity === "info").length;
  const weightedCount = issues.reduce((sum, issue) => {
    const weight = issue.severity === "critical" ? 20 : issue.severity === "warning" ? 10 : 4;
    return sum + weight * Math.min(issue.count, 5);
  }, 0);
  const score = Math.max(0, 100 - weightedCount);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: issues.length,
      critical,
      warning,
      info,
      score,
    },
    issues,
  };
}
