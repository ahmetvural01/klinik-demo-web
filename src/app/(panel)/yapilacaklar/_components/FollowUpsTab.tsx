"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { CalendarCheck, CalendarPlus, FileSpreadsheet, FileText, FolderOpen, Pencil, PhoneOff, RotateCcw, XCircle } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { Select } from "@/components/ui/Input";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { formatDateText } from "@/components/ui/Money";
import { SearchInput } from "@/components/ui/SearchInput";
import { ActiveFilters, Toolbar, type ActiveFilter } from "@/components/ui/Toolbar";
import { DueLabel, PriorityBadge } from "@/components/takip/takip-labels";
import { FollowUpDetailModal } from "@/components/takip/FollowUpDetailModal";
import { FollowUpFormModal } from "@/components/takip/FollowUpFormModal";
import { cancelFollowUp, outcomeByKey, recordOutcome, updateFollowUp } from "@/components/takip/follow-up-actions";
import {
  buildItems,
  collectReasonOptions,
  followBucket,
  isOverdueItem,
  type ApiFollowUp,
  type FollowItem,
  type FollowUpWorklist,
} from "@/components/takip/follow-up-model";
import { isoDaysFromToday, loadClinicSchedules, phoneMatches } from "@/components/takip/takip-utils";
import { PhoneLink } from "@/components/work-lists/PhoneLink";
import { confirmDialog } from "@/lib/confirm-client";
import { formatPhoneNumber } from "@/lib/format";
import { routes } from "@/lib/routes";
import { showToastSafe } from "@/lib/toast-client";
import { turkeyDateKey } from "@/lib/tz";
import { isAbortError, useLatestRequest } from "@/lib/use-latest-request";
import type { DaySchedule } from "@/lib/working-hours-core";
import type { FollowStatus } from "./query-state";
import { useWorkListRefresh } from "./use-work-list-refresh";

const CLOSED_RANGES = [
  { value: "30", label: "Son 30 gün" },
  { value: "90", label: "Son 90 gün" },
  { value: "365", label: "Son 1 yıl" },
] as const;

const STATUS_TITLES: Record<FollowStatus, string> = {
  bugun: "Bugün aranacaklar",
  sonraki: "Sonraki günlerde aranacaklar",
  kapali: "Kapanan aramalar",
};

const EMPTY_WORKLIST: FollowUpWorklist = { followUps: [], appointments: [], visits: {}, customTypes: [], canSeeAppointments: false };

function cacheKeyFor(scopeKey: string, closedDays: string) {
  // Kurum/şube/kullanıcı kapsamlı oturum önbelleği: sayfaya dönüşte liste anında görünür.
  return `hasta-takip:worklist:${scopeKey}:${closedDays}`;
}

function readCache(key: string): FollowUpWorklist | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FollowUpWorklist;
    return Array.isArray(parsed.followUps) && Array.isArray(parsed.appointments) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: FollowUpWorklist) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Önbellek yardımcıdır; yazılamazsa liste yine çalışır.
  }
}

function toWorklist(body: unknown): FollowUpWorklist | null {
  if (Array.isArray(body)) return { ...EMPTY_WORKLIST, followUps: body as ApiFollowUp[] };
  if (!body || typeof body !== "object") return null;
  const data = body as Partial<FollowUpWorklist>;
  if (!Array.isArray(data.followUps)) return null;
  return {
    followUps: data.followUps,
    appointments: Array.isArray(data.appointments) ? data.appointments : [],
    visits: data.visits && typeof data.visits === "object" ? data.visits : {},
    customTypes: Array.isArray(data.customTypes) ? data.customTypes.filter((value): value is string => typeof value === "string") : [],
    canSeeAppointments: Boolean(data.canSeeAppointments),
    appointmentsTruncated: Boolean(data.appointmentsTruncated),
  };
}

export type FollowUpsTabHandle = {
  openCreate: (prefill?: { patient?: PickedPatient | null; note?: string }) => void;
};

type Props = {
  /** Sekme görünür mü (görünmüyorken gerçek zamanlı olayda istek atılmaz). */
  active: boolean;
  status: FollowStatus;
  onStatusChange: (status: FollowStatus) => void;
};

/**
 * Aramalar ve görevler > Hasta aramaları: aranacak ve dönüşü beklenen hastalar.
 * Banko günün listesini ilk ekranda görür ("Bugün aranacak": günü geçmiş,
 * bugünkü ve tarihsiz aramalar; gecikenler en üstte) ve en sık sonucu satırdan
 * tek tıkla işler ("Ulaşılamadı" → 2 gün sonra tekrar aranır; randevusu
 * görünen hastada "Aramayı kapat"). Satıra tıklamak arama penceresini açar.
 */
export const FollowUpsTab = forwardRef<FollowUpsTabHandle, Props>(function FollowUpsTab({ active, status, onStatusChange }, ref) {
  const { can, hasFeature, scopeKey } = usePermissions();
  const canWrite = can("hastatracking:write");
  const canUseWhatsapp = hasFeature("whatsapp") && can("whatsapp:write");
  const canBookAppointments = can("appointments:write");
  const canOpenPatient = can("patients:read");
  const hidePhone = !can("patients:phone");
  const startRequest = useLatestRequest();

  const [closedDays, setClosedDays] = useState("90");
  const [data, setData] = useState<FollowUpWorklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  // Pencere açılırken satırın anlık kopyası tutulur: randevudan türeyen satır
  // kayda dönüşünce listeden düşse de açık pencere kapanmaz.
  const [detail, setDetail] = useState<FollowItem | null>(null);
  const [create, setCreate] = useState<{ patient: PickedPatient | null; note: string } | null>(null);
  const [editItem, setEditItem] = useState<FollowItem | null>(null);
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());
  const hasDataRef = useRef(false);
  const cacheKey = cacheKeyFor(scopeKey, closedDays);

  const load = useCallback(async () => {
    const request = startRequest();
    setLoading(true);
    try {
      const response = await fetch(`/api/patient-follow-ups/worklist?closedDays=${closedDays}`, { cache: "no-store", signal: request.signal });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error((body as { message?: string } | null)?.message || "Arama listesi yüklenemedi.");
      const next = toWorklist(body);
      if (!next) throw new Error("Arama listesi beklenmeyen biçimde döndü.");
      if (!request.isLatest()) return;
      hasDataRef.current = true;
      setData(next);
      setError("");
      setNowTick(Date.now());
    } catch (loadError) {
      if (isAbortError(loadError) || !request.isLatest()) return;
      // Eldeki liste ekranda kalır; üstünde "Liste yenilenemedi" ve "Yeniden dene" görünür.
      setError(loadError instanceof Error ? loadError.message : "Arama listesi yüklenemedi.");
    } finally {
      if (request.isLatest()) setLoading(false);
    }
  }, [closedDays, startRequest]);

  const refresh = useWorkListRefresh(() => void load(), active);

  // İlk açılış: önbellekteki liste yalnız henüz veri yokken gösterilir (önceden
  // her yenilemede eski önbellek yeni listenin üstüne basılıyor, yeni açılan
  // arama birkaç saniye kayboluyordu — canlı test H2). Dönem değişince yeniden yüklenir.
  useEffect(() => {
    if (!hasDataRef.current) {
      const cached = readCache(cacheKey);
      if (cached) {
        hasDataRef.current = true;
        setData(cached);
        setNowTick(Date.now());
      }
    }
    refresh();
  }, [cacheKey, refresh]);

  useEffect(() => {
    if (data && hasDataRef.current) writeCache(cacheKey, data);
  }, [cacheKey, data]);

  useImperativeHandle(ref, () => ({
    openCreate: (prefill) => {
      if (!canWrite) return;
      setCreate({ patient: prefill?.patient || null, note: prefill?.note || "" });
    },
  }), [canWrite]);

  const upsertFollowUp = useCallback((followUp: ApiFollowUp) => {
    setData((current) => {
      const base = current || EMPTY_WORKLIST;
      const exists = base.followUps.some((item) => item.id === followUp.id);
      return {
        ...base,
        followUps: exists ? base.followUps.map((item) => (item.id === followUp.id ? followUp : item)) : [followUp, ...base.followUps],
      };
    });
  }, []);

  // Kurumun çalışma takvimi: "Ulaşılamadı" ve "Yeniden aç" sonrası arama kapalı güne (Pazar) düşmesin.
  const schedulesRef = useRef<DaySchedule[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadClinicSchedules().then((schedules) => { if (alive) schedulesRef.current = schedules; });
    return () => { alive = false; };
  }, []);

  const markBusy = (key: string, busy: boolean) => setBusyKeys((current) => {
    const next = new Set(current);
    if (busy) next.add(key);
    else next.delete(key);
    return next;
  });

  const loaded = data !== null;
  const allItems = useMemo(() => (data ? buildItems(data.followUps, data.appointments, data.visits) : []), [data]);
  const todayKey = useMemo(() => turkeyDateKey(new Date(nowTick)), [nowTick]);

  const reasonOptions = useMemo(
    () => Array.from(new Set(allItems.map((item) => item.reasonLabel))).sort((a, b) => a.localeCompare(b, "tr")),
    [allItems],
  );
  const doctorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of allItems) if (item.doctorId && item.doctorName) map.set(item.doctorId, item.doctorName);
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [allItems]);
  const formReasons = useMemo(() => collectReasonOptions(data?.customTypes || [], data?.followUps || []), [data]);

  const openCountByPatient = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of allItems) if (item.isOpen) map.set(item.patientId, (map.get(item.patientId) || 0) + 1);
    return map;
  }, [allItems]);

  // Sayaçlar ve liste AYNI süzgeçle hesaplanır (önceden aramada iki satır
  // görünürken sekmeler süzülmemiş toplamı gösteriyordu — canlı test H12).
  const buckets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
    const result: Record<FollowStatus, FollowItem[]> = { bugun: [], sonraki: [], kapali: [] };
    for (const item of allItems) {
      if (reasonFilter && item.reasonLabel !== reasonFilter) continue;
      if (doctorFilter && item.doctorId !== doctorFilter) continue;
      if (normalizedQuery) {
        const haystack = [item.patientName, item.doctorName, item.noteText, item.reasonLabel, item.lastEvent?.summary, item.resolutionNote]
          .filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
        if (!haystack.includes(normalizedQuery) && !(!hidePhone && phoneMatches(item.patientPhone, query))) continue;
      }
      result[followBucket(item, todayKey)].push(item);
    }
    // Bugün: önce günü geçenler (en eski önce), sonra tarihsizler, sonra bugünküler; aynı grupta yüksek öncelik önce.
    const rank = (item: FollowItem) => (isOverdueItem(item, todayKey) ? 0 : !item.dueAt ? 1 : 2);
    const time = (item: FollowItem) => new Date(item.dueAt || item.createdAt).getTime();
    result.bugun.sort((a, b) => rank(a) - rank(b) || b.priority - a.priority || time(a) - time(b));
    result.sonraki.sort((a, b) => time(a) - time(b) || b.priority - a.priority);
    result.kapali.sort((a, b) => new Date(b.closedAt || b.createdAt).getTime() - new Date(a.closedAt || a.createdAt).getTime());
    return result;
  }, [allItems, query, reasonFilter, doctorFilter, hidePhone, todayKey]);

  const overdueCount = useMemo(() => buckets.bugun.filter((item) => isOverdueItem(item, todayKey)).length, [buckets, todayKey]);
  const rows = buckets[status];

  const visitFor = (item: FollowItem) => data?.visits[item.patientId];

  // ---- Satırdan tek tık eylemler (aynı uç; görüşme ve sonuç tek istekte) ----

  const quickUnreached = async (item: FollowItem) => {
    markBusy(item.key, true);
    try {
      const nextActionAt = isoDaysFromToday(2, "10:00", new Date(), schedulesRef.current);
      const updated = await recordOutcome(item, { outcome: outcomeByKey("ULASILAMADI"), nextActionAt }, { onCreated: upsertFollowUp });
      if (updated) upsertFollowUp(updated);
      else refresh();
      showToastSafe({ title: `${item.patientName}: ulaşılamadı`, message: `Sonraki arama: ${formatDateText(nextActionAt, "datetime")}`, type: "success", icon: "follow" });
    } catch (actionError) {
      showToastSafe({ title: "Kaydedilemedi", message: actionError instanceof Error ? actionError.message : "Lütfen tekrar deneyin.", type: "error" });
    } finally {
      markBusy(item.key, false);
    }
  };

  const quickCloseWithAppointment = async (item: FollowItem) => {
    const appointment = visitFor(item)?.nextAppointment;
    if (!appointment) return;
    markBusy(item.key, true);
    try {
      const prefix = `${formatDateText(appointment.startAt, "datetime")}${appointment.doctorName ? ` · ${appointment.doctorName}` : ""}`;
      const updated = await recordOutcome(item, { outcome: outcomeByKey("RANDEVU"), prefix }, { onCreated: upsertFollowUp });
      if (updated) upsertFollowUp(updated);
      else refresh();
      showToastSafe({ title: "Arama kapatıldı", message: `${item.patientName} · randevu ${prefix}`, type: "success", icon: "follow" });
    } catch (actionError) {
      showToastSafe({ title: "Kaydedilemedi", message: actionError instanceof Error ? actionError.message : "Lütfen tekrar deneyin.", type: "error" });
    } finally {
      markBusy(item.key, false);
    }
  };

  const quickReopen = async (item: FollowItem) => {
    if (!item.followUpId) return;
    markBusy(item.key, true);
    try {
      const nextActionAt = isoDaysFromToday(1, "10:00", new Date(), schedulesRef.current);
      upsertFollowUp(await updateFollowUp(item.followUpId, { status: "ACIK", nextActionAt }));
      showToastSafe({ title: "Arama yeniden açıldı", message: `${item.patientName} · sonraki arama: ${formatDateText(nextActionAt, "datetime")}`, type: "success", icon: "follow" });
    } catch (actionError) {
      showToastSafe({ title: "Yeniden açılamadı", message: actionError instanceof Error ? actionError.message : "Lütfen tekrar deneyin.", type: "error" });
    } finally {
      markBusy(item.key, false);
    }
  };

  const cancelRow = async (item: FollowItem) => {
    if (!item.followUpId) return;
    const confirmed = await confirmDialog({
      title: `${item.patientName}: arama iptal edilsin mi?`,
      message: "Yanlış açılmış ya da artık gerekmeyen arama listeden kalkar; görüşme geçmişi saklanır.",
      danger: true,
      confirmText: "Aramayı iptal et",
    });
    if (!confirmed) return;
    markBusy(item.key, true);
    try {
      const cancelled = await cancelFollowUp(item.followUpId);
      if (cancelled) upsertFollowUp(cancelled);
      else refresh();
      showToastSafe({ title: "Arama iptal edildi", message: item.patientName, type: "success", icon: "follow" });
    } catch (actionError) {
      showToastSafe({ title: "İptal edilemedi", message: actionError instanceof Error ? actionError.message : "Lütfen tekrar deneyin.", type: "error" });
    } finally {
      markBusy(item.key, false);
    }
  };

  const onDetailChanged = (updated: ApiFollowUp | null, message: string) => {
    if (updated) upsertFollowUp(updated);
    else refresh();
    setDetail(null);
    showToastSafe({ title: "Kaydedildi", message, type: "success", icon: "follow" });
  };

  const onFormSaved = (saved: ApiFollowUp, mode: "create" | "edit") => {
    upsertFollowUp(saved);
    setCreate(null);
    setEditItem(null);
    const when = saved.nextActionAt ? formatDateText(saved.nextActionAt, "datetime") : "bugün (hemen ara)";
    showToastSafe({
      title: mode === "create" ? "Arama listeye eklendi" : "Arama güncellendi",
      message: `${saved.patient?.fullName || "Hasta"} · ${when}`,
      type: "success",
      icon: "follow",
    });
    if (mode === "create" && status === "kapali") onStatusChange(saved.nextActionAt && turkeyDateKey(new Date(saved.nextActionAt)) > todayKey ? "sonraki" : "bugun");
  };

  const resetFilters = () => {
    setQuery("");
    setReasonFilter("");
    setDoctorFilter("");
    setClosedDays("90");
  };

  const doctorName = doctorOptions.find((doctor) => doctor.id === doctorFilter)?.name;
  const activeFilters: ActiveFilter[] = [
    ...(reasonFilter ? [{ key: "reason", label: `Neden: ${reasonFilter}`, onRemove: () => setReasonFilter("") }] : []),
    ...(doctorFilter ? [{ key: "doctor", label: `Doktor: ${doctorName || "Seçili"}`, onRemove: () => setDoctorFilter("") }] : []),
    ...(status === "kapali" && closedDays !== "90"
      ? [{ key: "range", label: CLOSED_RANGES.find((range) => range.value === closedDays)?.label || "Dönem", onRemove: () => setClosedDays("90") }]
      : []),
  ];

  // ---- Dışa aktarım (kütüphaneler yalnız seçilince yüklenir) ----

  const exportRows = () => rows.map((item) => ({
    Hasta: item.patientName,
    ...(hidePhone ? {} : { Telefon: item.patientPhone ? formatPhoneNumber(item.patientPhone) : "" }),
    Neden: item.reasonLabel,
    Doktor: item.doctorName || "",
    "Son görüşme": item.lastEvent ? `${formatDateText(item.lastEvent.occurredAt, "datetime")} ${item.lastEvent.summary}` : "",
    ...(status === "kapali"
      ? { Kapanış: item.closedAt ? formatDateText(item.closedAt, "datetime") : "", Sonuç: item.resolutionNote || "" }
      : {
          "Sonraki arama": item.dueAt ? formatDateText(item.dueAt, item.dueAllDay ? "short" : "datetime") : "Hemen ara",
          Durum: isOverdueItem(item, todayKey) ? "Gecikmiş" : "Açık",
          Not: item.noteText,
        }),
  }));
  const fileStamp = () => formatDateText(new Date()).replace(/\./g, "-");
  const downloadExcel = async () => {
    const { downloadCsv } = await import("@/lib/csv-export");
    downloadCsv(`hasta-aramalari-${fileStamp()}`, exportRows());
  };
  const downloadPdf = async () => {
    const { createPdfDoc, addPdfTitle, addPdfSection, preparePdfFonts } = await import("@/lib/pdf-export");
    // Türkçe font ve klinik anteti beklenir: yoksa ilk PDF ğ/ı/ş harflerini dönüştürerek yazılır.
    await preparePdfFonts();
    const doc = createPdfDoc();
    // Oluşturma zamanı antette, kayıt sayısı bölüm başlığında yazılır.
    const y = addPdfTitle(doc, "Hasta aramaları", STATUS_TITLES[status]);
    // Dikey sayfada elde tutulup sırayla aranacak liste: dört sütun, ikinci
    // bilgi aynı hücrede alt satırda (telefon adın altında, doktor nedenin
    // yanında). Excel'deki ayrı sütunlar dikey sayfaya sığmıyordu.
    const closed = status === "kapali";
    const headers = ["Hasta", "Neden", closed ? "Kapanış" : "Ne zaman", closed ? "Sonuç" : "Son görüşme / not"];
    addPdfSection(doc, y, "Aramalar", headers, rows.map((item) => {
      const phone = !hidePhone && item.patientPhone ? formatPhoneNumber(item.patientPhone) : "";
      const lastEvent = item.lastEvent ? `${formatDateText(item.lastEvent.occurredAt, "datetime")} — ${item.lastEvent.summary}` : "";
      return [
        [item.patientName, phone].filter(Boolean).join("\n"),
        [item.reasonLabel, item.doctorName || ""].filter(Boolean).join("\n"),
        closed
          ? (item.closedAt ? formatDateText(item.closedAt, "datetime") : "")
          : `${item.dueAt ? formatDateText(item.dueAt, item.dueAllDay ? "short" : "datetime") : "Hemen ara"}${isOverdueItem(item, todayKey) ? "\nGecikmiş" : ""}`,
        (closed ? [item.resolutionNote || "", lastEvent] : [lastEvent, item.noteText || ""]).filter(Boolean).join("\n"),
      ];
    }));
    doc.save(`hasta-aramalari-${fileStamp()}.pdf`);
  };

  // ---- Hücreler ----

  const dueCell = (item: FollowItem) => (item.dueAt
    ? <DueLabel at={item.dueAt} open={item.isOpen} now={new Date(nowTick)} granularity="day" showTime={!item.dueAllDay} />
    : <span className="whitespace-nowrap font-semibold text-amber-700">Hemen ara</span>);

  /** Satırda görünen TEK eylem (en sık sonuç); yoksa null. */
  const primaryAction = (item: FollowItem) => {
    const busy = busyKeys.has(item.key);
    const appointment = visitFor(item)?.nextAppointment;
    if (canWrite && item.isOpen && appointment) {
      return <Button size="sm" variant="secondary" icon={CalendarCheck} loading={busy} onClick={() => void quickCloseWithAppointment(item)} title="Randevusu var: görüşmeyi “Randevu verildi” olarak kaydet ve aramayı kapat">Aramayı kapat</Button>;
    }
    if (canWrite && item.isOpen && !hidePhone) {
      // Tek tık "Ulaşılamadı" yalnız telefonu görüp arayabilen için (doktor/asistan telefonu görmez).
      return <Button size="sm" variant="secondary" icon={PhoneOff} loading={busy} onClick={() => void quickUnreached(item)} title="Ulaşılamadı olarak kaydet; 2 gün sonra tekrar aranır">Ulaşılamadı</Button>;
    }
    if (canWrite && !item.isOpen && item.followUpId) {
      return <Button size="sm" variant="secondary" icon={RotateCcw} loading={busy} onClick={() => void quickReopen(item)}>Yeniden aç</Button>;
    }
    return null;
  };

  /** "…" menüsü: randevu ver, hasta dosyası, düzenle, iptal. */
  const menuItems = (item: FollowItem): ActionMenuItem[] => [
    ...(canBookAppointments && item.isOpen ? [{ key: "randevu", label: "Randevu ver", icon: CalendarPlus, href: routes.newAppointment({ patientId: item.patientId, patientName: item.patientName }) }] : []),
    ...(canOpenPatient ? [{ key: "dosya", label: "Hasta dosyası", icon: FolderOpen, href: routes.patient(item.patientId) }] : []),
    ...(canWrite && item.isOpen && item.followUpId ? [
      { key: "duzenle", label: "Aramayı düzenle", description: "Neden, gün, not ya da öncelik", icon: Pencil, onSelect: () => setEditItem(item) },
      { key: "iptal", label: "Aramayı iptal et", icon: XCircle, danger: true, separatorBefore: true, onSelect: () => void cancelRow(item) },
    ] : []),
  ];

  // Hasta hücresi iki satır: ad (+ diğer açık arama sayısı) · telefon ve
  // varsa randevusu. Önceden altında iki ayrı rozet satırı açılıyordu.
  const others = (item: FollowItem) => (item.isOpen ? (openCountByPatient.get(item.patientId) || 0) - 1 : 0);
  const appointmentText = (item: FollowItem) => {
    const appointment = item.isOpen ? visitFor(item)?.nextAppointment : null;
    return appointment ? `Randevusu var · ${formatDateText(appointment.startAt, "datetime")}` : "";
  };
  /** `withPriority`: telefonda "Yüksek öncelik" adın yanında (masaüstünde Neden sütununda). */
  const patientNameLine = (item: FollowItem, withPriority = false) => (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-bold text-slate-900">{item.patientName}</span>
      {others(item) > 0 && <span className="text-xs font-semibold text-slate-500">+{others(item)} açık arama</span>}
      {withPriority && <PriorityBadge value={item.priority} />}
    </p>
  );
  const patientCell = (item: FollowItem) => {
    const visit = appointmentText(item);
    const phone = !hidePhone && item.patientPhone ? item.patientPhone : null;
    return (
      <div className="min-w-0">
        {patientNameLine(item)}
        {(phone || visit) && (
          <p className="flex flex-wrap items-center gap-x-2 text-xs">
            {phone && <PhoneLink phone={phone} countryCode={item.phoneCountryCode} withIcon className="text-xs" />}
            {visit && <span className="font-semibold text-emerald-700">{visit}</span>}
          </p>
        )}
      </div>
    );
  };

  // Lab satırında provanın geliş günü de yazılır: aynı işin iki provası ayırt edilir (HL-28).
  const reasonDetail = (item: FollowItem) => item.labContext
    ? [`${item.labContext.receivedStep || "Prova"} geldi (${formatDateText(item.createdAt)})`, item.labContext.labType, item.labContext.labName].filter(Boolean).join(" · ")
    : item.type === "GELMEDI" && item.appointmentStartAt
      ? `Kaçırdığı randevu: ${formatDateText(item.appointmentStartAt, "datetime")}`
      : item.noteText || "";

  const reasonCell = (item: FollowItem) => {
    const detailText = [item.doctorName, reasonDetail(item)].filter(Boolean).join(" · ");
    return (
      <div className="min-w-0 max-w-[280px]">
        <div className="flex flex-wrap items-center gap-1">
          <Badge tone={item.reasonTone}>{item.reasonLabel}</Badge>
          <PriorityBadge value={item.priority} />
        </div>
        {detailText && <p className="mt-0.5 truncate text-xs text-slate-500" title={detailText}>{detailText}</p>}
      </div>
    );
  };

  // Görüşme yoksa hücre boş kalır (önceden her satırda "Görüşülmedi" yazıyordu);
  // listede hiç görüşme yoksa sütun da gösterilmez.
  const lastContactCell = (item: FollowItem) => (item.lastEvent ? (
    <div className="min-w-0 max-w-[220px]">
      <p className="text-xs tabular-nums text-slate-500">{formatDateText(item.lastEvent.occurredAt, "datetime")}</p>
      <p className="truncate text-sm text-slate-700" title={item.lastEvent.summary}>{item.lastEvent.summary}</p>
    </div>
  ) : null);
  const showLastContact = rows.some((item) => item.lastEvent);

  // Kapanan aramada "Son görüşme" ile kapanış aynı metni tekrar ediyordu; tek "Sonuç" sütunu (denetim §3.1 sorun 3).
  const resultCell = (item: FollowItem) => (
    <div className="min-w-0 max-w-[480px]">
      <p className="text-xs tabular-nums text-slate-500">{item.closedAt ? formatDateText(item.closedAt, "datetime") : "—"}</p>
      <p className="truncate text-sm text-slate-700" title={item.resolutionNote || undefined}>{item.resolutionNote || "—"}</p>
    </div>
  );

  // Satırda yapılacak bir şey yoksa (salt okuyan rol) boş "İşlem" sütunu gösterilmez.
  const actionColumn: ListTableColumn<FollowItem>[] = canWrite || canOpenPatient || canBookAppointments
    ? [{ key: "islem", header: "İşlem", align: "right", render: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          {primaryAction(item)}
          <ActionMenu items={menuItems(item)} label={`${item.patientName}: diğer işlemler`} />
        </div>
      ) }]
    : [];
  const columns: ListTableColumn<FollowItem>[] = status === "kapali"
    ? [
        { key: "patient", header: "Hasta", cellClassName: "min-w-[180px] whitespace-nowrap", render: patientCell },
        { key: "reason", header: "Neden", render: reasonCell },
        { key: "result", header: "Sonuç", render: resultCell },
        ...actionColumn,
      ]
    : [
        { key: "patient", header: "Hasta", cellClassName: "min-w-[180px] whitespace-nowrap", render: patientCell },
        { key: "reason", header: "Neden", render: reasonCell },
        ...(showLastContact ? [{ key: "last", header: "Son görüşme", render: lastContactCell }] : []),
        { key: "due", header: "Ne zaman", render: dueCell },
        ...actionColumn,
      ];

  // Telefonda kart: ad ("…" kartın sağ üst köşesinde, mobileCardActions); neden + ne zaman + doktor tek satır;
  // neden/not ayrıntısı; telefon ve (varsa) randevu ile sık eylem aynı satırda —
  // eylemler ayrı bir düğme sırası oluşturmaz.
  const mobileCard = (item: FollowItem) => {
    // Telefonda da "neden aranacak" görünür (not, lab provası, kaçırılan randevu); masaüstündeki Neden sütunuyla aynı metin.
    const detailText = item.isOpen ? reasonDetail(item) : "";
    const visit = appointmentText(item);
    const primary = primaryAction(item);
    const phone = !hidePhone && item.patientPhone ? item.patientPhone : null;
    return (
      <div className="space-y-1">
        <div className="min-h-7 pt-1">{patientNameLine(item, true)}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <Badge tone={item.reasonTone}>{item.reasonLabel}</Badge>
          {item.isOpen ? dueCell(item) : <span>Kapandı {item.closedAt ? formatDateText(item.closedAt) : ""}</span>}
          {item.doctorName && <span>{item.doctorName}</span>}
        </div>
        {detailText && <p className="truncate text-xs text-slate-600" title={detailText}>{detailText}</p>}
        {item.isOpen
          ? item.lastEvent && <p className="truncate text-xs text-slate-600">Son görüşme: {item.lastEvent.summary}</p>
          : item.resolutionNote && <p className="truncate text-xs text-slate-600">{item.resolutionNote}</p>}
        {(phone || visit || primary) && (
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
              {phone && <PhoneLink phone={phone} countryCode={item.phoneCountryCode} withIcon className="min-h-9 text-sm font-semibold" />}
              {visit && <span className="text-xs font-semibold text-emerald-700">{visit}</span>}
            </div>
            {primary}
          </div>
        )}
      </div>
    );
  };

  const isFiltered = Boolean(query.trim() || reasonFilter || doctorFilter);
  const emptyText = isFiltered
    ? "Aramanıza uyan kayıt yok"
    : status === "bugun" ? "Bugün aranacak hasta yok"
      : status === "sonraki" ? "İleri tarihli arama yok"
        : "Bu dönemde kapanan arama yok";
  const emptyDescription = isFiltered
    ? "Arama metnini ya da filtreleri değiştirin."
    : status === "bugun" && buckets.sonraki.length > 0 ? `Sonraki günlerde ${buckets.sonraki.length} arama var.` : undefined;

  const detailItem = detail ? allItems.find((item) => item.key === detail.key) || detail : null;

  // Listenin kartında üst şerit, iki düzenli sıra: durum çipleri (sağda Dışa
  // aktar) · arama ve süzgeçler. Önceden çipler, arama ve açılır listeler
  // ayrı bir kartta karışık sarılıyordu.
  const listToolbar = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2.5 sm:px-4 sm:pt-3">
        <ChoiceCards
          label="Arama durumu"
          labelHidden
          variant="pills"
          value={status}
          onChange={onStatusChange}
          options={[
            { value: "bugun", label: "Bugün aranacak", count: loaded ? buckets.bugun.length : undefined, countTone: overdueCount > 0 ? "critical" : "warning" },
            { value: "sonraki", label: "Sonraki günler", count: loaded ? buckets.sonraki.length : undefined },
            { value: "kapali", label: "Kapanan" },
          ]}
        />
        <ExportMenu
          className="hidden sm:inline-flex"
          disabled={rows.length === 0}
          disabledReason="Dışa aktarılacak kayıt yok"
          items={[
            { key: "excel", label: "Excel (CSV)", icon: FileSpreadsheet, onSelect: downloadExcel },
            { key: "pdf", label: "PDF", icon: FileText, onSelect: downloadPdf },
          ]}
        />
      </div>
      <Toolbar
        filters={(
          <>
            <Select aria-label="Neden" value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)} className="sm:w-48">
              <option value="">Tüm nedenler</option>
              {reasonOptions.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
            </Select>
            <Select aria-label="Doktor" value={doctorFilter} onChange={(event) => setDoctorFilter(event.target.value)} className="sm:w-48">
              <option value="">Tüm doktorlar</option>
              {doctorOptions.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
            </Select>
            {status === "kapali" && (
              <Select aria-label="Kapanış dönemi" value={closedDays} onChange={(event) => setClosedDays(event.target.value)} className="sm:w-36">
                {CLOSED_RANGES.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}
              </Select>
            )}
          </>
        )}
        filterCount={activeFilters.length}
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={hidePhone ? "Hasta adı veya not ara" : "Hasta adı, telefon veya not ara"}
          wrapperClassName="flex-1 min-w-[200px]"
        />
      </Toolbar>
    </>
  );
  const filterChips = activeFilters.length > 0 ? (
    <div className="border-b border-slate-100 px-3 py-2 sm:px-4">
      <ActiveFilters filters={activeFilters} onClearAll={resetFilters} />
    </div>
  ) : undefined;

  return (
    <div className="space-y-3">
      {data?.appointmentsTruncated && status !== "kapali" && (
        <Callout tone="warning" compact>Son 90 günde çok sayıda gelmeyen randevu var; listede en yeni 500 randevu gösteriliyor.</Callout>
      )}

      <ListTable<FollowItem>
        columns={columns}
        rows={rows}
        rowKey={(item) => item.key}
        loading={loading && !loaded}
        error={!loaded ? error || null : null}
        staleError={loaded ? error || null : null}
        onRetry={refresh}
        onRowClick={(item) => setDetail(item)}
        getRowAriaLabel={(item) => `${item.patientName} aramasını aç`}
        toolbar={listToolbar}
        header={filterChips}
        mobileCard={mobileCard}
        mobileCardActions={(item) => (menuItems(item).length > 0 ? <ActionMenu items={menuItems(item)} label={`${item.patientName}: işlemler`} /> : null)}
        emptyText={emptyText}
        emptyDescription={emptyDescription}
        emptyAction={isFiltered ? <Button size="sm" variant="secondary" onClick={resetFilters}>Filtreleri temizle</Button> : undefined}
      />

      {detailItem && (
        <FollowUpDetailModal
          key={detailItem.key}
          item={detailItem}
          onClose={() => setDetail(null)}
          onChanged={onDetailChanged}
          onCreated={upsertFollowUp}
          onEdit={(item) => { setDetail(null); setEditItem(item); }}
          onShowPatient={(name) => { setDetail(null); setQuery(name); }}
          canWrite={canWrite}
          canUseWhatsapp={canUseWhatsapp}
          canBookAppointments={canBookAppointments}
          hidePhone={hidePhone}
          visit={visitFor(detailItem)}
          otherOpenCount={Math.max(0, (openCountByPatient.get(detailItem.patientId) || 0) - (detailItem.isOpen ? 1 : 0))}
        />
      )}

      {(create || editItem) && (
        <FollowUpFormModal
          key={editItem?.key || "yeni"}
          onClose={() => { setCreate(null); setEditItem(null); }}
          onSaved={onFormSaved}
          initialPatient={create?.patient}
          initialNote={create?.note}
          item={editItem}
          followUp={editItem?.followUpId ? data?.followUps.find((followUp) => followUp.id === editItem.followUpId) || null : null}
          reasonOptions={formReasons}
          openItemsForPatient={(patientId) => allItems.filter((item) => item.isOpen && item.patientId === patientId)}
          onOpenExisting={(item) => { setCreate(null); setDetail(item); }}
        />
      )}
    </div>
  );
});
