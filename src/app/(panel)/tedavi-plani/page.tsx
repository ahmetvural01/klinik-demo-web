"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Toolbar, ActiveFilters, type ActiveFilter } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Money, DateText } from "@/components/ui/Money";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import { NewPlanModal } from "./_components/NewPlanModal";
import { PlanDetailModal } from "./_components/PlanDetailModal";
import { PLAN_STATUS, apiMessage, planProgress, type PlanListResponse, type PlanStatus, type TreatmentPlan } from "./_components/plan-shared";

const TedaviEmptyIcon = createSceneIllustration("tedavi");

const TAB_KEYS = ["tumu", "planlandi", "devam", "tamamlandi", "iptal"] as const;
type TabKey = (typeof TAB_KEYS)[number];
const TAB_STATUS: Record<TabKey, PlanStatus | ""> = { tumu: "", planlandi: "PLANLANDI", devam: "DEVAM_EDIYOR", tamamlandi: "TAMAMLANDI", iptal: "IPTAL" };
const PAGE_SIZE = 30;

/** Adres çubuğundaki hasta/plan/yeni parametrelerini (geri tuşu bozulmadan) günceller. */
function replaceParams(update: (params: URLSearchParams) => void) {
  const params = new URLSearchParams(window.location.search);
  update(params);
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

export default function TedaviPlaniPage() {
  const { can } = usePermissions();
  const canWrite = can("treatment:write");
  const searchParams = useSearchParams();
  const [tab, setTab] = useTabParam(TAB_KEYS, "tumu");

  // Hasta dosyasından ?patientId= ile gelince liste o hastaya süzülür (önceden
  // her bağlantı boş "Yeni plan" formu açıyordu); yeni form yalnız ?yeni=1 ile.
  const patientId = searchParams.get("patientId") || "";
  const patientNameParam = searchParams.get("patientName") || "";
  const [patientName, setPatientName] = useState(patientNameParam);

  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stats, setStats] = useState<PlanListResponse["stats"] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [doctorFilterName, setDoctorFilterName] = useState("");
  const loadSequenceRef = useRef(0);

  const [selected, setSelected] = useState<TreatmentPlan | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newPatient, setNewPatient] = useState<PickedPatient | null>(null);
  const deepLinkHandledRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => { setPage(1); }, [tab, doctorFilter, debouncedSearch, patientId]);
  useEffect(() => { if (patientNameParam) setPatientName(patientNameParam); }, [patientNameParam]);

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), take: String(PAGE_SIZE) });
      const status = TAB_STATUS[tab];
      if (status) params.set("status", status);
      if (doctorFilter) params.set("doctorId", doctorFilter);
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (patientId) params.set("patientId", patientId);
      const response = await fetch(`/api/treatment-plans?${params.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiMessage(body, "Tedavi planları yüklenemedi."));
      if (sequence !== loadSequenceRef.current) return;
      const data = body as PlanListResponse;
      setPlans(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total) || 0);
      setPageCount(Math.max(1, Number(data.pageCount) || 1));
      setStats(data.stats ?? null);
      setLoadError(null);
      setLoaded(true);
      // Hasta adı adreste yoksa (eski bağlantı) listedeki ilk plandan alınır.
      const firstPatient = data.items?.[0]?.patient;
      if (patientId && firstPatient?.id === patientId) setPatientName((current) => current || firstPatient.fullName);
    } catch (error) {
      if (sequence !== loadSequenceRef.current) return;
      // Liste ekrandaysa kaybolmaz; "yenilenemedi" şeridi görünür.
      setLoadError(error instanceof Error ? error.message : "Tedavi planları yüklenemedi.");
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false);
    }
  }, [debouncedSearch, doctorFilter, page, patientId, tab]);

  useEffect(() => { void load(); }, [load]);

  // Derin bağlantılar: ?yeni=1 (hasta seçili yeni plan), ?planId= (planı aç).
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const wantsNew = searchParams.get("yeni") === "1";
    const planId = searchParams.get("planId");
    if (!wantsNew && !planId) return;
    deepLinkHandledRef.current = true;
    replaceParams((params) => { params.delete("yeni"); params.delete("planId"); });
    if (wantsNew && canWrite) {
      setNewPatient(patientId ? { id: patientId, fullName: patientNameParam || "Hasta" } : null);
      setNewOpen(true);
    }
    if (planId) {
      fetch(`/api/treatment-plans/${encodeURIComponent(planId)}`, { cache: "no-store" })
        .then(async (response) => (response.ok ? response.json() : null))
        .then((plan) => { if (plan && typeof plan === "object" && "id" in plan) setSelected(plan as TreatmentPlan); })
        .catch(() => undefined);
    }
  }, [canWrite, patientId, patientNameParam, searchParams]);

  const clearPatient = () => {
    replaceParams((params) => { params.delete("patientId"); params.delete("patientName"); });
    setPatientName("");
  };

  const onPlanChanged = (plan: TreatmentPlan) => {
    setSelected(plan);
    setPlans((current) => current.map((item) => (item.id === plan.id ? { ...item, ...plan, patient: item.patient } : item)));
    void load();
  };

  const openNew = () => {
    setNewPatient(patientId ? { id: patientId, fullName: patientName || "Hasta" } : null);
    setNewOpen(true);
  };

  const filters: ActiveFilter[] = [
    ...(patientId ? [{ key: "patient", label: `Hasta: ${patientName || "seçili hasta"}`, onRemove: clearPatient }] : []),
    ...(doctorFilter ? [{ key: "doctor", label: doctorFilterName || "Hekim", onRemove: () => { setDoctorFilter(""); setDoctorFilterName(""); } }] : []),
  ];
  const filtered = Boolean(debouncedSearch || doctorFilter || patientId || tab !== "tumu");

  const progressCell = (plan: TreatmentPlan) => {
    const progress = planProgress(plan);
    // Adımı olmayan planda hücre boş kalır ("—" yazılmaz).
    if (progress.activeCount === 0) return null;
    return (
      <ProgressBar
        className="min-w-[8rem]"
        value={progress.doneCount}
        max={progress.activeCount}
        aria-label={`${plan.title}: ${progress.doneCount}/${progress.activeCount} adım yapıldı`}
        valueLabel={false}
        tone={plan.status === "TAMAMLANDI" ? "success" : "primary"}
        label={<span className="text-xs text-slate-500">{progress.doneCount}/{progress.activeCount} adım</span>}
      />
    );
  };

  const statusBadge = (plan: TreatmentPlan) => {
    const status = PLAN_STATUS[plan.status] || { label: plan.status, tone: "neutral" as const };
    return <Badge tone={status.tone} className="whitespace-nowrap">{status.label}</Badge>;
  };

  // Hekime süzülmüş listede hekim adı her satırda tekrar etmez (süzgeç
  // etiketinde yazıyor); yalnız tarih kalır.
  const columns: ListTableColumn<TreatmentPlan>[] = [
    {
      key: "plan",
      header: "Plan",
      render: (plan) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900" title={plan.title}>{plan.title}</p>
          <p className="truncate text-xs text-slate-500">
            {doctorFilter ? null : <>{plan.doctor.fullName} · </>}<DateText value={plan.createdAt} />
          </p>
        </div>
      ),
    },
    // Hastaya süzülmüş listede her satırda aynı ad tekrar etmesin.
    ...(patientId ? [] : [{ key: "patient", header: "Hasta", render: (plan: TreatmentPlan) => <span className="text-sm text-slate-800">{plan.patient.fullName}</span> }]),
    { key: "progress", header: "İlerleme", render: progressCell },
    { key: "total", header: "Tutar", align: "right", headerHint: "İptal edilen adımlar hariç", render: (plan) => <Money value={planProgress(plan).total} className="font-semibold text-slate-800" /> },
    { key: "status", header: "Durum", align: "right", render: statusBadge },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-3 pb-8">
      <PageHeader
        icon="tedavi"
        title="Tedavi planları"
        back={patientId ? { href: `/hasta-detay?id=${encodeURIComponent(patientId)}&tab=tedavi`, label: "Hasta dosyası" } : undefined}
        actions={canWrite ? <Button icon={Plus} onClick={openNew}>Yeni tedavi planı</Button> : undefined}
      />

      <Tabs<TabKey>
        ariaLabel="Plan durumu"
        value={tab}
        onChange={setTab}
        items={[
          { key: "tumu", label: "Tümü" },
          // Sayaç yalnız iş bekleyen durumlarda (başlanacak / süren planlar); yüklenene kadar gösterilmez.
          { key: "planlandi", label: "Planlandı", count: stats?.byStatus.PLANLANDI },
          { key: "devam", label: "Devam ediyor", count: stats?.byStatus.DEVAM_EDIYOR },
          { key: "tamamlandi", label: "Tamamlandı" },
          { key: "iptal", label: "İptal edildi" },
        ]}
      />

      <ActiveFilters filters={filters} onClearAll={() => { clearPatient(); setDoctorFilter(""); setDoctorFilterName(""); }} />

      {/* Arama ve hekim süzgeci listenin kartının üst şeridi (ayrı kart değil). */}
      <ListTable<TreatmentPlan>
        toolbar={(
          <Toolbar
            filterCount={doctorFilter ? 1 : 0}
            filters={(
              <DoctorSelect
                value={doctorFilter}
                onChange={(doctorId, doctor) => { setDoctorFilter(doctorId); setDoctorFilterName(doctor?.fullName || ""); }}
                emptyLabel="Tüm hekimler"
                aria-label="Hekim"
                className="sm:w-56"
              />
            )}
          >
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Hasta veya plan adı ara"
              slashShortcut
              wrapperClassName="flex-1 min-w-[220px]"
            />
          </Toolbar>
        )}
        columns={columns}
        rows={plans}
        rowKey={(plan) => plan.id}
        loading={loading && !loaded}
        error={loaded ? null : loadError}
        staleError={loaded ? loadError : null}
        onRetry={() => void load()}
        onRowClick={setSelected}
        getRowAriaLabel={(plan) => `${plan.title} — ${plan.patient.fullName} planını aç`}
        emptyText={filtered ? "Bu seçime uyan plan yok" : "Henüz tedavi planı yok"}
        emptyDescription={filtered ? "Aramayı veya filtreleri değiştirin." : "Uzun süren tedaviler için hastaya plan ve fiyat teklifi hazırlayın."}
        emptyIcon={filtered ? undefined : TedaviEmptyIcon}
        emptyIllustrative={!filtered}
        emptyAction={canWrite ? <Button icon={Plus} variant={filtered ? "secondary" : "primary"} onClick={openNew}>Yeni tedavi planı</Button> : undefined}
        mobileCard={(plan) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{plan.title}</p>
                <p className="truncate text-xs text-slate-500">{[patientId ? "" : plan.patient.fullName, doctorFilter ? "" : plan.doctor.fullName].filter(Boolean).join(" · ")}</p>
              </div>
              {statusBadge(plan)}
            </div>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">{progressCell(plan)}</div>
              <Money value={planProgress(plan).total} className="shrink-0 text-sm font-semibold text-slate-800" />
            </div>
          </div>
        )}
        pager={pageCount > 1 ? { page, pageCount, pageSize: PAGE_SIZE, total, onPageChange: setPage } : undefined}
      />

      <PlanDetailModal
        key={selected?.id || "kapali"}
        plan={selected}
        onClose={() => setSelected(null)}
        onChanged={onPlanChanged}
        canWrite={canWrite}
      />

      {canWrite && (
        <NewPlanModal
          open={newOpen}
          onClose={() => setNewOpen(false)}
          initialPatient={newPatient}
          lockPatient={Boolean(newPatient)}
          onCreated={(plan) => {
            setSelected(plan);
            void load();
          }}
        />
      )}
    </div>
  );
}
