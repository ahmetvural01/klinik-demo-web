"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, Check, ChevronLeft, ChevronRight, Megaphone, Pencil, Send, Trash2, WalletCards, X } from "lucide-react";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";

const CalendarEmptyIcon = createSceneIllustration("randevu", 160);
import { Button } from "@/components/ui/Button";
import { ModuleIcon, type ModuleKey } from "@/components/ui/ModuleIcon";
import { CountUp } from "@/components/ui/CountUp";
import { StatusFeedback } from "@/components/ui/StatusFeedback";
import { confirmDialog } from "@/lib/confirm-client";
import { cachedGet } from "@/lib/client-cache";
import { showToastSafe } from "@/lib/toast-client";
import { getDisplayAppointmentStatus } from "@/lib/appointment-status";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { usePermissions } from "@/components/auth/PermissionProvider";

type ApptStatus = "BEKLIYOR" | "GELDI" | "IPTAL" | "TAMAMLANDI" | string;
type Appt = { id: string; startAt: string; endAt: string; status: ApptStatus; patient: { fullName: string }; doctor: { fullName: string }; type: string };
type Msg = { id: string; userId: string; text: string; createdAt: string; user: { fullName: string; role: string } };
type Ann = { id: string; text: string; createdAt: string };
type CrossStats = { pendingLabOrders: number; overdueInstallments: number; todayInstallments: number };
type InstallmentAgendaItem = { id: string; patientName: string; amount: number; dueDate: string; days: number };
type HomeTask = {
  id: string;
  title: string;
  meta?: string;
  href: string;
  tone: "red" | "amber" | "blue" | "purple" | "slate";
  module: ModuleKey;
  count: number;
  severity: "Kritik" | "Yüksek" | "Normal";
};
type SummaryItem = { id: string; label: string; value: string; tone: "blue" | "emerald" | "amber" | "red" | "slate"; href: string; module: ModuleKey; countValue?: number; accentOverride?: "amber" };
type StockLite = { id: string; name: string; quantity: number; minQuantity: number };
type SmsLogLite = { id: string; action: string; createdAt: string };

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// GELDI ham durumu artık ekranda "Bekliyor" (hasta geldi, bekleme salonunda)
// olarak gösterilir — bkz. src/lib/appointment-status.ts. Bu obje
// getDisplayAppointmentStatus'un DÖNDÜĞÜ değerlerle (PLANLANDI/BEKLIYOR/
// TAMAMLANDI/GELMEDI/IPTAL) anahtarlanır, ham "GELDI" hiçbir zaman anahtar
// olarak gelmez.
const STATUS_CFG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  PLANLANDI:  { label: "Planlandı",  dot: "bg-sky-400",     bg: "bg-sky-50",     text: "text-sky-700" },
  BEKLIYOR:   { label: "Bekliyor",   dot: "bg-amber-400",   bg: "bg-amber-50",   text: "text-amber-700" },
  TAMAMLANDI: { label: "Tamamlandı", dot: "bg-blue-400",    bg: "bg-blue-50",    text: "text-blue-700" },
  GELMEDI:    { label: "Gelmedi",    dot: "bg-red-400",     bg: "bg-red-50",     text: "text-red-600" },
  IPTAL:      { label: "İptal",      dot: "bg-gray-400",    bg: "bg-gray-50",    text: "text-gray-600" },
};

const TYPE_CFG: Record<string, { label: string; cls: string }> = {
  STANDART: { label: "Standart", cls: "bg-slate-100 text-slate-600" },
  KONTROL:  { label: "Kontrol",  cls: "bg-violet-100 text-violet-700" },
  ACIL:     { label: "Acil",     cls: "bg-red-100 text-red-700" },
};

const DAY_FULL = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];

const ROLE_LABELS: Record<string, string> = {
  YONETICI: "Yönetici",
  DOKTOR: "Doktor",
  ASISTAN: "Asistan",
  BANKO: "Banko",
  MUHASEBE: "Muhasebe",
};

const HOME_CACHE_KEY = "anasayfa:home:v1";

function getHomeCacheKey() {
  if (typeof window === "undefined") return HOME_CACHE_KEY;
  const preview = sessionStorage.getItem("dev-preview-role");
  if (preview) return `${HOME_CACHE_KEY}:${preview}`;
  const raw = sessionStorage.getItem("auth:me:v1");
  if (!raw) return HOME_CACHE_KEY;
  try {
    const cached = JSON.parse(raw) as { id?: string; role?: string };
    return `${HOME_CACHE_KEY}:${cached.id || ""}:${cached.role || ""}`;
  } catch {
    return HOME_CACHE_KEY;
  }
}

function readHomeCache() {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = sessionStorage.getItem(getHomeCacheKey());
  if (!raw) return null;
  try {
    const cached = JSON.parse(raw) as {
      crossStats?: CrossStats;
      installmentAgenda?: { overdue?: InstallmentAgendaItem[]; upcoming?: InstallmentAgendaItem[] };
      todayCiro?: number;
      appts?: Appt[];
      messages?: Msg[];
      announcements?: Ann[];
      role?: string;
      currentUserId?: string;
      criticalStockCount?: number;
      failedSmsCount?: number;
      lastSyncAt?: string;
      dateOffset?: number;
    };

    return {
      crossStats: cached.crossStats || { pendingLabOrders: 0, overdueInstallments: 0, todayInstallments: 0 },
      installmentAgenda: {
        overdue: Array.isArray(cached.installmentAgenda?.overdue) ? cached.installmentAgenda!.overdue! : [],
        upcoming: Array.isArray(cached.installmentAgenda?.upcoming) ? cached.installmentAgenda!.upcoming! : [],
      },
      todayCiro: Number(cached.todayCiro || 0),
      appts: Array.isArray(cached.appts) ? cached.appts : [],
      messages: Array.isArray(cached.messages) ? cached.messages : [],
      announcements: Array.isArray(cached.announcements) ? cached.announcements : [],
      role: cached.role || "",
      currentUserId: cached.currentUserId || "",
      criticalStockCount: Number(cached.criticalStockCount || 0),
      failedSmsCount: Number(cached.failedSmsCount || 0),
      lastSyncAt: cached.lastSyncAt || "",
      dateOffset: Number(cached.dateOffset || 0),
    };
  } catch {
    return null;
  }
}

export default function AnasayfaPage() {
  const { can } = usePermissions();
  const [crossStats, setCrossStats] = useState<CrossStats>({ pendingLabOrders: 0, overdueInstallments: 0, todayInstallments: 0 });
  const [installmentAgenda, setInstallmentAgenda] = useState<{ overdue: InstallmentAgendaItem[]; upcoming: InstallmentAgendaItem[] }>({ overdue: [], upcoming: [] });
  const [todayCiro, setTodayCiro] = useState(0);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [dateOffset, setDateOffset] = useState(0);
  const [apptLoading, setApptLoading] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [msgLoading, setMsgLoading] = useState(false);
  const [annSaving, setAnnSaving] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgText, setEditingMsgText] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [announcements, setAnnouncements] = useState<Ann[]>([]);
  const [announcementsLoaded, setAnnouncementsLoaded] = useState(false);
  const [annText, setAnnText] = useState("");
  const [annRole, setAnnRole] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [rolePanelsLoaded, setRolePanelsLoaded] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const rolePanelsLoadingRef = useRef(false);
  const messagesLoadingRef = useRef(false);
  const baseRoleRef = useRef("");
  const annRoleRef = useRef("");
  const [criticalStockCount, setCriticalStockCount] = useState(0);
  const [failedSmsCount, setFailedSmsCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [rolePanelError, setRolePanelError] = useState("");
  const [appointmentError, setAppointmentError] = useState("");
  const [appointmentReloadKey, setAppointmentReloadKey] = useState(0);

  useLayoutEffect(() => {
    const cachedHome = readHomeCache();
    if (!cachedHome) return;
    setCrossStats(cachedHome.crossStats);
    setInstallmentAgenda(cachedHome.installmentAgenda);
    setTodayCiro(cachedHome.todayCiro);
    setAppts(cachedHome.appts);
    setApptLoading(false);
    setDateOffset(cachedHome.dateOffset);
    setMessages(cachedHome.messages);
    setMessagesLoaded(true);
    setCurrentUserId(cachedHome.currentUserId);
    setAnnouncements(cachedHome.announcements);
    setAnnouncementsLoaded(true);
    setAnnRole(cachedHome.role);
    setHydrated(Boolean(cachedHome.role));
    setCriticalStockCount(cachedHome.criticalStockCount);
    setFailedSmsCount(cachedHome.failedSmsCount);
    setLastSyncAt(cachedHome.lastSyncAt);
    setRolePanelsLoaded(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(getHomeCacheKey(), JSON.stringify({
          crossStats,
          installmentAgenda,
          todayCiro,
          appts,
          dateOffset,
          messages,
          currentUserId,
          announcements,
          role: annRole,
          criticalStockCount,
          failedSmsCount,
          lastSyncAt,
        }));
      } catch {}
    }, 120);

    return () => window.clearTimeout(timer);
  }, [crossStats, installmentAgenda, todayCiro, appts, dateOffset, messages, currentUserId, announcements, annRole, criticalStockCount, failedSmsCount, lastSyncAt]);

  const markMessagesSeen = (list: Msg[]) => {
    if (!Array.isArray(list) || list.length === 0) return;
    const lastCreatedAt = list[list.length - 1]?.createdAt;
    if (!lastCreatedAt) return;
    localStorage.setItem("clinic-messages-last-seen", lastCreatedAt);
    localStorage.setItem("clinic-unread-messages", "0");
    window.dispatchEvent(new Event("clinic-unread-messages-change"));
  };

  const loadMessages = async () => {
    if (!can("messages:read")) { setMessages([]); setMessagesLoaded(true); return; }
    if (messagesLoadingRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    messagesLoadingRef.current = true;
    try {
      const res = await fetch("/api/messages");
      if (!res.ok) { setMessagesLoaded(true); return; }
      const d = await res.json();
      const list = Array.isArray(d) ? d : [];
      setMessages(list);
      setMessagesLoaded(true);
      markMessagesSeen(list);
      setLastSyncAt(new Date().toISOString());
    } catch {
      setMessagesLoaded(true);
    }
    finally {
      messagesLoadingRef.current = false;
    }
  };

  useEffect(() => {
    setHydrated(true);
  }, []);

  const loadRolePanels = async (role: string) => {
    if (!role) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (rolePanelsLoadingRef.current) return;
    rolePanelsLoadingRef.current = true;

    try {
      let failedPanelCount = 0;
      const readPanel = async <T,>(url: string, fallback: T): Promise<T> => {
        try {
          const response = await fetch(url);
          const payload = await response.json().catch(() => null);
          if (!response.ok) throw new Error();
          return (payload ?? fallback) as T;
        } catch {
          failedPanelCount += 1;
          return fallback;
        }
      };
      const canSeeRoleCiro = can("finance:read");
      const canSeeTaksitDash = can("installments:read");
      const canSeeLabDash = can("lab:read");
      const canSeeStockDash = can("stock:read");
      const canSeeAuditDash = can("audit:read");

      setTodayCiro(0);

      // toISOString() (UTC) yerine yerel tarih bileşenleri kullanılır — aksi
      // halde gece 00:00-03:00 Türkiye saatinde "bugünün taksiti" dünün
      // tarihiyle karşılaştırılıp kaçırılırdı (bkz. denetim raporu, aşağıdaki
      // dateStr ile aynı düzeltme).
      const todayNow = new Date();
      const todayIso = `${todayNow.getFullYear()}-${String(todayNow.getMonth() + 1).padStart(2, "0")}-${String(todayNow.getDate()).padStart(2, "0")}`;
      const [labData, taksitData, stockData, smsLogData] = await Promise.all([
        canSeeLabDash ? readPanel("/api/lab-orders?limit=300", { labOrders: [] }) : Promise.resolve({ labOrders: [] }),
        canSeeTaksitDash ? readPanel("/api/taksit-plani?limit=400", { taksitPlanlari: [] }) : Promise.resolve({ taksitPlanlari: [] }),
        canSeeStockDash ? readPanel("/api/stock", []) : Promise.resolve([]),
        canSeeAuditDash ? readPanel("/api/logs?q=SMS_&limit=50", { logs: [] }) : Promise.resolve({ logs: [] }),
      ]);
      setRolePanelError(failedPanelCount > 0 ? "Bazı güncel özet verileri alınamadı; son başarılı veriler gösteriliyor." : "");

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

      const stockItems: StockLite[] = Array.isArray(stockData) ? stockData : [];
      setCriticalStockCount(
        canSeeStockDash
          ? stockItems.filter((item) => Number(item.quantity || 0) <= Number(item.minQuantity || 0)).length
          : 0
      );

      const smsLogs: SmsLogLite[] = Array.isArray(smsLogData?.logs) ? smsLogData.logs : [];
      setFailedSmsCount(canSeeAuditDash ? smsLogs.filter((log) => log.action.endsWith("_FAILED")).length : 0);

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

      setLastSyncAt(new Date().toISOString());
    } finally {
      rolePanelsLoadingRef.current = false;
      setRolePanelsLoaded(true);
    }
  };

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + dateOffset);
  // Yerel (tarayıcı/Türkiye) tarih bileşenlerinden üretilir — toISOString() (UTC) kullanılırsa
  // gece 00:00-03:00 arası dateStr "dün" olurken dateLabel "bugün" yazmaya devam eder ve
  // randevu listesi yanlış günü gösterir.
  const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;
  const dateLabel = `${DAY_FULL[targetDate.getDay()]}, ${targetDate.getDate()} ${MONTHS[targetDate.getMonth()]} ${targetDate.getFullYear()}`;

  useEffect(() => {
    annRoleRef.current = annRole;
  }, [annRole]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void loadMessages();
    if (can("announcements:read")) {
      fetch("/api/announcements").then(r => (r.ok ? r.json() : [])).then(d => { setAnnouncements(Array.isArray(d) ? d : []); setAnnouncementsLoaded(true); }).catch(() => setAnnouncementsLoaded(true));
    } else {
      setAnnouncements([]);
      setAnnouncementsLoaded(true);
    }
    cachedGet<{ role?: string; id?: string }>("/api/auth/me", 60_000).then(d => {
      baseRoleRef.current = d?.role || "";
      const preview = typeof window !== "undefined" ? sessionStorage.getItem("dev-preview-role") : null;
      const resolvedRole = preview || baseRoleRef.current;
      setAnnRole(resolvedRole);
      setCurrentUserId(d?.id || "");
      void loadRolePanels(resolvedRole);
    }).catch(() => {});

    const onPreview = () => {
      const preview = sessionStorage.getItem("dev-preview-role");
      const resolvedRole = preview || baseRoleRef.current;
      setAnnRole(resolvedRole);
      void loadRolePanels(resolvedRole);
    };

    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        void loadMessages();
        if (annRoleRef.current) void loadRolePanels(annRoleRef.current);
      }
    };

    // Sekme arka plandayken bu iki zamanlayıcı da çalışmaya devam edip
    // gereksiz istek atıyordu (bkz. denetim raporu) — visibilitychange zaten
    // sekme tekrar görünür olunca ayrıca yeniliyor (yukarıda onVisibility).
    const msgTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadMessages();
    }, 30000);
    const panelTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      const activeRole = (typeof window !== "undefined" ? sessionStorage.getItem("dev-preview-role") : null) || annRoleRef.current;
      if (activeRole) void loadRolePanels(activeRole);
    }, 120000);

    window.addEventListener("preview-role-change", onPreview);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("preview-role-change", onPreview);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(msgTimer);
      clearInterval(panelTimer);
    };
  }, []);

  useEffect(() => {
    if (!can("appointments:read")) {
      setAppts([]);
      setApptLoading(false);
      setAppointmentError("");
      return;
    }
    setApptLoading(true);
    const controller = new AbortController();
    fetch("/api/appointments?date=" + dateStr, { signal: controller.signal })
      .then(async (r) => {
        const payload = await r.json().catch(() => null);
        if (!r.ok) throw new Error(payload?.message || "Randevular yüklenemedi");
        return payload;
      })
      .then(d => {
        setAppts(Array.isArray(d) ? d : (d.appointments || []));
        setAppointmentError("");
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setAppointmentError(e instanceof Error ? e.message : "Randevular yüklenemedi");
      })
      .finally(() => setApptLoading(false));
    return () => controller.abort();
  }, [dateStr, appointmentReloadKey]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void loadMessages();
        if (annRoleRef.current) void loadRolePanels(annRoleRef.current);

        if (can("appointments:read")) fetch("/api/appointments?date=" + dateStr)
          .then(async (r) => {
            if (!r.ok) return; // geçici hata — ekrandaki mevcut randevu listesi olduğu gibi kalsın, yanlışlıkla boşaltılmasın
            const d = await r.json().catch(() => null);
            if (d) setAppts(Array.isArray(d) ? d : (d.appointments || []));
          })
          .catch(() => {});
      }, 350);
    };

    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
    };
  }, [dateStr]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    if (!msgText.trim() || msgLoading) return;
    setMsgLoading(true);
    try {
      const res = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msgText }) });
      if (!res.ok) {
        showToastSafe({ title: "Hata", message: "Mesaj gönderilemedi", type: "error" });
        return;
      }
      const msg = await res.json();
      setMessages(prev => [...prev, msg]);
      setMsgText("");
      markMessagesSeen([...(messages || []), msg]);
    } catch {
      showToastSafe({ title: "Hata", message: "Bağlantı hatası — mesaj gönderilemedi.", type: "error" });
    } finally {
      setMsgLoading(false);
    }
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
    try {
      const res = await fetch(`/api/messages/${editingMsgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editingMsgText }),
      });
      if (!res.ok) {
        showToastSafe({ title: "Hata", message: "Mesaj güncellenemedi", type: "error" });
        return;
      }
      const updated = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === editingMsgId ? updated : m)));
      setEditingMsgId(null);
      setEditingMsgText("");
    } catch {
      showToastSafe({ title: "Hata", message: "Bağlantı hatası — mesaj güncellenemedi.", type: "error" });
    }
  };

  const deleteMessage = async (id: string) => {
    const ok = await confirmDialog({ message: "Mesaj silinsin mi?", danger: true, confirmText: "Sil" });
    if (!ok) return;
    try {
      const res = await fetch(`/api/messages/${id}`, { method: "DELETE" });
      if (!res.ok) {
        showToastSafe({ title: "Hata", message: "Mesaj silinemedi", type: "error" });
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== id));
      if (editingMsgId === id) {
        setEditingMsgId(null);
        setEditingMsgText("");
      }
    } catch {
      showToastSafe({ title: "Hata", message: "Bağlantı hatası — mesaj silinemedi.", type: "error" });
    }
  };

  const addAnn = async () => {
    if (!annText.trim() || annSaving) return;
    setAnnSaving(true);
    try {
      const res = await fetch("/api/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: annText }) });
      if (!res.ok) {
        showToastSafe({ title: "Hata", message: "Duyuru eklenemedi", type: "error" });
        return;
      }
      const ann = await res.json();
      setAnnouncements(prev => [ann, ...prev]);
      setAnnText("");
    } catch {
      showToastSafe({ title: "Hata", message: "Bağlantı hatası — duyuru eklenemedi.", type: "error" });
    } finally {
      setAnnSaving(false);
    }
  };

  const deleteAnn = async (id: string) => {
    const ok = await confirmDialog({ message: "Duyuru silinsin mi?", danger: true, confirmText: "Sil" });
    if (!ok) return;
    try {
      const res = await fetch("/api/announcements", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) {
        showToastSafe({ title: "Hata", message: "Duyuru silinemedi", type: "error" });
        return;
      }
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch {
      showToastSafe({ title: "Hata", message: "Bağlantı hatası — duyuru silinemedi.", type: "error" });
    }
  };

  const todayTotal   = appts.length;
  const todayWaiting = appts.filter(a => a.status === "BEKLIYOR" || a.status === "GELDI").length;
  const todayDone    = appts.filter(a => a.status === "TAMAMLANDI").length;
  const todayCancel  = appts.filter(a => a.status === "IPTAL").length;

  // Rol bazlı içerik kontrolü
  const canSeeAppointments = can("appointments:read");
  const canSeeCiro   = can("finance:read");
  const canModerateAllMessages = can("messages:write");
  const canSeeInternalChat = can("messages:read");
  const canWriteInternalChat = can("messages:write");
  const canSeeAnnouncements = can("announcements:read");
  const canWriteAnnouncements = can("announcements:write");
  const canSeeInstallments = can("installments:read");
  const canSeeLabTask = can("lab:read");
  const canSeeStockTask = can("stock:read");
  const roleLabel = ROLE_LABELS[annRole] || "Kullanıcı";
  const lastSyncLabel = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  const homeTasks: HomeTask[] = [];
  if (canSeeAppointments && todayWaiting > 0) {
    homeTasks.push({
      id: "t-randevu",
      title: `${todayWaiting} randevu işlem bekliyor`,
      meta: "Durum güncelleme veya karşılama işlemini tamamlayın",
      href: "/randevu",
      tone: "blue",
      module: "calendar",
      count: todayWaiting,
      severity: "Normal",
    });
  }
  // Gecikmiş/yaklaşan taksit sayıları burada ayrıca özetlenmiyor — aynı bilgi
  // birkaç satır aşağıdaki "Taksit Takvimi" widget'ında zaten tam listeyle
  // gösteriliyor, iki yerde aynı sayıyı tekrarlamak kafa karıştırıyordu.
  if (canSeeLabTask && crossStats.pendingLabOrders > 0) {
    homeTasks.push({
      id: "t-lab",
      title: `${crossStats.pendingLabOrders} lab siparişi bekliyor`,
      meta: "Laboratuvar sürecini gözden geçirip aksiyon alın",
      href: "/lab",
      tone: "purple",
      module: "flask",
      count: crossStats.pendingLabOrders,
      severity: crossStats.pendingLabOrders > 2 ? "Yüksek" : "Normal",
    });
  }
  if (canSeeStockTask && criticalStockCount > 0) {
    homeTasks.push({
      id: "t-stok",
      title: `${criticalStockCount} stok kalemi kritik seviyede`,
      meta: "Satın alma veya stok kontrolü başlatın",
      href: "/stok",
      tone: "red",
      module: "box",
      count: criticalStockCount,
      severity: "Kritik",
    });
  }
  if (can("audit:read") && can("sms:read") && failedSmsCount > 0) {
    homeTasks.push({
      id: "t-sms",
      title: `${failedSmsCount} başarısız SMS kaydı var`,
      meta: "SMS sağlayıcı veya alıcı bilgilerini kontrol edin",
      href: "/sms",
      tone: "amber",
      module: "sms",
      count: failedSmsCount,
      severity: failedSmsCount > 2 ? "Yüksek" : "Normal",
    });
  }
  // Duyuru eksikliği günlük aksiyon değildir; anasayfayı gereksiz kalabalıklaştırmasın.
  const taskToneClass: Record<HomeTask["tone"], { card: string; badge: string; severity: string }> = {
    red: {
      card: "border-red-200 bg-red-50/80 text-red-700 hover:border-red-300 hover:bg-red-50",
      badge: "bg-red-600 text-white",
      severity: "bg-red-100 text-red-700",
    },
    amber: {
      card: "border-amber-200 bg-amber-50/80 text-amber-700 hover:border-amber-300 hover:bg-amber-50",
      badge: "bg-amber-500 text-white",
      severity: "bg-amber-100 text-amber-700",
    },
    blue: {
      card: "border-primary/20 bg-primary/5 text-primary hover:border-primary/30 hover:bg-primary/10",
      badge: "bg-primary text-white",
      severity: "bg-primary/10 text-primary",
    },
    purple: {
      card: "border-violet-200 bg-violet-50/80 text-violet-700 hover:border-violet-300 hover:bg-violet-50",
      badge: "bg-violet-600 text-white",
      severity: "bg-violet-100 text-violet-700",
    },
    slate: {
      card: "border-slate-200 bg-slate-50 text-slate-700",
      badge: "bg-slate-600 text-white",
      severity: "bg-slate-100 text-slate-600",
    },
  };
  const hasHomeTasks = homeTasks.length > 0;

  const summaryValueClass: Record<SummaryItem["tone"], string> = {
    blue: "text-primary",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
    slate: "text-slate-800",
  };

  // "Bekleyen Lab" burada ayrıca bir sayaç olarak durmuyor — aynı sayı zaten
  // "Bugün Dikkat Gerekenler" görev listesinde ve sidebar rozetinde var,
  // üçüncü bir tekrar gereksizdi.
  const summaryItems: SummaryItem[] = [
    ...(canSeeAppointments ? [
      { id: "s-appt-total", label: "Bugünkü Randevu", value: String(todayTotal), tone: "blue" as const, href: "/randevu", module: "calendar" as ModuleKey, countValue: todayTotal },
      { id: "s-appt-pending", label: "İşlem Bekleyen", value: String(todayWaiting), tone: "amber" as const, href: "/randevu", module: "calendar" as ModuleKey, countValue: todayWaiting, accentOverride: "amber" as const },
    ] : []),
    ...(canSeeCiro ? [{ id: "s-today-revenue", label: "Bugün Ciro", value: `₺${todayCiro.toLocaleString("tr-TR")}`, tone: "emerald" as const, href: "/muhasebe", module: "finance" as ModuleKey }] : []),
    { id: "s-open-alerts", label: "Açık Uyarılar", value: String(homeTasks.length), tone: "red", href: "#dikkat-gerekenler", module: "clipboard", countValue: homeTasks.length },
  ];

  return (
    <div className="ui-dashboard-vivid space-y-4 pb-2">

      {/* ── HEADER ────────────────────────────── */}
      <div className="ui-dashboard-hero ui-surface overflow-hidden px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="ui-dashboard-hero-eyebrow text-[11px] font-extrabold uppercase tracking-[0.18em]">Klinik Yönetim Paneli</p>
            <h1 className="ui-dashboard-hero-title font-display text-2xl font-extrabold tracking-tight">Günlük görünüm</h1>
            <p className="ui-dashboard-hero-date mt-1 text-sm">{dateLabel}</p>
          </div>
          <p className="ui-dashboard-hero-meta pb-0.5 text-xs font-semibold"><span className="ui-dashboard-live-dot" aria-hidden="true" />{roleLabel}{lastSyncAt ? ` · Güncellendi ${lastSyncLabel}` : ""}</p>
        </div>
      </div>

      {(rolePanelError || appointmentError) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span>{appointmentError || rolePanelError}</span>
          <button
            type="button"
            onClick={() => {
              if (appointmentError) setAppointmentReloadKey((value) => value + 1);
              if (annRole) void loadRolePanels(annRole);
            }}
            className="font-bold text-amber-900 underline underline-offset-2"
          >
            Yeniden dene
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryItems.map((item, idx) => (
          <Link
            key={item.id}
            href={item.href}
            style={{ ["--row-delay" as string]: `${idx * 60}ms` }}
            data-tone={item.tone}
            className="ui-dashboard-kpi ui-interactive ui-kpi-in group relative min-w-[150px] overflow-hidden rounded-2xl border px-5 py-4 shadow-sm"
          >
            <div className="relative flex items-start justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
              <ModuleIcon module={item.module} accentOverride={item.accentOverride} size="sm" />
            </div>
            <p className={`relative mt-1 text-[2.25rem] font-extrabold leading-none ${summaryValueClass[item.tone]}`}>
              {item.countValue === undefined ? item.value : <CountUp value={item.countValue} />}
            </p>
            <span className="ui-dashboard-kpi-caption">Detayları görüntüle <ArrowUpRight className="h-3 w-3" /></span>
          </Link>
        ))}
      </div>

      {canSeeInstallments && (installmentAgenda.overdue.length > 0 || installmentAgenda.upcoming.length > 0) && (
        <div className={installmentAgenda.overdue.length > 0 ? "ui-surface-critical" : "ui-surface-warning"}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-100/80 px-5 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
                <WalletCards className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-extrabold text-slate-800">Taksit Takvimi</h2>
                <p className="truncate text-xs text-slate-500">Geciken ve 7 gün içinde vadesi gelecek ödemeler</p>
              </div>
            </div>
            <Link href="/muhasebe?tab=taksit" className="text-xs font-semibold text-primary hover:underline">Tümüne Git →</Link>
          </div>

          <div className="space-y-2 p-3">
            {installmentAgenda.overdue.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Gecikmiş</p>
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">{installmentAgenda.overdue.length}</span>
                </div>
                {installmentAgenda.overdue.map((item, idx) => (
                  <Link
                    key={item.id}
                    href="/muhasebe?tab=taksit"
                    style={{ ["--row-delay" as string]: `${idx * 35}ms` }}
                    className="ui-row-in ui-pressable group flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2.5 text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 focus-visible:ring-offset-2"
                  >
                    <ModuleIcon module="finance" size="sm" className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-extrabold text-slate-800">{item.patientName}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-slate-600">₺{item.amount.toLocaleString("tr-TR")} · {item.days} gün gecikti</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold text-white">Gecikti</span>
                    <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-red-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                ))}
              </>
            )}
            {installmentAgenda.upcoming.length > 0 && (
              <>
                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Yaklaşan</p>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">{installmentAgenda.upcoming.length}</span>
                </div>
                {installmentAgenda.upcoming.map((item, idx) => (
                  <Link
                    key={item.id}
                    href="/muhasebe?tab=taksit"
                    style={{ ["--row-delay" as string]: `${idx * 35}ms` }}
                    className="ui-row-in ui-pressable group flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-amber-700 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2"
                  >
                    <ModuleIcon module="finance" size="sm" className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-extrabold text-slate-800">{item.patientName}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-slate-600">₺{item.amount.toLocaleString("tr-TR")} · {item.days === 0 ? "bugün" : `${item.days} gün sonra`}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold text-white">{item.days === 0 ? "Bugün" : "Yakın"}</span>
                    <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-amber-500 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── MAIN GRID ─────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-3">

        {/* LEFT: Appointments */}
        {canSeeAppointments && <div className="xl:col-span-2 space-y-3">
          {/* Tarih nav */}
          <div className="ui-surface flex items-center justify-between px-5 py-3">
            <button aria-label="Önceki gün" onClick={() => setDateOffset(d => d - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <p className="text-sm font-bold text-slate-800">{dateLabel}</p>
              {dateOffset === 0 && <span className="text-[11px] font-semibold text-primary">Bugün</span>}
              {dateOffset === 1 && <span className="text-[11px] text-slate-400">Yarın</span>}
              {dateOffset === -1 && <span className="text-[11px] text-slate-400">Dün</span>}
              {Math.abs(dateOffset) > 1 && <span className="text-[11px] text-slate-400">{Math.abs(dateOffset)} gün {dateOffset > 0 ? "sonra" : "önce"}</span>}
            </div>
            <button aria-label="Sonraki gün" onClick={() => setDateOffset(d => d + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Timeline */}
          <div className="ui-dashboard-panel ui-surface overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-800">Randevu Takvimi</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{apptLoading ? "..." : `${todayTotal} randevu`}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />Bekliyor/Geldi: {todayWaiting}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />Tamamlandı: {todayDone}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" />İptal: {todayCancel}</span>
              </div>
            </div>
            {apptLoading && appts.length === 0 ? (
              <ListRowSkeleton rows={4} />
            ) : appts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CalendarEmptyIcon className="ui-empty-illustration mb-3" />
                <p className="text-sm font-bold text-slate-800">Bu gün için randevu yok</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Takvim boş — yeni bir randevu ekleyerek günü planlamaya başlayın.</p>
                <Button href="/randevu" size="sm" icon={CalendarClock} className="mt-4">Randevu Ekle</Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {[...appts].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()).map(appt => {
                  const cfg = STATUS_CFG[getDisplayAppointmentStatus(appt.status, appt.startAt)] || STATUS_CFG.BEKLIYOR;
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
        </div>}

        {/* RIGHT: Aksiyon Merkezi */}
        <div id="dikkat-gerekenler" className={`ui-dashboard-panel ui-surface overflow-hidden ${canSeeAppointments ? "" : "xl:col-span-3"}`}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
                <CalendarClock className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-extrabold text-slate-800">Bugün Dikkat Gerekenler</h3>
                <p className="truncate text-[11px] font-medium text-slate-500">Operasyonel takip ve hızlı aksiyonlar</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-700">{homeTasks.length}</span>
          </div>

          {!rolePanelsLoaded ? (
            <div className="space-y-2.5 p-3">
              <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
            </div>
          ) : hasHomeTasks ? (
            <div className="space-y-2.5 p-3">
              {homeTasks.map((task, idx) => {
                const tone = taskToneClass[task.tone];
                return (
                  <Link
                    key={task.id}
                    href={task.href}
                    style={{ ["--row-delay" as string]: `${idx * 45}ms` }}
                    className={`ui-row-in ui-pressable group/task flex min-h-[72px] items-start gap-3 rounded-lg border p-3 shadow-[0_1px_2px_rgb(15_23_42/0.03)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 ${tone.card}`}
                  >
                    <ModuleIcon module={task.module} size="md" className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="min-w-0 flex-1 truncate text-xs font-extrabold text-slate-800">{task.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold leading-4 ${tone.badge}`}>{task.count}</span>
                      </div>
                      {task.meta && <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-4 text-slate-600">{task.meta}</p>}
                      <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.severity}`}>{task.severity}</span>
                    </div>
                    <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 opacity-70 transition-transform duration-150 group-hover/task:translate-x-0.5 group-hover/task:-translate-y-0.5 group-hover/task:opacity-100" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mx-3 my-3 flex min-h-[76px] items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50/65 px-3 py-3">
              <StatusFeedback type="success" size={22} />
              <div>
                <p className="text-xs font-extrabold text-emerald-800">Bugün bekleyen işlem yok</p>
                <p className="mt-0.5 text-[11px] font-medium text-emerald-700/80">Kritik operasyon kuyruğu temiz görünüyor.</p>
              </div>
            </div>
          )}

          {canSeeAnnouncements && <><div className="mt-1 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                  <Megaphone className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-extrabold uppercase tracking-wide text-slate-600">Duyurular</p>
                  <p className="truncate text-[10px] font-medium text-slate-400">Klinik içi bilgilendirmeler</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {announcements.length > 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">Yeni</span>}
                <Link href="#anasayfa-duyurular" className="text-[11px] font-bold text-slate-500 hover:text-primary">Tümünü Gör</Link>
              </div>
            </div>
          </div>
          <div id="anasayfa-duyurular" className="max-h-48 scroll-mt-24 space-y-2 overflow-y-auto px-3 py-3">
            {!announcementsLoaded ? (
              <div className="space-y-2">
                <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
              </div>
            ) : announcements.length === 0 && (
              <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-slate-200 bg-white py-6 text-center">
                <ModuleIcon module="log" size="sm" />
                <p className="text-xs font-semibold text-slate-500">Henüz duyuru yok</p>
              </div>
            )}
            {announcements.map((a, idx) => (
              <div
                key={a.id}
                style={{ ["--row-delay" as string]: `${idx * 35}ms` }}
                className="ui-announcement-item ui-row-in flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgb(15_23_42/0.03)]"
              >
                <span className="ui-announcement-mark mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600">
                  <Megaphone className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="min-w-0 flex-1 truncate text-xs font-extrabold text-slate-800">
                      {a.text.split(":")[0] || "Klinik duyurusu"}
                    </p>
                    <span className="shrink-0 text-[10px] font-semibold text-slate-400">
                      {new Date(a.createdAt).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-600">{a.text}</p>
                </div>
                {canWriteAnnouncements && (
                  <button type="button" onClick={() => deleteAnn(a.id)} aria-label="Duyuruyu sil" className="shrink-0 rounded-md p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {canWriteAnnouncements && (
            <div className="flex gap-2 border-t border-slate-50 p-3">
              <input value={annText} onChange={e => setAnnText(e.target.value)} onKeyDown={e => e.key === "Enter" && addAnn()} placeholder="Duyuru metni…" className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none" />
              <Button size="sm" icon={Megaphone} onClick={addAnn} loading={annSaving} disabled={!annText.trim()}>Ekle</Button>
            </div>
          )}</>}
        </div>
      </div>

      {/* ── BOTTOM ────────────────────────────── */}
      <div className="grid gap-5">
        {/* Chat */}
        {canSeeInternalChat && <div id="klinik-ici-mesajlar" className="ui-surface flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <ModuleIcon module="sms" size="sm" />
              <div className="min-w-0">
                <h3 className="truncate text-sm font-extrabold text-slate-800">Klinik İçi Mesajlar</h3>
                <p className="truncate text-[11px] font-medium text-slate-500">Ekip notları ve hızlı koordinasyon</p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{messages.length}</span>
          </div>
          <div ref={chatScrollRef} className="max-h-48 flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {!messagesLoaded ? (
              <div className="space-y-2">
                <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
              </div>
            ) : messages.length === 0 && (
              <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 py-6 text-center">
                <ModuleIcon module="sms" size="sm" />
                <p className="text-xs font-semibold text-slate-500">Henüz mesaj yok — ekibinizle burada iletişim kurun</p>
              </div>
            )}
            {messages.map((m, idx) => (
              <div
                key={m.id}
                style={{ ["--row-delay" as string]: `${idx * 30}ms` }}
                className="ui-row-in flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgb(15_23_42/0.03)]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-white shadow-sm">{m.user.fullName.charAt(0)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-xs font-extrabold text-slate-800">{m.user.fullName}</p>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{ROLE_LABELS[m.user.role] || m.user.role}</span>
                    <span className="text-[10px] font-medium text-slate-400">{new Date(m.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {editingMsgId === m.id ? (
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
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
                        className="min-h-8 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-primary focus:outline-none"
                      />
                      <div className="flex gap-1.5">
                        <Button size="sm" icon={Check} onClick={saveEditMessage}>Kaydet</Button>
                        <Button size="sm" variant="secondary" onClick={cancelEditMessage}>Vazgeç</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs leading-relaxed text-slate-700">{m.text}</p>
                  )}
                </div>

                {canWriteInternalChat && (m.userId === currentUserId || canModerateAllMessages) && editingMsgId !== m.id && (
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    <Button size="sm" variant="secondary" icon={Pencil} onClick={() => beginEditMessage(m)}>Düzenle</Button>
                    <Button size="sm" variant="danger" icon={Trash2} onClick={() => deleteMessage(m.id)}>Sil</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {canWriteInternalChat && <div className="flex gap-2 border-t border-slate-100 p-3">
            <input aria-label="Mesaj yaz" value={msgText} onChange={e => setMsgText(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())} placeholder="Kısa mesaj yazın" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            <Button icon={Send} onClick={sendMessage} loading={msgLoading} disabled={!msgText.trim()}>Gönder</Button>
          </div>}
        </div>}
      </div>
    </div>
  );
}
