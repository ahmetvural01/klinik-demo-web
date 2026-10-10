import { NextRequest, NextResponse } from "next/server";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth, withApiTiming } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { stripSystemTags } from "@/lib/format-text";
import { paymentMethodLabel } from "@/lib/payment-methods";
import { isValidDateKey, turkeyDateKey, turkeyDayRangeUtc } from "@/lib/tz";

/**
 * GET /api/muhasebe/defter?from=YYYY-MM-DD&to=YYYY-MM-DD&tur=HEPSI|TAHSILAT|GIDER|IPTAL&yontem=&q=&page=&take=&all=1
 *
 * Muhasebe "Gelir ve gider" listesi: hasta tahsilatları ile giderleri AYNI
 * tarih aralığında, sunucuda birleştirip filtreler ve dönem toplamlarını
 * filtrelenmiş kümenin tamamı üzerinden hesaplar. Önceden tahsilatlar tarih
 * sınırı olmadan son 500 kayıt, giderler yalnız son 3 ay olarak ayrı ayrı
 * yükleniyor ve tarayıcıda süzülüyordu; 3 aydan eski bir aralıkta giderler
 * sessizce eksik kalıyordu ve dönem toplamı hiç yoktu.
 *
 * Yetki: tahsilatlar payments:read, giderler finance:read ister (eski uçlarla
 * aynı kontrol); kullanıcının izni olmayan kaynak listeye hiç katılmaz.
 * Tüm kayıtları tek seferde (all=1, dışa aktarma) almak finance:export ister.
 * Kurum geneli liste olduğu için Muhasebe ekranı izni (finance:center) de
 * gerekir: önceden payments:read yeten asistan kliniğin bütün tahsilatlarını
 * okuyabiliyordu. Salt okunur uçtur; hiçbir kayıt değiştirmez.
 *
 * tur=IPTAL: dönemde iptal edilmiş tahsilat ve giderler (salt okunur iz;
 * önceden iptal edilen kayıt listeden iz bırakmadan kayboluyordu). Toplamlar
 * yalnız bu iptal edilmiş kümeyi anlatır; ekran bu görünümde dönem özetini
 * göstermez.
 */

const METHODS: readonly PaymentMethod[] = ["NAKIT", "KREDI_KARTI", "HAVALE_EFT", "MAIL_ORDER", "DIGER"];
const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const SOURCE_CAP = 5000;

const cleanNote = (text?: string | null) => stripSystemTags(text).replace(/\s*\[GELIR_TURU:[^\]]+\]/g, "").trim();
const isMethod = (value: string): value is PaymentMethod => (METHODS as readonly string[]).includes(value);
const round2 = (value: number) => Math.round(value * 100) / 100;

type Row = {
  key: string;
  id: string;
  kind: "TAHSILAT" | "GIDER";
  subtype: "tahsilat" | "gider" | "hakedis" | "firma";
  date: string;
  hasTime: boolean;
  who: string | null;
  whoId: string | null;
  item: string;
  note: string;
  doctor: string | null;
  method: string;
  amount: number;
  locked: boolean;
  /** İptal edilmiş kayıt (yalnız tur=IPTAL görünümünde); salt okunur. */
  voided?: boolean;
  /** İptal anı (tahsilatta iptal zamanı, giderde son değişiklik zamanı). */
  voidedAt?: string | null;
  payment?: Record<string, unknown>;
  expense?: Record<string, unknown>;
};

export const GET = withApiTiming("muhasebe-defter", async function GET(request: NextRequest) {
  try {
    // Oturum/kurum/şube kontrolü BİR kez; kaynak izinleri aynı oturumdan hesaplanır.
    // Önceden iki tam requireAuth turu (her biri 4 sorgu) birlikte çalışıyordu.
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const all = request.nextUrl.searchParams.get("all") === "1";
    const [canPayments, canExpenses, canExport, canCenter] = await Promise.all([
      hasEffectivePermission(auth.user, "payments:read"),
      hasEffectivePermission(auth.user, "finance:read"),
      all ? hasEffectivePermission(auth.user, "finance:export") : Promise.resolve(true),
      hasEffectivePermission(auth.user, "finance:center"),
    ]);
    if ((!canPayments && !canExpenses) || !canCenter) {
      return NextResponse.json({ message: "Gelir ve gider listesini görme yetkiniz yok." }, { status: 403 });
    }
    // Rol Yetkileri'ndeki "Finans — Dışa Aktarma" izni önceden hiçbir yerde denetlenmiyordu.
    if (!canExport) {
      return NextResponse.json({ message: "Muhasebe kayıtlarını dışa aktarma yetkiniz yok." }, { status: 403 });
    }
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
    const institutionId = auth.user.institutionId;
    if (!institutionId) return NextResponse.json({ message: "Kurum bağlamı bulunamadı." }, { status: 403 });

    const params = request.nextUrl.searchParams;
    const today = turkeyDateKey();
    const from = params.get("from") || `${today.slice(0, 7)}-01`;
    const to = params.get("to") || today;
    if (!isValidDateKey(from) || !isValidDateKey(to)) {
      return NextResponse.json({ message: "Geçerli bir tarih aralığı seçin." }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ message: "Başlangıç tarihi bitiş tarihinden sonra olamaz." }, { status: 400 });
    }
    const tur = params.get("tur") || "HEPSI";
    const yontemParam = params.get("yontem") || "HEPSI";
    if (!["HEPSI", "TAHSILAT", "GIDER", "IPTAL"].includes(tur) || (yontemParam !== "HEPSI" && !isMethod(yontemParam))) {
      return NextResponse.json({ message: "Geçersiz filtre." }, { status: 400 });
    }
    const cancelled = tur === "IPTAL";
    const method = yontemParam !== "HEPSI" && isMethod(yontemParam) ? yontemParam : null;
    const q = (params.get("q") || "").trim().toLocaleLowerCase("tr");
    const take = Math.min(200, Math.max(1, Number.parseInt(params.get("take") || "50", 10) || 50));
    const requestedPage = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);

    const rangeStart = turkeyDayRangeUtc(from).start;
    const rangeEnd = turkeyDayRangeUtc(to).end;

    const [payments, expenses] = await Promise.all([
      canPayments && tur !== "GIDER"
        ? prisma.payment.findMany({
            where: {
              institutionId,
              branchId: branch.branchId,
              status: cancelled ? "VOID" : "ACTIVE",
              // Eski "Hakediş Öde" akışının hastasız ödemeleri gelir değildir (kurumdan doktora çıkış).
              patientId: { not: null },
              createdAt: { gte: rangeStart, lte: rangeEnd },
              ...(method ? { method } : {}),
            },
            select: {
              id: true, createdAt: true, amount: true, method: true, description: true, posId: true, doctorId: true, voidedAt: true,
              patient: { select: { id: true, fullName: true } },
              doctor: { select: { id: true, fullName: true } },
            },
            orderBy: { createdAt: "desc" },
            take: SOURCE_CAP + 1,
          })
        : Promise.resolve([]),
      // tur=IPTAL iki kaynağı da (izin varsa) okur.
      canExpenses && tur !== "TAHSILAT"
        ? prisma.expense.findMany({
            where: {
              institutionId,
              branchId: branch.branchId,
              status: cancelled ? "IPTAL" : "AKTIF",
              tarih: { gte: rangeStart, lte: rangeEnd },
              ...(method ? { yontem: method } : {}),
            },
            select: {
              id: true, tarih: true, createdAt: true, updatedAt: true, category: true, categoryId: true, description: true, tutar: true,
              yontem: true, faturaNo: true, kdvOrani: true, doctorId: true, periodYear: true, periodMonth: true,
              sourceType: true, sourceId: true,
              expenseCategory: { select: { id: true, name: true } },
              doctor: { select: { id: true, fullName: true } },
            },
            orderBy: [{ tarih: "desc" }, { createdAt: "desc" }],
            take: SOURCE_CAP + 1,
          })
        : Promise.resolve([]),
    ]);

    const truncated = payments.length > SOURCE_CAP || expenses.length > SOURCE_CAP;
    const paymentRows = payments.slice(0, SOURCE_CAP);
    const expenseRows = expenses.slice(0, SOURCE_CAP);

    // Firma ödemesinden oluşan giderlerin firması (ad + ekstre bağlantısı için kimlik).
    const firmaIslemIds = expenseRows
      .filter((expense) => expense.sourceType === "FIRMA_ISLEM" && expense.sourceId)
      .map((expense) => expense.sourceId as string);
    const firmaIslemler = firmaIslemIds.length
      ? await prisma.firmaIslem.findMany({
          where: { id: { in: firmaIslemIds }, institutionId, branchId: branch.branchId },
          select: { id: true, firmaId: true, firma: { select: { name: true } } },
        })
      : [];
    const firmaByIslem = new Map(firmaIslemler.map((row) => [row.id, { firmaId: row.firmaId, name: row.firma?.name || "" }]));

    const rows: Row[] = [];
    for (const payment of paymentRows) {
      rows.push({
        key: `p-${payment.id}`,
        id: payment.id,
        kind: "TAHSILAT",
        subtype: "tahsilat",
        date: payment.createdAt.toISOString(),
        hasTime: true,
        who: payment.patient?.fullName || null,
        whoId: payment.patient?.id || null,
        item: "Tahsilat",
        note: cleanNote(payment.description),
        doctor: payment.doctor?.fullName || null,
        method: payment.method,
        amount: Number(payment.amount),
        locked: false,
        ...(cancelled ? { voided: true, voidedAt: payment.voidedAt?.toISOString() ?? null } : {}),
        payment: {
          id: payment.id,
          createdAt: payment.createdAt.toISOString(),
          amount: Number(payment.amount),
          method: payment.method,
          description: payment.description,
          posId: payment.posId,
          doctorId: payment.doctorId,
          doctor: payment.doctor,
          patient: payment.patient,
        },
      });
    }
    for (const expense of expenseRows) {
      const categoryName = expense.expenseCategory?.name || expense.category || "Gider";
      const note = cleanNote(expense.description);
      const isFirma = expense.sourceType === "FIRMA_ISLEM" || /\[SISTEM:FIRMA_ISLEM:/.test(expense.description || "");
      const firma = expense.sourceId ? firmaByIslem.get(expense.sourceId) : undefined;
      let who: string | null = null;
      let whoId: string | null = null;
      let item = categoryName;
      let displayNote = note;
      let subtype: Row["subtype"] = "gider";
      if (isFirma) {
        subtype = "firma";
        // Açıklama "Firma | ürün | not" biçiminde; firma adı ayrı sütunda gösterildiği için notta tekrar edilmez.
        const parts = note.split(" | ").map((part) => part.trim()).filter(Boolean);
        who = firma?.name || parts[0] || null;
        whoId = firma?.firmaId || null;
        displayNote = (parts[0] && parts[0] === who ? parts.slice(1) : parts).join(" · ");
        item = "Firma ödemesi";
      } else if (expense.doctorId) {
        subtype = "hakedis";
        who = expense.doctor?.fullName || null;
        whoId = expense.doctorId;
        item = expense.periodYear && expense.periodMonth ? `Hakediş · ${AY[expense.periodMonth - 1]} ${expense.periodYear}` : "Hakediş ödemesi";
      }
      rows.push({
        key: `e-${expense.id}`,
        id: expense.id,
        kind: "GIDER",
        subtype,
        date: expense.tarih.toISOString(),
        hasTime: false,
        who,
        whoId,
        item,
        note: displayNote,
        doctor: null,
        method: expense.yontem || "NAKIT",
        amount: Number(expense.tutar),
        locked: isFirma,
        ...(cancelled ? { voided: true, voidedAt: expense.updatedAt.toISOString() } : {}),
        expense: {
          id: expense.id,
          tarih: expense.tarih.toISOString(),
          category: categoryName,
          categoryId: expense.categoryId,
          description: expense.description,
          tutar: Number(expense.tutar),
          yontem: expense.yontem,
          faturaNo: expense.faturaNo,
          kdvOrani: expense.kdvOrani,
          doctorId: expense.doctorId,
          doctor: expense.doctor,
          periodYear: expense.periodYear,
          periodMonth: expense.periodMonth,
          sourceType: expense.sourceType,
        },
      });
    }

    // Fatura no da aranır: girilen fatura/dekont numarasıyla gider bulunabilsin.
    const filtered = q
      ? rows.filter((row) => {
          const faturaNo = typeof row.expense?.faturaNo === "string" ? row.expense.faturaNo : "";
          return [row.who, row.item, row.note, row.doctor, paymentMethodLabel(row.method), faturaNo]
            .some((value) => (value || "").toLocaleLowerCase("tr").includes(q));
        })
      : rows;
    filtered.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const byMethod: Record<string, { in: number; out: number }> = {};
    let tahsilat = 0;
    let gider = 0;
    let tahsilatCount = 0;
    let giderCount = 0;
    for (const row of filtered) {
      const bucket = byMethod[row.method] || (byMethod[row.method] = { in: 0, out: 0 });
      if (row.kind === "TAHSILAT") { tahsilat += row.amount; tahsilatCount += 1; bucket.in += row.amount; }
      else { gider += row.amount; giderCount += 1; bucket.out += row.amount; }
    }
    for (const key of Object.keys(byMethod)) {
      byMethod[key] = { in: round2(byMethod[key].in), out: round2(byMethod[key].out) };
    }

    const total = filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / take));
    const page = Math.min(requestedPage, pageCount);
    const pageRows = all ? filtered : filtered.slice((page - 1) * take, page * take);

    return NextResponse.json({
      rows: pageRows,
      total,
      page: all ? 1 : page,
      pageCount: all ? 1 : pageCount,
      take,
      range: { from, to },
      truncated,
      sources: { payments: canPayments, expenses: canExpenses },
      totals: {
        tahsilat: round2(tahsilat),
        tahsilatCount,
        gider: round2(gider),
        giderCount,
        net: round2(tahsilat - gider),
        byMethod,
      },
    });
  } catch (error) {
    console.error("[muhasebe defter GET]", error);
    return NextResponse.json({ message: "Gelir ve gider listesi yüklenemedi. Lütfen yeniden deneyin." }, { status: 503 });
  }
});
