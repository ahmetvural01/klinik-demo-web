"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarPlus, ClipboardList, Download, FileSignature, FileUp, FlaskConical, History, MessageSquareText, NotebookPen, Pencil, Pill, Plus, Send, ShieldAlert, Stethoscope, Users, Wallet } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDateText } from "@/components/ui/Money";
import { Tabs, useTabParam, type TabItem } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { TableSkeleton } from "@/components/ui/PageSkeleton";
import { PhoneLink } from "@/components/work-lists/PhoneLink";
import { cachedGet } from "@/lib/client-cache";
import { hasAnyPanelPermission, hasPanelPermission } from "@/lib/panel-permissions";
import { selectDoctors, type StaffLike } from "@/lib/staff-roles";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";
import { getOrderSummary } from "@/lib/lab-workflow";
import { isAbortError, useLatestRequest } from "@/lib/use-latest-request";
import type { PatientFormSection } from "@/components/patient/PatientFormModal";
import { PatientFileProvider, type PatientFileContextValue, type PatientFileIntent } from "./_components/PatientFileContext";
import { PatientFileSkeleton } from "./_components/PatientFileSkeleton";
import {
  fetchPatientFile,
  forgetPatientFileFetch,
  notePatientFileFetched,
  takePrefetchedPatientFile,
  wasPatientFileFetchedRecently,
} from "./_components/patient-prefetch";
import { readPatientListAddress } from "@/components/patient/patient-list-address";
import { loadClinicLetterhead } from "./_components/clinic-letterhead";
import {
  ageFrom,
  computeBalance,
  errorMessageOf,
  genderLabel,
  healthFlagsOf,
  isChargeableExam,
  isOpenInstallment,
  isPendingExam,
  money,
  TAB_LABELS,
  TAB_ORDER,
  TAB_PERMISSIONS,
  type ClinicTask,
  type Pay,
  type PatientBalance,
  type PatientDetailData,
  type TabKey,
} from "./_components/patient-file-shared";
import { SummaryTab } from "./_components/SummaryTab";

// Varsayılan (Özet) dışındaki sekmeler ve bütün pencereler ancak açılınca
// yüklenir: hasta dosyasının ilk açılışında inen kod küçülür (PDF kitaplığı,
// imza alanı, lab ve hasta formu yalnız gerektiğinde iner).
const tabSkeleton = () => <TableSkeleton rows={4} columns={4} />;
const TreatmentTab = dynamic(() => import("./_components/TreatmentTab").then((module) => module.TreatmentTab), { ssr: false, loading: tabSkeleton });
const FinanceTab = dynamic(() => import("./_components/FinanceTab").then((module) => module.FinanceTab), { ssr: false, loading: tabSkeleton });
const AppointmentsTab = dynamic(() => import("./_components/AppointmentsTab").then((module) => module.AppointmentsTab), { ssr: false, loading: tabSkeleton });
const LabTab = dynamic(() => import("./_components/LabTab").then((module) => module.LabTab), { ssr: false, loading: tabSkeleton });
const PrescriptionTab = dynamic(() => import("./_components/PrescriptionTab").then((module) => module.PrescriptionTab), { ssr: false, loading: tabSkeleton });
const DocumentsTab = dynamic(() => import("./_components/DocumentsTab").then((module) => module.DocumentsTab), { ssr: false, loading: tabSkeleton });
const PatientFormModal = dynamic(() => import("@/components/patient/PatientFormModal").then((module) => module.PatientFormModal), { ssr: false });
const PaymentModal = dynamic(() => import("./_components/PaymentModal").then((module) => module.PaymentModal), { ssr: false });
const LabNewOrderModal = dynamic(() => import("@/components/lab/LabNewOrderModal").then((module) => module.LabNewOrderModal), { ssr: false });
const ExportModal = dynamic(() => import("./_components/ExportModal").then((module) => module.ExportModal), { ssr: false });
const TaskFormModal = dynamic(() => import("@/components/takip/TaskFormModal").then((module) => module.TaskFormModal), { ssr: false });
const AccessLogModal = dynamic(() => import("./_components/AccessLogModal").then((module) => module.AccessLogModal), { ssr: false });

/** GET /api/patients/[id]/balance yanıtı (tek bakiye kuralı, sunucuda). */
type ServerBalance = {
  balance: PatientBalance;
  doctors: { id: string; fullName: string }[];
  lastDoctorId: string;
};

function toServerBalance(body: unknown): ServerBalance | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0);
  if (raw.bakiye === undefined) return null;
  const doctors = Array.isArray(raw.doctors)
    ? raw.doctors.filter((item): item is { id: string; fullName: string } => Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string")
    : [];
  return {
    balance: {
      totalCharged: number(raw.tedaviToplam),
      discountRate: number(raw.indirimOrani),
      discountAmount: number(raw.indirim),
      discountedTotal: number(raw.netTedavi),
      totalPaid: number(raw.tahsilatToplam),
      totalDebt: number(raw.bakiye),
    },
    doctors,
    lastDoctorId: typeof raw.lastDoctorId === "string" ? raw.lastDoctorId : "",
  };
}

const tasksFrom = (json: unknown): ClinicTask[] | null => {
  if (Array.isArray(json)) return json as ClinicTask[];
  if (json && typeof json === "object" && Array.isArray((json as { items?: unknown }).items)) return (json as { items: ClinicTask[] }).items;
  return null;
};

// Klinikteki her değişiklik (ödeme, randevu, lab...) gerçek zamanlı olay
// üretir; olay bu hastaya özgü değildir. Hasta kaydı en sık 10 sn'de bir
// sessizce yenilenir, sekme arka plandayken hiç yenilenmez (dönünce bir kez).
const REALTIME_MIN_GAP_MS = 10_000;

/** Açık hasta dosyasının kimliği ve adı (sekmeye özel oturum deposu; üst bar okur). */
const PATIENT_CONTEXT_KEY = "ks:hasta-baglam";

/**
 * Hasta dosyası — sistemin merkez ekranı. Bu bileşen yalnız veriyi yükler,
 * sayfa başlığını ve sekmeleri çizer; her sekmenin içeriği ve formu
 * ./_components altında kendi dosyasındadır.
 */
export default function HastaDetayContent() {
  const { permissions, role, userId, ghost } = usePermissions();
  // Yetki yoklaması her 15 sn'de aynı içerikte yeni dizi üretiyor; bağlam
  // ve bütün sekmeler (diş şeması dahil) boşuna yeniden çiziliyordu. Yetki
  // fonksiyonları yalnız içerik değişince yenilenir.
  const permissionKey = permissions.join("|");
  const can = useMemo(() => {
    const list = permissionKey ? permissionKey.split("|") : [];
    return (permission: string) => hasPanelPermission(list, permission);
  }, [permissionKey]);
  const canAny = useMemo(() => {
    const list = permissionKey ? permissionKey.split("|") : [];
    return (...required: string[]) => hasAnyPanelPermission(list, required);
  }, [permissionKey]);

  const search = useSearchParams();
  const id = search.get("id") || "";
  const hidePatientPhone = !can("patients:phone");
  const canEditPatient = can("patients:write");
  const canReadTasks = can("clinictasks:read");
  // Bakiye tek kuraldan, sunucudan (/api/patients/[id]/balance) okunur: her
  // rolde aynı tutar görünür. İstemci hesabı (tedavi + tahsilat kayıtları) yalnız
  // yedektir: sunucu yanıtı gelmezse ve iki kaydı da görebilen rolde kullanılır.
  // Önceden yetkili rolde istemci hesabı gösteriliyor, yarım kuruşta sunucudan
  // 1 kuruş farklı çıkıyordu; tedavileri göremeyen rolde (BANKO) ise tahsilatlar
  // "avans" görünüyordu.
  const clientBalanceOk = can("examinations:read") && can("payments:read");
  const serverBalanceNeeded = canAny("payments:read", "finance:read");
  // Doktor tedavi kaydını ve reçeteyi yalnız kendi adına açar (sunucu kuralı);
  // görünmez destek oturumu hariç.
  const lockDoctorToSelf = role === "DOKTOR" && !ghost;

  const [data, setData] = useState<PatientDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [clinicTasks, setClinicTasks] = useState<ClinicTask[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [tasksError, setTasksError] = useState(false);
  const [serverBalance, setServerBalance] = useState<ServerBalance | null>(null);
  const [doctors, setDoctors] = useState<StaffLike[]>([]);
  const [doctorsLoaded, setDoctorsLoaded] = useState(false);
  const [me, setMe] = useState<{ id: string; fullName: string }>({ id: userId || "", fullName: "" });
  // Geri bağlantı Hastalar listesinin son adresine döner (arama/sayfa korunur);
  // ilk çizimde /hasta, oturum deposu bağlandıktan sonra okunur (hidrasyon farkı yok).
  const [backHref, setBackHref] = useState("/hasta");
  const [clinicName, setClinicName] = useState("");
  const [labNames, setLabNames] = useState<string[]>([]);
  const [labsLoading, setLabsLoading] = useState(false);
  const [labsError, setLabsError] = useState<string | null>(null);
  const [intent, setIntent] = useState<PatientFileIntent | null>(null);
  const [compact, setCompact] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editSection, setEditSection] = useState<PatientFormSection | undefined>();
  const [paymentState, setPaymentState] = useState<{ open: boolean; payment: Pay | null }>({ open: false, payment: null });
  const [labCreateOpen, setLabCreateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [accessLogOpen, setAccessLogOpen] = useState(false);
  const [taskForm, setTaskForm] = useState<{ open: boolean; task: ClinicTask | null }>({ open: false, task: null });

  const beginLoad = useLatestRequest();
  const accessRecordedRef = useRef(false);
  const lastRefreshRef = useRef(0);
  const tasksWantedRef = useRef(false);
  const labsRequestedRef = useRef(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef(false);
  compactRef.current = compact;

  const visibleTabs = useMemo(() => TAB_ORDER.filter((key) => canAny(...TAB_PERMISSIONS[key])), [canAny]);
  // Hekim dosyayı çoğunlukla tedavi girmek için açar: adreste sekme yoksa
  // Tedavi açılır (risk ve alerji rozetleri başlıkta her sekmede görünür).
  // Eski `?tab=gorevler` / `?tab=notlar` bağlantıları her rolde Özet'e açılır
  // (görevler ve notlar artık orada); hekimde de Tedavi'ye düşmesin.
  const legacySummaryTab = ["gorevler", "notlar"].includes(search.get("tab") || "");
  const defaultTab: TabKey = !legacySummaryTab && role === "DOKTOR" && visibleTabs.includes("tedavi") ? "tedavi" : "bilgi";
  const [tab, setTab] = useTabParam<TabKey>(visibleTabs, defaultTab);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const canOpenTab = useCallback((key: TabKey) => visibleTabs.includes(key), [visibleTabs]);
  const selectTab = useCallback((key: TabKey) => {
    setTab(canOpenTab(key) ? key : "bilgi");
    // Sayfa aşağı kaymışsa (sekmeler yapışkan) yeni sekme baştan görünsün;
    // başlık görünürken kaydırma yapılmaz (ekran zıplamasın).
    if (compactRef.current) window.requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "start" }));
  }, [canOpenTab, setTab]);

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    const request = beginLoad();
    if (!silent) setLoading(true);
    try {
      // İlk açılış KVKK erişim kaydına yazılır; sonraki yenilemeler sessizdir.
      // İlk istek çoğunlukla sayfa kabuğu tarafından önceden başlatılmıştır.
      // İstek gönderildiği anda "kaydedildi" sayılır: ilk yanıt gelmeden düşen
      // gerçek zamanlı yenileme ikinci bir "görüntüleme" yazmasın. Dosya az
      // önce açıldıysa (içerik yeniden kuruldu) istek yine sessiz gider.
      const firstOpen = !accessRecordedRef.current;
      const prefetched = firstOpen ? takePrefetchedPatientFile(id) : null;
      const alreadyRecorded = firstOpen && !prefetched && wasPatientFileFetchedRecently(id);
      if (firstOpen && !prefetched && !alreadyRecorded) notePatientFileFetched(id);
      accessRecordedRef.current = true;
      // Görevler yalnız Özet açıldıysa istenir (bkz. loadTasks).
      const wantTasks = canReadTasks && tasksWantedRef.current;
      const [patientResult, taskResponse, balanceResponse] = await Promise.all([
        prefetched ?? fetchPatientFile(id, { signal: request.signal, silent: !firstOpen || alreadyRecorded }),
        wantTasks ? fetch(`/api/clinic-tasks?patientId=${encodeURIComponent(id)}&take=200`, { cache: "no-store", signal: request.signal }).catch(() => null) : Promise.resolve(null),
        serverBalanceNeeded ? fetch(`/api/patients/${encodeURIComponent(id)}/balance`, { cache: "no-store", signal: request.signal }).catch(() => null) : Promise.resolve(null),
      ]);
      if (!request.isLatest()) return;
      if (!patientResult.ok) {
        // Açılamayan dosya erişim kaydına yazılmadı: sonraki deneme yeniden yazar.
        if (firstOpen) {
          accessRecordedRef.current = false;
          forgetPatientFileFetch(id);
        }
        if (patientResult.status === 404) {
          setNotFound(true);
          setData(null);
        }
        setLoadError(
          patientResult.status === 404
            ? "Hasta bulunamadı ya da arşivlenmiş."
            : patientResult.status === 0
              ? "Bağlantı hatası: hasta dosyası yüklenemedi."
              : errorMessageOf(patientResult.body, "Hasta dosyası yüklenemedi."),
        );
        return;
      }
      lastRefreshRef.current = Date.now();
      const body = (patientResult.body || {}) as Partial<PatientDetailData>;
      const taskJson = taskResponse?.ok ? await taskResponse.json().catch(() => null) : null;
      const balanceJson = balanceResponse?.ok ? await balanceResponse.json().catch(() => null) : null;
      if (!request.isLatest()) return;
      setData({
        ...(body as PatientDetailData),
        appointments: Array.isArray(body.appointments) ? body.appointments : [],
        examinations: Array.isArray(body.examinations) ? body.examinations : [],
        payments: Array.isArray(body.payments) ? body.payments : [],
        prescriptions: Array.isArray(body.prescriptions) ? body.prescriptions : [],
        labOrders: Array.isArray(body.labOrders) ? body.labOrders : [],
        taksitPlanlari: Array.isArray(body.taksitPlanlari) ? body.taksitPlanlari : [],
      });
      setNotFound(false);
      setLoadError("");
      if (wantTasks) {
        const tasks = tasksFrom(taskJson);
        // Okunamadıysa eldeki liste korunur; hiç okunamadıysa "görev yok"
        // yerine hata ve "Yeniden dene" görünür (bilinmeyen değer boş gösterilmez).
        if (tasks) setClinicTasks(tasks);
        setTasksError(!tasks);
        setTasksLoaded(true);
      }
      if (serverBalanceNeeded) {
        const next = toServerBalance(balanceJson);
        // Yenileme başarısızsa eldeki bakiye korunur (yanlış "0" gösterilmez).
        if (next) setServerBalance(next);
      }
    } catch (error) {
      if (isAbortError(error)) return;
      setLoadError("Bağlantı hatası: hasta dosyası yenilenemedi.");
    } finally {
      if (request.isLatest()) setLoading(false);
    }
  }, [id, beginLoad, canReadTasks, serverBalanceNeeded]);

  const loadRef = useRef(load);
  loadRef.current = load;

  // Hasta değişince baştan yükle.
  useEffect(() => {
    accessRecordedRef.current = false;
    lastRefreshRef.current = 0;
    // Dosya Özet'te açılıyorsa görevler hasta isteğiyle birlikte (paralel)
    // istenir; başka sekmede açılıyorsa Özet'e geçilince (loadTasks).
    tasksWantedRef.current = tabRef.current === "bilgi";
    setData(null);
    setNotFound(false);
    setLoadError("");
    setTasksLoaded(false);
    setTasksError(false);
    setClinicTasks([]);
    setServerBalance(null);
    setIntent(null);
    setLoading(true);
    void loadRef.current();
  }, [id]);

  // Başka bir personel bu hastaya kayıt eklediğinde (ödeme, randevu, lab...)
  // ekran sessizce güncellenir; sekmeye geri dönülünce de tazelenir.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let missed = false;
    const run = () => {
      timer = null;
      if (document.hidden) { missed = true; return; }
      void loadRef.current(true);
    };
    const onRealtime = () => {
      if (document.hidden) { missed = true; return; }
      if (timer) return;
      const wait = Math.max(600, REALTIME_MIN_GAP_MS - (Date.now() - lastRefreshRef.current));
      timer = setTimeout(run, wait);
    };
    const onVisible = () => {
      if (document.hidden) return;
      if (!missed && Date.now() - lastRefreshRef.current < 15_000) return;
      missed = false;
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

  // Formların ortak kullandığı listeler — bir kez, uygulama genelindeki önbellekten.
  useEffect(() => {
    let active = true;
    cachedGet<StaffLike[]>("/api/staff", 60_000, { throwOnError: true })
      .then((staff) => { if (active) setDoctors(selectDoctors(staff || [])); })
      .catch(() => { if (active) showToastSafe({ type: "error", message: "Hekim listesi yüklenemedi; hekim seçimleri boş görünebilir." }); })
      .finally(() => { if (active) setDoctorsLoaded(true); });
    return () => { active = false; };
  }, []);

  // Oturumdaki kişinin kimliği kabuktan gelir; yalnız gelmediyse ayrıca okunur
  // (not damgasını artık sunucu atar; ad için istek gerekmez).
  useEffect(() => {
    if (userId) {
      setMe((current) => (current.id === userId ? current : { id: userId, fullName: current.fullName }));
      return;
    }
    let active = true;
    cachedGet<{ id?: string; fullName?: string } | null>("/api/auth/me", 60_000)
      .then((user) => { if (active && user?.id) setMe({ id: user.id, fullName: user.fullName || "" }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    setBackHref(readPatientListAddress());
  }, []);

  // Başlık görünümden çıkınca sekmelerin altında tek satırlık hasta şeridi:
  // hekim Tedavi/Reçete formunda aşağıdayken alerji ve borç uyarısını kaybetmesin.
  const hasData = Boolean(data);
  useEffect(() => {
    const element = headerRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), { threshold: 0 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasData]);

  // Tembel isteklerin yanıtı geldiğinde dosya başka hastaya geçmişse (geri/ileri
  // tuşu) yanıt yok sayılır: önceki hastanın görevi yeni hastada görünmesin.
  const idRef = useRef(id);
  idRef.current = id;

  // Görevler Özet görünür olunca okunur; `retry` hata sonrası "Yeniden dene".
  const loadTasks = useCallback((retry = false) => {
    if ((tasksWantedRef.current && !retry) || !id || !canReadTasks) return;
    tasksWantedRef.current = true;
    fetch(`/api/clinic-tasks?patientId=${encodeURIComponent(id)}&take=200`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((json) => {
        if (idRef.current !== id) return;
        const tasks = tasksFrom(json);
        if (tasks) setClinicTasks(tasks);
        setTasksError(!tasks);
        setTasksLoaded(true);
      });
  }, [canReadTasks, id]);

  const loadLabNames = useCallback(() => {
    if (labsRequestedRef.current || !can("lab:read")) return;
    labsRequestedRef.current = true;
    setLabsLoading(true);
    setLabsError(null);
    cachedGet<unknown>("/api/lab-orders?namesOnly=true", 60_000, { throwOnError: true })
      .then((payload) => setLabNames(Array.isArray(payload) ? payload.filter((name): name is string => typeof name === "string") : []))
      .catch((error: unknown) => {
        labsRequestedRef.current = false;
        // Hata saklanır: yeni lab işi penceresi "Tanımlı laboratuvar yok" yerine
        // hatayı ve "Yeniden dene"yi göstersin.
        setLabsError(error instanceof Error && error.message !== "Failed to fetch"
          ? error.message
          : "Laboratuvar listesi yüklenemedi. Bağlantınızı kontrol edin.");
      })
      .finally(() => setLabsLoading(false));
  }, [can]);

  const getLetterhead = useCallback(async () => {
    const letterhead = await loadClinicLetterhead();
    if (letterhead.name) setClinicName(letterhead.name);
    return letterhead;
  }, []);

  const balance = useMemo<PatientBalance | null>(() => {
    if (!data) return null;
    if (serverBalance) return serverBalance.balance;
    // Yedek: sunucu bakiyesi henüz gelmedi ya da okunamadı.
    return clientBalanceOk ? computeBalance(data) : computeBalance({ examinations: [], payments: [], discountRate: data.discountRate });
  }, [data, serverBalance, clientBalanceOk]);
  // Bakiye ancak doğru hesaplanabiliyorsa gösterilir; bilinmeyen değer "₺0" görünmez.
  const balanceKnown = clientBalanceOk || Boolean(serverBalance);

  // Formlarda (tahsilat, reçete, lab, görev, tedavi) önerilen hekim TEK kuraldan:
  // hastayı en son tedavi eden hekim — yalnız ücrete yansıyan tedaviler
  // (sunucunun lastDoctorId'si, Muhasebe'deki tahsilat formuyla aynı). Önceden
  // dosya iptal edilen ve planlanan kayıtları da sayıyordu. Tedavi yoksa sıradaki,
  // o da yoksa en son randevunun hekimi önerilir.
  const recentDoctorId = useMemo(() => {
    const isDoctor = (doctorId: string | null | undefined): doctorId is string => Boolean(doctorId) && doctors.some((doctor) => doctor.id === doctorId);
    const serverLast = serverBalance?.lastDoctorId;
    if (isDoctor(serverLast)) return serverLast;
    const chargeable = (data?.examinations || []).filter(isChargeableExam)
      .sort((a, b) => new Date(b.diagnosedAt).getTime() - new Date(a.diagnosedAt).getTime());
    const fromExams = chargeable.find((exam) => isDoctor(exam.doctorId))?.doctorId;
    if (fromExams) return fromExams;
    const now = Date.now();
    const appointments = (data?.appointments || []).filter((appointment) => appointment.status !== "IPTAL" && isDoctor(appointment.doctor?.id));
    const next = appointments
      .filter((appointment) => new Date(appointment.startAt).getTime() >= now)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0];
    const last = appointments
      .filter((appointment) => new Date(appointment.startAt).getTime() < now)
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())[0];
    return next?.doctor?.id || last?.doctor?.id || "";
  }, [data?.examinations, data?.appointments, doctors, serverBalance]);
  // Hastayı tedavi etmiş hekimler ("bu hekim hastayı tedavi etmedi" uyarısı):
  // sunucunun bildirdikleri (tedavileri göremeyen rolde, ör. banko, tek kaynak)
  // ve dosyadaki iptal edilmemiş tedavi kayıtlarının hekimleri.
  const treatingDoctors = useMemo(() => {
    const byId = new Map<string, string>();
    for (const doctor of serverBalance?.doctors || []) byId.set(doctor.id, doctor.fullName);
    for (const exam of data?.examinations || []) {
      if (exam.status === "IPTAL" || !exam.doctorId) continue;
      if (!byId.has(exam.doctorId)) byId.set(exam.doctorId, exam.doctor?.fullName || "");
    }
    return byId;
  }, [data?.examinations, serverBalance?.doctors]);
  const treatingDoctorIds = useMemo(() => Array.from(treatingDoctors.keys()), [treatingDoctors]);
  const treatingDoctorNames = useMemo(() => Array.from(new Set(Array.from(treatingDoctors.values()).filter(Boolean))), [treatingDoctors]);

  // Üst bar (Tahsilat, Görev, Hasta araması) hasta dosyasındayken hastayı
  // seçili açabilsin: yalnız kimlik ve ad, yalnız bu sekmenin oturum deposunda;
  // dosyadan çıkınca silinir.
  const contextPatientId = data?.id || "";
  const contextPatientName = data?.fullName || "";
  useEffect(() => {
    if (!contextPatientId) return;
    try {
      window.sessionStorage.setItem(PATIENT_CONTEXT_KEY, JSON.stringify({ id: contextPatientId, fullName: contextPatientName }));
    } catch {
      // Depo kullanılamıyorsa üst bar hastasız açılır.
    }
    return () => {
      try { window.sessionStorage.removeItem(PATIENT_CONTEXT_KEY); } catch { /* yok sayılır */ }
    };
  }, [contextPatientId, contextPatientName]);

  const openPayment = useCallback((payment?: Pay) => setPaymentState({ open: true, payment: payment || null }), []);
  const openEditPatient = useCallback((section?: PatientFormSection) => {
    setEditSection(section);
    setEditOpen(true);
  }, []);
  const openLabCreate = useCallback(() => {
    loadLabNames();
    setLabCreateOpen(true);
  }, [loadLabNames]);
  const openTaskForm = useCallback((task?: ClinicTask) => setTaskForm({ open: true, task: task || null }), []);
  const clearIntent = useCallback(() => setIntent(null), []);
  const startIntent = useCallback((key: TabKey, next: PatientFileIntent) => {
    selectTab(key);
    setIntent(next);
  }, [selectTab]);
  const reload = useCallback((silent = true) => loadRef.current(silent), []);

  // Görev penceresi (TaskFormModal) durum düğmesinde onayı ÇAĞIRANA bırakır
  // (Yapılacaklar sayfasıyla aynı): iptal onay ister. Önceden hasta dosyasında
  // görev onaysız iptal ediliyor, "Beklemeye al" da "yeniden açıldı" yazıyordu.
  const canCancelTasks = can("clinictasks:delete");
  const changeTaskStatus = useCallback(async (task: ClinicTask, status: ClinicTask["status"]) => {
    if (status === "IPTAL") {
      if (!canCancelTasks) return false;
      const confirmed = await confirmDialog({
        title: `"${task.title}" iptal edilsin mi?`,
        message: "Görev yapılmayacak olarak işaretlenir; geçmişi korunur.",
        danger: true,
        confirmText: "İptal et",
      });
      if (!confirmed) return false;
    }
    try {
      const response = await fetch(`/api/clinic-tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessageOf(body, "Görev güncellenemedi."));
      showToastSafe({
        type: "success",
        icon: "clipboard",
        message: status === "TAMAMLANDI" ? "Görev tamamlandı." : status === "IPTAL" ? "Görev iptal edildi." : status === "BEKLEMEDE" ? "Görev beklemeye alındı." : "Görev yeniden açıldı.",
      });
      void loadRef.current(true);
      return true;
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Görev güncellenemedi." });
      return false;
    }
  }, [canCancelTasks]);

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
  // Randevular sayfası ?yeni=1&patientId=&patientName= ile formu hasta seçili açar (sözleşme §5).
  const appointmentHref = data ? `/randevu?yeni=1&patientId=${encodeURIComponent(data.id)}&patientName=${encodeURIComponent(data.fullName)}` : "/randevu?yeni=1";

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
    currentUserName: me.fullName,
    clinicName,
    getLetterhead,
    balance,
    balanceKnown,
    recentDoctorId,
    treatingDoctorNames,
    treatingDoctorIds,
    lockDoctorToSelf,
    clinicTasks,
    tasksLoaded,
    tasksError,
    loadTasks,
    labNames,
    labsLoading,
    loadLabNames,
    openPayment,
    openEditPatient,
    openLabCreate,
    openTaskForm,
    appointmentHref,
    intent,
    clearIntent,
    startIntent,
  } : null), [data, balance, balanceKnown, reload, can, canOpenTab, selectTab, hidePatientPhone, canEditPatient, doctors, doctorsLoaded, me.id, me.fullName, clinicName, getLetterhead, recentDoctorId, treatingDoctorNames, treatingDoctorIds, lockDoctorToSelf, clinicTasks, tasksLoaded, tasksError, loadTasks, labNames, labsLoading, loadLabNames, openPayment, openEditPatient, openLabCreate, openTaskForm, appointmentHref, intent, clearIntent, startIntent]);

  if (!id) {
    return (
      <section className="space-y-4">
        <PageHeader icon="users" title="Hasta dosyası" back={{ href: backHref, label: "Hastalar" }} />
        <div className="ui-surface">
          <EmptyState
            icon={Users}
            title="Hasta seçilmedi"
            description="Dosyasını açmak istediğiniz hastayı Hastalar listesinden seçin."
            action={<Button variant="secondary" href="/hasta">Hastalar listesine git</Button>}
          />
        </div>
      </section>
    );
  }

  if (loading && !data) return <PatientFileSkeleton />;

  if (!data || !contextValue || !balance) {
    return (
      <section className="space-y-4">
        <PageHeader icon="users" title="Hasta dosyası" back={{ href: backHref, label: "Hastalar" }} />
        {notFound ? (
          <div className="ui-surface">
            <EmptyState
              icon={Users}
              title="Hasta bulunamadı"
              description="Hasta arşivlenmiş ya da kaydı silinmiş olabilir."
              action={<Button variant="secondary" href={backHref}>Hastalar listesine dön</Button>}
            />
          </div>
        ) : (
          <LoadErrorState message={loadError || "Hasta dosyası yüklenemedi."} onRetry={() => void load()} />
        )}
      </section>
    );
  }

  const healthFlags = healthFlagsOf(data);
  const otherFlags = healthFlags.filter((flag) => flag !== "Bulaşıcı hastalık");
  const age = ageFrom(data.birthDate);
  const identity = [age !== null ? `${age} yaş` : "", genderLabel(data.gender)].filter(Boolean).join(" · ");
  const showPhone = !hidePatientPhone && Boolean(data.phone) && data.phone !== "***";

  // Banko hastayı dosyayı açar açmaz tanısın: son geldiği gün ve sıradaki randevusu
  // başlık satırında (Randevular sekmesini açmadan). Yalnız randevuyu görebilen rol.
  const nowMs = Date.now();
  const visits = (data.appointments || []).filter((appt) => appt.status === "GELDI" || appt.status === "TAMAMLANDI");
  const lastVisit = visits.reduce<string | null>((latest, appt) => (!latest || appt.startAt > latest ? appt.startAt : latest), null);
  const nextAppt = (data.appointments || [])
    .filter((appt) => (appt.status === "BEKLIYOR" || appt.status === "ONAYLANDI") && new Date(appt.startAt).getTime() > nowMs)
    .reduce<string | null>((soonest, appt) => (!soonest || appt.startAt < soonest ? appt.startAt : soonest), null);
  const visitText = [
    nextAppt ? `Sıradaki randevu ${formatDateText(nextAppt, "datetime")}` : "",
    lastVisit ? `Son ziyaret ${formatDateText(lastVisit)}` : "",
  ].filter(Boolean).join(" · ");

  const debt = balance.totalDebt;
  // Borç ya da avans yoksa başlıkta "Kalan borç ₺0,00" yazılmaz (bilgi vermiyordu).
  // Ad Hesap sekmesindeki ve dışa aktarımdakiyle aynı ("Avans" / "Hastanın avansı" karışıyordu).
  const showBalance = canOpenTab("odeme") && balanceKnown && Math.abs(debt) > 0.004;
  // Hasta yapılan tedaviden fazla ödediyse (ör. tedaviden önce alınan ödeme):
  // "Ön ödeme", sonraki tedavilerden düşülür (Muhasebe › Alacaklar ile aynı ad).
  const debtLabel = debt < -0.004 ? "Ön ödeme" : "Kalan borç";
  const debtTone = debt > 0.004 ? "text-red-700" : debt < -0.004 ? "text-emerald-700" : "text-slate-800";

  const riskBadges = (size: "sm" | "md" = "sm"): ReactNode => (
    <>
      {data.hasContagiousDisease && (
        <Badge tone="critical" solid size={size} icon={ShieldAlert} title={data.contagiousDiseaseNote || undefined}>Bulaşıcı hastalık</Badge>
      )}
      {otherFlags.length > 0 && <Badge tone="critical" size={size} icon={ShieldAlert}>{otherFlags.join(", ")}</Badge>}
    </>
  );

  const pendingCount = data.examinations.filter(isPendingExam).length;
  const overdueInstallments = data.taksitPlanlari.flatMap((plan) => plan.taksitler || []).filter((item) => isOpenInstallment(item) && item.status === "GECIKTI").length;
  const labSummaries = data.labOrders.map((order) => getOrderSummary({ labType: order.labType, notes: order.notes || null, status: order.status, trips: order.trips || [], invoices: [] }));
  const openLabs = labSummaries.filter((summary) => !summary.isDone && !summary.cancelled);

  const tabItems: TabItem<TabKey>[] = visibleTabs.map((key) => {
    if (key === "tedavi") return { key, label: TAB_LABELS[key], count: pendingCount, countTone: "neutral", countLabel: "planlanan tedavi" };
    if (key === "odeme") return { key, label: TAB_LABELS[key], count: overdueInstallments, countTone: "critical", countLabel: "geciken taksit" };
    if (key === "lab") return { key, label: TAB_LABELS[key], count: openLabs.length, countTone: openLabs.some((summary) => summary.late) ? "critical" : "neutral", countLabel: "açık lab işi" };
    return { key, label: TAB_LABELS[key] };
  });

  // "İşlem ekle": bu hasta için yapılabilecek her iş tek menüde ve her öğe işi
  // doğrudan başlatır (önceden bir kısmı yalnız sekme değiştiriyordu).
  const frontDesk: ActionMenuItem[] = [
    ...(can("appointments:write") ? [{ key: "appointment", label: "Yeni randevu", description: "Takvim bu hasta seçili açılır", icon: CalendarPlus, href: appointmentHref }] : []),
    ...(can("payments:write") ? [{ key: "payment", label: "Tahsilat al", description: showBalance && debt > 0.004 ? `${debtLabel} ${money(debt)}` : "Nakit, kart, havale", icon: Wallet, onSelect: () => openPayment() }] : []),
    ...(can("sms:write") || can("sms:bulk") ? [{ key: "message", label: "Mesaj gönder", description: "SMS / WhatsApp, hasta seçili", icon: Send, href: `/sms?tab=gonder&patientId=${encodeURIComponent(data.id)}&patientName=${encodeURIComponent(data.fullName)}` }] : []),
  ];
  const clinical: ActionMenuItem[] = [
    ...(can("examinations:write") && canOpenTab("tedavi") ? [{ key: "treatment", label: "Tedavi ekle", description: "Diş seçimi ve fiyat listesinden tedavi", icon: Stethoscope, onSelect: () => startIntent("tedavi", "treatment") }] : []),
    // Reçete sekmesindeki düğme ve formla aynı ad (önceden menüde "Reçete yaz", sekmede "Yeni reçete").
    ...(can("prescriptions:write") && canOpenTab("recete") ? [{ key: "rx", label: "Yeni reçete", icon: Pill, onSelect: () => startIntent("recete", "rx") }] : []),
    ...(can("lab:write") ? [{ key: "lab", label: "Yeni lab işi", icon: FlaskConical, onSelect: openLabCreate }] : []),
  ];
  const other: ActionMenuItem[] = [
    ...((can("documents:write") || can("xray:write")) && canOpenTab("belgeler") ? [{ key: "doc", label: "Belge / röntgen yükle", icon: FileUp, onSelect: () => startIntent("belgeler", "upload") }] : []),
    ...(can("documents:write") && canOpenTab("belgeler") ? [{ key: "consent", label: "Onam imzalat", icon: FileSignature, onSelect: () => startIntent("belgeler", "consent") }] : []),
    ...(canEditPatient ? [{ key: "note", label: "Not ekle", icon: NotebookPen, onSelect: () => startIntent("bilgi", "note") }] : []),
    ...(can("clinictasks:write") ? [{ key: "task", label: "Yeni görev", icon: ClipboardList, onSelect: () => openTaskForm() }] : []),
  ];
  const menuItems: ActionMenuItem[] = [frontDesk, clinical, other]
    .filter((group) => group.length > 0)
    .flatMap((group, index) => group.map((item, itemIndex) => (index > 0 && itemIndex === 0 ? { ...item, separatorBefore: true } : item)));

  const moreItems: ActionMenuItem[] = [
    { key: "export", label: "Hasta dosyasını indir", description: "PDF ya da Excel; KVKK erişim kaydına yazılır", icon: Download, onSelect: () => setExportOpen(true) },
    // "Mesajınız gelmedi" sorusu: bu hastaya giden SMS/WhatsApp ve nedenleri tek yerde.
    ...(can("sms:read") ? [{ key: "messages", label: "Gönderilen mesajlar", description: "Bu hastaya giden SMS / WhatsApp ve gitmeyenlerin nedeni", icon: MessageSquareText, href: `/sms?tab=gecmis&ara=${encodeURIComponent(data.fullName)}` }] : []),
    ...(can("audit:read") ? [{ key: "access-log", label: "Erişim kaydı", description: "Dosyayı kimin ne zaman açtığı", icon: History, onSelect: () => setAccessLogOpen(true) }] : []),
  ];

  return (
    <PatientFileProvider value={contextValue}>
      <section className="space-y-4">
        <div ref={headerRef}>
          <PageHeader
            icon="users"
            back={{ href: backHref, label: "Hastalar" }}
            title={data.fullName}
            description={(identity || showPhone || healthFlags.length > 0 || visitText) ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {identity && <span>{identity}</span>}
                {identity && showPhone && <span aria-hidden="true">·</span>}
                {showPhone && <PhoneLink phone={data.phone} countryCode={data.phoneCountryCode} className="text-slate-600" />}
                {visitText && (identity || showPhone) && <span aria-hidden="true">·</span>}
                {visitText && <span>{visitText}</span>}
                {riskBadges()}
              </span>
            ) : undefined}
            stats={showBalance ? [{ label: debtLabel, value: money(Math.abs(debt)), color: debtTone }] : undefined}
            actions={(
              <>
                {menuItems.length > 0 && <ActionMenu trigger="button" variant="primary" size="md" icon={Plus} label="İşlem ekle" items={menuItems} />}
                {canEditPatient && <Button variant="secondary" icon={Pencil} onClick={() => openEditPatient()}>Düzenle</Button>}
                <ActionMenu size="md" label="Diğer işlemler" items={moreItems} />
              </>
            )}
          />
        </div>

        {loadError && <LoadErrorState compact message={`${loadError} Ekrandaki bilgiler son yüklenen hâlidir.`} onRetry={() => void load(true)} />}

        <div className="sticky top-0 z-30 -mx-1 bg-[rgb(var(--app-bg))] px-1 py-1">
          {/* relative: sayaçların ekran okuyucu metni (konumlu gizli span) kayan
              sekme çubuğunun içinde kırpılsın; yoksa telefonda sayfa yatay kayıyordu. */}
          <Tabs ariaLabel="Hasta dosyası bölümleri" items={tabItems} value={tab} onChange={selectTab} panelIdPrefix="hd-panel" className="relative" />
          {compact && (
            <div className="absolute inset-x-1 top-full flex flex-wrap items-center gap-x-3 gap-y-1 rounded-b-lg border-x border-b border-slate-200 bg-[rgb(var(--app-surface))] px-3 py-1.5 text-sm shadow-sm">
              <span className="min-w-0 truncate font-bold text-slate-900">{data.fullName}</span>
              {riskBadges()}
              {showBalance && (
                <span className="ml-auto whitespace-nowrap text-xs text-slate-500">
                  {debtLabel} <b className={`tabular-nums ${debtTone}`}>{money(Math.abs(debt))}</b>
                </span>
              )}
            </div>
          )}
        </div>

        <div ref={panelRef} id={`hd-panel-${tab}`} role="tabpanel" aria-label={TAB_LABELS[tab]} className="scroll-mt-28">
          {tab === "bilgi" && <SummaryTab />}
          {tab === "tedavi" && <TreatmentTab />}
          {tab === "odeme" && <FinanceTab />}
          {tab === "randevular" && <AppointmentsTab />}
          {tab === "lab" && <LabTab />}
          {tab === "recete" && <PrescriptionTab />}
          {tab === "belgeler" && <DocumentsTab />}
        </div>

        {editOpen && (
          <PatientFormModal
            open
            onClose={() => setEditOpen(false)}
            patientId={data.id}
            // Dosyanın elindeki kayıt verilir: pencere hastayı ikinci kez
            // okumaz (ek istek ve ek KVKK erişim kaydı yok).
            initialData={data}
            hidePhoneField={hidePatientPhone}
            initialSection={editSection}
            onSaved={() => {
              setEditOpen(false);
              showToastSafe({ type: "success", message: "Hasta bilgileri güncellendi." });
              void load(true);
            }}
          />
        )}
        {paymentState.open && <PaymentModal open payment={paymentState.payment} onClose={() => setPaymentState({ open: false, payment: null })} />}
        {labCreateOpen && can("lab:write") && (
          <LabNewOrderModal
            open
            onClose={() => setLabCreateOpen(false)}
            onCreated={() => {
              void load(true);
              if (canOpenTab("lab")) selectTab("lab");
            }}
            initialPatient={labInitialPatient}
            // Lab işinin hekimi hastayı tedavi eden hekimdir (lab ücreti onun
            // hakedişinden düşer): doktor rolündeki kişi kendi adına açar;
            // yönetici, asistan ve banko açarken (yönetici hekim olsa bile)
            // hastayı en son tedavi eden hekim önerilir. Önceden hekim olan
            // yönetici kendi adına öneriliyor, başka hekimin hastasının lab
            // ücreti yanlış hekimin hakedişinden düşüyordu.
            initialDoctorId={lockDoctorToSelf ? me.id : recentDoctorId || (doctors.some((doctor) => doctor.id === me.id) ? me.id : "")}
            lockPatient
            labNames={labNames}
            labsLoading={labsLoading}
            labsError={labsError}
            onRetryLabs={loadLabNames}
            canAddLab={can("finance:write")}
            onLabCreated={(name) => setLabNames((current) => Array.from(new Set([...current, name])).sort((a, b) => a.localeCompare(b, "tr")))}
          />
        )}
        {taskForm.open && (
          <TaskFormModal
            open
            onClose={() => setTaskForm({ open: false, task: null })}
            task={taskForm.task ? { ...taskForm.task, patient: taskForm.task.patient ?? { id: data.id, fullName: data.fullName } } : null}
            initialPatient={{ id: data.id, fullName: data.fullName }}
            onSaved={(_, mode) => {
              setTaskForm({ open: false, task: null });
              showToastSafe({ type: "success", icon: "clipboard", message: mode === "edit" ? "Görev güncellendi." : "Görev eklendi." });
              void load(true);
            }}
            onStatusChange={changeTaskStatus}
            canCancel={canCancelTasks}
            readOnly={!can("clinictasks:write")}
          />
        )}
        {exportOpen && <ExportModal open onClose={() => setExportOpen(false)} />}
        {accessLogOpen && <AccessLogModal open onClose={() => setAccessLogOpen(false)} patientId={data.id} patientName={data.fullName} />}
      </section>
    </PatientFileProvider>
  );
}
