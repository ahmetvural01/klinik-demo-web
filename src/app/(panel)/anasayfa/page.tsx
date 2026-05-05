"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type ApptStatus = "BEKLIYOR" | "GELDI" | "IPTAL" | "TAMAMLANDI" | string;
type Appt = { id: string; startAt: string; endAt: string; status: ApptStatus; patient: { fullName: string }; doctor: { fullName: string }; type: string };
type Msg = { id: string; userId: string; text: string; createdAt: string; user: { fullName: string; role: string } };
type Ann = { id: string; text: string; createdAt: string };
type CrossStats = { pendingLabOrders: number; overdueInstallments: number; todayInstallments: number };
type LiveLog = { id: string; createdAt: string; action: string; detail: string; user: { fullName: string; role: string } };
type InstallmentAgendaItem = { id: string; patientName: string; amount: number; dueDate: string; days: number };
type HomeTask = { id: string; title: string; meta?: string; href: string; tone: "red" | "amber" | "blue" | "slate" };
type SummaryItem = { id: string; label: string; value: string; tone: "blue" | "emerald" | "amber" | "red" | "slate"; href: string };

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

const ROLE_LABELS: Record<string, string> = {
  YONETICI: "Yönetici",
  SUPERADMIN: "Superadmin",
  DOKTOR: "Doktor",
  ASISTAN: "Asistan",
  BANKO: "Banko",
  MUHASEBE: "Muhasebe",
};

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

export default function AnasayfaPage() {
  const [crossStats, setCrossStats] = useState<CrossStats>({ pendingLabOrders: 0, overdueInstallments: 0, todayInstallments: 0 });
  const [installmentAgenda, setInstallmentAgenda] = useState<{ overdue: InstallmentAgendaItem[]; upcoming: InstallmentAgendaItem[] }>({ overdue: [], upcoming: [] });
  const [todayCiro, setTodayCiro] = useState(0);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [dateOffset, setDateOffset] = useState(0);
  const [apptLoading, setApptLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [msgText, setMsgText] = useState("");
  const [msgLoading, setMsgLoading] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgText, setEditingMsgText] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [announcements, setAnnouncements] = useState<Ann[]>([]);
  const [annText, setAnnText] = useState("");
  const [annRole, setAnnRole] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [liveLogs, setLiveLogs] = useState<LiveLog[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState("");

  const markMessagesSeen = (list: Msg[]) => {
    if (!Array.isArray(list) || list.length === 0) return;
    const lastCreatedAt = list[list.length - 1]?.createdAt;
    if (!lastCreatedAt) return;
    localStorage.setItem("clinic-messages-last-seen", lastCreatedAt);
    localStorage.setItem("clinic-unread-messages", "0");
    window.dispatchEvent(new Event("clinic-unread-messages-change"));
  };

  const loadMessages = async () => {
    try {
      const res = await fetch("/api/messages");
      if (!res.ok) return;
      const d = await res.json();
      const list = Array.isArray(d) ? d : [];
      setMessages(list);
      markMessagesSeen(list);
      setLastSyncAt(new Date().toISOString());
    } catch {}
  };

  useEffect(() => {
    setHydrated(true);
  }, []);

  const loadRolePanels = async (role: string) => {
    const canSeeRoleCiro = ["YONETICI", "SUPERADMIN", "MUHASEBE"].includes(role || "");
    const canSeeTaksitDash = ["YONETICI", "SUPERADMIN", "MUHASEBE", "BANKO"].includes(role || "");
    const canSeeLabDash = ["YONETICI", "SUPERADMIN", "DOKTOR", "ASISTAN"].includes(role || "");

    if (canSeeRoleCiro) {
      fetch("/api/kasa?date=" + new Date().toISOString().split("T")[0])
        .then(r => r.json())
        .then(d => setTodayCiro(d?.total || 0))
        .catch(() => setTodayCiro(0));
    } else {
      setTodayCiro(0);
    }

    const todayIso = new Date().toISOString().split("T")[0];
    Promise.all([
      canSeeLabDash ? fetch("/api/lab-orders?limit=1000").then(r => r.json()).catch(() => ({ labOrders: [] })) : Promise.resolve({ labOrders: [] }),
      canSeeTaksitDash ? fetch("/api/taksit-plani?limit=1000").then(r => r.json()).catch(() => ({ taksitPlanlari: [] })) : Promise.resolve({ taksitPlanlari: [] }),
    ]).then(([labData, taksitData]) => {
      const labOrders: { status: string }[] = Array.isArray(labData) ? labData : (labData.labOrders || []);
      const pendingLab = labOrders.filter((l: { status: string }) => l.status !== "HASTAYA_TAKILDI" && l.status !== "IPTAL").length;

      const plans: {
        id: string;
        patient?: { fullName?: string | null };
        taksitler?: { id: string; status: string; vadeDate: string; tutar?: number; kalan?: number }[];
      }[] = Array.isArray(taksitData) ? taksitData : (taksitData.taksitPlanlari || []);

      let overdueCount = 0;
      let todayCount = 0;
      plans.forEach((p) => {
        (p.taksitler || []).forEach((t: { status: string; vadeDate: string }) => {
          if (t.status === "GECIKTI") overdueCount++;
          if (t.status === "BEKLIYOR" && t.vadeDate && t.vadeDate.startsWith(todayIso)) todayCount++;
        });
      });
      setCrossStats({ pendingLabOrders: pendingLab, overdueInstallments: overdueCount, todayInstallments: todayCount });

      if (canSeeTaksitDash) {
        const now = new Date();
        const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const overdueItems: InstallmentAgendaItem[] = [];
        const upcomingItems: InstallmentAgendaItem[] = [];

        plans.forEach((plan) => {
          const patientName = (plan.patient?.fullName || "Hasta").trim();
          (plan.taksitler || []).forEach((t) => {
            if (!t.vadeDate) return;
            const due = new Date(t.vadeDate);
            if (Number.isNaN(due.getTime())) return;
            const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
            const diffDays = Math.round((dueStart.getTime() - startToday.getTime()) / (1000 * 60 * 60 * 24));
            const amount = Number(t.kalan ?? t.tutar ?? 0);

            if (t.status === "GECIKTI") {
              overdueItems.push({
                id: t.id,
                patientName,
                amount,
                dueDate: t.vadeDate,
                days: Math.abs(Math.min(diffDays, 0)),
              });
            }

            if (t.status === "BEKLIYOR" && diffDays >= 0 && diffDays <= 7) {
              upcomingItems.push({
                id: t.id,
                patientName,
                amount,
                dueDate: t.vadeDate,
                days: diffDays,
              });
            }
          });
        });

        overdueItems.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        upcomingItems.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

        setInstallmentAgenda({
          overdue: overdueItems.slice(0, 5),
          upcoming: upcomingItems.slice(0, 5),
        });
      } else {
        setInstallmentAgenda({ overdue: [], upcoming: [] });
      }
    });

    if (["YONETICI", "SUPERADMIN"].includes(role || "")) {
      const todayStr = new Date().toISOString().split("T")[0];
      fetch("/api/logs?from=" + todayStr + "&to=" + todayStr + "&limit=10")
        .then(r => r.json())
        .then(d => setLiveLogs(Array.isArray(d) ? d : (d.logs || [])))
        .catch(() => setLiveLogs([]));
    } else {
      setLiveLogs([]);
    }
    setLastSyncAt(new Date().toISOString());
  };

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + dateOffset);
  const dateStr = targetDate.toISOString().split("T")[0];
  const dateLabel = `${DAY_FULL[targetDate.getDay()]}, ${targetDate.getDate()} ${MONTHS[targetDate.getMonth()]} ${targetDate.getFullYear()}`;

  useEffect(() => {
    loadMessages();
    fetch("/api/announcements").then(r => r.json()).then(d => setAnnouncements(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      const preview = typeof window !== "undefined" ? sessionStorage.getItem("dev-preview-role") : null;
      const resolvedRole = preview || d.role || "";
      setAnnRole(resolvedRole);
      setCurrentUserId(d?.id || "");
      void loadRolePanels(resolvedRole);
    }).catch(() => {});

    const onPreview = () => {
      const preview = sessionStorage.getItem("dev-preview-role");
      fetch("/api/auth/me").then(r => r.json()).then(d => {
        const resolvedRole = preview || d.role || "";
        setAnnRole(resolvedRole);
        setCurrentUserId(d?.id || "");
        void loadRolePanels(resolvedRole);
      }).catch(() => {});
    };
    const msgTimer = setInterval(() => {
      void loadMessages();
    }, 15000);
    const panelTimer = setInterval(() => {
      const activeRole = (typeof window !== "undefined" ? sessionStorage.getItem("dev-preview-role") : null) || annRole;
      if (activeRole) void loadRolePanels(activeRole);
    }, 45000);

    window.addEventListener("preview-role-change", onPreview);
    return () => {
      window.removeEventListener("preview-role-change", onPreview);
      clearInterval(msgTimer);
      clearInterval(panelTimer);
    };
  }, [annRole]);

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
      markMessagesSeen([...(messages || []), msg]);
    }
    setMsgLoading(false);
  };

  const beginEditMessage = (msg: Msg) => {
    setEditingMsgId(msg.id);
    setEditingMsgText(msg.text);
  };

  const cancelEditMessage = () => {
    setEditingMsgId(null);
    setEditingMsgText("");
  };

  const saveEditMessage = async () => {
    if (!editingMsgId || !editingMsgText.trim()) return;
    const res = await fetch(`/api/messages/${editingMsgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: editingMsgText }),
    });
    if (!res.ok) return;
    const updated = await res.json();
    setMessages((prev) => prev.map((m) => (m.id === editingMsgId ? updated : m)));
    setEditingMsgId(null);
    setEditingMsgText("");
  };

  const deleteMessage = async (id: string) => {
    const ok = window.confirm("Mesaj silinsin mi?");
    if (!ok) return;
    const res = await fetch(`/api/messages/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (editingMsgId === id) {
      setEditingMsgId(null);
      setEditingMsgText("");
    }
  };

  const insertEmoji = (emoji: string) => {
    setMsgText((prev) => `${prev}${emoji}`);
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

  const todayTotal   = appts.length;
  const todayWaiting = appts.filter(a => a.status === "BEKLIYOR" || a.status === "GELDI").length;
  const todayDone    = appts.filter(a => a.status === "TAMAMLANDI").length;
  const todayCancel  = appts.filter(a => a.status === "IPTAL").length;

  // Rol bazlı içerik kontrolü
  const isYonetici   = annRole === "YONETICI" || annRole === "SUPERADMIN";
  const isDoktorRole = annRole === "DOKTOR";
  const isAsistanRole = annRole === "ASISTAN";
  const isBankoRole  = annRole === "BANKO";
  const isMuhasebeRole = annRole === "MUHASEBE";
  const canSeeCiro   = isYonetici || isMuhasebeRole;
  const hideTaksitAlerts = isDoktorRole || isAsistanRole;             // Taksit uyarıları finans dışında gizli
  const hideLogs     = !isYonetici;                                   // Loglar sadece Yönetici/Superadmin
  const canModerateAllMessages = annRole === "YONETICI" || annRole === "SUPERADMIN";
  const canSeeInternalChat = true;
  const canSeeInstallments = isYonetici || isMuhasebeRole || isBankoRole;
  const canSeeLabTask = isYonetici || isDoktorRole || isAsistanRole;
  const roleLabel = hydrated ? (ROLE_LABELS[annRole] || "Kullanıcı") : "Yükleniyor";
  const lastSyncLabel = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  const homeTasks: HomeTask[] = [];
  if (todayWaiting > 0) {
    homeTasks.push({
      id: "t-randevu",
      title: `${todayWaiting} randevu işlem bekliyor`,
      meta: "Durum güncelleme veya karşılama işlemini tamamlayın",
      href: "/randevu",
      tone: "blue",
    });
  }
  if (canSeeInstallments && installmentAgenda.overdue.length > 0) {
    homeTasks.push({
      id: "t-gecikme",
      title: `${installmentAgenda.overdue.length} gecikmiş taksit var`,
      meta: "Tahsilat planı oluşturun ve müşteri bilgilendirmesini başlatın",
      href: "/muhasebe?tab=taksit",
      tone: "red",
    });
  }
  if (canSeeInstallments && installmentAgenda.upcoming.length > 0) {
    homeTasks.push({
      id: "t-yaklasan",
      title: `${installmentAgenda.upcoming.length} vade 7 gün içinde`,
      meta: "Hatırlatma ve tahsilat hazırlığını tamamlayın",
      href: "/muhasebe?tab=taksit",
      tone: "amber",
    });
  }
  if (canSeeLabTask && crossStats.pendingLabOrders > 0) {
    homeTasks.push({
      id: "t-lab",
      title: `${crossStats.pendingLabOrders} lab siparişi bekliyor`,
      meta: "Laboratuvar sürecini gözden geçirip aksiyon alın",
      href: "/lab",
      tone: "blue",
    });
  }
  if (isYonetici && announcements.length === 0) {
    homeTasks.push({
      id: "t-duyuru",
      title: "Güncel kurum duyurusu eklenmemiş",
      meta: "Ekip bilgilendirmesi için kısa bir duyuru paylaşın",
      href: "/anasayfa",
      tone: "slate",
    });
  }
  const taskToneClass: Record<HomeTask["tone"], string> = {
    red: "border-red-200 bg-red-50 text-red-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  const hasHomeTasks = homeTasks.length > 0;

  const summaryToneClass: Record<SummaryItem["tone"], string> = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };

  const summaryItems: SummaryItem[] = [
    { id: "s-appt-total", label: "Bugünkü Randevu", value: String(todayTotal), tone: "blue", href: "/randevu" },
    { id: "s-appt-pending", label: "İşlem Bekleyen", value: String(todayWaiting), tone: "amber", href: "/randevu" },
  ];
  if (canSeeLabTask) {
    summaryItems.push({ id: "s-lab", label: "Bekleyen Lab", value: String(crossStats.pendingLabOrders), tone: crossStats.pendingLabOrders > 0 ? "blue" : "slate", href: "/lab" });
  }

  return (
    <div className="space-y-5">

      {/* ── HEADER ────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Anasayfa</h1>
          <p className="mt-0.5 text-sm text-slate-500">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">Rol: {roleLabel}</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">Son Senkron: {lastSyncLabel}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryItems.map((item) => (
          <Link key={item.id} href={item.href} className={`rounded-xl border px-4 py-3 transition hover:opacity-90 ${summaryToneClass[item.tone]}`}>
            <p className="text-[11px] font-semibold opacity-80">{item.label}</p>
            <p className="mt-1 text-xl font-black">{item.value}</p>
          </Link>
        ))}
      </div>

      {canSeeCiro && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-5 py-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Bugünkü Ciro</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-2xl font-black text-emerald-800">₺{todayCiro.toLocaleString("tr-TR")}</p>
            <Link href="/muhasebe?tab=gelir" className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Muhasebeye Git</Link>
          </div>
        </div>
      )}

      {/* ── CROSS-MODULE UYARI KARTLARİ ──────── */}
      {crossStats.pendingLabOrders > 0 && (
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
        </div>
      )}

      {canSeeInstallments && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Taksit Takvimi</h2>
              <p className="text-xs text-slate-500">Geciken ve 7 gün içinde vadesi gelecek ödemeler</p>
            </div>
            <Link href="/muhasebe?tab=taksit" className="text-xs font-semibold text-primary hover:underline">Tümüne Git →</Link>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-2">
            <div className="rounded-xl border border-red-100 bg-red-50/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-red-700">Geciken Ödemeler</p>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">{installmentAgenda.overdue.length}</span>
              </div>
              {installmentAgenda.overdue.length === 0 ? (
                <p className="py-1 text-xs text-slate-500">Geciken ödeme bulunmuyor.</p>
              ) : (
                <div className="space-y-2">
                  {installmentAgenda.overdue.map((item) => (
                    <div key={item.id} className="rounded-lg border border-red-100 bg-white px-3 py-2">
                      <p className="text-xs font-semibold text-slate-800">{item.patientName}</p>
                      <p className="text-[11px] text-slate-600">₺{item.amount.toLocaleString("tr-TR")} · {item.days} gün gecikti</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Yaklaşan Vadeler</p>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{installmentAgenda.upcoming.length}</span>
              </div>
              {installmentAgenda.upcoming.length === 0 ? (
                <p className="py-1 text-xs text-slate-500">7 gün içinde vadesi gelen ödeme yok.</p>
              ) : (
                <div className="space-y-2">
                  {installmentAgenda.upcoming.map((item) => (
                    <div key={item.id} className="rounded-lg border border-amber-100 bg-white px-3 py-2">
                      <p className="text-xs font-semibold text-slate-800">{item.patientName}</p>
                      <p className="text-[11px] text-slate-600">₺{item.amount.toLocaleString("tr-TR")} · {item.days === 0 ? "bugün" : `${item.days} gün sonra`}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-800">Randevu Takvimi</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{apptLoading ? "..." : `${todayTotal} randevu`}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />Bekliyor/Geldi: {todayWaiting}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />Tamamlandı: {todayDone}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" />İptal: {todayCancel}</span>
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

          {/* Günün İşleri */}
          {hasHomeTasks && <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-50 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-800">Günün İşleri</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{homeTasks.length}</span>
            </div>
            <div className="space-y-2 p-3">
              {homeTasks.map((task) => (
                <Link key={task.id} href={task.href} className={`block rounded-xl border px-3 py-2 transition hover:opacity-90 ${taskToneClass[task.tone]}`}>
                  <p className="text-xs font-semibold">{task.title}</p>
                  {task.meta && <p className="mt-0.5 text-[11px] opacity-80">{task.meta}</p>}
                </Link>
              ))}
            </div>
          </div>}

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

        </div>
      </div>

      {/* ── BOTTOM ────────────────────────────── */}
      <div className={`grid gap-5 ${canSeeInternalChat && !hideLogs ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
        {/* Chat */}
        {canSeeInternalChat && <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-50 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-800">Klinik İçi Mesajlar</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{messages.length}</span>
          </div>
          <div ref={chatScrollRef} className="max-h-48 flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {messages.length === 0 && <p className="py-4 text-center text-xs text-slate-400">Henüz mesaj yok</p>}
            {messages.map(m => (
              <div key={m.id} className="flex items-start gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">{m.user.fullName.charAt(0)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-slate-600">{m.user.fullName} <span className="font-normal text-slate-400">{new Date(m.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span></p>
                  {editingMsgId === m.id ? (
                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        value={editingMsgText}
                        onChange={(e) => setEditingMsgText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveEditMessage();
                          }
                          if (e.key === "Escape") cancelEditMessage();
                        }}
                        className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-primary focus:outline-none"
                      />
                      <button onClick={saveEditMessage} className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-white">Kaydet</button>
                      <button onClick={cancelEditMessage} className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600">Vazgeç</button>
                    </div>
                  ) : (
                    <p className="text-xs leading-relaxed text-slate-700">{m.text}</p>
                  )}
                </div>

                {(m.userId === currentUserId || canModerateAllMessages) && editingMsgId !== m.id && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => beginEditMessage(m)} className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">Düzenle</button>
                    <button onClick={() => deleteMessage(m.id)} className="rounded-md border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50">Sil</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1 border-t border-slate-100 px-3 py-2">
            {["🙂", "👍", "🙏", "🎯", "✅", "🔥", "📌", "💬"].map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="rounded-md border border-slate-200 px-1.5 py-1 text-sm hover:bg-slate-50"
                title={`Ekle ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="flex gap-2 border-t border-slate-50 p-3">
            <input value={msgText} onChange={e => setMsgText(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())} placeholder="Mesaj yaz… (Enter)" className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-none" />
            <button onClick={sendMessage} disabled={msgLoading} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">Gönder</button>
          </div>
        </div>}

        {/* Loglar */}
        {!hideLogs && <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-50 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-800">Son İşlemler</h3>
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
        </div>}
      </div>
    </div>
  );
}
