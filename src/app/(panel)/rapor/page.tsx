"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { ExportMenu } from "@/components/ui/ExportMenu";
import type { ListSort } from "@/components/ui/ListTable";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Tabs, useTabParam, type TabItem } from "@/components/ui/Tabs";
import { Toolbar } from "@/components/ui/Toolbar";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { useRealtimeRefresh } from "@/components/muhasebe/finance-hooks";
import { DATE_PRESET_SETS, formatRangeLabel, writeDateRangeParams, type DateRange, type DateRangeValue } from "@/lib/date-presets";
import { isLedgerPreset } from "@/lib/ledger-periods";
import { useDateRangeParam } from "@/lib/use-date-range-param";
import { isAbortError, useLatestRequest } from "@/lib/use-latest-request";
import {
  REPORT_TYPES,
  isReportPatientFilter,
  type ExpensesReport,
  type PatientsReport,
  type ReportDoctor,
  type ReportPatientFilter,
  type ReportResponse,
  type ReportType,
  type SummaryReport,
  type TreatmentsReport,
} from "@/lib/report-center-types";
import { ExpensesView } from "./_components/ExpensesView";
import { PatientsView, sortPatientRows } from "./_components/PatientsView";
import { SummaryView } from "./_components/SummaryView";
import { TreatmentsView, sortTreatmentRows } from "./_components/TreatmentsView";
import {
  downloadReportCsv,
  downloadReportPdf,
  expensesDocument,
  patientsDocument,
  summaryDocument,
  treatmentsDocument,
  type ExportContext,
  type ExportDocument,
} from "./_components/report-export";
import { doctorNameMap, doctorPickerOptions, nextSort } from "./_components/report-ui";

const TAB_ITEMS: TabItem<ReportType>[] = [
  { key: "ozet", label: "Özet" },
  { key: "hastalar", label: "Hastalar" },
  { key: "tedaviler", label: "Tedaviler" },
  { key: "giderler", label: "Giderler" },
];

type ReportByType = { ozet: SummaryReport; hastalar: PatientsReport; tedaviler: TreatmentsReport; giderler: ExpensesReport };
/** Yüklenen rapor, hangi seçimle (dönem/doktor/süzgeç) yüklendiğiyle birlikte tutulur. */
type Loaded<T> = { key: string; range: DateRange; doctorName: string; data: T };
type ReportStore = { [K in ReportType]?: Loaded<ReportByType[K]> };

function ledgerHref(value: DateRangeValue, range: DateRange, tur: "TAHSILAT" | "GIDER") {
  const params = new URLSearchParams({ tab: "defter", tur });
  // Defterin tanıdığı hazır dönem adıyla taşınır (src/lib/ledger-periods.ts); ötekiler
  // (ör. "Dün") defterde varsayılana dönmesin diye gün aralığı olarak.
  const carried: DateRangeValue = isLedgerPreset(value.preset) ? { preset: value.preset } : { preset: "ozel", from: range.from, to: range.to };
  // Defterin varsayılan dönemi role göre değişir (banko: Bugün); dönem her zaman açıkça yazılır.
  writeDateRangeParams(params, carried, "ozel");
  return `/muhasebe?${params.toString()}`;
}

/**
 * Raporlar: seçilen dönemin (ve istenirse tek doktorun) raporları — Özet,
 * Hastalar (gelen hastalar, tedavi tutarı, tahsilat, kalan borç), Tedaviler ve
 * Giderler. Dönem, doktor, sekme ve hasta süzgeci adreste durur. Sayıların
 * tanımı tek yerde: src/lib/report-center.ts. Vergi/mali müşavir bölümü yoktur.
 */
function RaporContent() {
  const { can } = usePermissions();
  const searchParams = useSearchParams();
  const canExport = can("reports:export");
  const canOpenPatients = can("patients:read");
  const startRequest = useLatestRequest();

  const [tab, setTab] = useTabParam(REPORT_TYPES, "ozet");
  // Dönem adres çubuğunda (?donem=…); varsayılan "Bu ay", bitiş bugünü geçemez.
  const period = useDateRangeParam(DATE_PRESET_SETS.takvim, "ay");
  const range = period.range;
  const doctorParam = searchParams.get("doktor") || "";
  const filterParam = searchParams.get("goster");
  const patientFilter: ReportPatientFilter = isReportPatientFilter(filterParam) ? filterParam : "tumu";

  const [store, setStore] = useState<ReportStore>({});
  // Şubenin hekimleri raporla birlikte gelir (aynı kapsam, ayrıca izin gerekmez).
  const [doctors, setDoctors] = useState<ReportDoctor[] | null>(null);
  // İskelet "veri yok"tan çizilir; bu yalnız istek sürüyor bilgisidir (geçersiz dönemde istek atılmaz).
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<{ tab: ReportType; message: string } | null>(null);
  const [patientSort, setPatientSort] = useState<ListSort | null>(null);
  const [treatmentSort, setTreatmentSort] = useState<ListSort | null>({ key: "tarih", dir: "desc" });

  /** Adresteki parametreleri tek seferde değiştirir (sunucuya tur atılmaz; useSearchParams eşitlenir). */
  const setQuery = useCallback((changes: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, []);

  // Liste: şubenin hekimleri + dönemde kaydı olanlar (ayrılanlar "(ayrıldı)" ekiyle) + seçili kişi.
  // Dönemde tek doktor varsa doktor süzgeci yoktur; bu kurumda olmayan kişi adresten düşer.
  const multiDoctor = doctors === null || doctors.length > 1;
  const doctorKnown = Boolean(doctorParam) && (doctors === null || (doctors.length > 1 && doctors.some((doctor) => doctor.id === doctorParam)));
  const doctorId = doctorKnown ? doctorParam : "";
  useEffect(() => {
    if (doctors && doctorParam && !doctorKnown) setQuery({ doktor: null });
  }, [doctors, doctorParam, doctorKnown, setQuery]);
  const doctorNameById = useMemo(() => doctorNameMap(doctors), [doctors]);
  const doctorOptions = useMemo(() => doctorPickerOptions(doctors), [doctors]);
  // Giderler kliniğin genelidir: o sekmede doktor süzgeci görünmez.
  const doctorApplies = tab !== "giderler";

  const requestKey = range
    ? [tab, range.from, range.to, doctorApplies ? doctorId : "", tab === "hastalar" ? patientFilter : ""].join("|")
    : "";

  const load = useCallback(async () => {
    // Geçersiz aralıkta istek atılmaz; hata tarih alanlarının altında görünür.
    if (period.error || !range || !requestKey) return;
    const target = tab;
    const key = requestKey;
    const targetRange = range;
    const request = startRequest();
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ type: target, from: `${targetRange.from}T00:00`, to: `${targetRange.to}T23:59` });
      // Giderler süzülmez; doktor yine gönderilir ki seçili doktor listede kalsın.
      if (doctorId) params.set("doctorId", doctorId);
      if (target === "hastalar" && patientFilter !== "tumu") params.set("goster", patientFilter);
      const response = await fetch(`/api/reports?${params.toString()}`, { signal: request.signal, cache: "no-store" });
      const body = (await response.json().catch(() => null)) as (ReportResponse & { message?: string }) | null;
      if (!request.isLatest()) return;
      if (!response.ok || !body || body.type !== target) throw new Error(body?.message || "Rapor yüklenemedi.");
      const list = Array.isArray(body.doctors) ? body.doctors : [];
      setDoctors(list);
      const name = body.doctorId ? doctorNameMap(list).get(body.doctorId) || "" : "";
      setStore((current) => ({ ...current, [target]: { key, range: targetRange, doctorName: name, data: body } }));
    } catch (error) {
      if (isAbortError(error) || !request.isLatest()) return;
      // Tarayıcının İngilizce ağ hatası ("Failed to fetch") gösterilmez.
      const message = error instanceof Error && !(error instanceof TypeError) && error.message
        ? error.message
        : "Rapor yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.";
      setLoadError({ tab: target, message });
    } finally {
      if (request.isLatest()) setLoading(false);
    }
  }, [period.error, range, requestKey, tab, doctorId, patientFilter, startRequest]);

  useEffect(() => { void load(); }, [load]);
  // Başka ekranda girilen tahsilat, tedavi, randevu ya da gider rapora da yansısın.
  useRealtimeRefresh(() => void load());

  const current = store[tab];
  // Ekrandaki rakamlar başka bir seçime aitse (dönem/doktor/süzgeç değişti, yenisi yükleniyor) soluk kalır;
  // aynı seçimin arka plan yenilemesinde soluklaşmaz. Bilinmeyen tutar hiçbir zaman ₺0 görünmez.
  const stale = Boolean(current) && (current?.key !== requestKey || Boolean(period.error));
  const tabError = loadError?.tab === tab && !loading ? loadError.message : null;

  const openTab = (next: ReportType) => setTab(next);
  const openPatients = () => setQuery({ tab: "hastalar", goster: null });
  const setDoctor = (id: string) => setQuery({ doktor: id || null });
  const clearListFilters = () => setQuery({ doktor: null, goster: null });

  const showDoctorFilter = doctorApplies && multiDoctor;
  const showDoctorColumn = !doctorId && doctors !== null && doctors.length > 1;
  const canSeeCollections = can("finance:center") && can("payments:read");
  const canSeeExpenses = can("finance:center") && can("finance:read");

  // ── Dışa aktarma: ekrandakinin aynısı (aynı dönem, doktor, süzgeç ve sıra).
  const exportDocument = (): ExportDocument | null => {
    if (!current) return null;
    const context: ExportContext = {
      rangeLabel: formatRangeLabel(current.range),
      fileRange: `${current.range.from}-${current.range.to}`,
      doctorName: current.doctorName,
      doctorNameById,
    };
    // Doktor tablosu ekranda yoksa (tek doktorlu klinik) dışa aktarmada da yoktur.
    if (tab === "ozet") return summaryDocument(current.data as SummaryReport, context, showDoctorColumn);
    if (tab === "hastalar") {
      const data = current.data as PatientsReport;
      return patientsDocument(data, sortPatientRows(data.rows, patientSort), context);
    }
    if (tab === "tedaviler") {
      const data = current.data as TreatmentsReport;
      return treatmentsDocument(data, sortTreatmentRows(data.rows, treatmentSort), context);
    }
    return expensesDocument(current.data as ExpensesReport, context);
  };
  const runExport = async (format: "csv" | "pdf") => {
    const file = exportDocument();
    if (!file) throw new Error("Rapor henüz hazır değil.");
    if (format === "csv") await downloadReportCsv(file);
    else await downloadReportPdf(file);
  };
  const exportReason = period.error ? "Önce geçerli bir dönem seçin" : "Rapor hazırlanıyor";

  const viewFor = () => {
    if (tab === "ozet") {
      return (
        <SummaryView
          data={(current?.data as SummaryReport | undefined) ?? null}
          showDoctorTable={!doctorId && multiDoctor}
          doctorNameById={doctorNameById}
          collectionsHref={!doctorId && canSeeCollections && range ? ledgerHref(period.value, range, "TAHSILAT") : undefined}
          onOpenPatients={openPatients}
          onOpenTreatments={() => openTab("tedaviler")}
          onSelectDoctor={setDoctor}
        />
      );
    }
    if (tab === "hastalar") {
      return (
        <PatientsView
          data={(current?.data as PatientsReport | undefined) ?? null}
          filter={patientFilter}
          onFilterChange={(next) => setQuery({ goster: next === "tumu" ? null : next })}
          sort={patientSort}
          onSortChange={(key) => setPatientSort((sort) => nextSort(sort, key, key === "hasta"))}
          doctorNameById={doctorNameById}
          showDoctorColumn={showDoctorColumn}
          canOpenPatients={canOpenPatients}
          onClearFilters={patientFilter !== "tumu" || doctorId ? clearListFilters : undefined}
        />
      );
    }
    if (tab === "tedaviler") {
      return (
        <TreatmentsView
          data={(current?.data as TreatmentsReport | undefined) ?? null}
          sort={treatmentSort}
          onSortChange={(key) => setTreatmentSort((sort) => nextSort(sort, key))}
          doctorNameById={doctorNameById}
          showDoctorColumn={showDoctorColumn}
          canOpenPatients={canOpenPatients}
          onClearFilters={doctorId ? clearListFilters : undefined}
        />
      );
    }
    return (
      <ExpensesView
        data={(current?.data as ExpensesReport | undefined) ?? null}
        expensesHref={canSeeExpenses && range ? ledgerHref(period.value, range, "GIDER") : undefined}
        purchasesHref={can("finance:read") ? "/firma" : undefined}
      />
    );
  };

  return (
    <section className="space-y-3">
      <PageHeader icon="rapor" title="Raporlar" />
      <Tabs ariaLabel="Rapor türleri" value={tab} onChange={setTab} items={TAB_ITEMS} />

      {/* Dönem, doktor ve dışa aktarma sayfa zemininde (ayrı kart değil); dört rapor için ortak.
          Doktor seçici her zaman görünür: ayrıca "uygulanan süzgeç" etiketi gerekmez. */}
      <Toolbar
        bare
        actions={canExport ? (
          <ExportMenu
            size="md"
            onExcel={() => runExport("csv")}
            onPdf={() => runExport("pdf")}
            disabled={!current || stale}
            disabledReason={exportReason}
          />
        ) : undefined}
      >
        <DateRangeFilter {...period.filterProps} showRange />
        {showDoctorFilter && (
          <DoctorSelect
            value={doctorId}
            onChange={(id) => setDoctor(id)}
            emptyLabel="Tüm doktorlar"
            doctors={doctorOptions}
            disabled={doctors === null}
            aria-label="Doktor"
            className="sm:w-56"
          />
        )}
      </Toolbar>

      {tabError && !current ? (
        <LoadErrorState message={tabError} onRetry={() => void load()} />
      ) : !current && period.error ? null : (
        <div className="space-y-3">
          {tabError && (
            <Callout
              tone="warning"
              compact
              role="status"
              action={<Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => void load()}>Yeniden dene</Button>}
            >
              {tabError} Son yüklenen bilgiler gösteriliyor.
            </Callout>
          )}
          <div className={`transition-opacity ${stale ? "opacity-50" : ""}`} aria-busy={loading || undefined}>
            {viewFor()}
          </div>
        </div>
      )}
    </section>
  );
}

export default function RaporPage() {
  return (
    <Suspense fallback={<PageSkeleton headerAction={false} tabs={4} toolbar="bare" stats={4} body="table" rows={4} columns={5} label="Raporlar yükleniyor" />}>
      <RaporContent />
    </Suspense>
  );
}
