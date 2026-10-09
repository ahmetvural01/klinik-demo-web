"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, CalendarPlus, Pencil, Percent, Phone, ShieldAlert, UserPlus } from "lucide-react";
import { confirmDialog } from "@/lib/confirm-client";
import { clientMutation } from "@/lib/client-mutation";
import { showToastSafe } from "@/lib/toast-client";
import { formatCurrency, formatPhoneNumber } from "@/lib/format";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { PatientFormModal } from "@/components/patient/PatientFormModal";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyValue, ListTable, type ListSort, type ListTableColumn } from "@/components/ui/ListTable";
import { formatDateText } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { ActiveFilters, Toolbar, type ActiveFilter } from "@/components/ui/Toolbar";

type Patient = {
  id: string;
  tcNo: string;
  fullName: string;
  phone: string;
  gender: string;
  birthDate?: string | null;
  insurance?: string | null;
  discountRate?: number | null;
  hasContagiousDisease?: boolean;
  contagiousDiseaseNote?: string | null;
  hasMedicalRisk?: boolean;
  // GET /api/patients?extras=1 — yalnız ilgili yetkisi olan role gelir;
  // yetki yoksa alan hiç gelmez (undefined), sütun da gösterilmez.
  lastVisitAt?: string | null;
  nextAppointment?: { startAt: string; doctorName: string | null } | null;
  balance?: number | null;
};

type PatientResponse = {
  patients: Patient[];
  total: number;
  pageCount: number;
  summary?: { total: number; newThisMonth: number };
  message?: string;
};

type SortKey = "fullName" | "createdAt";

const PAGE_SIZES = [15, 25, 50, 100];

const SMS_CONSENT_FILTER_LABELS: Record<string, string> = {
  ENABLED: "SMS izni: Onaylandı",
  DISABLED: "SMS izni: Reddedildi",
  PENDING: "SMS izni: Onay bekliyor",
  EXPIRED: "SMS izni: Süresi doldu",
  SEND_FAILED: "SMS izni: Onay SMS'i gönderilemedi",
};

// Veritabanında cinsiyet hem "ERKEK/KADIN" hem eski kayıtlarda "E/K" olarak duruyor;
// ekranda ham kod görünmesin.
function genderLabel(value?: string | null) {
  const code = (value || "").trim().toUpperCase();
  if (code === "ERKEK" || code === "E") return "Erkek";
  if (code === "KADIN" || code === "K") return "Kadın";
  return "";
}

function calculateAge(value?: string | null) {
  if (!value) return null;
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** "41 yaş · Kadın" — boş parçalar yazılmaz. */
function patientFacts(patient: Patient) {
  const age = calculateAge(patient.birthDate);
  return [age !== null ? `${age} yaş` : "", genderLabel(patient.gender)].filter(Boolean).join(" · ");
}

function telHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `tel:${digits.startsWith("0") ? digits : `0${digits}`}` : "";
}

function appointmentText(next: NonNullable<Patient["nextAppointment"]>) {
  return formatDateText(next.startAt, "datetime");
}

function PatientBadges({ patient }: { patient: Patient }) {
  if (!patient.hasContagiousDisease && !patient.hasMedicalRisk && !patient.discountRate) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {patient.hasContagiousDisease && (
        <Badge tone="critical" solid icon={ShieldAlert} title={patient.contagiousDiseaseNote || undefined}>Bulaşıcı hastalık</Badge>
      )}
      {patient.hasMedicalRisk && <Badge tone="critical" icon={ShieldAlert}>Medikal uyarı</Badge>}
      {patient.discountRate ? <Badge tone="warning" icon={Percent}>%{patient.discountRate} indirim</Badge> : null}
    </div>
  );
}

/** Pozitif bakiye = hastanın borcu (kırmızı); negatif = hastanın avansı (yeşil). */
function BalanceText({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || Math.abs(value) < 0.005) return <EmptyValue />;
  if (value > 0) return <span className="font-semibold tabular-nums text-red-700">{formatCurrency(value)} borç</span>;
  return <span className="tabular-nums text-emerald-700">{formatCurrency(Math.abs(value))} avans</span>;
}

function HastaContent() {
  const { can } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadSequenceRef = useRef(0);
  const summaryLoadedRef = useRef(false);

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get("q") || "");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [summary, setSummary] = useState<PatientResponse["summary"]>();
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });
  const [doctorId, setDoctorId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [smsConsentFilter, setSmsConsentFilter] = useState(searchParams.get("smsConsent") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editPatientId, setEditPatientId] = useState<string | null>(null);

  const hidePhone = !can("patients:phone");
  const canWritePatients = can("patients:write");
  const canDeletePatients = can("patients:delete");
  const canBookAppointments = can("appointments:write");

  // Üst bardaki "Yeni > Hasta" ve diğer ekranlardan gelen ?yeni=1 formu açar.
  useEffect(() => {
    if (searchParams.get("yeni") === "1" && canWritePatients) setShowCreate(true);
  }, [searchParams, canWritePatients]);

  const closeCreate = () => {
    setShowCreate(false);
    if (searchParams.get("yeni") === "1") window.history.replaceState(null, "", "/hasta");
  };

  // Üst bardaki aramadan ya da başka ekrandan /hasta?q=… ile gelindiğinde
  // sayfa açıkken de arama kutusu ve liste güncellenir (denetim X-HL-01).
  const urlQuery = searchParams.get("q") || "";
  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async (force = false) => {
    const requestId = ++loadSequenceRef.current;
    setLoading(true);
    setError(null);
    setForbidden(false);
    const params = new URLSearchParams({
      q: debouncedQuery,
      page: String(page),
      take: String(pageSize),
      sortBy: sort.key,
      sortDir: sort.dir,
      extras: "1",
    });
    if (doctorId) params.set("doctorId", doctorId);
    if (smsConsentFilter) params.set("smsConsent", smsConsentFilter);
    // Üstteki "Bu ay yeni" sayısı filtreden bağımsızdır; yalnız ilk açılışta
    // ve kayıt değişince (force) istenir.
    if (summaryLoadedRef.current && !force) params.set("summary", "false");

    try {
      // cachedGet kasıtlı kullanılmıyor: 403'ü "kayıt yok"tan ayırmak gerekir.
      const res = await fetch(`/api/patients?${params.toString()}`, { cache: "no-store" });
      if (requestId !== loadSequenceRef.current) return;
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        setPatients([]);
        setTotal(0);
        setPageCount(1);
        return;
      }
      const json: PatientResponse = await res.json().catch(() => ({ patients: [], total: 0, pageCount: 1 }));
      if (!res.ok) throw new Error(json.message || "Hasta listesi yüklenemedi.");
      if (requestId !== loadSequenceRef.current) return;
      const nextPageCount = Math.max(1, Number(json.pageCount || 1));
      if (page > nextPageCount) {
        setPageCount(nextPageCount);
        setPage(nextPageCount);
        return;
      }
      setPatients(Array.isArray(json.patients) ? json.patients : []);
      setTotal(Number(json.total || 0));
      setPageCount(nextPageCount);
      if (json.summary) {
        summaryLoadedRef.current = true;
        setSummary(json.summary);
      }
    } catch (err) {
      if (requestId !== loadSequenceRef.current) return;
      setError(err instanceof Error ? err.message : "Hasta listesi yüklenemedi.");
    } finally {
      if (requestId === loadSequenceRef.current) setLoading(false);
    }
  }, [debouncedQuery, doctorId, smsConsentFilter, page, pageSize, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(true), 300);
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
    };
  }, [load]);

  const archive = async (patient: Patient) => {
    const confirmed = await confirmDialog({
      title: `"${patient.fullName}" arşivlensin mi?`,
      message: "Hasta aktif listeden kaldırılır. Tedavi, ödeme, laboratuvar ve yasal kayıt geçmişi korunur; ileri tarihli randevuları iptal edilir.",
      danger: true,
      confirmText: "Arşivle",
    });
    if (!confirmed) return;
    try {
      await clientMutation(`/api/patients/${patient.id}`, { method: "DELETE" }, "Hasta arşivlenemedi.");
      showToastSafe({ title: "Hasta arşivlendi", message: `${patient.fullName} aktif listeden kaldırıldı.`, type: "success" });
      void load(true);
    } catch (archiveError) {
      showToastSafe({ title: "Hasta arşivlenemedi", message: archiveError instanceof Error ? archiveError.message : "Lütfen tekrar deneyin.", type: "error" });
    }
  };

  const bookAppointment = (patient: Patient) => {
    router.push(`/randevu?newPatientId=${patient.id}&newPatientName=${encodeURIComponent(patient.fullName)}`);
  };

  const openPatient = (patient: Patient) => router.push(`/hasta-detay?id=${patient.id}`);

  const clearSmsFilter = () => {
    setSmsConsentFilter("");
    setPage(1);
    window.history.replaceState(null, "", "/hasta");
  };

  const resetFilters = () => {
    setQuery("");
    setDebouncedQuery("");
    setDoctorId("");
    setDoctorName("");
    if (smsConsentFilter) clearSmsFilter();
    setPage(1);
  };

  const activeFilters: ActiveFilter[] = [
    ...(doctorId ? [{
      key: "doctor",
      label: `Doktorun hastaları: ${doctorName || "Seçili doktor"}`,
      onRemove: () => { setDoctorId(""); setDoctorName(""); setPage(1); },
    }] : []),
    ...(smsConsentFilter ? [{
      key: "sms",
      label: SMS_CONSENT_FILTER_LABELS[smsConsentFilter] || "SMS izni",
      onRemove: clearSmsFilter,
    }] : []),
  ];
  const isFiltered = Boolean(debouncedQuery || doctorId || smsConsentFilter);

  // Yetkiye göre gelen ek alanlar: yetki yoksa API alanı hiç göndermez.
  const showVisits = patients.some((patient) => patient.nextAppointment !== undefined);
  const showBalance = patients.some((patient) => patient.balance !== undefined);

  const rowActions = (patient: Patient) => (
    <div className="flex items-center justify-end gap-1.5">
      {canBookAppointments && (
        <IconButton icon={CalendarPlus} title="Randevu ver" tone="primary" onClick={() => bookAppointment(patient)} />
      )}
      {canWritePatients && (
        <IconButton icon={Pencil} title="Bilgileri düzenle" onClick={() => setEditPatientId(patient.id)} />
      )}
      {canDeletePatients && (
        <IconButton icon={Archive} title={`${patient.fullName} hastasını arşivle`} tone="danger" onClick={() => void archive(patient)} />
      )}
    </div>
  );

  const columns: ListTableColumn<Patient>[] = [
    {
      key: "fullName",
      header: "Hasta",
      sortKey: "fullName",
      render: (patient) => (
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{patient.fullName}</p>
          <p className="text-xs text-slate-500">
            {[patientFacts(patient), !hidePhone && patient.tcNo ? `TC ${patient.tcNo}` : ""].filter(Boolean).join(" · ") || "—"}
          </p>
          <PatientBadges patient={patient} />
        </div>
      ),
    },
    ...(!hidePhone ? [{
      key: "phone",
      header: "Telefon",
      cellClassName: "whitespace-nowrap",
      render: (patient: Patient) => patient.phone ? (
        <a href={telHref(patient.phone)} className="tabular-nums text-slate-700 hover:text-primary hover:underline">{formatPhoneNumber(patient.phone)}</a>
      ) : <EmptyValue />,
    }] : []),
    {
      key: "insurance",
      header: "Anlaşmalı kurum",
      render: (patient) => patient.insurance?.trim() ? <Badge tone="neutral">{patient.insurance}</Badge> : <EmptyValue />,
    },
    ...(showVisits ? [{
      key: "lastVisit",
      header: "Son ziyaret",
      cellClassName: "whitespace-nowrap",
      render: (patient: Patient) => patient.lastVisitAt
        ? <span className="tabular-nums text-slate-600">{formatDateText(patient.lastVisitAt)}</span>
        : <EmptyValue />,
    }, {
      key: "nextAppointment",
      header: "Sonraki randevu",
      render: (patient: Patient) => patient.nextAppointment ? (
        <div className="whitespace-nowrap">
          <p className="font-semibold tabular-nums text-slate-800">{appointmentText(patient.nextAppointment)}</p>
          {patient.nextAppointment.doctorName && <p className="text-xs text-slate-500">{patient.nextAppointment.doctorName}</p>}
        </div>
      ) : <EmptyValue />,
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

  const mobileCard = (patient: Patient) => (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{patient.fullName}</p>
          <p className="text-xs text-slate-500">
            {[patientFacts(patient), patient.insurance?.trim() || ""].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <BalanceBadge value={patient.balance} />
      </div>
      <PatientBadges patient={patient} />
      {patient.nextAppointment && (
        <p className="text-xs text-slate-600">
          Sonraki randevu: <span className="font-semibold tabular-nums text-slate-800">{appointmentText(patient.nextAppointment)}</span>
          {patient.nextAppointment.doctorName ? ` · ${patient.nextAppointment.doctorName}` : ""}
        </p>
      )}
      <div className="flex items-center gap-1.5">
        {!hidePhone && patient.phone ? (
          <a href={telHref(patient.phone)} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold tabular-nums text-primary">
            <Phone className="h-4 w-4" aria-hidden="true" />
            {formatPhoneNumber(patient.phone)}
          </a>
        ) : null}
        <span className="flex-1" />
        {canBookAppointments && <IconButton icon={CalendarPlus} title="Randevu ver" tone="primary" onClick={() => bookAppointment(patient)} />}
        {canWritePatients && <IconButton icon={Pencil} title="Bilgileri düzenle" onClick={() => setEditPatientId(patient.id)} />}
        {canDeletePatients && <IconButton icon={Archive} title={`${patient.fullName} hastasını arşivle`} tone="danger" onClick={() => void archive(patient)} />}
      </div>
    </div>
  );

  const emptyAction = (
    <div className="flex flex-wrap justify-center gap-2">
      {canWritePatients && <Button size="sm" icon={UserPlus} onClick={() => setShowCreate(true)}>Yeni hasta kaydet</Button>}
      {isFiltered && <Button size="sm" variant="secondary" onClick={resetFilters}>Aramayı temizle</Button>}
    </div>
  );

  return (
    <section className="space-y-3">
      <PageHeader
        icon="users"
        title="Hastalar"
        description="Hastayı adı, TC'si veya telefonuyla bulun; dosyasını açın ya da randevu verin."
        stats={summary ? [{ label: "Bu ay yeni kayıt", value: summary.newThisMonth.toLocaleString("tr-TR"), color: "text-emerald-700" }] : undefined}
        actions={canWritePatients ? <Button icon={UserPlus} onClick={() => setShowCreate(true)}>Yeni Hasta</Button> : undefined}
      />

      <Toolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Ad, TC veya telefon ara"
          aria-label="Hasta ara: ad, TC, telefon, anlaşmalı kurum veya yönlendiren kişi"
          slashShortcut
          wrapperClassName="flex-1 min-w-[220px]"
        />
        <DoctorSelect
          value={doctorId}
          onChange={(id, doctor) => { setDoctorId(id); setDoctorName(doctor?.fullName || ""); setPage(1); }}
          emptyLabel="Tüm doktorların hastaları"
          aria-label="Doktora göre: bu doktordan randevu veya muayene almış hastalar"
          className="sm:w-64"
        />
      </Toolbar>
      <ActiveFilters filters={activeFilters} onClearAll={resetFilters} />

      <ListTable<Patient>
        columns={columns}
        rows={patients}
        rowKey={(patient) => patient.id}
        loading={loading}
        error={forbidden ? "Hasta listesini görme yetkiniz yok." : error}
        onRetry={forbidden ? undefined : () => void load(true)}
        onRowClick={openPatient}
        getRowAriaLabel={(patient) => `${patient.fullName} hasta dosyasını aç`}
        mobileCard={mobileCard}
        sort={sort.key === "fullName" ? { key: "fullName", dir: sort.dir } satisfies ListSort : null}
        onSortChange={() => {
          setPage(1);
          setSort((current) => current.key === "fullName"
            ? (current.dir === "asc" ? { key: "fullName", dir: "desc" } : { key: "createdAt", dir: "desc" })
            : { key: "fullName", dir: "asc" });
        }}
        emptyText={isFiltered ? "Aramanıza uyan hasta yok" : "Henüz hasta kaydı yok"}
        emptyDescription={isFiltered
          ? "Yazımı kontrol edin; hasta kayıtlı değilse yeni kayıt açabilirsiniz."
          : "İlk hastanızı kaydederek başlayın."}
        emptyAction={canWritePatients || isFiltered ? emptyAction : undefined}
        pager={{
          page,
          pageCount,
          pageSize,
          pageSizeOptions: PAGE_SIZES,
          total,
          loading,
          onPageChange: setPage,
          onPageSizeChange: (size) => { setPageSize(size); setPage(1); },
        }}
      />

      {canWritePatients && (
        <PatientFormModal open={showCreate} onClose={closeCreate} onSaved={(patient) => router.push(`/hasta-detay?id=${patient.id}`)} />
      )}
      {canWritePatients && (
        <PatientFormModal
          open={Boolean(editPatientId)}
          onClose={() => setEditPatientId(null)}
          patientId={editPatientId || undefined}
          hidePhoneField={hidePhone}
          onSaved={() => void load(true)}
        />
      )}
    </section>
  );
}

/** Mobil kartta yalnız borç varsa küçük kırmızı etiket. */
function BalanceBadge({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || value < 0.005) return null;
  return <Badge tone="critical">Borç {formatCurrency(value)}</Badge>;
}

export default function HastaPage() {
  return (
    <Suspense fallback={<div className="py-20" aria-hidden="true" />}>
      <HastaContent />
    </Suspense>
  );
}
