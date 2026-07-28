"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
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
import { ListRowSkeleton, TableRowsSkeleton } from "@/components/ui/ListSkeleton";
import { cachedGet } from "@/lib/client-cache";
import { PatientFormModal } from "@/components/patient/PatientFormModal";

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

type AuthCache = { id?: string; fullName?: string; role?: string };
type SortKey = "fullName" | "tcNo" | "phone" | "gender" | "birthDate" | "insurance" | "profession" | "createdAt" | "updatedAt";

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
  const [userRole, setUserRole] = useState(() => readCachedAuthRole());
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [editPatientId, setEditPatientId] = useState<string | null>(null);

  const hidePhone = userRole === "DOKTOR" || userRole === "ASISTAN";
  const canDeletePatients = userRole === "SUPERADMIN" || userRole === "YONETICI";
  const activeFilterCount = [doctorId].filter(Boolean).length;

  useEffect(() => {
    if (searchParams.get("yeni") === "1") setShowQuickCreate(true);
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
        const me = await cachedGet<AuthCache | null>("/api/auth/me", 60_000);
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

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      q: debouncedQuery,
      page: String(page),
      take: String(pageSize),
      sortBy: sortKey,
      sortDir,
    });
    if (doctorId) params.set("doctorId", doctorId);
    if (summaryLoadedRef.current && !force) params.set("summary", "false");

    try {
      const url = `/api/patients?${params.toString()}`;
      const json = await cachedGet<PatientResponse | null>(url, 15_000, { force });
      if (!json) throw new Error("Hasta listesi yüklenemedi");
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
  }, [debouncedQuery, doctorId, page, pageSize, sortDir, sortKey]);

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
      { label: "Toplam Hasta", value: summary?.total ?? total, color: "text-slate-800" },
      { label: "Bu Ay Yeni", value: summary?.newThisMonth ?? 0, color: "text-emerald-700" },
    ],
    [summary, total],
  );

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-black text-slate-900">Hastalar</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {visibleSummary.map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="block text-[11px] font-bold uppercase text-slate-400">{item.label}</span>
                <span className={`text-base font-black ${item.color}`}>{Number(item.value || 0).toLocaleString("tr-TR")}</span>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setShowQuickCreate(true)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90"
            >
              <UserPlus className="h-4 w-4" />
              Yeni Hasta
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(249,252,251,0.98)_100%)] p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
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
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <select
              value={doctorId}
              onChange={(event) => {
                setDoctorId(event.target.value);
                setPage(1);
              }}
              aria-label="Doktor filtresi"
              className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Tüm doktorlar</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 px-3 text-sm text-slate-500">
              <Filter className="h-4 w-4" />
              {activeFilterCount} filtre
            </div>
            {(query || activeFilterCount > 0) && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-10 items-center gap-1 rounded-2xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-primary/[0.04]"
              >
                <X className="h-4 w-4" />
                Temizle
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(249,252,251,0.98)_100%)] shadow-[0_10px_24px_rgba(15,23,42,0.04)]" aria-busy={loading}>
        <div className="divide-y divide-slate-100 md:hidden">
          {loading && patients.length === 0 ? (
            <ListRowSkeleton rows={6} />
          ) : patients.length === 0 ? (
            <div className="px-4 py-14 text-center text-sm text-slate-400">Hasta bulunamadı</div>
          ) : (
            patients.map((patient) => {
              const age = calculateAge(patient.birthDate);
              const riskFlag = hasMedicalRisk(patient);
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
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{patient.gender || "Cinsiyet yok"}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{age !== null ? `${age} yaş` : "Yaş yok"}</span>
                    {patient.insurance && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{patient.insurance}</span>}
                    {patient.hasContagiousDisease && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-black text-white" title={patient.contagiousDiseaseNote || undefined}>⚠ Bulaşıcı Hastalık</span>}
                    {riskFlag && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Medikal uyarı</span>}
                  </div>
                  <div className={`mt-4 grid gap-2 ${canDeletePatients ? "grid-cols-3" : "grid-cols-2"}`}>
                    <Link href={`/hasta-detay?id=${patient.id}`} className="rounded-lg bg-primary px-3 py-2 text-center text-sm font-bold text-white">Kart</Link>
                    <button type="button" onClick={() => setEditPatientId(patient.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-700">Düzenle</button>
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
                  <SortButton col="profession" label="Meslek" />
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase text-slate-500">
                  <SortButton col="insurance" label="Kurum" />
                </th>
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
                          <div className="mt-1 flex flex-wrap gap-1">
                            {patient.hasContagiousDisease && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-black text-white" title={patient.contagiousDiseaseNote || undefined}>⚠ Bulaşıcı Hastalık</span>}
                            {riskFlag && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">Medikal uyarı</span>}
                            {patient.discountRate ? <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-orange-700">%{patient.discountRate} indirim</span> : null}
                          </div>
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
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">{patient.insurance}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/hasta-detay?id=${patient.id}`} title="Hasta kartını aç" className="rounded-lg bg-primary/10 p-2 text-primary transition hover:bg-primary hover:text-white">
                          <Eye className="h-4 w-4" />
                        </Link>
                        <button type="button" onClick={() => setEditPatientId(patient.id)} title="Düzenle" className="rounded-lg bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200">
                          <Pencil className="h-4 w-4" />
                        </button>
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
      <PatientFormModal open={showQuickCreate} onClose={closeQuickCreate} onSaved={(patient) => router.push(`/hasta-detay?id=${patient.id}`)} />
      <PatientFormModal
        open={Boolean(editPatientId)}
        onClose={() => setEditPatientId(null)}
        patientId={editPatientId || undefined}
        hidePhoneField={hidePhone}
        onSaved={() => void load(true)}
      />
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
