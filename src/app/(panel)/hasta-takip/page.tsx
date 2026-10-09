"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarPlus, FileDown, FileSpreadsheet, Phone, Plus } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { formatDateText } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { ActiveFilters, Toolbar, type ActiveFilter } from "@/components/ui/Toolbar";
import { DueLabel } from "@/components/takip/takip-labels";
import { formatPhoneNumber } from "@/lib/format";
import { downloadCsv } from "@/lib/csv-export";
import { showToastSafe } from "@/lib/toast-client";
import { isAbortError, useLatestRequest } from "@/lib/use-latest-request";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import {
  appointmentLink,
  buildItems,
  isDueToday,
  isOverdue,
  parseCustomType,
  phoneDigitsForTel,
  type ApiAppointment,
  type ApiFollowUp,
  type FollowItem,
  type PatientVisit,
} from "./_components/follow-up-model";
import { FollowUpDetailModal } from "./_components/FollowUpDetailModal";
import { FollowUpCreateModal } from "./_components/FollowUpCreateModal";

const TAB_KEYS = ["acik", "gecikmis", "bugun", "kapali"] as const;
type TabKey = (typeof TAB_KEYS)[number];

// Randevudan türeyen "Gelmedi" satırları son 90 günün randevularından gelir;
// açık takipler tarihten bağımsız her zaman gelir (API). Kapalı takipler için
// süre seçilebilir.
const DERIVED_RANGE_DAYS = 90;
const CLOSED_RANGES = [
  { value: "30", label: "Son 30 günde kapananlar" },
  { value: "90", label: "Son 90 günde kapananlar" },
  { value: "365", label: "Son 1 yılda kapananlar" },
] as const;

type DashboardCache = { appointments: ApiAppointment[]; followUps: ApiFollowUp[]; visits?: Record<string, PatientVisit> };

function cacheKeyFor(scopeKey: string, closedRange: string) {
  // Kurum/şube/kullanıcı kapsamlı oturum önbelleği: sayfaya dönüşte liste anında görünür.
  return `hasta-takip:dashboard:${scopeKey}:${closedRange}`;
}

function readCache(key: string): DashboardCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardCache;
    return Array.isArray(parsed.appointments) && Array.isArray(parsed.followUps) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: DashboardCache) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Önbellek yardımcıdır; yazılamazsa liste yine çalışır.
  }
}

function TelLink({ phone, countryCode, large = false }: { phone: string; countryCode: string; large?: boolean }) {
  return (
    <a
      href={`tel:${phoneDigitsForTel(phone, countryCode)}`}
      className={large
        ? "inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold tabular-nums text-primary"
        : "inline-flex items-center gap-1 text-xs tabular-nums text-slate-600 hover:text-primary hover:underline"}
    >
      <Phone className={large ? "h-4 w-4" : "h-3 w-3"} aria-hidden="true" />
      {formatPhoneNumber(phone)}
    </a>
  );
}

function HastaTakipContent() {
  const { can, hasFeature, scopeKey } = usePermissions();
  const searchParams = useSearchParams();
  const startDashboardRequest = useLatestRequest();
  const canWrite = can("hastatracking:write");
  const canUseWhatsapp = hasFeature("whatsapp") && can("whatsapp:write");
  const canBookAppointments = can("appointments:write");
  const hidePhone = !can("patients:phone");

  const [tab, setTab] = useTabParam<TabKey>(TAB_KEYS, "acik");
  const [closedRange, setClosedRange] = useState<string>("90");
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [followUps, setFollowUps] = useState<ApiFollowUp[]>([]);
  const [visits, setVisits] = useState<Record<string, PatientVisit>>({});
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customReasons, setCustomReasons] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [doctorFilterName, setDoctorFilterName] = useState("");
  const [detailKey, setDetailKey] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createPatient, setCreatePatient] = useState<PickedPatient | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const loadData = useCallback(async () => {
    const request = startDashboardRequest();
    const cacheKey = cacheKeyFor(scopeKey, closedRange);
    const cached = readCache(cacheKey);
    if (cached) {
      setAppointments(cached.appointments);
      setFollowUps(cached.followUps);
      if (cached.visits) setVisits(cached.visits);
      setLoaded(true);
    }
    setLoading(true);
    setError("");
    const now = new Date();
    const derivedFrom = new Date(now.getTime() - DERIVED_RANGE_DAYS * 86_400_000);
    const closedFrom = new Date(now.getTime() - Number(closedRange) * 86_400_000);
    try {
      const [appointmentResponse, followUpResponse] = await Promise.all([
        can("appointments:read")
          ? fetch(`/api/appointments?from=${derivedFrom.toISOString()}&to=${now.toISOString()}`, { cache: "no-store", signal: request.signal })
          : Promise.resolve(null),
        fetch(`/api/patient-follow-ups?from=${closedFrom.toISOString()}&to=${now.toISOString()}`, { cache: "no-store", signal: request.signal }),
      ]);
      const followUpData = await followUpResponse.json().catch(() => null);
      if (!followUpResponse.ok) throw new Error(followUpData?.message || "Takip listesi yüklenemedi.");
      // Randevu listesi yalnız "Gelmedi" satırları içindir; okunamazsa takipler yine gösterilir.
      const appointmentData = appointmentResponse && appointmentResponse.ok ? await appointmentResponse.json().catch(() => []) : [];
      if (!request.isLatest()) return;
      const nextFollowUps: ApiFollowUp[] = Array.isArray(followUpData) ? followUpData : [];
      const nextAppointments: ApiAppointment[] = Array.isArray(appointmentData) ? appointmentData : [];
      setFollowUps(nextFollowUps);
      setAppointments(nextAppointments);
      setLoaded(true);
      setNowTick(Date.now());

      // Randevusu verilmiş / sonradan gelmiş hastalar (Gelmedi satırını düşürmek ve
      // "Randevusu var" göstermek için) — liste bunu beklemeden çizilir.
      const patientIds = Array.from(new Set([
        ...nextFollowUps.filter((followUp) => followUp.status === "ACIK").map((followUp) => followUp.patientId),
        ...nextAppointments.map((appointment) => appointment.patient?.id).filter(Boolean) as string[],
      ])).slice(0, 300);
      let nextVisits: Record<string, PatientVisit> = {};
      if (patientIds.length > 0) {
        const visitResponse = await fetch(`/api/patient-follow-ups/patient-visits?ids=${patientIds.join(",")}`, { cache: "no-store", signal: request.signal }).catch(() => null);
        const visitData = visitResponse?.ok ? await visitResponse.json().catch(() => null) : null;
        nextVisits = visitData?.patients && typeof visitData.patients === "object" ? visitData.patients : {};
      }
      if (!request.isLatest()) return;
      setVisits(nextVisits);
      writeCache(cacheKey, { appointments: nextAppointments, followUps: nextFollowUps, visits: nextVisits });
    } catch (loadError) {
      if (isAbortError(loadError) || !request.isLatest()) return;
      // Önceki (önbellekteki) liste ekranda kalır; hata ve "Yeniden dene" gösterilir.
      setError(loadError instanceof Error ? loadError.message : "Takip listesi yüklenemedi.");
    } finally {
      if (request.isLatest()) setLoading(false);
    }
  }, [can, closedRange, scopeKey, startDashboardRequest]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (document.hidden) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void loadData(), 400);
    };
    // Başka ekrandan gelen değişiklik (gerçek zamanlı olay) ya da sekmeye dönüş.
    window.addEventListener("ks:realtime-sync", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/patient-follow-up-types", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled || !body) return;
        setCustomReasons(Array.isArray(body.types) ? body.types.filter((value: unknown): value is string => typeof value === "string") : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Derin bağlantı: /hasta-takip?yeni=1&patientId=…&patientName=… formu hasta seçili açar
  // (Görevler'deki "Hasta Takip'te takip açın" bağlantısı ve sözleşme §5).
  useEffect(() => {
    if (searchParams.get("yeni") !== "1" || !canWrite) return;
    const patientId = searchParams.get("patientId");
    const patientName = searchParams.get("patientName");
    setCreatePatient(patientId && patientName ? { id: patientId, fullName: patientName } : null);
    setCreateOpen(true);
    const params = new URLSearchParams(window.location.search);
    params.delete("yeni");
    params.delete("patientId");
    params.delete("patientName");
    window.history.replaceState(null, "", window.location.pathname + (params.toString() ? `?${params.toString()}` : ""));
  }, [searchParams, canWrite]);

  const allItems = useMemo(() => buildItems(followUps, appointments, visits), [followUps, appointments, visits]);

  const todayEnd = useMemo(() => {
    const end = new Date(nowTick);
    end.setHours(23, 59, 59, 999);
    return end.getTime();
  }, [nowTick]);

  const openItems = useMemo(() => allItems.filter((item) => item.isOpen), [allItems]);
  const counts = useMemo(() => ({
    acik: openItems.length,
    gecikmis: openItems.filter((item) => isOverdue(item, nowTick)).length,
    bugun: openItems.filter((item) => isDueToday(item, todayEnd, nowTick)).length,
  }), [openItems, nowTick, todayEnd]);

  const openCountByPatient = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of openItems) map.set(item.patientId, (map.get(item.patientId) || 0) + 1);
    return map;
  }, [openItems]);

  const reasonOptions = useMemo(
    () => Array.from(new Set(allItems.map((item) => item.reasonLabel))).sort((a, b) => a.localeCompare(b, "tr")),
    [allItems],
  );

  const items = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
    const queryDigits = query.replace(/\D/g, "").replace(/^0+/, "");
    const filtered = allItems.filter((item) => {
      if (tab === "kapali") { if (item.isOpen) return false; }
      else if (!item.isOpen) return false;
      if (tab === "gecikmis" && !isOverdue(item, nowTick)) return false;
      if (tab === "bugun" && !isDueToday(item, todayEnd, nowTick)) return false;
      if (reasonFilter && item.reasonLabel !== reasonFilter) return false;
      if (doctorFilter && item.doctorId !== doctorFilter) return false;
      if (normalizedQuery) {
        const haystack = [item.patientName, item.doctorName, item.noteText, item.reasonLabel, item.lastEvent?.summary]
          .filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
        const phoneMatch = !hidePhone && queryDigits.length >= 3 && (item.patientPhone || "").replace(/\D/g, "").includes(queryDigits);
        if (!haystack.includes(normalizedQuery) && !phoneMatch) return false;
      }
      return true;
    });
    if (tab === "kapali") {
      return filtered.sort((a, b) => new Date(b.closedAt || b.createdAt).getTime() - new Date(a.closedAt || a.createdAt).getTime());
    }
    // Önce gecikenler (en eski önce), sonra bugün/ tarihsiz (hemen aranacak), sonra ileri tarihliler.
    const rank = (item: FollowItem) => (isOverdue(item, nowTick) ? 0 : !item.nextActionAt ? 1 : 2);
    return filtered.sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      if (a.priority !== b.priority) return b.priority - a.priority;
      const aTime = new Date(a.nextActionAt || a.createdAt).getTime();
      const bTime = new Date(b.nextActionAt || b.createdAt).getTime();
      return aTime - bTime;
    });
  }, [allItems, tab, reasonFilter, doctorFilter, query, hidePhone, nowTick, todayEnd]);

  const detailItem = useMemo(() => allItems.find((item) => item.key === detailKey) || null, [allItems, detailKey]);

  const onDetailChanged = (updated: ApiFollowUp | null, message: string) => {
    if (updated) {
      setFollowUps((current) => {
        const exists = current.some((followUp) => followUp.id === updated.id);
        return exists ? current.map((followUp) => (followUp.id === updated.id ? updated : followUp)) : [updated, ...current];
      });
    }
    setDetailKey("");
    showToastSafe({ title: "Kaydedildi", message, type: "success" });
    void loadData();
  };

  const onCreated = async (created: ApiFollowUp, customLabel: string) => {
    setFollowUps((current) => [created, ...current]);
    setCreateOpen(false);
    setCreatePatient(null);
    showToastSafe({ title: "Takip açıldı", message: `${created.patient?.fullName || "Hasta"} aranacaklar listesine eklendi.`, type: "success" });
    // Yeni özel neden kurum listesine eklenir; bir sonraki takipte seçilebilir.
    if (customLabel && !customReasons.some((reason) => reason.toLocaleLowerCase("tr-TR") === customLabel.toLocaleLowerCase("tr-TR"))) {
      const nextReasons = [...customReasons, customLabel].slice(0, 80);
      setCustomReasons(nextReasons);
      await fetch("/api/patient-follow-up-types", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ types: nextReasons }),
      }).catch(() => null);
    }
    if (tab === "kapali") setTab("acik");
  };

  const resetFilters = () => {
    setQuery("");
    setReasonFilter("");
    setDoctorFilter("");
    setDoctorFilterName("");
  };

  const activeFilters: ActiveFilter[] = [
    ...(reasonFilter ? [{ key: "reason", label: `Neden: ${reasonFilter}`, onRemove: () => setReasonFilter("") }] : []),
    ...(doctorFilter ? [{ key: "doctor", label: `Doktor: ${doctorFilterName || "Seçili"}`, onRemove: () => { setDoctorFilter(""); setDoctorFilterName(""); } }] : []),
  ];

  const exportRows = () => items.map((item) => ({
    Hasta: item.patientName,
    ...(hidePhone ? {} : { Telefon: item.patientPhone ? formatPhoneNumber(item.patientPhone) : "" }),
    Neden: item.reasonLabel,
    Doktor: item.doctorName || "",
    "Son görüşme": item.lastEvent ? `${formatDateText(item.lastEvent.occurredAt, "datetime")} ${item.lastEvent.summary}` : "",
    "Sonraki arama": item.nextActionAt ? formatDateText(item.nextActionAt, "datetime") : "",
    Durum: item.isOpen ? (isOverdue(item, nowTick) ? "Gecikmiş" : "Açık") : "Kapalı",
    Not: item.isOpen ? item.noteText : item.resolutionNote || "",
  }));

  const downloadExcel = () => {
    downloadCsv(`hasta-takip-${formatDateText(new Date()).replace(/\./g, "-")}`, exportRows());
  };

  const downloadPdf = async () => {
    const { createPdfDoc, addPdfTitle, addPdfSection } = await import("@/lib/pdf-export");
    const rows = exportRows();
    const headers = rows.length > 0 ? Object.keys(rows[0]) : ["Hasta"];
    const doc = createPdfDoc("l");
    addPdfTitle(doc, "Hasta takip listesi", `${TAB_LABELS[tab]} · ${rows.length} kayıt · ${formatDateText(new Date(), "datetime")}`);
    addPdfSection(doc, 30, TAB_LABELS[tab], headers, rows.map((row) => headers.map((header) => String((row as Record<string, string>)[header] ?? ""))));
    doc.save(`hasta-takip-${formatDateText(new Date()).replace(/\./g, "-")}.pdf`);
  };

  // Arama: satırdaki telefon numarasına dokunmak/tıklamak hastayı arar (ayrı düğme yok).
  const rowActions = (item: FollowItem) => (
    <div className="flex items-center justify-end gap-1.5">
      {canBookAppointments && item.isOpen && (
        <IconButton icon={CalendarPlus} title="Randevu ver" href={appointmentLink(item.patientId, item.patientName)} />
      )}
      {canWrite && item.isOpen ? (
        <Button size="sm" variant="secondary" onClick={() => setDetailKey(item.key)}>Görüşme kaydet</Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setDetailKey(item.key)}>Aç</Button>
      )}
    </div>
  );

  const patientCell = (item: FollowItem) => {
    const visit = visits[item.patientId];
    const others = (openCountByPatient.get(item.patientId) || 0) - (item.isOpen ? 1 : 0);
    return (
      <div className="min-w-0">
        <p className="font-bold text-slate-900">{item.patientName}</p>
        {!hidePhone && item.patientPhone && <TelLink phone={item.patientPhone} countryCode={item.phoneCountryCode} />}
        {(visit?.nextAppointment && item.isOpen) || others > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {visit?.nextAppointment && item.isOpen && (
              <Badge tone="success">Randevusu var · {formatDateText(visit.nextAppointment.startAt, "datetime")}</Badge>
            )}
            {others > 0 && <Badge tone="neutral">+{others} takip</Badge>}
          </div>
        ) : null}
      </div>
    );
  };

  // Lab satırında provanın geliş günü de yazılır: aynı işin iki provası ayırt edilir (HL-28).
  const reasonDetail = (item: FollowItem) => item.labContext
    ? [`${item.labContext.receivedStep || "Prova"} geldi (${formatDateText(item.createdAt)})`, item.labContext.labType, item.labContext.labName].filter(Boolean).join(" · ")
    : item.type === "GELMEDI" && item.appointmentStartAt
      ? `Kaçırdığı randevu: ${formatDateText(item.appointmentStartAt, "datetime")}`
      : item.noteText || "";

  const reasonCell = (item: FollowItem) => (
    <div className="min-w-0 max-w-[260px]">
      <div className="flex flex-wrap items-center gap-1">
        <Badge tone={item.reasonTone}>{item.reasonLabel}</Badge>
        {item.priority >= 3 && <Badge tone="critical">Yüksek</Badge>}
      </div>
      <p className="mt-0.5 truncate text-xs text-slate-500" title={[item.doctorName, reasonDetail(item)].filter(Boolean).join(" · ") || undefined}>
        {[item.doctorName, reasonDetail(item)].filter(Boolean).join(" · ")}
      </p>
    </div>
  );

  const lastContactCell = (item: FollowItem) => item.lastEvent ? (
    <div className="min-w-0 max-w-[220px]">
      <p className="text-xs tabular-nums text-slate-500">{formatDateText(item.lastEvent.occurredAt, "datetime")}</p>
      <p className="truncate text-sm text-slate-700" title={item.lastEvent.summary}>{item.lastEvent.summary}</p>
    </div>
  ) : <span className="text-xs text-slate-400">Görüşülmedi</span>;

  const columns: ListTableColumn<FollowItem>[] = [
    { key: "patient", header: "Hasta", cellClassName: "min-w-[190px] whitespace-nowrap", render: patientCell },
    { key: "reason", header: "Neden · Doktor", render: reasonCell },
    { key: "last", header: "Son görüşme", render: lastContactCell },
    tab === "kapali"
      ? {
          key: "closed",
          header: "Kapanış",
          render: (item: FollowItem) => (
            <div className="min-w-0 max-w-[240px]">
              <p className="text-xs tabular-nums text-slate-500">{item.closedAt ? formatDateText(item.closedAt, "datetime") : "—"}</p>
              <p className="truncate text-sm text-slate-700" title={item.resolutionNote || undefined}>{item.resolutionNote || ""}</p>
            </div>
          ),
        }
      : {
          key: "next",
          header: "Sonraki arama",
          render: (item: FollowItem) => item.nextActionAt
            ? <DueLabel at={item.nextActionAt} open={item.isOpen} now={new Date(nowTick)} />
            : <span className="text-xs font-semibold text-amber-700">Hemen aranacak</span>,
        },
    { key: "islem", header: "İşlem", align: "right", render: rowActions },
  ];

  const mobileCard = (item: FollowItem) => {
    const visit = visits[item.patientId];
    return (
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 font-bold text-slate-900">{item.patientName}</p>
          <Badge tone={item.reasonTone}>{item.reasonLabel}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {item.isOpen
            ? (item.nextActionAt ? <DueLabel at={item.nextActionAt} open now={new Date(nowTick)} /> : <span className="font-semibold text-amber-700">Hemen aranacak</span>)
            : <span>Kapandı {item.closedAt ? formatDateText(item.closedAt) : ""}</span>}
          {item.doctorName && <span>{item.doctorName}</span>}
        </div>
        {item.lastEvent && <p className="truncate text-xs text-slate-600">Son görüşme: {item.lastEvent.summary}</p>}
        {visit?.nextAppointment && item.isOpen && (
          <p className="text-xs font-semibold text-emerald-700">Randevusu var · {formatDateText(visit.nextAppointment.startAt, "datetime")}</p>
        )}
        <div className="flex items-center gap-1.5 pt-0.5">
          {!hidePhone && item.patientPhone ? <TelLink phone={item.patientPhone} countryCode={item.phoneCountryCode} large /> : null}
          <span className="flex-1" />
          {rowActions(item)}
        </div>
      </div>
    );
  };

  const isFiltered = Boolean(query.trim() || reasonFilter || doctorFilter);
  const emptyText = isFiltered
    ? "Aramanıza uyan takip yok"
    : tab === "gecikmis" ? "Geciken takip yok"
      : tab === "bugun" ? "Bugün aranacak hasta yok"
        : tab === "kapali" ? "Bu dönemde kapanan takip yok"
          : "Açık takip yok";

  return (
    <section className="space-y-3">
      <PageHeader
        icon="follow"
        title="Hasta Takip"
        description="Aranacak ve dönüşü beklenen hastalar. Görüşmeyi kaydedin, randevu verin; iş bitince takip kapanır."
        actions={canWrite ? <Button icon={Plus} onClick={() => { setCreatePatient(null); setCreateOpen(true); }}>Yeni takip</Button> : undefined}
      />

      <Tabs
        ariaLabel="Takip listesi"
        value={tab}
        onChange={setTab}
        items={[
          { key: "acik", label: "Açık", count: loaded ? counts.acik : undefined },
          { key: "gecikmis", label: "Gecikmiş", count: loaded ? counts.gecikmis : undefined, countTone: "critical" },
          { key: "bugun", label: "Bugün aranacak", count: loaded ? counts.bugun : undefined, countTone: "warning" },
          { key: "kapali", label: "Kapalı" },
        ]}
      />

      <Toolbar
        actions={(
          <>
            {/* Dışa aktarım masaüstü işidir; telefonda listeyi aşağı itmesin. */}
            <Button size="sm" variant="secondary" icon={FileSpreadsheet} onClick={downloadExcel} disabled={items.length === 0} className="hidden sm:inline-flex">Excel&apos;e aktar</Button>
            <Button size="sm" variant="secondary" icon={FileDown} onClick={() => void downloadPdf()} disabled={items.length === 0} className="hidden sm:inline-flex">PDF indir</Button>
          </>
        )}
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Hasta adı, telefon veya not ara"
          wrapperClassName="flex-1 min-w-[220px]"
        />
        <Select aria-label="Takip nedeni" value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)} className="sm:w-52">
          <option value="">Tüm nedenler</option>
          {reasonOptions.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
        </Select>
        <DoctorSelect
          value={doctorFilter}
          onChange={(id, doctor) => { setDoctorFilter(id); setDoctorFilterName(doctor?.fullName || ""); }}
          emptyLabel="Tüm doktorlar"
          className="sm:w-52"
        />
        {tab === "kapali" && (
          <Select aria-label="Kapanış dönemi" value={closedRange} onChange={(event) => setClosedRange(event.target.value)} className="sm:w-56">
            {CLOSED_RANGES.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}
          </Select>
        )}
      </Toolbar>
      <ActiveFilters filters={activeFilters} onClearAll={resetFilters} />

      <ListTable<FollowItem>
        columns={columns}
        rows={items}
        rowKey={(item) => item.key}
        loading={loading && !loaded}
        error={error && !loaded ? error : null}
        onRetry={() => void loadData()}
        onRowClick={(item) => setDetailKey(item.key)}
        getRowAriaLabel={(item) => `${item.patientName} takibini aç`}
        mobileCard={mobileCard}
        emptyText={emptyText}
        emptyDescription={isFiltered ? "Arama veya filtreyi değiştirin." : tab === "kapali" ? undefined : "Aranacak hasta kalmadı."}
        emptyAction={isFiltered ? <Button size="sm" variant="secondary" onClick={resetFilters}>Filtreleri temizle</Button> : undefined}
        header={error && loaded ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-800">
            <span>Liste yenilenemedi: {error}</span>
            <Button size="sm" variant="secondary" onClick={() => void loadData()}>Yeniden dene</Button>
          </div>
        ) : undefined}
      />

      {detailItem && (
        <FollowUpDetailModal
          key={detailItem.key}
          item={detailItem}
          onClose={() => setDetailKey("")}
          onChanged={onDetailChanged}
          canWrite={canWrite}
          canUseWhatsapp={canUseWhatsapp}
          canBookAppointments={canBookAppointments}
          hidePhone={hidePhone}
          visit={visits[detailItem.patientId]}
          otherOpenCount={Math.max(0, (openCountByPatient.get(detailItem.patientId) || 0) - (detailItem.isOpen ? 1 : 0))}
        />
      )}

      {createOpen && (
        <FollowUpCreateModal
          onClose={() => { setCreateOpen(false); setCreatePatient(null); }}
          onCreated={(created, customLabel) => void onCreated(created, customLabel)}
          initialPatient={createPatient}
          customReasons={Array.from(new Set([
            ...customReasons,
            ...followUps.map((followUp) => parseCustomType(followUp.note).customType).filter(Boolean),
          ]))}
          openItemsForPatient={(patientId) => openItems.filter((item) => item.patientId === patientId)}
          onOpenExisting={(item) => { setCreateOpen(false); setCreatePatient(null); setDetailKey(item.key); }}
        />
      )}
    </section>
  );
}

const TAB_LABELS: Record<TabKey, string> = {
  acik: "Açık takipler",
  gecikmis: "Gecikmiş takipler",
  bugun: "Bugün aranacaklar",
  kapali: "Kapalı takipler",
};

export default function HastaTakipPage() {
  return (
    <Suspense fallback={<div className="py-20" aria-hidden="true" />}>
      <HastaTakipContent />
    </Suspense>
  );
}
