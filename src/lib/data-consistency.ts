import { prisma } from "@/lib/prisma";
import { LAB_SOURCE_PREFIX } from "@/lib/lab-firma-integration";

export type ConsistencySeverity = "critical" | "warning" | "info";

export type ConsistencyRecordRef = { label: string; href: string };

export type ConsistencyIssue = {
  id: string;
  severity: ConsistencySeverity;
  area: string;
  title: string;
  detail: string;
  count: number;
  action: string;
  href?: string;
  // Uyarıya sebep olan KAYITLARIN kendisi — verilmişse sistem-izleme ekranı
  // yalnızca ilgili genel sayfaya değil, doğrudan o kayda (ör. ?orderId=...)
  // yönlendiren tekil bağlantılar listeler (bkz. kullanıcı geri bildirimi:
  // "uyarıya sebep olan kayda yönlendirmeli").
  records?: ConsistencyRecordRef[];
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
  return {
    status: "ACTIVE",
    ...(institutionId ? { institutionId } : {}),
  };
}

function countNormalizedDuplicates(rows: Array<{ id: string; name: string }>) {
  const seen = new Set<string>();
  let duplicateCount = 0;
  for (const row of rows) {
    const key = row.name.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
    if (!key) continue;
    if (seen.has(key)) duplicateCount += 1;
    else seen.add(key);
  }
  return duplicateCount;
}

async function countPurchaseTotalMismatches(institutionId?: string | null) {
  const purchases = await prisma.purchase.findMany({
    where: {
      status: "AKTIF",
      receiptStatus: "TESLIM_ALINDI",
      ...(institutionId ? { institutionId } : {}),
    },
    select: {
      id: true,
      createdAt: true,
      firmaId: true,
      firma: { select: { name: true } },
      items: { select: { lineTotal: true } },
      firmaIslem: { select: { tutar: true, status: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 1000,
  });

  const mismatched = purchases.filter((purchase) => {
    const itemTotal = Math.round(
      purchase.items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0) * 100,
    ) / 100;
    return !purchase.firmaIslem
      || purchase.firmaIslem.status !== "AKTIF"
      || Math.abs(itemTotal - Number(purchase.firmaIslem.tutar || 0)) > 0.009;
  });

  const records: ConsistencyRecordRef[] = mismatched.slice(0, 20).map((purchase) => ({
    label: `${purchase.firma?.name || "Bilinmeyen firma"} — ${new Date(purchase.createdAt).toLocaleDateString("tr-TR")}`,
    href: purchase.firmaId ? `/firma-detay?id=${purchase.firmaId}` : "/firma",
  }));

  return { count: mismatched.length, records };
}

async function countLabInvoiceTotalMismatches(institutionId?: string | null) {
  const orders = await prisma.labOrder.findMany({
    where: {
      status: { not: "IPTAL" },
      OR: [
        { price: { not: 0 } },
        { invoices: { some: {} } },
      ],
      ...(institutionId ? { patient: { institutionId } } : {}),
    },
    select: {
      price: true,
      invoices: { select: { amount: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 1000,
  });

  return orders.filter((order) => {
    const invoiceTotal = Math.round(
      order.invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0) * 100,
    ) / 100;
    return Math.abs(invoiceTotal - Number(order.price || 0)) > 0.009;
  }).length;
}

async function countOverpaidFirms(institutionId?: string | null) {
  const firms = await prisma.firma.findMany({
    where: {
      isActive: true,
      ...(institutionId ? { institutionId } : {}),
    },
    select: {
      islemler: {
        where: { status: "AKTIF" },
        select: { islemTipi: true, tutar: true },
      },
    },
    take: 2000,
  });

  return firms.filter((firma) => {
    const balance = firma.islemler.reduce((sum, row) => {
      const amount = Number(row.tutar || 0);
      return sum + (row.islemTipi === "ODEME" ? -amount : amount);
    }, 0);
    return balance < -0.009;
  }).length;
}

async function countFirmaPaymentAllocationMismatches(institutionId?: string | null) {
  const scope = institutionId ? { firma: { institutionId } } : {};
  const [payments, debts, allocations] = await Promise.all([
    prisma.firmaIslem.findMany({
      where: { ...scope, status: "AKTIF", islemTipi: "ODEME" },
      select: {
        id: true,
        tutar: true,
        paymentAllocations: {
          where: {
            debtIslem: { status: "AKTIF", islemTipi: { in: ["ALIM", "HIZMET"] } },
          },
          select: { tutar: true },
        },
      },
      take: 5000,
    }),
    prisma.firmaIslem.findMany({
      where: { ...scope, status: "AKTIF", islemTipi: { in: ["ALIM", "HIZMET"] } },
      select: {
        id: true,
        tutar: true,
        debtAllocations: {
          where: { paymentIslem: { status: "AKTIF", islemTipi: "ODEME" } },
          select: { tutar: true },
        },
      },
      take: 5000,
    }),
    prisma.firmaPaymentAllocation.findMany({
      where: institutionId ? { firma: { institutionId } } : {},
      select: {
        firmaId: true,
        paymentIslem: { select: { firmaId: true, status: true, islemTipi: true } },
        debtIslem: { select: { firmaId: true, status: true, islemTipi: true } },
      },
      take: 10000,
    }),
  ]);

  const unmatchedPayments = payments.filter((payment) => {
    const allocated = payment.paymentAllocations.reduce(
      (sum, allocation) => sum + Number(allocation.tutar || 0),
      0,
    );
    return Math.abs(allocated - Number(payment.tutar || 0)) > 0.009;
  }).length;
  const overallocatedDebts = debts.filter((debt) => {
    const allocated = debt.debtAllocations.reduce(
      (sum, allocation) => sum + Number(allocation.tutar || 0),
      0,
    );
    return allocated - Number(debt.tutar || 0) > 0.009;
  }).length;
  const invalidAllocations = allocations.filter((allocation) => (
    allocation.paymentIslem.firmaId !== allocation.firmaId
    || allocation.debtIslem.firmaId !== allocation.firmaId
    || allocation.paymentIslem.status !== "AKTIF"
    || allocation.paymentIslem.islemTipi !== "ODEME"
    || allocation.debtIslem.status !== "AKTIF"
    || !["ALIM", "HIZMET"].includes(allocation.debtIslem.islemTipi)
  )).length;

  return unmatchedPayments + overallocatedDebts + invalidAllocations;
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
    select: {
      id: true,
      labOrderId: true,
      labOrder: { select: { labType: true, patient: { select: { fullName: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 250,
  });

  if (invoices.length === 0) return { count: 0, records: [] as ConsistencyRecordRef[] };

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

  const unlinked = invoices.filter((invoice) => !linkedInvoiceIds.has(invoice.id));
  const records: ConsistencyRecordRef[] = unlinked.slice(0, 20).map((invoice) => ({
    label: `${invoice.labOrder.patient?.fullName || "Bilinmeyen hasta"} — ${invoice.labOrder.labType}`,
    href: `/lab?orderId=${invoice.labOrderId}`,
  }));

  return { count: unlinked.length, records };
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
    labInvoiceNoFirmaMovementResult,
    purchaseTotalMismatchResult,
    labInvoiceTotalMismatch,
    overpaidFirms,
    firmaPaymentAllocationMismatch,
    recentPayments,
    activeStockNames,
    activeFirmaNames,
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
        ...paymentScope,
      },
    }),
    prisma.payment.count({
      where: { patientId: null, doctorId: null, ...paymentScope },
    }),
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
          receiptStatus: "TESLIM_ALINDI",
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
    countPurchaseTotalMismatches(institutionId),
    countLabInvoiceTotalMismatches(institutionId),
    countOverpaidFirms(institutionId),
    countFirmaPaymentAllocationMismatches(institutionId),
    prisma.payment.findMany({
      where: paymentScope,
      select: {
        id: true,
        patientId: true,
        doctorId: true,
        method: true,
        amount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    prisma.stockItem.findMany({
      where: {
        isActive: true,
        ...(institutionId ? { institutionId } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
    prisma.firma.findMany({
      where: {
        isActive: true,
        ...(institutionId ? { institutionId } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
  ]);

  const labInvoiceNoFirmaMovement = labInvoiceNoFirmaMovementResult.count;
  const purchaseTotalMismatch = purchaseTotalMismatchResult.count;

  const paymentFingerprints = new Map<string, number>();
  recentPayments.forEach((payment) => {
    const minute = payment.createdAt.toISOString().slice(0, 16);
    const key = [
      payment.patientId || "-",
      payment.doctorId || "-",
      payment.method,
      Number(payment.amount).toFixed(2),
      minute,
    ].join("|");
    paymentFingerprints.set(key, (paymentFingerprints.get(key) || 0) + 1);
  });
  const suspectedDuplicatePayments = Array.from(paymentFingerprints.values())
    .reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const duplicateStockNames = countNormalizedDuplicates(activeStockNames);
  const duplicateFirmaNames = countNormalizedDuplicates(activeFirmaNames);

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
    id: "payment-suspected-duplicate",
    severity: "warning",
    area: "Muhasebe",
    title: "Olası mükerrer tahsilat",
    detail: "Aynı hasta, doktor, yöntem ve tutarla aynı dakika içinde birden fazla tahsilat bulundu.",
    count: suspectedDuplicatePayments,
    action: "Muhasebe defterinde kayıtları karşılaştırın; gerçek tekrarları silin.",
    href: "/muhasebe?tab=defter",
  });

  addIssue(issues, {
    id: "stock-duplicate-name",
    severity: "warning",
    area: "Stok",
    title: "Aynı isimli stok kartı",
    detail: "Büyük/küçük harf veya boşluk farkıyla yinelenen stok kartları ortalama maliyet ve miktarı bölebilir.",
    count: duplicateStockNames,
    action: "Stok kartlarını tek kartta birleştirin.",
    href: "/stok",
  });

  addIssue(issues, {
    id: "firma-duplicate-name",
    severity: "warning",
    area: "Satın Alma",
    title: "Aynı isimli firma kartı",
    detail: "Aynı firmanın birden fazla kartı borç, ödeme ve laboratuvar geçmişini bölebilir.",
    count: duplicateFirmaNames,
    action: "Firma kayıtlarını tek kartta birleştirin.",
    href: "/firma",
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
    records: labInvoiceNoFirmaMovementResult.records,
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
    id: "purchase-total-mismatch",
    severity: "critical",
    area: "Satın Alma",
    title: "Satın alma toplamı ile firma borcu uyuşmuyor",
    detail: "Satır toplamı, bağlı firma cari hareketinden farklıysa stok maliyeti ile borç kaydı ayrışır.",
    count: purchaseTotalMismatch,
    action: "Satın alma kaydını açıp satırları ve bağlı firma hareketini doğrulayın.",
    href: "/firma",
    records: purchaseTotalMismatchResult.records,
  });

  addIssue(issues, {
    id: "lab-invoice-total-mismatch",
    severity: "warning",
    area: "Laboratuvar",
    title: "Laboratuvar fatura toplamı uyuşmuyor",
    detail: "Fatura kalemleri toplamı ile laboratuvar işinin toplam ücreti farklı görünüyor.",
    count: labInvoiceTotalMismatch,
    action: "Laboratuvar işindeki fatura kalemlerini kontrol edin.",
    href: "/lab",
  });

  addIssue(issues, {
    id: "firma-overpaid",
    severity: "warning",
    area: "Firma Cari",
    title: "Bakiyesinden fazla ödeme yapılmış firma",
    detail: "Firma ödemeleri aktif borç toplamını aşmış; eski veya mükerrer ödeme kaydı olabilir.",
    count: overpaidFirms,
    action: "Firma ekstresindeki ödeme kayıtlarını karşılaştırın.",
    href: "/firma",
  });

  addIssue(issues, {
    id: "firma-payment-allocation-mismatch",
    severity: "critical",
    area: "Firma Cari",
    title: "Firma ödeme dağılımı uyuşmuyor",
    detail: "Aktif firma ödemesinin borçlara dağıtılan toplamı, ödeme tutarıyla eşleşmiyor veya geçersiz bir borç ilişkisi içeriyor.",
    count: firmaPaymentAllocationMismatch,
    action: "Firma ekstresini açıp ödeme ve borç kayıtlarını kontrol edin.",
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
