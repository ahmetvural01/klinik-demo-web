"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Filter,
  Pencil,
  Phone,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { confirmDialog } from "@/lib/confirm-client";
import { useSlashFocus } from "@/lib/use-slash-focus";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { ListRowSkeleton, TableRowsSkeleton } from "@/components/ui/ListSkeleton";
import { cachedGet } from "@/lib/client-cache";
import { PatientFormModal } from "@/components/patient/PatientFormModal";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";
import { Badge } from "@/components/ui/Badge";
import { ShieldAlert, Percent } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

const PatientEmptyIcon = createSceneIllustration("hasta");

type Patient = {
  id: string;
  tcNo: string;
  fullName: string;
  phone: string;
  profession?: string | null;
  gender: string;
  birthDate?: string | null;
  insurance?: string | null;
  discountRate?: number | null;
  hasAllergy?: boolean;
  hasHepatitis?: boolean;
  hasKidney?: boolean;
  hasDiabetes?: boolean;
  hasHeart?: boolean;
  hasBloodIssue?: boolean;
  hasContagiousDisease?: boolean;
  contagiousDiseaseNote?: string | null;
  hasMedicalRisk?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type PatientResponse = {
  patients: Patient[];
  total: number;
  page: number;
  pageCount: number;
  take: number;
  summary?: {
    total: number;
    newThisMonth: number;
  };
  message?: string;
};

type SortKey = "fullName" | "tcNo" | "phone" | "gender" | "birthDate" | "insurance" | "profession" | "createdAt" | "updatedAt";

const PAGE_SIZES = [15, 25, 50, 100];

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("tr-TR");
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

function hasMedicalRisk(patient: Patient) {
  return Boolean(patient.hasMedicalRisk);
}

function patientInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("tr-TR");
}

function HastaContent() {
  const { can } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const summaryLoadedRef = useRef(false);
  useSlashFocus(searchInputRef);

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get("q") || "");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [summary, setSummary] = useState<PatientResponse["summary"]>();
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [doctorId, setDoctorId] = useState("");
  const [doctors, setDoctors] = useState<{ id: string; fullName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [editPatientId, setEditPatientId] = useState<string | null>(null);
  const [smsConsentFilter, setSmsConsentFilter] = useState(searchParams.get("smsConsent") || "");

  const hidePhone = !can("patients:phone");
  const canWritePatients = can("patients:write");
  const canDeletePatients = can("patients:delete");
  const activeFilterCount = [doctorId, smsConsentFilter].filter(Boolean).length;

  useEffect(() => {
    if (searchParams.get("yeni") === "1" && canWritePatients) setShowQuickCreate(true);
  }, [searchParams]);

  const closeQuickCreate = () => {
    setShowQuickCreate(false);
    if (searchParams.get("yeni") === "1") {
      window.history.replaceState(null, "", "/hasta");
    }
  };

  useEffect(() => {
    cachedGet<unknown>("/api/staff", 60_000).then((d) => {
      type StaffMember = { id: string; fullName: string; role: string; profile?: { hideAsDoctor?: boolean | null } | null };
      const list = (Array.isArray(d) ? d as StaffMember[] : []).filter((u) => u.role === "DOKTOR" || (u.role === "YONETICI" && u.profile?.hideAsDoctor === false));
      setDoctors(list.map((u) => ({ id: u.id, fullName: u.fullName })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    const params = new URLSearchParams({
      q: debouncedQuery,
      page: String(page),
      take: String(pageSize),
      sortBy: sortKey,
      sortDir,
    });
    if (doctorId) params.set("doctorId", doctorId);
    if (smsConsentFilter) params.set("smsConsent", smsConsentFilter);
    if (summaryLoadedRef.current && !force) params.set("summary", "false");

    try {
      const url = `/api/patients?${params.toString()}`;
      // cachedGet burada kasıtlı kullanılmıyor: 403 durumunda gerçek durum
      // kodunu ayırt edip kullanıcıya "yetkiniz yok" ile "kayıt bulunamadı"
      // arasındaki farkı net göstermek gerekiyor — cachedGet her HTTP
      // hatasını aynı şekilde null'a indirger (bkz. src/lib/client-cache.ts).
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        setPatients([]);
        setTotal(0);
        setPageCount(1);
        return;
      }
      if (!res.ok) throw new Error("Hasta listesi yüklenemedi");
      const json: PatientResponse = await res.json();
      setPatients(Array.isArray(json.patients) ? json.patients : []);
      setTotal(Number(json.total || 0));
      setPageCount(Math.max(1, Number(json.pageCount || 1)));
      if (json.summary) {
        summaryLoadedRef.current = true;
        setSummary(json.summary);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hasta listesi yüklenemedi");
      // Bir filtre yenilenirken mevcut tabloyu boşaltmak, ekranda gereksiz
      // zıplama yaratır. Son geçerli sonuç kullanıcıda kalır.
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, doctorId, smsConsentFilter, page, pageSize, sortDir, sortKey]);

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

  const remove = async (id: string) => {
    const patient = patients.find((p) => p.id === id);
    if (
      !(await confirmDialog({
        title: `"${patient?.fullName || "Hasta"}" arşivlensin mi?`,
        message:
          "Hasta aktif listeden kaldırılır. Klinik, finans, laboratuvar ve yasal kayıt geçmişi korunur; gelecekteki randevular iptal edilir.",
        danger: true,
        confirmText: "Arşivle",
      }))
    ) {
      return;
    }
    const res = await fetch(`/api/patients/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Silme işlemi başarısız");
      return;
    }
    void load(true);
  };

  const toggleSort = (key: SortKey) => {
    setPage(1);
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "createdAt" || key === "updatedAt" ? "desc" : "asc");
  };

  const resetFilters = () => {
    setQuery("");
    setDebouncedQuery("");
    setDoctorId("");
    setSmsConsentFilter("");
    setPage(1);
    if (searchParams.get("smsConsent")) window.history.replaceState(null, "", "/hasta");
  };

  const SMS_CONSENT_FILTER_LABELS: Record<string, string> = {
    ENABLED: "SMS İzni: Onaylandı",
    DISABLED: "SMS İzni: Reddedildi",
    PENDING: "SMS İzni: Onay Bekliyor",
    EXPIRED: "SMS İzni: Süresi Doldu",
    SEND_FAILED: "SMS İzni: Onay SMS'i Gönderilemedi",
  };

  const SortButton = ({ col, label }: { col: SortKey; label: string }) => (
    <button type="button" onClick={() => toggleSort(col)} className="inline-flex items-center gap-1 text-left uppercase tracking-wide">
      {label}
      {sortKey === col ? (
        sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 text-slate-300" />
      )}
    </button>
  );

  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, total);

  const visibleSummary = useMemo(
    () => [
      { label: "Toplam Hasta", value: summary?.total ?? total, color: "text-slate-800" },
      { label: "Bu Ay Yeni", value: summary?.newThisMonth ?? 0, color: "text-emerald-700" },
    ],
    [summary, total],
  );

  return (
    <section className="space-y-4">
      <PageHeader
        icon="users"
        title="Hastalar"
        description="Kayıtlı hasta dosyalarını, iletişim bilgilerini ve klinik uyarıları yönetin."
        stats={visibleSummary.map((item) => ({
          label: item.label,
          value: Number(item.value || 0).toLocaleString("tr-TR"),
          color: item.color,
        }))}
        actions={canWritePatients ? <Button icon={UserPlus} onClick={() => setShowQuickCreate(true)}>Yeni Hasta</Button> : undefined}
      />

      <div className="ui-surface p-3">
        <div className="grid gap-2 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px]">
            <label className="relative block">
              <span className="sr-only">Hasta ara</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ad, TC, telefon, kurum/sigorta veya referans kişi ile ara... ( / )"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <select
              value={doctorId}
              onChange={(event) => {
                setDoctorId(event.target.value);
                setPage(1);
              }}
              aria-label="Doktor filtresi"
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Tüm doktorlar</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm transition ${activeFilterCount > 0 ? "border-primary/25 bg-primary/5 text-primary" : "border-slate-200 text-slate-500"}`}>
              <Filter className="h-4 w-4" />
              {activeFilterCount} filtre
            </div>
            {(query || activeFilterCount > 0) && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
                Temizle
              </button>
            )}
          </div>
        </div>
      </div>

      {smsConsentFilter && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary">
            {SMS_CONSENT_FILTER_LABELS[smsConsentFilter] || smsConsentFilter}
            <button
              type="button"
              onClick={() => { setSmsConsentFilter(""); setPage(1); window.history.replaceState(null, "", "/hasta"); }}
              className="ml-0.5 rounded-full p-0.5 hover:bg-primary/10"
              aria-label="SMS izin filtresini kaldır"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 shadow-[var(--shadow-rest)]">{error}</p>}

      <div className="ui-surface overflow-hidden" aria-busy={loading}>
        <div className="divide-y divide-slate-100 md:hidden">
          {loading && patients.length === 0 ? (
            <ListRowSkeleton rows={6} />
          ) : forbidden ? (
            <div className="px-4 py-14 text-center text-sm font-medium text-amber-700">Bu sayfayı görüntüleme yetkiniz yok.</div>
          ) : patients.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-14 text-center">
              <PatientEmptyIcon className="ui-empty-illustration mb-4" />
              <p className="text-sm font-bold text-slate-800">Hasta bulunamadı</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Arama veya filtre kriterlerine uyan bir hasta yok. Yeni bir hasta ekleyerek başlayabilirsiniz.</p>
            </div>
          ) : (
            patients.map((patient, patientIdx) => {
              const age = calculateAge(patient.birthDate);
              const riskFlag = hasMedicalRisk(patient);
              return (
                <div
                  key={patient.id}
                  role="link"
                  tabIndex={0}
                  aria-label={`${patient.fullName} hasta kartını aç`}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("button, a")) return;
                    router.push(`/hasta-detay?id=${patient.id}`);
                  }}
                  onKeyDown={(event) => {
                    if ((event.target as HTMLElement).closest("button, a, input, select, textarea, [role='button']")) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/hasta-detay?id=${patient.id}`);
                    }
                  }}
                  style={{ ["--row-delay" as string]: `${Math.min(patientIdx, 12) * 20}ms` }}
                  className="ui-tone-card-interactive ui-row-in ui-pressable p-4 transition-colors hover:bg-primary/[0.035] focus:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/25"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-strong text-sm font-black text-white shadow-[0_2px_6px_rgb(var(--app-primary)/0.28)] ring-2 ring-white">
                      {patientInitials(patient.fullName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/hasta-detay?id=${patient.id}`} className="font-black text-slate-900">
                        {patient.fullName}
                      </Link>
                      <p className="mt-1 font-mono text-xs text-slate-500">TC: {patient.tcNo || "-"}</p>
                      {patient.profession && <p className="mt-0.5 text-xs font-semibold text-slate-500">Meslek: {patient.profession}</p>}
                      {!hidePhone && (
                        <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-600">
                          <Phone className="h-3.5 w-3.5" />
                          {patient.phone || "-"}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge tone="neutral">{patient.gender || "Cinsiyet yok"}</Badge>
                    <Badge tone="neutral">{age !== null ? `${age} yaş` : "Yaş yok"}</Badge>
                    {patient.insurance && <Badge tone="success">{patient.insurance}</Badge>}
                    {patient.hasContagiousDisease && <Badge tone="critical" solid icon={ShieldAlert} className="ui-badge-pulse" title={patient.contagiousDiseaseNote || undefined}>Bulaşıcı Hastalık</Badge>}
                    {riskFlag && <Badge tone="critical" icon={ShieldAlert}>Medikal uyarı</Badge>}
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/randevu?newPatientId=${patient.id}&newPatientName=${encodeURIComponent(patient.fullName)}`)}
                      className="ui-interactive rounded-lg bg-gradient-to-b from-primary to-primary-strong px-3 py-2.5 text-center text-sm font-bold text-white shadow-[0_2px_8px_rgb(var(--app-primary)/0.25)]"
                    >
                      Randevu Oluştur
                    </button>
                    {(canWritePatients || canDeletePatients) && <div className={`grid gap-2 ${canWritePatients && canDeletePatients ? "grid-cols-2" : "grid-cols-1"}`}>
                      {canWritePatients && <button type="button" onClick={() => setEditPatientId(patient.id)} className="ui-interactive rounded-lg border border-slate-200 px-3 py-2.5 text-center text-sm font-semibold text-slate-700">Düzenle</button>}
                      {canDeletePatients && <button type="button" onClick={() => remove(patient.id)} className="ui-interactive rounded-lg border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-600">Sil</button>}
                    </div>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <SortButton col="fullName" label="Hasta" />
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <SortButton col="tcNo" label="TC Kimlik" />
                </th>
                {!hidePhone && (
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <SortButton col="phone" label="Telefon" />
                  </th>
                )}
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <SortButton col="birthDate" label="Yaş" />
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <SortButton col="profession" label="Meslek" />
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <SortButton col="insurance" label="Kurum" />
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && patients.length === 0 && <TableRowsSkeleton rows={7} columns={hidePhone ? 6 : 7} />}
              {!loading && forbidden && (
                <tr>
                  <td colSpan={hidePhone ? 6 : 7} className="px-4 py-14 text-center text-sm font-medium text-amber-700">
                    Bu sayfayı görüntüleme yetkiniz yok.
                  </td>
                </tr>
              )}
              {!loading && !forbidden && patients.length === 0 && (
                <tr>
                  <td colSpan={hidePhone ? 6 : 7} className="px-4 py-14 text-center">
                    <PatientEmptyIcon className="ui-empty-illustration mx-auto mb-4" />
                    <p className="text-sm font-bold text-slate-800">Hasta bulunamadı</p>
                    <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-slate-500">Arama veya filtre kriterlerine uyan bir hasta yok. Yeni bir hasta ekleyerek başlayabilirsiniz.</p>
                  </td>
                </tr>
              )}
              {patients.map((patient, patientIdx) => {
                const age = calculateAge(patient.birthDate);
                const riskFlag = hasMedicalRisk(patient);
                return (
                  <tr
                    key={patient.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`${patient.fullName} hasta kartını aç`}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("button, a")) return;
                      router.push(`/hasta-detay?id=${patient.id}`);
                    }}
                    onKeyDown={(event) => {
                      if ((event.target as HTMLElement).closest("button, a, input, select, textarea, [role='button']")) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(`/hasta-detay?id=${patient.id}`);
                      }
                    }}
                    style={{ ["--row-delay" as string]: `${Math.min(patientIdx, 12) * 20}ms` }}
                    className="ui-row-in cursor-pointer transition-colors hover:bg-primary/[0.035] focus:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/25"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-strong text-xs font-black text-white shadow-[0_2px_6px_rgb(var(--app-primary)/0.28)] ring-2 ring-white">
                          {patientInitials(patient.fullName)}
                        </div>
                        <div className="min-w-0">
                          <Link href={`/hasta-detay?id=${patient.id}`} className="font-black text-slate-900 hover:text-primary">
                            {patient.fullName}
                          </Link>
                          <p className="mt-0.5 text-xs text-slate-400">{patient.gender === "ERKEK" ? "Erkek" : patient.gender === "KADIN" ? "Kadın" : "Cinsiyet yok"}</p>
                          {Boolean(patient.hasContagiousDisease || riskFlag || patient.discountRate) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {patient.hasContagiousDisease && <Badge tone="critical" solid icon={ShieldAlert} className="ui-badge-pulse" title={patient.contagiousDiseaseNote || undefined}>Bulaşıcı Hastalık</Badge>}
                              {riskFlag && <Badge tone="critical" icon={ShieldAlert}>Medikal uyarı</Badge>}
                              {patient.discountRate ? <Badge tone="warning" icon={Percent}>%{patient.discountRate} indirim</Badge> : null}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{patient.tcNo || "-"}</td>
                    {!hidePhone && <td className="px-4 py-3 text-slate-600">{patient.phone || "-"}</td>}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-700">{age !== null ? `${age} yaş` : "-"}</span>
                        <span className="text-xs text-slate-400">{formatDate(patient.birthDate)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{patient.profession || "-"}</td>
                    <td className="px-4 py-3">
                      {patient.insurance ? (
                        <Badge tone="success">{patient.insurance}</Badge>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Tooltip label="Randevu Oluştur">
                          <button
                            type="button"
                            onClick={() => router.push(`/randevu?newPatientId=${patient.id}&newPatientName=${encodeURIComponent(patient.fullName)}`)}
                            aria-label="Randevu Oluştur"
                            className="ui-interactive rounded-lg bg-primary/10 p-2 text-primary hover:bg-primary/20"
                          >
                            <CalendarPlus className="h-4 w-4" />
                          </button>
                        </Tooltip>
                        {canWritePatients && <Tooltip label="Düzenle">
                          <button type="button" onClick={() => setEditPatientId(patient.id)} aria-label="Düzenle" className="ui-interactive rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                            <Pencil className="h-4 w-4" />
                          </button>
                        </Tooltip>}
                        {canDeletePatients && (
                          <Tooltip label="Sil">
                            <button type="button" onClick={() => remove(patient.id)} aria-label="Sil" className="ui-interactive rounded-lg bg-red-50 p-2 text-red-600 hover:bg-red-100">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500">
            <span className="font-bold text-slate-700">{startRow}-{endRow}</span>
            <span>/ {total.toLocaleString("tr-TR")} kayıt</span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              Sayfa {page} / {pageCount}
            </span>
            <label className="inline-flex items-center gap-2">
              Sayfa başına
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs outline-none"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="ui-interactive inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Önceki
            </button>
            <button
              type="button"
              disabled={page >= pageCount || loading}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              className="ui-interactive inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 disabled:pointer-events-none disabled:opacity-40"
            >
              Sonraki
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      {canWritePatients && <PatientFormModal open={showQuickCreate} onClose={closeQuickCreate} onSaved={(patient) => router.push(`/hasta-detay?id=${patient.id}`)} />}
      {canWritePatients && <PatientFormModal
        open={Boolean(editPatientId)}
        onClose={() => setEditPatientId(null)}
        patientId={editPatientId || undefined}
        hidePhoneField={hidePhone}
        onSaved={() => void load(true)}
      />}
    </section>
  );
}

export default function HastaPage() {
  return (
    <Suspense fallback={<div className="py-20" aria-hidden="true" />}>
      <HastaContent />
    </Suspense>
  );
}
