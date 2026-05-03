"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type ApptStatus = "BEKLIYOR" | "GELDI" | "IPTAL" | "TAMAMLANDI" | string;
type Appt = { id: string; startAt: string; endAt: string; status: ApptStatus; patient: { fullName: string }; doctor: { fullName: string }; type: string };
type Msg = { id: string; text: string; createdAt: string; user: { fullName: string; role: string } };
type Ann = { id: string; text: string; createdAt: string };
type Stats = { totalAppointments: number; totalExaminations: number; totalPatients: number; totalStaff: number };
type CrossStats = { pendingLabOrders: number; overdueInstallments: number; todayInstallments: number };
type LiveLog = { id: string; createdAt: string; action: string; detail: string; user: { fullName: string; role: string } };

const DAY_NAMES = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

const STATUS_CFG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  BEKLIYOR:   { label: "Bekliyor",   dot: "bg-amber-400",   bg: "bg-amber-50",   text: "text-amber-700" },
  GELDI:      { label: "Geldi",      dot: "bg-emerald-400", bg: "bg-emerald-50", text: "text-emerald-700" },
  IPTAL:      { label: "İptal",      dot: "bg-red-400",     bg: "bg-red-50",     text: "text-red-600" },
  TAMAMLANDI: { label: "Tamamlandı", dot: "bg-blue-400",    bg: "bg-blue-50",    text: "text-blue-700" },
};

const TYPE_CFG: Record<string, { label: string; cls: string }> = {
  STANDART: { label: "Standart", cls: "bg-slate-100 text-slate-600" },
  KONTROL:  { label: "Kontrol",  cls: "bg-violet-100 text-violet-700" },
  ACIL:     { label: "Acil",     cls: "bg-red-100 text-red-700" },
};

const DAY_FULL = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Sisteme Giriş",
  LOGOUT: "Sistemden Çıkış",
  PATIENT_CREATE: "Hasta Kaydı Oluşturma",
  PATIENT_UPDATE: "Hasta Bilgisi Güncelleme",
  PATIENT_DELETE: "Hasta Kaydı Silme",
  APPOINTMENT_CREATE: "Randevu Oluşturma",
  APPOINTMENT_UPDATE: "Randevu Güncelleme",
  APPOINTMENT_STATUS: "Randevu Durumu Güncelleme",
  APPOINTMENT_DELETE: "Randevu Silme",
  EXAM_CREATE: "Muayene Kaydı Oluşturma",
  EXAM_UPDATE: "Muayene Kaydı Güncelleme",
  EXAM_DELETE: "Muayene Kaydı Silme",
  PAYMENT_CREATE: "Ödeme Kaydı Oluşturma",
  PAYMENT_UPDATE: "Ödeme Kaydı Güncelleme",
  PAYMENT_DELETE: "Ödeme Kaydı Silme",
  FIRMA_ISLEM_CREATE: "Firma İşlemi Oluşturma",
  FIRMA_ISLEM_CANCEL: "Firma İşlemi İptali",
  PRICE_CREATE: "Fiyat Oluşturma",
  PRICE_UPDATE: "Fiyat Güncelleme",
  PRICE_DELETE: "Fiyat Silme",
  SETTINGS_UPDATE: "Sistem Ayarı Güncelleme",
  PROFILE_UPDATE: "Profil Güncelleme",
  PASSWORD_CHANGE: "Şifre Değiştirme",
  STAFF_CREATE: "Personel Ekleme",
  STAFF_UPDATE: "Personel Güncelleme",
  STAFF_DEACTIVATE: "Personel Pasife Alma",
  SUPPORT_UPDATE: "Destek Talebi Güncelleme",
  POS_UPDATE: "POS Cihazı Güncelleme",
  SUPERADMIN_UPDATE: "Superadmin Güncelleme",
  SMS_TEMPLATE_UPDATE: "SMS Şablonu Güncelleme",
};

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] || action.replaceAll("_", " ");
}

function getLogSummary(detail: string): string {
  const firstLine = (detail || "").split(/\r?\n/)[0]?.trim();
  return firstLine || "Detay yok";
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export default function AnasayfaPage() {
  const [stats, setStats] = useState<Stats>({ totalAppointments: 0, totalExaminations: 0, totalPatients: 0, totalStaff: 0 });
  const [crossStats, setCrossStats] = useState<CrossStats>({ pendingLabOrders: 0, overdueInstallments: 0, todayInstallments: 0 });
  const [todayCiro, setTodayCiro] = useState(0);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [dateOffset, setDateOffset] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [apptLoading, setApptLoading] = useState(false);
  const [weekData, setWeekData] = useState<{ label: string; count: number }[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [msgText, setMsgText] = useState("");
  const [msgLoading, setMsgLoading] = useState(false);
  const [announcements, setAnnouncements] = useState<Ann[]>([]);
  const [annText, setAnnText] = useState("");
  const [annRole, setAnnRole] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [liveLogs, setLiveLogs] = useState<LiveLog[]>([]);

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + dateOffset);
  const dateStr = targetDate.toISOString().split("T")[0];
  const dateLabel = `${DAY_FULL[targetDate.getDay()]}, ${targetDate.getDate()} ${MONTHS[targetDate.getMonth()]} ${targetDate.getFullYear()}`;

  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(d => setStats({ totalAppointments: d.totalAppointments || 0, totalExaminations: d.totalExaminations || 0, totalPatients: d.totalPatients || 0, totalStaff: d.totalStaff || 0 }))
      .catch(() => {})
      .finally(() => setStatsLoading(false));

    const today = new Date();
    const promises = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      const ds = d.toISOString().split("T")[0];
      const lbl = DAY_NAMES[d.getDay()];
      return fetch("/api/appointments?date=" + ds)
        .then(r => r.json())
        .then(data => ({ label: lbl, count: Array.isArray(data) ? data.length : (data?.appointments?.length || 0) }))
        .catch(() => ({ label: lbl, count: 0 }));
    });
    Promise.all(promises).then(setWeekData);

    fetch("/api/messages").then(r => r.json()).then(d => setMessages(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/announcements").then(r => r.json()).then(d => setAnnouncements(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/auth/me").then(r => r.json()).then(d => setAnnRole(d.role || "")).catch(() => {});

    // Bugünkü kasa cirosu
    fetch("/api/kasa?date=" + new Date().toISOString().split("T")[0])
      .then(r => r.json())
      .then(d => setTodayCiro(d?.total || 0))
      .catch(() => {});

    // Cross-module KPIs
    const todayIso = new Date().toISOString().split("T")[0];
    Promise.all([
      fetch("/api/lab-orders?limit=1000").then(r => r.json()).catch(() => ({ labOrders: [] })),
      fetch("/api/taksit-plani?limit=1000").then(r => r.json()).catch(() => ({ taksitPlanlari: [] })),
    ]).then(([labData, taksitData]) => {
      const labOrders: { status: string }[] = Array.isArray(labData) ? labData : (labData.labOrders || []);
      const pendingLab = labOrders.filter((l: { status: string }) => l.status !== "HASTAYA_TAKILDI" && l.status !== "IPTAL").length;

      const plans: { status: string; taksitler?: { status: string; vadeDate: string }[] }[] = Array.isArray(taksitData) ? taksitData : (taksitData.taksitPlanlari || []);
      let overdueCount = 0;
      let todayCount = 0;
      plans.forEach((p) => {
        (p.taksitler || []).forEach((t: { status: string; vadeDate: string }) => {
          if (t.status === "GECIKTI") overdueCount++;
          if (t.status === "BEKLIYOR" && t.vadeDate && t.vadeDate.startsWith(todayIso)) todayCount++;
        });
      });
      setCrossStats({ pendingLabOrders: pendingLab, overdueInstallments: overdueCount, todayInstallments: todayCount });
    });

      const todayStr = new Date().toISOString().split("T")[0];
      fetch("/api/logs?from=" + todayStr + "&to=" + todayStr + "&limit=10")
        .then(r => r.json())
        .then(d => setLiveLogs(Array.isArray(d) ? d : (d.logs || [])))
        .catch(() => {});
  }, []);

  useEffect(() => {
    setApptLoading(true);
    fetch("/api/appointments?date=" + dateStr)
      .then(r => r.json())
      .then(d => setAppts(Array.isArray(d) ? d : (d.appointments || [])))
      .catch(() => setAppts([]))
      .finally(() => setApptLoading(false));
  }, [dateStr]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    if (!msgText.trim()) return;
    setMsgLoading(true);
    const res = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msgText }) });
    if (res.ok) {
      const msg = await res.json();
      setMessages(prev => [...prev, msg]);
      setMsgText("");
    }
    setMsgLoading(false);
  };

  const addAnn = async () => {
    if (!annText.trim()) return;
    const res = await fetch("/api/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: annText }) });
    if (res.ok) {
      const ann = await res.json();
      setAnnouncements(prev => [ann, ...prev]);
      setAnnText("");
    }
  };

  const deleteAnn = async (id: string) => {
    const res = await fetch("/api/announcements", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) setAnnouncements(prev => prev.filter(a => a.id !== id));
  };

  const maxWeek = Math.max(...weekData.map(d => d.count), 1);

  const todayTotal   = appts.length;
  const todayDone    = appts.filter(a => a.status === "TAMAMLANDI").length;
  const todayWaiting = appts.filter(a => a.status === "BEKLIYOR" || a.status === "GELDI").length;

  return (
    <div className="space-y-5">

      {/* ── HEADER ────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Genel Bakış</h1>
          <p className="mt-0.5 text-sm text-slate-500">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/hasta-ekle" className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Yeni Hasta
          </Link>
          <Link href="/randevu" className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Randevu Ekle
          </Link>
        </div>
      </div>

      {/* ── KPI CARDS ──────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded-2xl grad-blue p-5 text-white shadow-md shadow-blue-200">
          <div className="absolute -right-3 -top-3 h-20 w-20 rounded-full bg-white/10" />
          <p className="text-[11px] font-bold uppercase tracking-widest text-blue-100">Bugün Randevu</p>
          <p className="mt-1 text-4xl font-black tabular-nums">{statsLoading ? "…" : todayTotal}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">{todayDone} bitti</span>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">{todayWaiting} bekliyor</span>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl grad-violet p-5 text-white shadow-md shadow-violet-200">
          <div className="absolute -right-3 -top-3 h-20 w-20 rounded-full bg-white/10" />
          <p className="text-[11px] font-bold uppercase tracking-widest text-violet-100">Toplam Muayene</p>
          <p className="mt-1 text-4xl font-black tabular-nums">{statsLoading ? "…" : stats.totalExaminations}</p>
          <div className="mt-2">
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">{stats.totalPatients} aktif hasta</span>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl grad-green p-5 text-white shadow-md shadow-green-200">
          <div className="absolute -right-3 -top-3 h-20 w-20 rounded-full bg-white/10" />
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-100">Kayıtlı Hasta</p>
          <p className="mt-1 text-4xl font-black tabular-nums">{statsLoading ? "…" : stats.totalPatients}</p>
          <div className="mt-2">
            <Link href="/hasta-ekle" className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold transition hover:bg-white/30">+ Yeni Hasta</Link>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl grad-amber p-5 text-white shadow-md shadow-amber-200">
          <div className="absolute -right-3 -top-3 h-20 w-20 rounded-full bg-white/10" />
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-100">Bugünkü Ciro</p>
          <p className="mt-1 text-4xl font-black tabular-nums">{statsLoading ? "…" : "₺" + todayCiro.toLocaleString("tr-TR")}</p>
          <div className="mt-2">
            <Link href="/kasa" className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold transition hover:bg-white/30">Kasaya Git</Link>
          </div>
        </div>
      </div>

      {/* ── CROSS-MODULE UYARI KARTLARİ ──────── */}
      {(crossStats.pendingLabOrders > 0 || crossStats.overdueInstallments > 0 || crossStats.todayInstallments > 0) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {crossStats.pendingLabOrders > 0 && (
            <Link href="/lab" className="group flex items-center gap-3 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-100">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-600 group-hover:bg-cyan-200">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>
              </div>
              <div>
                <p className="text-xs font-bold text-cyan-700">Bekleyen Lab Siparişi</p>
                <p className="text-xl font-black text-cyan-800">{crossStats.pendingLabOrders}</p>
              </div>
            </Link>
          )}
          {crossStats.overdueInstallments > 0 && (
            <Link href="/taksit" className="group flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-sm transition hover:border-red-300 hover:bg-red-100">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 group-hover:bg-red-200">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div>
                <p className="text-xs font-bold text-red-700">Gecikmiş Taksit</p>
                <p className="text-xl font-black text-red-800">{crossStats.overdueInstallments}</p>
              </div>
            </Link>
          )}
          {crossStats.todayInstallments > 0 && (
            <Link href="/taksit" className="group flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm transition hover:border-amber-300 hover:bg-amber-100">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 group-hover:bg-amber-200">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <div>
                <p className="text-xs font-bold text-amber-700">Bugün Vadesi Gelen Taksit</p>
                <p className="text-xl font-black text-amber-800">{crossStats.todayInstallments}</p>
              </div>
            </Link>
          )}
        </div>
      )}

      <Link href="/hasta-takip" className="group flex items-center justify-between rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 via-white to-orange-50 px-5 py-4 shadow-sm transition hover:border-rose-300 hover:shadow-md">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-500">Operasyon Takibi</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">Hasta Takip Paneli</h2>
          <p className="mt-1 text-sm text-slate-600">Gelmeyen, ulaşılamayan ve geri aranması gereken hastaları ayrı panelden yönetin.</p>
        </div>
        <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition group-hover:bg-rose-100">Panele Git →</span>
      </Link>

      {/* ── MAIN GRID ─────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-3">

        {/* LEFT: Appointments */}
        <div className="xl:col-span-2 space-y-3">
          {/* Tarih nav */}
          <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-5 py-3 shadow-sm">
            <button onClick={() => setDateOffset(d => d - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div className="text-center">
              <p className="text-sm font-bold text-slate-800">{dateLabel}</p>
              {dateOffset === 0 && <span className="text-[11px] font-semibold text-primary">Bugün</span>}
              {dateOffset === 1 && <span className="text-[11px] text-slate-400">Yarın</span>}
              {dateOffset === -1 && <span className="text-[11px] text-slate-400">Dün</span>}
              {Math.abs(dateOffset) > 1 && <span className="text-[11px] text-slate-400">{Math.abs(dateOffset)} gün {dateOffset > 0 ? "sonra" : "önce"}</span>}
            </div>
            <button onClick={() => setDateOffset(d => d + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          {/* Timeline */}
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-50 px-5 py-3">
              <h2 className="text-sm font-bold text-slate-800">Randevu Takvimi</h2>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />Bekliyor</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />Geldi</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />Tamamlandı</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" />İptal</span>
              </div>
            </div>
            {appts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                <svg className="mb-3 h-12 w-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <p className="text-sm text-slate-400">Bu gün için randevu yok</p>
                <Link href="/randevu" className="mt-3 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700">Randevu Ekle</Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {[...appts].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()).map(appt => {
                  const cfg = STATUS_CFG[appt.status] || STATUS_CFG.BEKLIYOR;
                  const tCfg = TYPE_CFG[appt.type] || TYPE_CFG.STANDART;
                  return (
                    <div key={appt.id} className="flex items-center gap-4 px-5 py-3 transition hover:bg-slate-50/80">
                      <div className="w-16 shrink-0 text-center">
                        <p className="text-sm font-bold tabular-nums text-slate-800">
                          {new Date(appt.startAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(appt.endAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className={`h-10 w-1 rounded-full ${cfg.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{appt.patient?.fullName || "—"}</p>
                        <p className="text-[11px] text-slate-400">{appt.doctor?.fullName || "—"}</p>
                      </div>
                      <span className={`hidden shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold sm:inline ${tCfg.cls}`}>{tCfg.label}</span>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="border-t border-slate-50 px-5 py-3 text-right">
              <Link href="/randevu" className="text-xs font-semibold text-primary hover:underline">Tüm Randevulara Git →</Link>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          {/* 7-Gün Chart */}
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-slate-800">7 Günlük Randevu</h3>
            <div className="flex h-20 items-end justify-between gap-1.5">
              {weekData.map((w, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[9px] font-semibold text-slate-400">{w.count || ""}</span>
                  <div className="w-full rounded-t-md bg-primary transition-all duration-500" style={{ height: `${Math.max((w.count / maxWeek) * 64, w.count > 0 ? 6 : 2)}px`, opacity: i === 6 ? 1 : 0.5 }} />
                  <span className={`text-[9px] font-bold ${i === 6 ? "text-primary" : "text-slate-400"}`}>{w.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Duyurular */}
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-50 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-800">Duyurular</h3>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{announcements.length}</span>
            </div>
            <div className="max-h-40 divide-y divide-slate-50 overflow-y-auto">
              {announcements.length === 0 && <p className="py-4 text-center text-xs text-slate-400">Duyuru yok</p>}
              {announcements.map(a => (
                <div key={a.id} className="flex items-start gap-2 px-4 py-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  <p className="flex-1 text-xs leading-relaxed text-slate-700">{a.text}</p>
                  {annRole === "YONETICI" && (
                    <button onClick={() => deleteAnn(a.id)} className="shrink-0 rounded p-0.5 text-slate-300 transition hover:text-red-400">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            {annRole === "YONETICI" && (
              <div className="flex gap-2 border-t border-slate-50 p-3">
                <input value={annText} onChange={e => setAnnText(e.target.value)} onKeyDown={e => e.key === "Enter" && addAnn()} placeholder="Duyuru metni…" className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none" />
                <button onClick={addAnn} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-600">Ekle</button>
              </div>
            )}
          </div>

          {/* Hızlı Erişim */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-800">Hızlı Erişim</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: "/hasta",        label: "Hastalar",     cls: "bg-blue-50 text-blue-700 hover:bg-blue-100",     dot: "bg-blue-400" },
                { href: "/tedavi-plani", label: "Tedavi Planı", cls: "bg-violet-50 text-violet-700 hover:bg-violet-100", dot: "bg-violet-400" },
                { href: "/lab",          label: "Lab Takip",    cls: "bg-teal-50 text-teal-700 hover:bg-teal-100",     dot: "bg-teal-400" },
                { href: "/stok",         label: "Stok",         cls: "bg-amber-50 text-amber-700 hover:bg-amber-100",   dot: "bg-amber-400" },
                { href: "/kasa",         label: "Kasa",         cls: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100", dot: "bg-emerald-400" },
                { href: "/rapor",        label: "Raporlar",     cls: "bg-rose-50 text-rose-700 hover:bg-rose-100",     dot: "bg-rose-400" },
              ].map(l => (
                <Link key={l.href} href={l.href} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${l.cls}`}>
                  <span className={`h-2 w-2 rounded-full ${l.dot}`} />{l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM ────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Chat */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-50 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-800">Klinik İçi Mesajlar</h3>
          </div>
          <div ref={chatScrollRef} className="max-h-48 flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {messages.length === 0 && <p className="py-4 text-center text-xs text-slate-400">Henüz mesaj yok</p>}
            {messages.map(m => (
              <div key={m.id} className="flex items-start gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">{m.user.fullName.charAt(0)}</div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-600">{m.user.fullName} <span className="font-normal text-slate-400">{new Date(m.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span></p>
                  <p className="text-xs leading-relaxed text-slate-700">{m.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t border-slate-50 p-3">
            <input value={msgText} onChange={e => setMsgText(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())} placeholder="Mesaj yaz… (Enter)" className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-none" />
            <button onClick={sendMessage} disabled={msgLoading} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">Gönder</button>
          </div>
        </div>

        {/* Loglar */}
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-50 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-800">Sistem Logları</h3>
            <Link href="/log" className="text-xs font-semibold text-primary hover:underline">Tümünü Gör →</Link>
          </div>
          <div className="max-h-64 divide-y divide-slate-50 overflow-y-auto">
            {liveLogs.length === 0 && <p className="py-4 text-center text-xs text-slate-400">Log kaydı yok</p>}
            {liveLogs.map(l => (
              <div key={l.id} className="flex items-start gap-3 px-4 py-2.5">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-600">{l.user?.fullName?.charAt(0) || "?"}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-700">{getActionLabel(l.action)}</p>
                  <p className="truncate text-[10px] text-slate-400">{getLogSummary(l.detail)}</p>
                </div>
                <p className="shrink-0 text-[10px] tabular-nums text-slate-400">{new Date(l.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
