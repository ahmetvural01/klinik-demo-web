import { NextRequest, NextResponse } from "next/server";
import { Prisma, type PaymentMethod, type TaksitPeriod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createIntegratedPayment } from "@/lib/payment-ledger";
import { hasEffectivePermission, requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { parsePagination } from "@/lib/pagination";
import { isValidDateKey, turkeyTodayStartUtc } from "@/lib/tz";
import { shouldHidePatientPhoneForUser } from "@/lib/patient-visibility-server";
import { effectiveDoctorWhere } from "@/lib/hakedis";
import { addInstallmentPeriod, INSTALLMENT_PERIODS } from "@/lib/installment-schedule";
import { requireActiveBranch } from "@/lib/branch-context";
import { posSelectionRequired } from "@/lib/pos-requirement";
import { computePatientBalances, loadOpenInstallmentSummaries } from "@/lib/patient-balance";
import { BusinessRuleError } from "@/lib/public-error";
import { formatCurrency } from "@/lib/format";

const AGING4_KEYS = ["current", "d0_30", "d31_60", "d60p"] as const;

function bucketAging4(rows: { kalan: unknown; vadeDate: Date }[]) {
  const buckets = AGING4_KEYS.map((key) => ({ key, amount: 0, count: 0 }));
  const now = new Date();
  for (const row of rows) {
    const days = Math.floor((now.getTime() - new Date(row.vadeDate).getTime()) / 86400000);
    const bucket = days <= 0 ? buckets[0] : days <= 30 ? buckets[1] : days <= 60 ? buckets[2] : buckets[3];
    bucket.amount += Number(row.kalan || 0);
    bucket.count += 1;
  }
  return buckets;
}

function bucketAging5(rows: { kalan: unknown; vadeDate: Date }[]) {
  // Sıra: Bugün Vadeli, 1-30 Gün Geç, 31-60 Gün, 60+ Gün, Gelecek
  const buckets = [0, 1, 2, 3, 4].map(() => ({ amount: 0, count: 0 }));
  const now = new Date();
  for (const row of rows) {
    const due = new Date(row.vadeDate);
    const diffDays = Math.floor((now.getTime() - due.getTime()) / 86400000);
    const idx =
      due.toDateString() === now.toDateString() ? 0 :
      diffDays > 0 && diffDays <= 30 ? 1 :
      diffDays > 30 && diffDays <= 60 ? 2 :
      diffDays > 60 ? 3 : 4;
    buckets[idx].amount += Number(row.kalan || 0);
    buckets[idx].count += 1;
  }
  return buckets;
}

export const GET = withApiTiming("taksit-plani", async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth("installments:read");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });
    const user = auth.user;
    if (user.role !== "SUPERADMIN" && !user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const patientId = searchParams.get("patientId");
    const q = (searchParams.get("q") || "").trim();
    // stats=0: sayaç gerekmeyen çağrılar (ör. tahsilat formunun hasta bağlamı,
    // özeti ayrıca okunan süzgeçler) altı istatistik sorgusunu atlar.
    const withStats = searchParams.get("stats") !== "0";
    const { page, take, skip, pageCount } = parsePagination(searchParams, { defaultTake: 25, maxTake: 100 });

    // Kurum geneli taksit listesi Muhasebe ekranının işidir (finance:center).
    // Tek hastanın planları (hasta dosyası › Hesap, tahsilat formu) taksit
    // okuma izniyle açılmaya devam eder. Önceden finans merkezi olmayan rol
    // (ör. asistan) patientId vermeden kliniğin bütün planlarını okuyabiliyordu.
    if (!patientId && !(await hasEffectivePermission(user, "finance:center"))) {
      return NextResponse.json({ error: "Tüm hastaların taksit listesini görme yetkiniz yok; hastanın planına hasta dosyasından bakabilirsiniz." }, { status: 403 });
    }

    const baseWhere: Record<string, unknown> = { institutionId: user.institutionId, branchId: branch.branchId };
    if (patientId) baseWhere.patientId = patientId;

    const planStatuses = new Set(["AKTIF", "DEVAM_EDIYOR", "TAMAMLANDI", "IPTAL"]);
    const taksitStatuses = new Set(["BEKLIYOR", "ODENDI", "GECIKTI", "IPTAL"]);
    // "ACIK": ödemesi süren planlar (AKTIF + DEVAM_EDIYOR) — Muhasebe > Taksitler'in varsayılan görünümü.
    if (status && status !== "HEPSI" && status !== "ACIK" && !planStatuses.has(status) && !taksitStatuses.has(status)) {
      return NextResponse.json({ error: "Geçersiz taksit durumu" }, { status: 400 });
    }

    const todayStart = turkeyTodayStartUtc();
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    // Vadesi geçmiş BEKLIYOR taksitler yalnızca /api/taksit-plani/mark-gecikti
    // çalıştıktan SONRA DB'de gerçekten "GECIKTI" olur — bu asenkron/fire-and-forget
    // çağrılır (bkz. muhasebe/page.tsx), yani bu endpoint'e gelen bir istek o iş
    // bitmeden önce çalışabilir ve gerçekten gecikmiş bir taksidi "Bekliyor"
    // olarak gösterebilirdi (bkz. denetim raporu). Bu yüzden "GECIKTI" hem filtre
    // hem de dönen veri seviyesinde DB'deki ham değere değil, canlı türetilmiş
    // duruma göre hesaplanır.
    const overdueTaksitWhere = { status: "BEKLIYOR", vadeDate: { lt: todayStart } };
    if (status && status !== "HEPSI") {
      if (status === "ACIK") {
        baseWhere.status = { in: ["AKTIF", "DEVAM_EDIYOR"] };
      } else if (planStatuses.has(status)) {
        baseWhere.status = status;
      } else if (status === "GECIKTI") {
        baseWhere.taksitler = { some: { OR: [{ status: "GECIKTI" }, overdueTaksitWhere] } };
      } else if (taksitStatuses.has(status)) {
        baseWhere.taksitler = { some: { status } };
      }
    }

    const searchWhere = q
      ? {
          OR: [
            { patient: { fullName: { contains: q, mode: "insensitive" as const } } },
            { doctor: { fullName: { contains: q, mode: "insensitive" as const } } },
            { baslik: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const listWhere = q ? { AND: [baseWhere, searchWhere] } : baseWhere;

    // Özet sorguları (geciken, kalan, yaşlandırma) yalnız istendiğinde.
    const statsPromise = withStats
      ? Promise.all([
          (prisma as any).taksit.findMany({
            where: { plan: baseWhere, OR: [{ status: "GECIKTI" }, overdueTaksitWhere] },
            select: { planId: true },
            distinct: ["planId"],
            take: 20000,
          }),
          (prisma as any).taksit.aggregate({
            _sum: { kalan: true },
            where: { plan: { ...baseWhere, status: { notIn: ["TAMAMLANDI", "IPTAL"] } } },
          }),
          // "Bekleyen" vadesi henüz gelmemiş taksitleri sayar — vadesi geçmiş ama
          // henüz GECIKTI'ye çevrilmemiş taksitler burada değil, "geciken"de sayılır
          // (yukarıdaki not).
          (prisma as any).taksit.count({ where: { plan: baseWhere, status: "BEKLIYOR", vadeDate: { gte: todayStart } } }),
          (prisma as any).taksit.count({
            where: { plan: baseWhere, status: "BEKLIYOR", vadeDate: { gte: todayStart, lte: todayEnd } },
          }),
          (prisma as any).taksit.findMany({
            where: { plan: { ...baseWhere, status: { notIn: ["IPTAL", "TAMAMLANDI"] } }, kalan: { gt: 0 } },
            select: { kalan: true, vadeDate: true },
            take: 20000,
          }),
          (prisma as any).taksit.findMany({
            where: { plan: baseWhere, kalan: { gt: 0 }, status: { notIn: ["ODENDI", "IPTAL"] } },
            select: { kalan: true, vadeDate: true },
            take: 20000,
          }),
        ])
      : Promise.resolve(null);

    const [total, plans, statRows] = await Promise.all([
      (prisma as any).taksitPlan.count({ where: listWhere }),
      (prisma as any).taksitPlan.findMany({
        where: listWhere,
        include: {
          patient: { select: { id: true, fullName: true, phone: true } },
          doctor: { select: { id: true, fullName: true } },
          taksitler: {
            orderBy: { siraNo: "asc" },
            select: {
              id: true, siraNo: true, vadeDate: true, tutar: true,
              odenen: true, kalan: true, status: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      statsPromise,
    ]);

    // KVKK: telefon maskesi kişinin etkin iznine (rol + şube daraltması) bakar.
    const hidePhone = await shouldHidePatientPhoneForUser(user);
    const withLiveTaksitStatus = (p: any) => ({
      ...p,
      taksitler: (p.taksitler || []).map((t: any) =>
        t.status === "BEKLIYOR" && new Date(t.vadeDate).getTime() < todayStart.getTime()
          ? { ...t, status: "GECIKTI" }
          : t
      ),
    });
    const items = plans.map((p: any) => {
      const withStatus = withLiveTaksitStatus(p);
      return hidePhone
        ? { ...withStatus, patient: withStatus.patient ? { ...withStatus.patient, phone: "***" } : withStatus.patient }
        : withStatus;
    });

    if (!statRows) {
      return NextResponse.json({ items, total, page, pageCount: pageCount(total) });
    }
    const [geciktenPlanIds, kalanAgg, bekleyen, bugunVade, aging4Rows, aging5Rows] = statRows;

    // Tek birimli özet: geciken ve bu hafta vadesi gelen taksitlerin TUTARI ve ADEDİ.
    // (Önceden kartlarda para ile adet karışıktı: "Bekleyen 2" neyin 2'si belli değildi.)
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    let gecikenTaksit = 0, gecikenTutar = 0, haftaTaksit = 0, haftaTutar = 0;
    for (const row of aging5Rows as { kalan: unknown; vadeDate: Date }[]) {
      const due = new Date(row.vadeDate);
      const amount = Number(row.kalan || 0);
      if (due < todayStart) { gecikenTaksit += 1; gecikenTutar += amount; }
      else if (due <= weekEnd) { haftaTaksit += 1; haftaTutar += amount; }
    }

    return NextResponse.json({
      items,
      total,
      page,
      pageCount: pageCount(total),
      stats: {
        gecikenTaksit,
        gecikenTutar: Math.round(gecikenTutar * 100) / 100,
        haftaTaksit,
        haftaTutar: Math.round(haftaTutar * 100) / 100,
        geciken: geciktenPlanIds.length,
        toplamKalan: Number(kalanAgg._sum.kalan ?? 0),
        bekleyen,
        bugunVade,
        aging4: bucketAging4(aging4Rows),
        aging5: bucketAging5(aging5Rows),
      },
    });
  } catch (e) {
    console.error("[taksit-plani GET] fallback:", e);
    return NextResponse.json({ error: "Taksit planları yüklenemedi." }, { status: 503 });
  }
});

const PAYMENT_METHODS = new Set(["NAKIT", "KREDI_KARTI", "HAVALE_EFT", "MAIL_ORDER", "DIGER"]);

export async function POST(req: NextRequest) {
  const requestKey = req.headers.get("idempotency-key")?.trim() || null;
  try {
    const auth = await requireAuth("installments:write");
    if (auth.error) return auth.error;
    const user = auth.user;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });
    if (!user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
    }
    const {
      patientId, doctorId, baslik, toplamBorc, pesnat = 0,
      taksitSayisi, period = "AYLIK", startDate, notes,
      taksitler: customTaksitler
    } = body;

    if (typeof patientId !== "string" || !patientId || typeof doctorId !== "string" || !doctorId || !toplamBorc) {
      return NextResponse.json({ error: "Gerekli alanlar eksik" }, { status: 400 });
    }
    if (baslik !== undefined && baslik !== null && (typeof baslik !== "string" || baslik.trim().length > 180)) {
      return NextResponse.json({ error: "Plan başlığı en fazla 180 karakter olabilir" }, { status: 400 });
    }
    if (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.trim().length > 2_000)) {
      return NextResponse.json({ error: "Plan notu en fazla 2000 karakter olabilir" }, { status: 400 });
    }
    if (typeof period !== "string" || !INSTALLMENT_PERIODS.has(period)) {
      return NextResponse.json({ error: "Geçersiz taksit dönemi" }, { status: 400 });
    }
    if (customTaksitler !== undefined && !Array.isArray(customTaksitler)) {
      return NextResponse.json({ error: "Özel taksit listesi geçersiz" }, { status: 400 });
    }
    if (!customTaksitler?.length && (!taksitSayisi || !startDate)) {
      return NextResponse.json({ error: "Gerekli alanlar eksik" }, { status: 400 });
    }

    // Mantıksız/negatif değerler sessizce negatif bakiyeli taksitlere yol
    // açmasın diye burada da (istemcinin yanı sıra) doğrulanıyor. Tutarlar
    // Decimal: kuruş hesabı JS sayısıyla yapılmaz.
    const toplamBorcNum = Number(toplamBorc);
    const pesnatNum = Number(pesnat) || 0;
    if (!Number.isFinite(toplamBorcNum) || toplamBorcNum <= 0 || toplamBorcNum > 99_999_999.99) {
      return NextResponse.json({ error: "Toplam borç pozitif bir sayı olmalıdır" }, { status: 400 });
    }
    if (!Number.isFinite(pesnatNum) || pesnatNum < 0) {
      return NextResponse.json({ error: "Peşinat negatif olamaz" }, { status: 400 });
    }
    const toplamBorcD = toMoney(toplamBorcNum);
    const pesnatD = toMoney(pesnatNum);
    if (pesnatD.gte(toplamBorcD)) {
      return NextResponse.json({ error: "Peşinat toplam borçtan küçük olmalıdır" }, { status: 400 });
    }

    // İsteğe bağlı: peşinatın bugün alındığı ve nasıl ödendiği. Gönderilmezse
    // (ör. hasta dosyasındaki sihirbaz) eski davranış: peşinat yalnız planda saklanır.
    const pesinatTahsilat = body.pesinatTahsilat;
    let pesinatMethod: PaymentMethod | null = null;
    let pesinatPosId: string | null = null;
    if (pesinatTahsilat !== undefined && pesinatTahsilat !== null && pesnatD.gt(0)) {
      // Peşinat tahsilatı bir Payment kaydı açar: taksit izninin yanında tahsilat izni de gerekir.
      const paymentAuth = await requireAuth("payments:write");
      if (paymentAuth.error) return paymentAuth.error;
      if (typeof pesinatTahsilat !== "object" || Array.isArray(pesinatTahsilat)) {
        return NextResponse.json({ error: "Peşinat ödeme bilgisi geçersiz" }, { status: 400 });
      }
      const yontem = (pesinatTahsilat as { yontem?: unknown }).yontem;
      const posId = (pesinatTahsilat as { posId?: unknown }).posId;
      if (typeof yontem !== "string" || !PAYMENT_METHODS.has(yontem)) {
        return NextResponse.json({ error: "Peşinat için geçerli bir ödeme yöntemi seçin" }, { status: 400 });
      }
      if (posId !== undefined && posId !== null && typeof posId !== "string") {
        return NextResponse.json({ error: "Geçersiz POS cihazı" }, { status: 400 });
      }
      const posRequired = yontem === "KREDI_KARTI" || yontem === "MAIL_ORDER";
      if (posRequired && !posId && await posSelectionRequired(yontem, auth.user.institutionId, branch.branchId)) {
        return NextResponse.json({ error: "Kart / mail order ile alınan peşinat için POS seçimi zorunlu" }, { status: 400 });
      }
      if (!posRequired && posId) {
        return NextResponse.json({ error: "POS yalnızca kredi kartı veya mail order tahsilatında seçilebilir" }, { status: 400 });
      }
      pesinatMethod = yontem as PaymentMethod;
      pesinatPosId = posRequired ? (posId as string) : null;
      if (requestKey && (requestKey.length < 8 || requestKey.length > 100)) {
        return NextResponse.json({ error: "İşlem anahtarı geçersiz" }, { status: 400 });
      }
    }
    if (!customTaksitler?.length) {
      const taksitSayisiNum = Number(taksitSayisi);
      if (!Number.isInteger(taksitSayisiNum) || taksitSayisiNum < 1 || taksitSayisiNum > 100) {
        return NextResponse.json({ error: "Taksit sayısı 1-100 arasında olmalıdır" }, { status: 400 });
      }
      if (typeof startDate !== "string" || !isValidDateKey(startDate)) {
        return NextResponse.json({ error: "Geçerli bir başlangıç tarihi girilmelidir" }, { status: 400 });
      }
    }

    if (Array.isArray(customTaksitler) && customTaksitler.length > 100) {
      return NextResponse.json({ error: "En fazla 100 taksit oluşturulabilir" }, { status: 400 });
    }

    const [patient, doctor] = await Promise.all([
      prisma.patient.findFirst({
        where: { id: patientId, institutionId: user.institutionId, homeBranchId: branch.branchId, archivedAt: null },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { id: doctorId, ...effectiveDoctorWhere(user.institutionId, branch.branchId) },
        select: { id: true },
      }),
    ]);
    if (!patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });
    if (!doctor) return NextResponse.json({ error: "Doktor bulunamadı" }, { status: 404 });
    if (pesinatPosId) {
      const pos = await prisma.posDevice.findFirst({
        where: { id: pesinatPosId, institutionId: user.institutionId, branchId: branch.branchId, isActive: true },
        select: { id: true },
      });
      if (!pos) return NextResponse.json({ error: "Seçilen POS bu kuruma ait değil veya kullanım dışı" }, { status: 403 });
    }

    const kalan = toplamBorcD.minus(pesnatD);

    let taksitlerCreate: { siraNo: number; vadeDate: Date; tutar: Prisma.Decimal }[];

    if (Array.isArray(customTaksitler) && customTaksitler.length > 0) {
      const invalidCustom = customTaksitler.some((t: unknown) => {
        if (!t || typeof t !== "object") return true;
        const row = t as { date?: unknown; amount?: unknown };
        const amount = Number(row.amount);
        return typeof row.date !== "string" || !isValidDateKey(row.date) || !Number.isFinite(amount) || amount <= 0 || amount > 99_999_999.99;
      });
      if (invalidCustom) {
        return NextResponse.json({ error: "Özel taksitlerin tarih ve tutarları geçersiz" }, { status: 400 });
      }
      taksitlerCreate = customTaksitler.map((t: { date: string; amount: number }, i: number) => (
        { siraNo: i + 1, vadeDate: new Date(t.date), tutar: toMoney(Number(t.amount)) }
      ));
      const datesAreOrdered = taksitlerCreate.every((item, index) => index === 0 || item.vadeDate >= taksitlerCreate[index - 1].vadeDate);
      if (!datesAreOrdered) {
        return NextResponse.json({ error: "Taksit vadeleri kronolojik sırada olmalıdır" }, { status: 400 });
      }
    } else {
      // Eşit bölme: her taksit kuruşa yarım-yukarı yuvarlanır, küsurat son taksite eklenir.
      const count = Number(taksitSayisi);
      const per = kalan.div(count).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const start = new Date(`${startDate}T00:00:00.000Z`);
      taksitlerCreate = Array.from({ length: count }, (_, i) => ({
        siraNo: i + 1,
        vadeDate: addInstallmentPeriod(start, period, i),
        tutar: i === count - 1 ? kalan.minus(per.mul(count - 1)) : per,
      }));
    }

    // Güvenlik ağı: küsurat nereden gelirse gelsin (istemci ya da yukarıdaki hesap), taksitlerin
    // toplamı her zaman "kalan" ile birebir eşitlensin — aksi halde hasta hesabında asla
    // kapanmayan bir kuruş bakiyesi oluşur.
    if (taksitlerCreate.length > 0) {
      if (taksitlerCreate.some((item) => item.tutar.lt(MIN_INSTALLMENT))) {
        return NextResponse.json({ error: "Her taksit en az 0,01 TL olmalıdır; taksit sayısını azaltın" }, { status: 400 });
      }
      const sum = taksitlerCreate.reduce((acc, t) => acc.plus(t.tutar), new Prisma.Decimal(0));
      const diff = kalan.minus(sum);
      if (Array.isArray(customTaksitler) && customTaksitler.length > 0 && diff.abs().gt(MIN_INSTALLMENT)) {
        return NextResponse.json({ error: "Özel taksitlerin toplamı peşinat sonrası kalan borca eşit olmalıdır" }, { status: 400 });
      }
      if (!diff.isZero()) {
        const last = taksitlerCreate[taksitlerCreate.length - 1];
        last.tutar = last.tutar.plus(diff);
      }
    }

    const effectiveTaksitSayisi = Array.isArray(customTaksitler) && customTaksitler.length > 0
      ? customTaksitler.length
      : Number(taksitSayisi);
    const effectiveStartDate = Array.isArray(customTaksitler) && customTaksitler.length > 0
      ? taksitlerCreate[0].vadeDate
      : new Date(`${startDate}T00:00:00.000Z`);

    const institutionId = user.institutionId;
    const planData: Prisma.TaksitPlanUncheckedCreateInput = {
      institutionId,
      branchId: branch.branchId,
      patientId,
      doctorId,
      baslik: baslik?.trim() || null,
      toplamBorc: toplamBorcD,
      pesnat: pesnatD,
      taksitSayisi: effectiveTaksitSayisi,
      period: period as TaksitPeriod,
      startDate: effectiveStartDate,
      notes: notes?.trim() || null,
      status: "AKTIF",
      taksitler: {
        create: taksitlerCreate.map((item) => ({
          siraNo: item.siraNo,
          vadeDate: item.vadeDate,
          tutar: item.tutar,
          odenen: 0,
          kalan: item.tutar,
          status: "BEKLIYOR" as const,
        })),
      },
    };
    const planInclude = {
      patient: { select: { id: true, fullName: true } },
      doctor: { select: { id: true, fullName: true } },
      taksitler: true,
    } as const;

    const collectNow = Boolean(pesinatMethod && pesnatD.gt(0));
    // Aynı işlem anahtarıyla tekrar gelen istek (ağ tekrarı): plan ve peşinat
    // zaten kaydedildi. Borç denetiminden ÖNCE bakılır; yoksa tekrar "açık plan
    // var" hatası alırdı.
    if (collectNow && requestKey) {
      const duplicate = await prisma.payment.findUnique({
        where: { branchId_requestKey: { branchId: branch.branchId, requestKey } },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json({ error: "Bu plan ve peşinat zaten kaydedildi. Liste yenileniyor." }, { status: 409 });
      }
    }

    // Borç denetimi, plan ve (varsa) peşinat tahsilatı TEK serializable işlemde:
    // iki personel aynı anda aynı borca plan açarsa ikincisi reddedilir. Peşinat
    // bugün alındıysa plan ile AYNI işlemde tahsilat kaydı açılır: kasa, defter,
    // rapor ve hasta bakiyesi peşinatı görür. Taksitlere otomatik eşleştirme
    // yapılmaz (peşinat taksit değildir). Aynı işlem anahtarıyla tekrar gelen
    // istek tahsilatta çakışır ve plan da ikinci kez oluşmaz.
    const result = await prisma.$transaction(async (tx) => {
      await assertPlanFitsDebt(tx, {
        institutionId,
        branchId: branch.branchId,
        patientId,
        planRemaining: kalan,
        collectedNow: collectNow ? pesnatD : null,
      });
      const created = await tx.taksitPlan.create({ data: planData, include: planInclude });
      if (!collectNow || !pesinatMethod) return { created, paymentId: null as string | null };
      const { payment } = await createIntegratedPayment({
        tx,
        institutionId,
        branchId: branch.branchId,
        requestKey,
        patientId,
        doctorId,
        method: pesinatMethod,
        amount: pesnatD.toNumber(),
        description: `Peşinat — ${created.baslik || "taksit planı"}`,
        posId: pesinatPosId,
        integrateInstallments: false,
      });
      return { created, paymentId: payment.id };
    }, { isolationLevel: "Serializable" });

    if (result.paymentId) {
      await writeAudit(
        auth.user.id,
        "TAKSIT_PLAN_CREATE",
        `${toplamBorcD.toFixed(2)} TL taksit planı oluşturuldu; ${pesnatD.toFixed(2)} TL peşinat tahsil edildi (${pesinatMethod}).`,
      );
      return NextResponse.json({ ...result.created, pesinatPaymentId: result.paymentId }, { status: 201 });
    }

    await writeAudit(auth.user.id, "TAKSIT_PLAN_CREATE", `${toplamBorcD.toFixed(2)} TL taksit planı oluşturuldu`);
    return NextResponse.json(result.created, { status: 201 });
  } catch (e) {
    if (e instanceof PlanExceedsDebtError) {
      return NextResponse.json({ error: e.message, code: "PLAN_EXCEEDS_DEBT", unplanned: e.unplanned }, { status: 409 });
    }
    if (e instanceof BusinessRuleError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Bu plan ve peşinat zaten kaydedildi. Liste yenileniyor." }, { status: 409 });
    }
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2034") {
      return NextResponse.json({ error: "Bu hasta için aynı anda başka bir işlem kaydedildi. Bilgileriniz korundu; yeniden deneyin." }, { status: 409 });
    }
    console.error("[taksit-plani POST] fallback:", e);
    return NextResponse.json({ error: "Taksit planı oluşturulamadı" }, { status: 503 });
  }
}

const MIN_INSTALLMENT = new Prisma.Decimal("0.01");
/** Hasta dosyasının istemci hesabıyla olası 1 kuruşluk yuvarlama farkı reddedilmesin. */
const DEBT_TOLERANCE = new Prisma.Decimal("0.01");

/** Kuruşa yarım-yukarı yuvarlanmış Decimal tutar. */
function toMoney(value: number) {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

class PlanExceedsDebtError extends BusinessRuleError {
  constructor(message: string, readonly unplanned: number) {
    super(message, 409);
  }
}

/**
 * Aynı borç ikinci kez taksitlenmesin (canlı muhasebe H2: iki POST ile aynı
 * 2.400 TL borca iki plan açılıyor, Taksitler toplamı alacağı iki kez
 * sayıyordu). Kural istemcideki sınırla aynı ve tek kaynaktan
 * (src/lib/patient-balance.ts):
 *   taksitte olmayan borç = bakiye − açık planların (Süren) kalanı
 *   yeni planın taksitlenen kısmı (toplam − peşinat) ≤ taksitte olmayan borç
 *   − (peşinat bu işlemde tahsil ediliyorsa) peşinat
 * Peşinat önceden tahsilat olarak girildiyse bakiye onu zaten düşmüştür.
 */
async function assertPlanFitsDebt(
  tx: Prisma.TransactionClient,
  input: { institutionId: string; branchId: string; patientId: string; planRemaining: Prisma.Decimal; collectedNow: Prisma.Decimal | null },
) {
  const scope = { institutionId: input.institutionId, branchId: input.branchId, patientIds: [input.patientId] };
  const [balances, openPlans] = await Promise.all([
    computePatientBalances(scope, tx),
    loadOpenInstallmentSummaries(scope, tx),
  ]);
  const bakiye = balances.get(input.patientId)?.bakiye ?? new Prisma.Decimal(0);
  const openRemaining = new Prisma.Decimal(openPlans.get(input.patientId)?.kalan ?? 0);
  const unplanned = bakiye.minus(openRemaining);
  const available = input.collectedNow ? unplanned.minus(input.collectedNow) : unplanned;
  if (input.planRemaining.lte(available.plus(DEBT_TOLERANCE))) return;

  const shown = Prisma.Decimal.max(0, unplanned).toNumber();
  throw new PlanExceedsDebtError(
    openRemaining.gt(0)
      ? `Bu borç için açık taksit planı var; taksitte olmayan borç ${formatCurrency(shown)}.`
      : `Taksitlendirilecek tutar kalan borcu (${formatCurrency(shown)}) aşamaz.`,
    shown,
  );
}
