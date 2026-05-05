"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  FOLLOW_UP_OPTIONS,
  appointmentNeedsFollowUp,
  getFollowUpMeta,
  parseAppointmentNote,
} from "@/lib/appointment-follow-up";

type Appointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  note?: string | null;
  patient?: { id: string; fullName: string; phone?: string | null };
  doctor?: { id: string; fullName: string };
};

const STATUS_LABELS: Record<string, string> = {
  BEKLIYOR: "Bekliyor",
  GELDI: "Geldi",
  GELMEDI: "Gelmedi",
  IPTAL: "İptal",
};

export default function HastaTakipPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"TUMU" | "GELMEDI" | "GERI_ARA" | "ULASILAMADI" | "DONUS_BEKLENIYOR">("TUMU");
  const [userRole, setUserRole] = useState("");
  const hidePhone = userRole === "DOKTOR" || userRole === "ASISTAN";

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => {
        const preview = typeof window !== "undefined" ? sessionStorage.getItem("dev-preview-role") : null;
        setUserRole(preview || d?.role || "");
      })
      .catch(() => {});

    const onPreview = () => {
      const preview = sessionStorage.getItem("dev-preview-role");
      fetch("/api/auth/me").then(r => r.json()).then(d => setUserRole(preview || d?.role || "")).catch(() => {});
    };
    window.addEventListener("preview-role-change", onPreview);
    return () => window.removeEventListener("preview-role-change", onPreview);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 90);

      try {
        const res = await fetch(`/api/appointments?from=${from.toISOString()}&to=${to.toISOString()}`);
        const data = await res.json();
        setAppointments(Array.isArray(data) ? data : []);
      } catch {
        setAppointments([]);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const followItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
    return appointments
      .filter((appt) => appointmentNeedsFollowUp(appt.status, appt.note))
      .filter((appt) => {
        const parsed = parseAppointmentNote(appt.note);
        if (filter === "GELMEDI") return appt.status === "GELMEDI";
        if (filter !== "TUMU") return parsed.followUp === filter;
        return true;
      })
      .filter((appt) => {
        if (!normalizedQuery) return true;
        const haystack = [appt.patient?.fullName, hidePhone ? null : appt.patient?.phone, appt.doctor?.fullName, parseAppointmentNote(appt.note).detail]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("tr-TR");
        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }, [appointments, filter, query]);

  const stats = useMemo(() => {
    const all = appointments.filter((appt) => appointmentNeedsFollowUp(appt.status, appt.note));
    const byFollow = (key: string) => all.filter((appt) => parseAppointmentNote(appt.note).followUp === key).length;
    return {
      total: all.length,
      noShow: all.filter((appt) => appt.status === "GELMEDI").length,
      callBack: byFollow("GERI_ARA"),
      unreachable: byFollow("ULASILAMADI"),
      waitingReturn: byFollow("DONUS_BEKLENIYOR"),
    };
  }, [appointments]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Hasta Takip Paneli</h1>
          <p className="mt-0.5 text-sm text-slate-500">Gelmeyen, ulaşılamayan ve geri dönüş beklenen hastaları tek panelden yönetin</p>
        </div>
        <Link href="/randevu" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Randevulara Dön
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-rose-600">Toplam Takip</p>
          <p className="mt-2 text-3xl font-black text-rose-900">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-red-600">Gelmeyen</p>
          <p className="mt-2 text-3xl font-black text-red-900">{stats.noShow}</p>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-violet-600">Geri Aranacak</p>
          <p className="mt-2 text-3xl font-black text-violet-900">{stats.callBack + stats.unreachable}</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-600">Dönüş Beklenen</p>
          <p className="mt-2 text-3xl font-black text-amber-900">{stats.waitingReturn}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hasta adı, telefon, doktor veya not ara..."
          className="min-w-[240px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="TUMU">Tüm Takipler</option>
          <option value="GELMEDI">Gelmeyen Hastalar</option>
          <option value="GERI_ARA">Tekrar Aranacak</option>
          <option value="ULASILAMADI">Ulaşılamayanlar</option>
          <option value="DONUS_BEKLENIYOR">Dönüş Beklenenler</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">Aksiyon Gerektiren Hasta Listesi</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{followItems.length} kayıt</span>
        </div>

        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">Takip kayıtları yükleniyor...</div>
        ) : followItems.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">Seçili filtrede takip gerektiren hasta bulunmuyor.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {followItems.map((appt) => {
              const parsed = parseAppointmentNote(appt.note);
              const meta = getFollowUpMeta(parsed.followUp);
              const statusLabel = STATUS_LABELS[appt.status] || appt.status;
              const primaryLabel = appt.status === "GELMEDI" && parsed.followUp === "YOK" ? "Gelmedi - geri arama önerilir" : meta.label;

              return (
                <div key={appt.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1.6fr_1fr_1fr_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{appt.patient?.fullName || "Hasta"}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{statusLabel}</span>
                      <span className={"rounded-full px-2 py-0.5 text-[10px] font-bold " + meta.badge}>{primaryLabel}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{new Date(appt.startAt).toLocaleString("tr-TR")} · {appt.doctor?.fullName || "Doktor atanmamış"}</p>
                    <p className="mt-2 text-sm text-slate-700">{parsed.detail || "Henüz detay notu girilmemiş. Randevu detayından açıklama notu eklenmeli."}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Telefon</p>
                    {hidePhone
                      ? <p className="mt-1 text-sm text-slate-400 italic">Gizli</p>
                      : <p className="mt-1 text-sm font-medium text-slate-700">{appt.patient?.phone || "Kayıtlı telefon yok"}</p>
                    }
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Sonraki Adım</p>
                    <p className="mt-1 text-sm font-medium text-slate-700">{primaryLabel}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {!hidePhone && appt.patient?.phone && (
                      <a href={`tel:${appt.patient.phone}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        Ara
                      </a>
                    )}
                    {appt.patient?.id && (
                      <Link href={`/hasta-detay?id=${appt.patient.id}`} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                        Hasta Kartı
                      </Link>
                    )}
                    <Link href="/randevu" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      Randevuya Git
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500">
        Takip kayıtları randevu detay penceresindeki takip durumu ve operasyon notundan beslenir.
        {" "}
        {FOLLOW_UP_OPTIONS.filter((item) => item.needsAction).map((item) => item.label).join(", ")}
        {" "}
        olarak işaretlenen veya durumu Gelmedi olan hastalar burada otomatik listelenir.
      </div>
    </section>
  );
}