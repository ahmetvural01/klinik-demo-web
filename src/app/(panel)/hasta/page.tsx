"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BadgeCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  Filter,
  Pencil,
  Phone,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { confirmDialog } from "@/lib/confirm-client";
import { useSlashFocus } from "@/lib/use-slash-focus";
import { ListRowSkeleton, TableRowsSkeleton } from "@/components/ui/ListSkeleton";

type Patient = {
  id: string;
  tcNo: string;
  fullName: string;
  phone: string;
  gender: string;
  birthDate?: string | null;
  insurance?: string | null;
  discountRate?: number | null;
  address?: string | null;
  bloodType?: string | null;
  hasAllergy?: boolean;
  hasHepatitis?: boolean;
  hasKidney?: boolean;
  hasDiabetes?: boolean;
  hasHeart?: boolean;
  hasBloodIssue?: boolean;
  surgeries?: string | null;
  medications?: string | null;
  otherDiseases?: string | null;
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
    medicalRisk: number;
    missingInfo: number;
    newThisMonth: number;
  };
  message?: string;
};

type AuthCache = { id?: string; fullName?: string; role?: string };
type SortKey = "fullName" | "tcNo" | "phone" | "gender" | "birthDate" | "insurance" | "createdAt" | "updatedAt";

const PAGE_SIZES = [15, 25, 50, 100];

function readCachedAuthRole() {
  if (typeof window === "undefined") return "";
  const preview = sessionStorage.getItem("dev-preview-role");
  if (preview) return preview;
  const raw = sessionStorage.getItem("auth:me:v1");
  if (!raw) return "";
  try {
    const cached = JSON.parse(raw) as AuthCache;
    return cached.role || "";
  } catch {
    return "";
  }
}

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
  return Boolean(
    patient.hasAllergy ||
      patient.hasHepatitis ||
      patient.hasKidney ||
      patient.hasDiabetes ||
      patient.hasHeart ||
      patient.hasBloodIssue ||
      patient.surgeries ||
      patient.medications ||
      patient.otherDiseases,
  );
}

function hasMissingInfo(patient: Patient) {
  const phoneMissing = patient.phone !== "***" && !patient.phone;
  return !patient.tcNo || phoneMissing || !patient.gender || !patient.birthDate || !patient.address;
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
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
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
  const [gender, setGender] = useState("");
  const [risk, setRisk] = useState("");
  const [missing, setMissing] = useState(false);
  const [insurance, setInsurance] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState(() => readCachedAuthRole());

  const hidePhone = userRole === "DOKTOR" || userRole === "ASISTAN";
  const canDeletePatients = userRole === "SUPERADMIN" || userRole === "YONETICI";
  const activeFilterCount = [gender, risk, missing ? "missing" : "", insurance].filter(Boolean).length;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const applyRole = async () => {
      const preview = typeof window !== "undefined" ? sessionStorage.getItem("dev-preview-role") : null;
      if (preview) {
        setUserRole(preview);
        return;
      }
      const cachedRole = readCachedAuthRole();
      if (cachedRole) {
        setUserRole(cachedRole);
        return;
      }
      try {
        const meRes = await fetch("/api/auth/me");
        const me = await meRes.json().catch(() => ({}));
        if (me?.role) setUserRole(me.role);
      } catch {}
    };

    void applyRole();
    const onPreview = () => {
      const preview = sessionStorage.getItem("dev-preview-role") || "";
      if (preview) setUserRole(preview);
    };
    window.addEventListener("preview-role-change", onPreview);
    return () => window.removeEventListener("preview-role-change", onPreview);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      q: debouncedQuery,
      page: String(page),
      take: String(pageSize),
      sortBy: sortKey,
      sortDir,
    });
    if (gender) params.set("gender", gender);
    if (risk) params.set("risk", risk);
    if (missing) params.set("missing", "true");
    if (insurance.trim()) params.set("insurance", insurance.trim());

    try {
      const res = await fetch(`/api/patients?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as PatientResponse;
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/giris";
          return;
        }
        throw new Error(json.message || "Hasta listesi yüklenemedi");
      }
      setPatients(Array.isArray(json.patients) ? json.patients : []);
      setTotal(Number(json.total || 0));
      setPageCount(Math.max(1, Number(json.pageCount || 1)));
      setSummary(json.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hasta listesi yüklenemedi");
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, gender, insurance, missing, page, pageSize, risk, sortDir, sortKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 300);
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
        title: `"${patient?.fullName || "Hasta"}" kalıcı olarak silinecek`,
        message:
          "Bu işlemle birlikte randevu, muayene, ödeme, taksit, reçete ve laboratuvar kayıtları da silinir.\n\nKurumsal kullanımda arşivleme tercih edilmelidir. Yine de devam etmek istiyor musunuz?",
        danger: true,
        confirmText: "Kalıcı Olarak Sil",
      }))
    ) {
      return;
    }
    const res = await fetch(`/api/patients/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Silme işlemi başarısız");
      return;
    }
    void load();
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
    setGender("");
    setRisk("");
    setMissing(false);
    setInsurance("");
    setPage(1);
  };

  const SortButton = ({ col, label }: { col: SortKey; label: string }) => (
    <button type="button" onClick={() => toggleSort(col)} className="inline-flex items-center gap-1 text-left">
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
      { label: "Toplam Hasta", value: summary?.total ?? total, icon: ClipboardList, color: "text-slate-700" },
      { label: "Medikal Uyarı", value: summary?.medicalRisk ?? 0, icon: ShieldAlert, color: "text-red-700" },
      { label: "Eksik Bilgi", value: summary?.missingInfo ?? 0, icon: AlertTriangle, color: "text-amber-700" },
      { label: "Bu Ay Yeni", value: summary?.newThisMonth ?? 0, icon: BadgeCheck, color: "text-emerald-700" },
    ],
    [summary, total],
  );

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-black text-slate-900">Hastalar</h1>
            <p className="mt-1 text-sm text-slate-500">Hasta kartları, iletişim bilgileri, medikal uyarılar ve hızlı erişim.</p>
          </div>
          <Link
            href="/hasta-ekle"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90"
          >
            <UserPlus className="h-4 w-4" />
            Yeni Hasta
          </Link>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {visibleSummary.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-500">{item.label}</span>
                  <Icon className={`h-4 w-4 ${item.color}`} />
                </div>
                <p className={`mt-2 text-2xl font-black ${item.color}`}>{Number(item.value || 0).toLocaleString("tr-TR")}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px_160px_160px]">
            <label className="relative block">
              <span className="sr-only">Hasta ara</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ad, TC veya telefon ile ara... ( / )"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <select
              value={gender}
              onChange={(event) => {
                setGender(event.target.value);
                setPage(1);
              }}
              aria-label="Cinsiyet filtresi"
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Tüm cinsiyetler</option>
              <option value="ERKEK">Erkek</option>
              <option value="KADIN">Kadın</option>
            </select>
            <select
              value={risk}
              onChange={(event) => {
                setRisk(event.target.value);
                setPage(1);
              }}
              aria-label="Medikal risk filtresi"
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Tüm riskler</option>
              <option value="medical">Medikal uyarılı</option>
            </select>
            <input
              value={insurance}
              onChange={(event) => {
                setInsurance(event.target.value);
                setPage(1);
              }}
              placeholder="Kurum / sigorta"
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={missing}
                onChange={(event) => {
                  setMissing(event.target.checked);
                  setPage(1);
                }}
                className="accent-primary"
              />
              Eksik bilgi
            </label>
            <div className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-500">
              <Filter className="h-4 w-4" />
              {activeFilterCount} filtre
            </div>
            {(query || activeFilterCount > 0) && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
                Temizle
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-busy={loading}>
        <div className="divide-y divide-slate-100 md:hidden">
          {loading && patients.length === 0 ? (
            <ListRowSkeleton rows={6} />
          ) : patients.length === 0 ? (
            <div className="px-4 py-14 text-center text-sm text-slate-400">Hasta bulunamadı</div>
          ) : (
            patients.map((patient) => {
              const age = calculateAge(patient.birthDate);
              const riskFlag = hasMedicalRisk(patient);
              const missingFlag = hasMissingInfo(patient);
              return (
                <div key={patient.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary">
                      {patientInitials(patient.fullName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/hasta-detay?id=${patient.id}`} className="font-black text-slate-900">
                        {patient.fullName}
                      </Link>
                      <p className="mt-1 font-mono text-xs text-slate-500">TC: {patient.tcNo || "-"}</p>
                      {!hidePhone && (
                        <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-600">
                          <Phone className="h-3.5 w-3.5" />
                          {patient.phone || "-"}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{patient.gender || "Cinsiyet yok"}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{age !== null ? `${age} yaş` : "Yaş yok"}</span>
                    {patient.insurance && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{patient.insurance}</span>}
                    {riskFlag && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Medikal uyarı</span>}
                    {missingFlag && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Eksik bilgi</span>}
                  </div>
                  <div className={`mt-4 grid gap-2 ${canDeletePatients ? "grid-cols-3" : "grid-cols-2"}`}>
                    <Link href={`/hasta-detay?id=${patient.id}`} className="rounded-lg bg-primary px-3 py-2 text-center text-sm font-bold text-white">Kart</Link>
                    <Link href={`/hasta-ekle?id=${patient.id}`} className="rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-700">Düzenle</Link>
                    {canDeletePatients && <button type="button" onClick={() => remove(patient.id)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600">Sil</button>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase text-slate-500">
                  <SortButton col="fullName" label="Hasta" />
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase text-slate-500">
                  <SortButton col="tcNo" label="TC Kimlik" />
                </th>
                {!hidePhone && (
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase text-slate-500">
                    <SortButton col="phone" label="Telefon" />
                  </th>
                )}
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase text-slate-500">
                  <SortButton col="birthDate" label="Yaş" />
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase text-slate-500">
                  <SortButton col="insurance" label="Kurum" />
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase text-slate-500">Durum</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase text-slate-500">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && patients.length === 0 && <TableRowsSkeleton rows={7} columns={hidePhone ? 6 : 7} />}
              {!loading && patients.length === 0 && (
                <tr>
                  <td colSpan={hidePhone ? 6 : 7} className="px-4 py-14 text-center text-sm text-slate-400">
                    Hasta bulunamadı
                  </td>
                </tr>
              )}
              {patients.map((patient) => {
                const age = calculateAge(patient.birthDate);
                const riskFlag = hasMedicalRisk(patient);
                const missingFlag = hasMissingInfo(patient);
                return (
                  <tr key={patient.id} className="transition hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
                          {patientInitials(patient.fullName)}
                        </div>
                        <div className="min-w-0">
                          <Link href={`/hasta-detay?id=${patient.id}`} className="font-black text-slate-900 hover:text-primary">
                            {patient.fullName}
                          </Link>
                          <p className="mt-0.5 text-xs text-slate-400">{patient.gender === "ERKEK" ? "Erkek" : patient.gender === "KADIN" ? "Kadın" : "Cinsiyet yok"}</p>
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
                    <td className="px-4 py-3">
                      {patient.insurance ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">{patient.insurance}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {riskFlag && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Medikal uyarı</span>}
                        {missingFlag && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Eksik bilgi</span>}
                        {patient.discountRate ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">%{patient.discountRate} indirim</span> : null}
                        {!riskFlag && !missingFlag && !patient.discountRate && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Normal</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/hasta-detay?id=${patient.id}`} title="Hasta kartını aç" className="rounded-lg bg-primary/10 p-2 text-primary transition hover:bg-primary hover:text-white">
                          <Eye className="h-4 w-4" />
                        </Link>
                        <Link href={`/hasta-ekle?id=${patient.id}`} title="Düzenle" className="rounded-lg bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200">
                          <Pencil className="h-4 w-4" />
                        </Link>
                        {canDeletePatients && (
                          <button type="button" onClick={() => remove(patient.id)} title="Sil" className="rounded-lg bg-red-50 p-2 text-red-600 transition hover:bg-red-100">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>{startRow}-{endRow} / {total.toLocaleString("tr-TR")} kayıt</span>
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
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Önceki
            </button>
            <button
              type="button"
              disabled={page >= pageCount || loading}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Sonraki
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
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
