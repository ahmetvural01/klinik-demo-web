"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type FocusEvent, type PointerEvent, type TouchEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, CalendarPlus, MessageSquare, Pencil, Phone, ShieldAlert, UserPlus } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { ArchivePatientModal } from "@/components/patient/ArchivePatientModal";
import { PatientFormModal, type PatientFormInitialValues } from "@/components/patient/PatientFormModal";
import { smsConsentOf } from "@/components/sms/communication-labels";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { formatDateText } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { StatusPage } from "@/components/ui/StatusPage";
import { ActiveFilters, Toolbar, type ActiveFilter } from "@/components/ui/Toolbar";
import { cachedGet } from "@/lib/client-cache";
import { formatCurrency } from "@/lib/format";
import { formatPatientPhone, healthFlagLabels, patientTelHref, type HealthFlagKey } from "@/lib/patient-display";
import type { StaffLike } from "@/lib/staff-roles";
import { showToastSafe } from "@/lib/toast-client";
import { rememberPatientListAddress } from "@/components/patient/patient-list-address";
import { preloadHastaDosyasi } from "../hasta-detay/preload";
import { HastaListesiIskelet } from "./_components/HastaListesiIskelet";

type Patient = {
  id: string;
  tcNo: string | null;
  isForeigner?: boolean;
  fullName: string;
  phone: string;
  phoneCountryCode?: string | null;
  gender: string;
  birthDate?: string | null;
  insurance?: string | null;
  hasMedicalRisk?: boolean;
  // GET /api/patients?extras=1 — yalnız ilgili yetkisi olan role gelir;
  // yetki yoksa alan hiç gelmez (undefined), sütun da gösterilmez.
  lastVisitAt?: string | null;
  nextAppointment?: { startAt: string; doctorName: string | null } | null;
  balance?: number | null;
} & Partial<Record<HealthFlagKey, boolean>>;

const LIST_PATH = "/hasta";
const PAGE_SIZES = [15, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;
const SMS_CONSENT_CODES = new Set(["ENABLED", "DISABLED", "PENDING", "EXPIRED", "SEND_FAILED"]);
/** Klinikteki her kayıt değişikliğinde liste en çok 10 sn'de bir, yalnız sekme görünürken yenilenir. */
const REALTIME_MIN_INTERVAL_MS = 10_000;

/** "SMS izni: Onay bekliyor" — İletişim sayfasıyla aynı sözcükler (communication-labels). */
function smsConsentFilterLabel(code: string) {
  const label = smsConsentOf(code).label;
  return code === "ENABLED" ? label : `SMS izni: ${label}`;
}

/** Arama boş sonuç verince "Yeni hasta olarak kaydet" formu yazılanla dolu açılır. */
function initialValuesFromQuery(query: string): PatientFormInitialValues | undefined {
  const text = query.trim();
  if (!text) return undefined;
  if (/^[\d\s()+\-.]+$/.test(text)) {
    const digits = text.replace(/\D/g, "");
    // TC kimlik no 0 ile başlamaz; 0 ile başlayan 11 hane telefondur.
    if (digits.length === 11 && !digits.startsWith("0")) return { tcNo: digits };
    if (digits.length >= 10) return { phone: digits };
    return undefined;
  }
  return { fullName: text };
}

/**
 * Pozitif bakiye = hastanın borcu (kırmızı); negatif = hastanın avansı (yeşil).
 * Bakiye yoksa hücre boş kalır (her satırda "—" yazılmaz).
 */
function BalanceText({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || Math.abs(value) < 0.005) return null;
  if (value > 0) return <span className="font-semibold tabular-nums text-red-700">{formatCurrency(value)} borç</span>;
  return <span className="tabular-nums text-emerald-700">{formatCurrency(Math.abs(value))} ön ödeme</span>;
}

/**
 * Adın yanındaki sağlık işaretleri (ayrı satır açmaz). Bulaşıcı hastalık
 * enfeksiyon kontrolü için ayrı ve belirgin kalır (notu listeye gelmez);
 * diğer uyarılar tek rozette, hangi uyarı olduğu üzerine gelince görünür.
 */
function RiskBadges({ patient }: { patient: Patient }) {
  const labels = healthFlagLabels(patient).filter((label) => label !== "Bulaşıcı hastalık");
  const hasRisk = labels.length > 0 || Boolean(patient.hasMedicalRisk);
  if (!patient.hasContagiousDisease && !hasRisk) return null;
  return (
    <>
      {patient.hasContagiousDisease && <Badge tone="critical" solid icon={ShieldAlert}>Bulaşıcı hastalık</Badge>}
      {hasRisk && (
        <Badge tone="critical" icon={ShieldAlert} title={labels.length > 0 ? labels.join(", ") : "İlaç, ameliyat ya da hastalık notu var"}>
          Sağlık uyarısı
        </Badge>
      )}
    </>
  );
}

/** Ad + (varsa) sağlık rozetleri tek satırda. */
function PatientName({ patient }: { patient: Patient }) {
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-bold text-slate-900">{patient.fullName}</span>
      <RiskBadges patient={patient} />
    </p>
  );
}

function HastaContent() {
  const { can } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Adres çubuğundaki liste durumu: geri tuşu ve yenilemede arama, sayfa,
  // doktor ve sıralama korunur (önceden hasta dosyasından geri gelince
  // arama ve sayfa kayboluyordu — denetim A1).
  const urlQuery = (searchParams.get("q") || "").trim();
  const page = Math.max(1, Number.parseInt(searchParams.get("sayfa") || "1", 10) || 1);
  const sizeParam = Number.parseInt(searchParams.get("boyut") || "", 10);
  const pageSize = PAGE_SIZES.includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE;
  const doctorId = searchParams.get("doktor") || "";
  // "ad" = A–Z, "ad-za" = Z–A (eski başlık tıklamasındaki ters sıra korunur), boş = son eklenen.
  const sortParam = searchParams.get("sirala") || "";
  const sortByName = sortParam === "ad" || sortParam === "ad-za";
  const sortNameDesc = sortParam === "ad-za";
  const smsParam = (searchParams.get("smsConsent") || "").toUpperCase();
  const smsConsent = SMS_CONSENT_CODES.has(smsParam) ? smsParam : "";
  const wantsCreate = searchParams.get("yeni") === "1";
  const archivedParam = searchParams.get("arsiv") === "1";

  const [query, setQuery] = useState(urlQuery);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleError, setStaleError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createInitial, setCreateInitial] = useState<PatientFormInitialValues | undefined>();
  const [editPatientId, setEditPatientId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; fullName: string } | null>(null);

  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const hasDataRef = useRef(false);
  const lastLoadAtRef = useRef(0);
  const ignoreRealtimeUntilRef = useRef(0);
  const listTopRef = useRef<HTMLDivElement>(null);

  const hidePhone = !can("patients:phone");
  const canWritePatients = can("patients:write");
  const canDeletePatients = can("patients:delete");
  // Arşivlenen hastalar yalnız arşivleyip geri alabilen kişiye görünür.
  const archived = archivedParam && canDeletePatients;
  const [restoringId, setRestoringId] = useState<string | null>(null);
  // Randevular sayfası appointments:read ister; formu açmak appointments:write.
  const canBookAppointments = can("appointments:write") && can("appointments:read");
  // İletişim sayfası sms:read ister, tek hastaya gönderim sms:write; ikisi yoksa bağlantı ölü olur.
  const canMessage = can("sms:write") && can("sms:read");

  /**
   * Liste durumu adres çubuğuna yazılır; sunucuya gidilmez (anında değişir).
   * Başka sayfaya geçilmişse (ör. arama gecikmesi dolmadan hasta dosyası
   * açıldıysa) yeni sayfanın adresine dokunulmaz.
   */
  const setParams = useCallback((changes: Record<string, string | null>) => {
    if (window.location.pathname !== LIST_PATH) return;
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const next = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
  }, []);

  // Liste durumu her değiştiğinde son adres saklanır: hasta dosyasındaki
  // "Hastalar" geri bağlantısı aynı arama/süzgeç/sayfaya döner.
  useEffect(() => {
    if (window.location.pathname === LIST_PATH) rememberPatientListAddress(window.location.search);
  }, [urlQuery, page, pageSize, doctorId, sortParam, smsConsent, archived]);

  // Üst bardaki aramadan ya da başka ekrandan /hasta?q=… ile gelindiğinde
  // sayfa açıkken de arama kutusu güncellenir (denetim X-HL-01).
  useEffect(() => {
    setQuery((current) => (current.trim() === urlQuery ? current : urlQuery));
  }, [urlQuery]);

  // Yazarken her tuşta istek atılmaz: 300 ms sonra adrese yazılır, liste ondan yüklenir.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === urlQuery) return;
    const timer = window.setTimeout(() => setParams({ q: trimmed || null, sayfa: null }), 300);
    return () => window.clearTimeout(timer);
  }, [query, urlQuery, setParams]);

  // Üst bardaki "Yeni > Hasta" ve diğer ekranlardan gelen ?yeni=1 formu açar (tek seferlik).
  useEffect(() => {
    if (!wantsCreate || window.location.pathname !== LIST_PATH) return;
    setParams({ yeni: null });
    if (canWritePatients) {
      setCreateInitial(undefined);
      setShowCreate(true);
    }
  }, [wantsCreate, canWritePatients, setParams]);

  // Adresten gelen doktor filtresinin adı (etikette). Doktor seçiciyle aynı
  // önbellekli istek kullanılır; ayrıca ağ isteği atılmaz.
  useEffect(() => {
    if (!doctorId) {
      setDoctorName("");
      return;
    }
    if (doctorName) return;
    let active = true;
    cachedGet<StaffLike[]>("/api/staff", 60_000, { throwOnError: true })
      .then((staff) => { if (active) setDoctorName(staff?.find((person) => person.id === doctorId)?.fullName || ""); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [doctorId, doctorName]);

  /**
   * mode "user": arama/filtre/sayfa değişti — hata olursa liste yerine hata
   * gösterilir (eski satırlar yeni filtreye ait değil). mode "silent": arka
   * plan yenilemesi — hata olursa liste yerinde kalır, üstte ince şerit
   * çıkar (önceden geçici bir kopukta liste hata kutusuyla değişiyordu).
   */
  const load = useCallback(async (mode: "user" | "silent" = "user") => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestRef.current;
    if (mode === "user") setLoading(true);
    const params = new URLSearchParams({
      q: urlQuery,
      page: String(page),
      take: String(pageSize),
      sortBy: sortByName ? "fullName" : "createdAt",
      sortDir: sortByName && !sortNameDesc ? "asc" : "desc",
      extras: "1",
      summary: "false",
    });
    if (doctorId) params.set("doctorId", doctorId);
    if (smsConsent) params.set("smsConsent", smsConsent);
    if (archived) params.set("arsiv", "1");

    try {
      // cachedGet kasıtlı kullanılmıyor: 403'ü "kayıt yok"tan ayırmak gerekir.
      const res = await fetch(`/api/patients?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const json = await res.json().catch(() => null);
      if (requestId !== requestRef.current) return;
      if (res.status === 401 || res.status === 403) {
        setForbidden(typeof json?.message === "string" && json.message ? json.message : "Hasta listesini görme izniniz yok.");
        setPatients([]);
        hasDataRef.current = false;
        return;
      }
      if (!res.ok) throw new Error(json?.message || "Hasta listesi yüklenemedi.");
      const nextPageCount = Math.max(1, Number(json?.pageCount || 1));
      if (page > nextPageCount) {
        setParams({ sayfa: nextPageCount > 1 ? String(nextPageCount) : null });
        return;
      }
      setForbidden(null);
      setPatients(Array.isArray(json?.patients) ? json.patients : []);
      setTotal(Number(json?.total || 0));
      setPageCount(nextPageCount);
      setError(null);
      setStaleError(null);
      hasDataRef.current = true;
      lastLoadAtRef.current = Date.now();
    } catch (err) {
      if (controller.signal.aborted || requestId !== requestRef.current) return;
      const message = err instanceof Error && err.message !== "Failed to fetch"
        ? err.message
        : "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.";
      if (mode === "silent" && hasDataRef.current) {
        setStaleError(message);
      } else {
        setError(message);
        setPatients([]);
        hasDataRef.current = false;
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [urlQuery, page, pageSize, sortByName, sortNameDesc, doctorId, smsConsent, archived, setParams]);

  useEffect(() => {
    void load("user");
  }, [load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Gerçek zamanlı yenileme: klinikteki her değişiklikte 300 ms'de bir değil,
  // en çok 10 sn'de bir ve yalnız sekme görünürken (gizliyken birikir,
  // görünür olunca bir kez). Kendi kaydımızın yankısı yok sayılır.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pendingWhileHidden = false;
    const schedule = (delay: number) => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (document.hidden) {
          pendingWhileHidden = true;
          return;
        }
        void load("silent");
      }, delay);
    };
    const onRealtime = () => {
      if (Date.now() < ignoreRealtimeUntilRef.current) return;
      if (document.hidden) {
        pendingWhileHidden = true;
        return;
      }
      schedule(Math.max(500, REALTIME_MIN_INTERVAL_MS - (Date.now() - lastLoadAtRef.current)));
    };
    const onVisibility = () => {
      if (document.hidden || !pendingWhileHidden) return;
      pendingWhileHidden = false;
      schedule(300);
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  /** Kendi kaydımızdan sonra hemen yenile; ardından gelen gerçek zamanlı yankıyı yok say. */
  const reloadAfterOwnChange = () => {
    ignoreRealtimeUntilRef.current = Date.now() + 3_000;
    void load("silent");
  };

  // ── Hasta dosyasına hızlı geçiş: imleç satırda durunca (150 ms) ya da
  // satıra dokununca/odaklanınca dosya sayfası önceden hazırlanır.
  const prefetchedRef = useRef(new Set<string>());
  const hoverRef = useRef<{ id: string | null; timer: number | null }>({ id: null, timer: null });
  const prefetchPatient = useCallback((id: string) => {
    if (prefetchedRef.current.has(id)) return;
    prefetchedRef.current.add(id);
    router.prefetch(`/hasta-detay?id=${encodeURIComponent(id)}`);
    // router.prefetch tarayıcıda çizilen (ssr:false) dosya içeriğinin kodunu
    // ısıtmaz; içerik parçası da indirilir. Hasta verisi istenmez (KVKK
    // erişim kaydı ancak dosya gerçekten açılınca yazılır).
    preloadHastaDosyasi();
  }, [router]);
  const rowPatientId = (target: EventTarget | null) => {
    const row = target instanceof Element ? target.closest("[role='button']") : null;
    return row?.querySelector<HTMLElement>("[data-patient-id]")?.dataset.patientId || null;
  };
  const onListPointerOver = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const id = rowPatientId(event.target);
    if (id === hoverRef.current.id) return;
    if (hoverRef.current.timer) window.clearTimeout(hoverRef.current.timer);
    hoverRef.current = { id, timer: id ? window.setTimeout(() => prefetchPatient(id), 150) : null };
  };
  const onListFocus = (event: FocusEvent<HTMLDivElement>) => {
    const id = rowPatientId(event.target);
    if (id) prefetchPatient(id);
  };
  const onListTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const id = rowPatientId(event.target);
    if (id) prefetchPatient(id);
  };
  useEffect(() => () => {
    if (hoverRef.current.timer) window.clearTimeout(hoverRef.current.timer);
  }, []);

  const openCreate = (initial?: PatientFormInitialValues) => {
    setCreateInitial(initial);
    setShowCreate(true);
  };

  const appointmentHref = (patient: { id: string; fullName: string }) =>
    `/randevu?yeni=1&patientId=${encodeURIComponent(patient.id)}&patientName=${encodeURIComponent(patient.fullName)}`;

  const openPatient = (patient: Patient) => router.push(`/hasta-detay?id=${encodeURIComponent(patient.id)}`);

  const changePage = (nextPage: number) => {
    setParams({ sayfa: nextPage > 1 ? String(nextPage) : null });
    const top = listTopRef.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) listTopRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const clearFilters = () => setParams({ doktor: null, smsConsent: null, arsiv: null, sayfa: null });

  const restorePatient = async (patient: Patient) => {
    setRestoringId(patient.id);
    try {
      const response = await fetch(`/api/patients/${encodeURIComponent(patient.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Hasta arşivden geri alınamadı.");
      showToastSafe({ type: "success", title: "Hasta geri alındı", message: `${patient.fullName} yeniden hasta listesinde. Arşivlenirken iptal edilen randevular geri açılmaz.` });
      reloadAfterOwnChange();
    } catch (restoreError) {
      showToastSafe({ type: "error", message: restoreError instanceof Error ? restoreError.message : "Hasta arşivden geri alınamadı." });
    } finally {
      setRestoringId(null);
    }
  };
  const clearSearch = () => {
    setQuery("");
    setParams({ q: null, sayfa: null });
  };

  const activeFilters: ActiveFilter[] = [
    ...(doctorId ? [{
      key: "doctor",
      label: `Doktorun hastaları: ${doctorName || "seçili doktor"}`,
      onRemove: () => setParams({ doktor: null, sayfa: null }),
    }] : []),
    ...(smsConsent ? [{
      key: "sms",
      label: smsConsentFilterLabel(smsConsent),
      onRemove: () => setParams({ smsConsent: null, sayfa: null }),
    }] : []),
    ...(archived ? [{
      key: "arsiv",
      label: "Arşivlenen hastalar",
      onRemove: () => setParams({ arsiv: null, sayfa: null }),
    }] : []),
  ];
  const hasFilters = activeFilters.length > 0;

  // Yetkiye göre gelen ek alanlar: yetki yoksa API alanı hiç göndermez.
  const showVisits = patients.some((patient) => patient.nextAppointment !== undefined);
  const showBalance = patients.some((patient) => patient.balance !== undefined);
  // Sonraki randevuların doktoru tek kişiyse ("Dr. Demo Doktor" her satırda) ad gösterilmez.
  const showNextDoctor = new Set(patients.map((patient) => patient.nextAppointment?.doctorName).filter(Boolean)).size > 1;

  /** `withBooking`: telefonda "Randevu ver" de menüde (kartta ayrı düğme sırası olmasın). */
  const menuItems = (patient: Patient, withBooking = false): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [];
    if (withBooking && canBookAppointments) items.push({ key: "book", label: "Randevu ver", icon: CalendarPlus, href: appointmentHref(patient) });
    if (canWritePatients) items.push({ key: "edit", label: "Bilgileri düzenle", icon: Pencil, onSelect: () => setEditPatientId(patient.id) });
    if (canMessage) {
      items.push({
        key: "sms",
        label: "Mesaj gönder",
        icon: MessageSquare,
        href: `/sms?tab=gonder&patientId=${encodeURIComponent(patient.id)}&patientName=${encodeURIComponent(patient.fullName)}`,
      });
    }
    if (canDeletePatients) {
      items.push({
        key: "archive",
        label: "Arşivle",
        icon: Archive,
        danger: true,
        separatorBefore: items.length > 0,
        onSelect: () => setArchiveTarget({ id: patient.id, fullName: patient.fullName }),
      });
    }
    return items;
  };

  // Satırda en sık eylem görünür (randevu ver — çerçevesiz ikon); düzenleme,
  // mesaj ve nadir arşivleme "…" menüsünde.
  const rowActions = (patient: Patient) => archived ? (
    <div className="flex items-center justify-end">
      <Button size="sm" variant="secondary" icon={ArchiveRestore} loading={restoringId === patient.id} onClick={() => void restorePatient(patient)}>Arşivden geri al</Button>
    </div>
  ) : (
    <div className="flex items-center justify-end gap-1">
      {canBookAppointments && (
        <IconButton icon={CalendarPlus} title="Randevu ver" tone="ghost" size="sm" href={appointmentHref(patient)} />
      )}
      <ActionMenu items={menuItems(patient)} label={`${patient.fullName} için diğer işlemler`} />
    </div>
  );

  // Hasta hücresi tek satır: ad + sağlık rozeti. Cinsiyet ve maskeli TC her
  // satırda tekrar ediyordu; hasta dosyasında görünür, TC ile arama sürer.
  const columns: ListTableColumn<Patient>[] = [
    {
      key: "fullName",
      header: "Hasta",
      render: (patient) => (
        <div className="min-w-0" data-patient-id={patient.id}>
          <PatientName patient={patient} />
        </div>
      ),
    },
    ...(!hidePhone ? [{
      key: "phone",
      header: "Telefon",
      cellClassName: "whitespace-nowrap",
      render: (patient: Patient) => {
        const text = formatPatientPhone(patient.phone, patient.phoneCountryCode);
        const href = patientTelHref(patient.phone, patient.phoneCountryCode);
        if (!text) return null;
        return href
          ? <a href={href} className="tabular-nums text-slate-700 hover:text-primary hover:underline">{text}</a>
          : <span className="tabular-nums text-slate-700">{text}</span>;
      },
    }] : []),
    ...(showVisits ? [{
      key: "lastVisit",
      header: "Son ziyaret",
      cellClassName: "whitespace-nowrap",
      render: (patient: Patient) => patient.lastVisitAt
        ? <span className="tabular-nums text-slate-600">{formatDateText(patient.lastVisitAt)}</span>
        : null,
    }, {
      key: "nextAppointment",
      header: "Sonraki randevu",
      render: (patient: Patient) => patient.nextAppointment ? (
        <div className="whitespace-nowrap">
          <p
            className="font-semibold tabular-nums text-slate-800"
            title={!showNextDoctor && patient.nextAppointment.doctorName ? patient.nextAppointment.doctorName : undefined}
          >
            {formatDateText(patient.nextAppointment.startAt, "datetime")}
          </p>
          {/* Listedeki randevuların hepsi aynı doktordaysa ad her satırda tekrar etmez (üzerine gelince görünür). */}
          {patient.nextAppointment.doctorName && (showNextDoctor
            ? <p className="text-xs text-slate-500">{patient.nextAppointment.doctorName}</p>
            : <span className="sr-only"> · {patient.nextAppointment.doctorName}</span>)}
        </div>
      ) : null,
    }] : []),
    ...(showBalance ? [{
      key: "balance",
      header: "Bakiye",
      align: "right" as const,
      cellClassName: "whitespace-nowrap",
      render: (patient: Patient) => <BalanceText value={patient.balance} />,
    }] : []),
    {
      key: "islem",
      header: "İşlem",
      align: "right",
      render: rowActions,
    },
  ];

  // Telefonda kart: ad (+ sağlık rozeti); sağ üst köşede "…" (Randevu ver
  // dahil, ListTable mobileCardActions); altında telefon ve bakiye tek satır;
  // varsa sonraki randevu. Eylemler ayrı bir düğme sırası oluşturmaz.
  const mobileCard = (patient: Patient) => {
    const phoneText = hidePhone ? "" : formatPatientPhone(patient.phone, patient.phoneCountryCode);
    const phoneHref = hidePhone ? null : patientTelHref(patient.phone, patient.phoneCountryCode);
    const hasBalance = typeof patient.balance === "number" && Math.abs(patient.balance) >= 0.005;
    return (
      <div className="space-y-1" data-patient-id={patient.id}>
        <div className="min-h-7 pt-1"><PatientName patient={patient} /></div>
        {(phoneText || hasBalance) && (
          <div className="flex items-center justify-between gap-2">
            {phoneText ? (
              phoneHref ? (
                <a href={phoneHref} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold tabular-nums text-primary">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  {phoneText}
                </a>
              ) : <span className="text-sm tabular-nums text-slate-700">{phoneText}</span>
            ) : <span />}
            {hasBalance && <span className="shrink-0 text-sm"><BalanceText value={patient.balance} /></span>}
          </div>
        )}
        {patient.nextAppointment && (
          <p className="text-xs text-slate-600">
            Sonraki randevu: <span className="font-semibold tabular-nums text-slate-800">{formatDateText(patient.nextAppointment.startAt, "datetime")}</span>
            {patient.nextAppointment.doctorName && showNextDoctor ? ` · ${patient.nextAppointment.doctorName}` : ""}
          </p>
        )}
      </div>
    );
  };

  if (forbidden) {
    return (
      <section className="space-y-4">
        <PageHeader icon="users" title="Hastalar" />
        <StatusPage kind="forbidden" headingAs="h2" title="Hasta listesini görme izniniz yok" description={forbidden} />
      </section>
    );
  }

  // Arama ve süzgeçler listenin kartında üst şerit (ListTable `toolbar` yuvası);
  // önceden ayrı kart + altında tablo kartıydı. Uygulanan süzgeç etiketleri
  // de aynı kartta, şeridin altında.
  const listToolbar = (
    <Toolbar
      filterCount={activeFilters.length}
      filters={(
        <>
          <DoctorSelect
            value={doctorId}
            onChange={(id, doctor) => {
              setDoctorName(doctor?.fullName || "");
              setParams({ doktor: id || null, sayfa: null });
            }}
            emptyLabel="Tüm doktorlar"
            aria-label="Doktora göre: bu doktordan randevu ya da tedavi almış hastalar"
            className="sm:w-52"
          />
          {canDeletePatients && (
            <Select
              value={archived ? "arsiv" : ""}
              onChange={(event) => setParams({ arsiv: event.target.value === "arsiv" ? "1" : null, sayfa: null })}
              aria-label="Hangi hastalar"
              className="sm:w-48"
            >
              <option value="">Kayıtlı hastalar</option>
              <option value="arsiv">Arşivlenen hastalar</option>
            </Select>
          )}
          <Select
            value={sortNameDesc ? "ad-za" : sortByName ? "ad" : ""}
            onChange={(event) => setParams({ sirala: event.target.value || null, sayfa: null })}
            aria-label="Sıralama"
            className="sm:w-48"
          >
            <option value="">Son eklenen önce</option>
            <option value="ad">Ada göre (A–Z)</option>
            <option value="ad-za">Ada göre (Z–A)</option>
          </Select>
        </>
      )}
    >
      <SearchInput
        value={query}
        onChange={setQuery}
        // Telefonu/TC'yi göremeyen rolde arama numarayla eşleşmez (sunucu kuralı).
        placeholder={hidePhone ? "Ad veya kurum ara" : "Ad, TC, telefon veya kurum ara"}
        aria-label={hidePhone
          ? "Hasta ara: ad, anlaşmalı kurum, meslek ya da yönlendiren"
          : "Hasta ara: ad, TC, telefon, anlaşmalı kurum, meslek ya da yönlendiren"}
        slashShortcut
        wrapperClassName="flex-1 min-w-[220px]"
      />
    </Toolbar>
  );
  const filterChips = hasFilters ? (
    <div className="border-b border-slate-100 px-3 py-2 sm:px-4">
      <ActiveFilters filters={activeFilters} onClearAll={clearFilters} />
    </div>
  ) : undefined;

  const searchEmpty = Boolean(urlQuery);
  const emptyAction = searchEmpty || hasFilters ? (
    <div className="flex flex-wrap justify-center gap-2">
      {searchEmpty && canWritePatients && (
        <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => openCreate(initialValuesFromQuery(urlQuery))}>
          Yeni hasta olarak kaydet
        </Button>
      )}
      {searchEmpty
        ? <Button size="sm" variant="ghost" onClick={clearSearch}>Aramayı temizle</Button>
        : <Button size="sm" variant="ghost" onClick={clearFilters}>Filtreleri temizle</Button>}
    </div>
  ) : undefined;

  return (
    <section className="space-y-4">
      <PageHeader
        icon="users"
        title="Hastalar"
        actions={canWritePatients ? <Button icon={UserPlus} onClick={() => openCreate()}>Yeni hasta</Button> : undefined}
      />

      <div
        ref={listTopRef}
        className="scroll-mt-4"
        onPointerOver={onListPointerOver}
        onFocus={onListFocus}
        onTouchStart={onListTouchStart}
      >
        <ListTable<Patient>
          columns={columns}
          rows={patients}
          rowKey={(patient) => patient.id}
          loading={loading}
          skeletonRows={8}
          error={error}
          staleError={staleError}
          onRetry={() => void load(error ? "user" : "silent")}
          // Arşivdeki hastanın dosyası açılmaz; önce arşivden geri alınır.
          onRowClick={archived ? undefined : openPatient}
          getRowAriaLabel={archived ? undefined : (patient) => `${patient.fullName} hasta dosyasını aç`}
          toolbar={listToolbar}
          header={filterChips}
          mobileCard={mobileCard}
          mobileCardActions={(patient) => archived
            ? <Button size="sm" variant="secondary" icon={ArchiveRestore} loading={restoringId === patient.id} onClick={() => void restorePatient(patient)}>Geri al</Button>
            : <ActionMenu items={menuItems(patient, true)} label={`${patient.fullName} için işlemler`} />}
          emptyText={archived ? "Arşivlenmiş hasta yok" : searchEmpty ? "Aramanıza uyan hasta yok" : hasFilters ? "Bu filtreye uyan hasta yok" : "Henüz hasta kaydı yok"}
          emptyDescription={searchEmpty
            ? "Yazımı kontrol edin; hasta kayıtlı değilse yeni hasta olarak kaydedin."
            : hasFilters ? undefined : canWritePatients ? "İlk hastayı \"Yeni hasta\" ile kaydedin." : undefined}
          emptyAction={emptyAction}
          pager={{
            page,
            pageCount,
            pageSize,
            pageSizeOptions: PAGE_SIZES,
            total,
            loading,
            onPageChange: changePage,
            onPageSizeChange: (size) => setParams({ boyut: size !== DEFAULT_PAGE_SIZE ? String(size) : null, sayfa: null }),
          }}
        />
      </div>

      {canWritePatients && (
        <PatientFormModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          initialValues={createInitial}
          onSaved={(patient) => router.push(`/hasta-detay?id=${encodeURIComponent(patient.id)}`)}
          onBookAppointment={canBookAppointments ? (patient) => router.push(appointmentHref(patient)) : undefined}
        />
      )}
      {canWritePatients && (
        <PatientFormModal
          open={Boolean(editPatientId)}
          onClose={() => setEditPatientId(null)}
          patientId={editPatientId || undefined}
          hidePhoneField={hidePhone}
          onSaved={(patient) => {
            showToastSafe({ type: "success", message: `${patient.fullName} bilgileri güncellendi.` });
            reloadAfterOwnChange();
          }}
        />
      )}
      {canDeletePatients && (
        <ArchivePatientModal
          patient={archiveTarget}
          onClose={() => setArchiveTarget(null)}
          onArchived={(patient) => {
            showToastSafe({ type: "success", title: "Hasta arşivlendi", message: `${patient.fullName} aktif listeden kaldırıldı.` });
            reloadAfterOwnChange();
          }}
        />
      )}
    </section>
  );
}

export default function HastaPage() {
  return (
    <Suspense fallback={<HastaListesiIskelet />}>
      <HastaContent />
    </Suspense>
  );
}
