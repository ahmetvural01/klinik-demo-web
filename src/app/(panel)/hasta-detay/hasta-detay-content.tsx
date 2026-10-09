"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarPlus,
  ClipboardList,
  Download,
  FileUp,
  FlaskConical,
  NotebookPen,
  Pencil,
  Pill,
  ShieldAlert,
  Stethoscope,
  Wallet,
} from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam, type TabItem } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { PatientFormModal } from "@/components/patient/PatientFormModal";
import { LabNewOrderModal } from "@/components/lab/LabNewOrderModal";
import { fetchJson } from "@/components/lab/lab-order-model";
import { cachedGet } from "@/lib/client-cache";
import { formatPhoneNumber } from "@/lib/format";
import { selectDoctors, type StaffLike } from "@/lib/staff-roles";
import { showToastSafe } from "@/lib/toast-client";
import { getOrderSummary } from "@/lib/lab-workflow";
import { isAbortError, useLatestRequest } from "@/lib/use-latest-request";
import { PatientFileProvider, type PatientFileContextValue } from "./_components/PatientFileContext";
import {
  ageFrom,
  computeBalance,
  genderLabel,
  healthFlagsOf,
  isOpenInstallment,
  isPendingExam,
  money,
  TAB_LABELS,
  TAB_ORDER,
  TAB_PERMISSIONS,
  type ClinicTask,
  type Pay,
  type PatientDetailData,
  type TabKey,
  type TreatmentPlanLite,
} from "./_components/patient-file-shared";
import { ActionMenu, type ActionMenuItem } from "./_components/ActionMenu";
import { SummaryTab } from "./_components/SummaryTab";
import { TreatmentTab } from "./_components/TreatmentTab";
import { FinanceTab } from "./_components/FinanceTab";
import { AppointmentsTab } from "./_components/AppointmentsTab";
import { LabTab } from "./_components/LabTab";
import { PrescriptionTab } from "./_components/PrescriptionTab";
import { TasksTab } from "./_components/TasksTab";
import { DocumentsTab } from "./_components/DocumentsTab";
import { PaymentModal } from "./_components/PaymentModal";
import { ExportModal } from "./_components/ExportModal";
import { PrintArea } from "./_components/print";

/**
 * Hasta dosyası — sistemin merkez ekranı. Bu bileşen yalnız veriyi yükler,
 * sayfa başlığını ve sekmeleri çizer; her sekmenin içeriği ve formu
 * ./_components altında kendi dosyasındadır (önceden hepsi tek bir 5.800
 * satırlık dosyadaydı).
 */
export default function HastaDetayContent() {
  const { can, canAny } = usePermissions();
  const search = useSearchParams();
  const id = search.get("id") || "";
  const hidePatientPhone = !can("patients:phone");
  const canEditPatient = can("patients:write");

  const [data, setData] = useState<PatientDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [clinicTasks, setClinicTasks] = useState<ClinicTask[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [treatmentPlans, setTreatmentPlans] = useState<TreatmentPlanLite[]>([]);
  const [doctors, setDoctors] = useState<StaffLike[]>([]);
  const [doctorsLoaded, setDoctorsLoaded] = useState(false);
  const [me, setMe] = useState<{ id: string; fullName: string }>({ id: "", fullName: "" });
  const [clinicName, setClinicName] = useState("");
  const [labNames, setLabNames] = useState<string[]>([]);
  const [labsLoading, setLabsLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [paymentState, setPaymentState] = useState<{ open: boolean; payment: Pay | null }>({ open: false, payment: null });
  const [labCreateOpen, setLabCreateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const beginLoad = useLatestRequest();
  const accessRecordedRef = useRef(false);
  const lastRefreshRef = useRef(0);

  const visibleTabs = useMemo(() => TAB_ORDER.filter((key) => canAny(...TAB_PERMISSIONS[key])), [canAny]);
  const [tab, setTab] = useTabParam<TabKey>(visibleTabs, "bilgi");
  const canOpenTab = useCallback((key: TabKey) => visibleTabs.includes(key), [visibleTabs]);
  const selectTab = useCallback((key: TabKey) => {
    setTab(canOpenTab(key) ? key : "bilgi");
    window.scrollTo({ top: 0 });
  }, [canOpenTab, setTab]);

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    const request = beginLoad();
    if (!silent) setLoading(true);
    try {
      const [patientResponse, taskResponse, planResponse] = await Promise.all([
        fetch(`/api/patients/${id}`, {
          cache: "no-store",
          signal: request.signal,
          // İlk açılış KVKK erişim kaydına yazılır; sonraki sessiz yenilemeler yazılmaz.
          headers: accessRecordedRef.current ? { "x-silent-refresh": "1" } : undefined,
        }),
        can("clinictasks:read") ? fetch(`/api/clinic-tasks?patientId=${id}&take=200`, { cache: "no-store", signal: request.signal }).catch(() => null) : Promise.resolve(null),
        can("treatment:read") ? fetch(`/api/treatment-plans?patientId=${id}&take=50`, { cache: "no-store", signal: request.signal }).catch(() => null) : Promise.resolve(null),
      ]);
      if (!request.isLatest()) return;
      if (!patientResponse.ok) {
        if (patientResponse.status === 404) {
          setNotFound(true);
          setData(null);
        }
        setLoadError(patientResponse.status === 404 ? "Hasta bulunamadı. Arşivlenmiş ya da başka bir şubenin hastası olabilir." : "Hasta dosyası yüklenemedi.");
        return;
      }
      accessRecordedRef.current = true;
      lastRefreshRef.current = Date.now();
      const body = await patientResponse.json();
      const taskJson = taskResponse?.ok ? await taskResponse.json().catch(() => null) : null;
      const planJson = planResponse?.ok ? await planResponse.json().catch(() => null) : null;
      if (!request.isLatest()) return;
      setData({
        ...body,
        appointments: Array.isArray(body?.appointments) ? body.appointments : [],
        examinations: Array.isArray(body?.examinations) ? body.examinations : [],
        payments: Array.isArray(body?.payments) ? body.payments : [],
        prescriptions: Array.isArray(body?.prescriptions) ? body.prescriptions : [],
        labOrders: Array.isArray(body?.labOrders) ? body.labOrders : [],
        taksitPlanlari: Array.isArray(body?.taksitPlanlari) ? body.taksitPlanlari : [],
      });
      setNotFound(false);
      setLoadError("");
      if (Array.isArray(taskJson)) setClinicTasks(taskJson);
      else if (can("clinictasks:read") && !silent) showToastSafe({ type: "error", message: "Hastanın görevleri yüklenemedi." });
      setTasksLoaded(true);
      if (Array.isArray(planJson?.items)) setTreatmentPlans(planJson.items);
    } catch (error) {
      if (isAbortError(error)) return;
      setLoadError("Bağlantı hatası: hasta dosyası yenilenemedi.");
    } finally {
      if (request.isLatest()) setLoading(false);
    }
  }, [id, beginLoad, can]);

  const loadRef = useRef(load);
  loadRef.current = load;

  // Hasta değişince baştan yükle.
  useEffect(() => {
    accessRecordedRef.current = false;
    lastRefreshRef.current = 0;
    setData(null);
    setNotFound(false);
    setLoadError("");
    setTasksLoaded(false);
    setClinicTasks([]);
    setTreatmentPlans([]);
    setLoading(true);
    void loadRef.current();
  }, [id]);

  // Başka bir personel bu hastaya kayıt eklediğinde (ödeme, randevu, lab...)
  // ekran sessizce güncellenir; sekmeye geri dönülünce de tazelenir.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void loadRef.current(true); }, 400);
    };
    const onVisible = () => {
      if (document.hidden || Date.now() - lastRefreshRef.current < 15_000) return;
      void loadRef.current(true);
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Sekmelerin ortak kullandığı listeler — bir kez, önbellekten.
  useEffect(() => {
    let active = true;
    cachedGet<{ id?: string; fullName?: string } | null>("/api/auth/me", 60_000)
      .then((user) => { if (active && user?.id) setMe({ id: user.id, fullName: user.fullName || "" }); })
      .catch(() => undefined);
    cachedGet<StaffLike[]>("/api/staff", 60_000, { throwOnError: true })
      .then((staff) => { if (active) setDoctors(selectDoctors(staff || [])); })
      .catch(() => { if (active) showToastSafe({ type: "error", message: "Hekim listesi yüklenemedi; hekim seçimleri boş görünebilir." }); })
      .finally(() => { if (active) setDoctorsLoaded(true); });
    cachedGet<{ institutionName?: string } | null>("/api/settings", 60_000)
      .then((settings) => { if (active && settings?.institutionName) setClinicName(settings.institutionName); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const canReadLab = can("lab:read");
  useEffect(() => {
    if (!canReadLab) return;
    let active = true;
    setLabsLoading(true);
    fetchJson("/api/lab-orders?namesOnly=true", undefined, "Laboratuvar listesi yüklenemedi.")
      .then((payload) => { if (active) setLabNames(Array.isArray(payload) ? payload.filter((name): name is string => typeof name === "string") : []); })
      .catch(() => { if (active) setLabNames([]); })
      .finally(() => { if (active) setLabsLoading(false); });
    return () => { active = false; };
  }, [canReadLab]);

  const balance = useMemo(() => (data ? computeBalance(data) : null), [data]);

  // Tahsilat / reçete formlarında varsayılan hekim: hastayı en son tedavi eden.
  const recentDoctorId = useMemo(() => {
    const exams = [...(data?.examinations || [])].sort((a, b) => new Date(b.diagnosedAt).getTime() - new Date(a.diagnosedAt).getTime());
    return exams.find((exam) => exam.doctorId && doctors.some((doctor) => doctor.id === exam.doctorId))?.doctorId || "";
  }, [data?.examinations, doctors]);
  const treatingDoctorNames = useMemo(() => Array.from(new Set((data?.examinations || []).map((exam) => exam.doctor?.fullName).filter((name): name is string => Boolean(name)))), [data?.examinations]);

  const openPayment = useCallback((payment?: Pay) => setPaymentState({ open: true, payment: payment || null }), []);
  const openEditPatient = useCallback(() => setEditOpen(true), []);
  const openLabCreate = useCallback(() => setLabCreateOpen(true), []);
  const reload = useCallback((silent = true) => loadRef.current(silent), []);
  // Lab penceresine giden hasta nesnesi her yenilemede yeniden kurulmasın
  // (pencere açıkken kullanıcının girdisi sıfırlanmasın).
  const patientIdValue = data?.id || "";
  const patientNameValue = data?.fullName || "";
  const patientTcValue = data?.tcNo || null;
  const patientPhoneValue = hidePatientPhone ? null : data?.phone || null;
  const labInitialPatient = useMemo(
    () => (patientIdValue ? { id: patientIdValue, fullName: patientNameValue, tcNo: patientTcValue, phone: patientPhoneValue } : null),
    [patientIdValue, patientNameValue, patientTcValue, patientPhoneValue],
  );
  const appointmentHref = data ? `/randevu?newPatientId=${encodeURIComponent(data.id)}&newPatientName=${encodeURIComponent(data.fullName)}` : "/randevu?yeni=1";

  const contextValue = useMemo<PatientFileContextValue | null>(() => (data && balance ? {
    patientId: data.id,
    data,
    reload,
    can,
    canOpenTab,
    selectTab,
    hidePatientPhone,
    canEditPatient,
    doctors,
    doctorsLoaded,
    currentUserId: me.id,
    clinicName,
    balance,
    recentDoctorId,
    treatingDoctorNames,
    clinicTasks,
    tasksLoaded,
    treatmentPlans,
    openPayment,
    openEditPatient,
    openLabCreate,
    appointmentHref,
  } : null), [data, balance, reload, can, canOpenTab, selectTab, hidePatientPhone, canEditPatient, doctors, doctorsLoaded, me.id, clinicName, recentDoctorId, treatingDoctorNames, clinicTasks, tasksLoaded, treatmentPlans, openPayment, openEditPatient, openLabCreate, appointmentHref]);

  if (!id) {
    return (
      <section className="space-y-4">
        <PageHeader icon="users" title="Hasta dosyası" back={{ href: "/hasta", label: "Hastalar" }} />
        <LoadErrorState message="Açılacak hasta seçilmedi. Hastalar listesinden bir hasta seçin." />
      </section>
    );
  }

  if (loading && !data) {
    return (
      <section className="space-y-4" aria-busy="true" aria-label="Hasta dosyası yükleniyor">
        <div className="flex items-center gap-3 pt-4">
          <div className="h-10 w-10 rounded-lg bg-slate-100" />
          <div className="space-y-2">
            <div className="h-5 w-48 rounded bg-slate-100" />
            <div className="h-3 w-64 rounded bg-slate-100" />
          </div>
        </div>
        <div className="h-10 rounded-lg bg-slate-100" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="h-64 rounded-xl bg-slate-100" />
          <div className="h-64 rounded-xl bg-slate-100" />
        </div>
      </section>
    );
  }

  if (!data || !contextValue || !balance) {
    return (
      <section className="space-y-4">
        <PageHeader icon="users" title="Hasta dosyası" back={{ href: "/hasta", label: "Hastalar" }} />
        <LoadErrorState message={loadError || "Hasta dosyası yüklenemedi."} onRetry={notFound ? undefined : () => void load()} />
        {notFound && <Button variant="secondary" href="/hasta">Hastalar listesine dön</Button>}
      </section>
    );
  }

  const healthFlags = healthFlagsOf(data);
  const otherFlags = healthFlags.filter((flag) => flag !== "Bulaşıcı hastalık");
  const age = ageFrom(data.birthDate);
  const identity = [
    data.tcNo && data.tcNo !== "***" ? `TC ${data.tcNo}` : "",
    !hidePatientPhone && data.phone && data.phone !== "***" ? (data.phoneCountryCode && data.phoneCountryCode !== "+90" ? `${data.phoneCountryCode} ${data.phone}` : formatPhoneNumber(data.phone)) : "",
    age !== null ? `${age} yaş` : "",
    genderLabel(data.gender),
  ].filter(Boolean).join(" · ");

  const showBalance = canOpenTab("odeme");
  const debt = balance.totalDebt;
  const stats = showBalance
    ? [{
        label: debt < -0.004 ? "Avans" : "Kalan borç",
        value: money(Math.abs(debt)),
        color: debt > 0.004 ? "text-red-700" : debt < -0.004 ? "text-emerald-700" : "text-slate-800",
      }]
    : undefined;

  const pendingCount = data.examinations.filter(isPendingExam).length;
  const overdueInstallments = data.taksitPlanlari.flatMap((plan) => plan.taksitler || []).filter((item) => isOpenInstallment(item) && item.status === "GECIKTI").length;
  const labSummaries = data.labOrders.map((order) => getOrderSummary({ labType: order.labType, notes: order.notes || null, status: order.status, trips: order.trips || [], invoices: [] }));
  const openLabs = labSummaries.filter((summary) => !summary.isDone && !summary.cancelled);
  const openTasks = clinicTasks.filter((task) => task.status === "ACIK" || task.status === "BEKLEMEDE");
  const overdueTasks = openTasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < Date.now()).length;

  const tabItems: TabItem<TabKey>[] = visibleTabs.map((key) => {
    if (key === "tedavi") return { key, label: TAB_LABELS[key], count: pendingCount, countTone: "neutral" };
    if (key === "odeme") return { key, label: TAB_LABELS[key], count: overdueInstallments, countTone: "critical" };
    if (key === "lab") return { key, label: TAB_LABELS[key], count: openLabs.length, countTone: openLabs.some((summary) => summary.late) ? "critical" : "neutral" };
    if (key === "gorevler") return { key, label: TAB_LABELS[key], count: openTasks.length, countTone: overdueTasks > 0 ? "warning" : "neutral" };
    return { key, label: TAB_LABELS[key] };
  });

  const menuItems: ActionMenuItem[] = [
    ...(can("appointments:write") ? [{ key: "appointment", label: "Randevu ver", description: "Takvimde bu hasta seçili açılır", icon: CalendarPlus, href: appointmentHref }] : []),
    ...(can("payments:write") ? [{ key: "payment", label: "Tahsilat al", description: debt > 0.004 ? `Kalan borç ${money(debt)}` : "Nakit, kart, havale", icon: Wallet, onSelect: () => openPayment() }] : []),
    ...(can("examinations:write") && canOpenTab("tedavi") ? [{ key: "treatment", label: "Muayene / tedavi ekle", icon: Stethoscope, onSelect: () => selectTab("tedavi") }] : []),
    ...(can("lab:write") ? [{ key: "lab", label: "Lab işi aç", icon: FlaskConical, onSelect: openLabCreate }] : []),
    ...(can("prescriptions:write") && canOpenTab("recete") ? [{ key: "rx", label: "Reçete yaz", icon: Pill, onSelect: () => selectTab("recete") }] : []),
    ...(can("clinictasks:write") && canOpenTab("gorevler") ? [{ key: "task", label: "Görev ekle", icon: ClipboardList, onSelect: () => selectTab("gorevler") }] : []),
    ...(canEditPatient ? [{
      key: "note",
      label: "Not ekle",
      icon: NotebookPen,
      onSelect: () => {
        selectTab("bilgi");
        window.setTimeout(() => document.getElementById("hd-note")?.focus(), 150);
      },
    }] : []),
    ...((can("documents:write") || can("xray:write")) && canOpenTab("belgeler") ? [{ key: "doc", label: "Belge / röntgen yükle", icon: FileUp, onSelect: () => selectTab("belgeler") }] : []),
  ];

  return (
    <PatientFileProvider value={contextValue}>
      <section className="space-y-4">
        <PageHeader
          icon="users"
          back={{ href: "/hasta", label: "Hastalar" }}
          title={data.fullName}
          description={(
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {identity && <span>{identity}</span>}
              {data.hasContagiousDisease && (
                <Badge tone="critical" solid icon={ShieldAlert} title={data.contagiousDiseaseNote || undefined}>Bulaşıcı hastalık</Badge>
              )}
              {otherFlags.length > 0 && <Badge tone="critical" icon={ShieldAlert}>{otherFlags.join(", ")}</Badge>}
            </span>
          )}
          stats={stats}
          actions={(
            <>
              <ActionMenu items={menuItems} />
              {canEditPatient && <Button variant="secondary" icon={Pencil} onClick={openEditPatient}>Düzenle</Button>}
              <IconButton icon={Download} title="Hasta dosyasını PDF / Excel indir" onClick={() => setExportOpen(true)} />
            </>
          )}
        />

        {loadError && <LoadErrorState compact message={`${loadError} Ekrandaki bilgiler son yüklenen hâlidir.`} onRetry={() => void load(true)} />}

        <div className="sticky top-0 z-30 -mx-1 bg-[rgb(var(--app-bg))] px-1 py-1">
          <Tabs ariaLabel="Hasta dosyası bölümleri" items={tabItems} value={tab} onChange={selectTab} panelIdPrefix="hd-panel" />
        </div>

        <div id={`hd-panel-${tab}`} role="tabpanel" aria-label={TAB_LABELS[tab]}>
          {tab === "bilgi" && <SummaryTab currentUserName={me.fullName} />}
          {tab === "tedavi" && <TreatmentTab />}
          {tab === "odeme" && <FinanceTab />}
          {tab === "randevular" && <AppointmentsTab />}
          {tab === "lab" && <LabTab labNames={labNames} />}
          {tab === "recete" && <PrescriptionTab />}
          {tab === "gorevler" && <TasksTab />}
          {tab === "belgeler" && <DocumentsTab />}
        </div>

        <PatientFormModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          patientId={data.id}
          hidePhoneField={hidePatientPhone}
          onSaved={() => {
            showToastSafe({ type: "success", message: "Hasta bilgileri güncellendi." });
            void load(true);
          }}
        />
        <PaymentModal open={paymentState.open} payment={paymentState.payment} onClose={() => setPaymentState({ open: false, payment: null })} />
        {can("lab:write") && (
          <LabNewOrderModal
            open={labCreateOpen}
            onClose={() => setLabCreateOpen(false)}
            onCreated={() => {
              void load(true);
              if (canOpenTab("lab")) selectTab("lab");
            }}
            initialPatient={labInitialPatient}
            lockPatient
            labNames={labNames}
            labsLoading={labsLoading}
            canAddLab={can("finance:write")}
            onLabCreated={(name) => setLabNames((current) => Array.from(new Set([...current, name])).sort((a, b) => a.localeCompare(b, "tr")))}
          />
        )}
        <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
        <PrintArea />
      </section>
    </PatientFileProvider>
  );
}
