import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withApiTiming } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { parseReportDateInput } from "@/lib/report-date-range";
import { turkeyDateKey, turkeyDayRangeUtc } from "@/lib/tz";
import {
  buildExpensesReport,
  buildPatientsReport,
  buildSummaryReport,
  buildTreatmentsReport,
  type ReportScope,
} from "@/lib/report-center";
import { isReportPatientFilter, isReportType, type ReportResponse } from "@/lib/report-center-types";

/**
 * GET /api/reports?type=ozet|hastalar|tedaviler|giderler&from&to&doctorId[&goster=yeni|borclu]
 *
 * Raporlar ekranının dört raporu (hesap ve tanımlar: src/lib/report-center.ts).
 * - from/to: Türkiye yerel saati ("2026-10-01T00:00"); saatsiz bitiş günün
 *   sonudur (src/lib/report-date-range.ts). Verilmezse içinde bulunulan yıl.
 * - doctorId: bu kurumda olmayan kişi yok sayılır (yanıttaki `doctorId` uygulanan
 *   süzgeçtir). Yanıttaki `doctors`: şubenin hekimleri + dönemde kaydı olanlar
 *   (ayrılanlar dahil) + seçili kişi. Giderler kliniğin genelidir (süzülmez).
 * - goster (yalnız hastalar): yeni = kaydı dönemde açılanlar, borclu = bugün borcu olanlar.
 * Satır listeleri en çok 1000 satırdır (`truncated`); toplamlar bütün kayıtlardandır.
 */
export const GET = withApiTiming("reports", async function GET(request: NextRequest) {
  const auth = await requireAuth("reports:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const rawType = params.get("type");
  if (rawType && !isReportType(rawType)) {
    return NextResponse.json({ message: "Rapor türü geçersiz." }, { status: 400 });
  }
  const type = isReportType(rawType) ? rawType : "ozet";
  const rawFilter = params.get("goster");
  const filter = isReportPatientFilter(rawFilter) ? rawFilter : "tumu";

  const from = params.get("from") || params.get("start");
  const to = params.get("to") || params.get("end");
  let period: ReportScope["period"];
  try {
    if (from || to) {
      // Tek uç verilirse öteki uç içinde bulunulan yılın sınırıdır (tüm geçmiş taranmasın).
      const year = turkeyDateKey().slice(0, 4);
      period = {
        gte: parseReportDateInput(from) ?? turkeyDayRangeUtc(`${year}-01-01`).start,
        lte: parseReportDateInput(to, true) ?? turkeyDayRangeUtc(`${year}-12-31`).end,
      };
    } else {
      const year = turkeyDateKey().slice(0, 4);
      period = { gte: turkeyDayRangeUtc(`${year}-01-01`).start, lte: turkeyDayRangeUtc(`${year}-12-31`).end };
    }
    if (period.gte > period.lte) throw new Error("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Rapor tarihleri geçersiz." }, { status: 400 });
  }

  const scope: ReportScope = {
    institutionId: auth.user.institutionId,
    branchId: branch.branchId,
    period,
    doctorId: params.get("doctorId")?.trim() || null,
  };

  try {
    let report: ReportResponse;
    if (type === "hastalar") report = await buildPatientsReport(scope, filter);
    else if (type === "tedaviler") report = await buildTreatmentsReport(scope);
    else if (type === "giderler") report = await buildExpensesReport(scope);
    else report = await buildSummaryReport(scope);
    return NextResponse.json(report);
  } catch (error) {
    console.error("[reports GET]", error);
    return NextResponse.json({ message: "Rapor hesaplanamadı. Biraz sonra yeniden deneyin." }, { status: 503 });
  }
});
