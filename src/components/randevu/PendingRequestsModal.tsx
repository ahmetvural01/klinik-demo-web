"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, PhoneCall, UserPlus, X } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { Modal } from "@/components/ui/Modal";
import { FormModal } from "@/components/ui/FormModal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Tabs } from "@/components/ui/Tabs";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { FormField } from "@/components/ui/FormField";
import { Input, Textarea } from "@/components/ui/Input";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { confirmDialog } from "@/lib/confirm-client";
import { clientMutation } from "@/lib/client-mutation";
import { showToastSafe } from "@/lib/toast-client";
import { linkBookingRequest } from "@/components/randevu/appointment-api";
import {
  formatDayShort,
  formatPhoneDisplay,
  fromDateKey,
  phoneHref,
  preferredDateKeyOf,
  preferredMinutesOf,
  preferredPeriodLabel,
  toDateKey,
  type AppointmentPermissions,
  type AppointmentSource,
  type BookingRequestEntry,
  type CalendarDoctor,
  type WaitlistEntry,
} from "@/components/randevu/appointment-utils";

export type PendingTab = "online" | "bekleme";

type PendingRequestsModalProps = {
  initialTab: PendingTab;
  doctors: CalendarDoctor[];
  permissions: AppointmentPermissions;
  /** Randevusu oluşturulmuş ama talebe bağlanamamış online talepler (talep → randevu). */
  unlinkedRequests: Record<string, string>;
  onUnlinkedResolved: (requestId: string) => void;
  onClose: () => void;
  /** "Randevu ver" — sayfa ortak randevu formunu bu kaynakla açar. */
  onSchedule: (source: AppointmentSource) => void;
  /** Sayılar değişti (üstteki sayaçlar tazelensin). */
  onCountsChanged: () => void;
};

type OnlineStatus = "BEKLIYOR" | "ONAYLANDI" | "REDDEDILDI";
type ListState<T> = { items: T[]; loading: boolean; loaded: boolean; error: string | null };

const APPROVE_REQUIRED = "Online talebe randevu vermek için “Randevu onaylama” yetkisi gerekir.";

/**
 * Liste yükleyici: gerçek zamanlı olayda (başka bir personel talebi işledi)
 * 0,8 sn birleştirerek yeniler; sekme gizliyken yenilemez, görünür olunca bir
 * kez yeniler. `url` null ise hiç istek atmaz (seçilmeyen durum sekmesi).
 */
function useList<T>(url: string | null) {
  const [state, setState] = useState<ListState<T>>({ items: [], loading: Boolean(url), loaded: false, error: null });
  const load = useCallback(async () => {
    if (!url) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) throw new Error(data?.message || data?.error || "Liste yüklenemedi.");
      setState({ items: data as T[], loading: false, loaded: true, error: null });
    } catch (loadError) {
      setState((prev) => ({ ...prev, loading: false, error: loadError instanceof Error ? loadError.message : "Liste yüklenemedi." }));
    }
  }, [url]);
  // Adres değişince (ör. "Reddedilen" süzgecine geçiş) önceki listenin satırları görünmesin.
  useEffect(() => {
    setState({ items: [], loading: Boolean(url), loaded: false, error: null });
    void load();
  }, [load, url]);
  useEffect(() => {
    if (!url) return;
    let timer: number | null = null;
    let missed = false;
    const run = () => {
      if (document.hidden) { missed = true; return; }
      void load();
    };
    const onRealtime = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(run, 800);
    };
    const onVisibility = () => {
      if (!document.hidden && missed) { missed = false; void load(); }
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load, url]);
  return { ...state, reload: load, setItems: (updater: (items: T[]) => T[]) => setState((prev) => ({ ...prev, items: updater(prev.items) })) };
}

function preferredText(iso: string | null | undefined) {
  const key = preferredDateKeyOf(iso);
  const day = fromDateKey(key);
  if (!day || !key) return null;
  return { day, key, period: preferredPeriodLabel(preferredMinutesOf(iso)) };
}

/** Talebin ne zaman geldiği: "az önce", "45 dk önce", "3 sa önce", "2 gün önce" ya da tarih. */
function sinceText(iso: string, now: Date) {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce`;
  return formatDayShort(new Date(iso), now);
}

/**
 * "Talepler": internetten gelen randevu talepleri ve bekleme listesi tek
 * pencerede, sayaçlı sekmelerle. Online taleplerde durum süzgeci (bekleyen /
 * onaylanan / reddedilen — hasta "talep ettim" dediğinde bakılır); satırda en
 * sık eylem görünür, kalanı "…" menüsünde. Önceden sekme başlarında iki ayrı
 * açıklama paragrafı aynı şeyi anlatıyordu ve "Arandı ▾" düğmesi durum mu
 * eylem mi belli değildi.
 */
export function PendingRequestsModal({
  initialTab,
  doctors,
  permissions,
  unlinkedRequests,
  onUnlinkedResolved,
  onClose,
  onSchedule,
  onCountsChanged,
}: PendingRequestsModalProps) {
  const [tab, setTab] = useState<PendingTab>(initialTab);
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatus>("BEKLIYOR");
  // Aranacak hasta tek yerde izlenir: Aramalar ve görevler > Hasta aramaları.
  const canTrackCalls = usePermissions().can("hastatracking:write");
  const pending = useList<BookingRequestEntry>("/api/booking-requests");
  // Geçmiş talepler yalnız o süzgeç seçilince yüklenir.
  const history = useList<BookingRequestEntry>(tab === "online" && onlineStatus !== "BEKLIYOR" ? `/api/booking-requests?status=${onlineStatus}` : null);
  const waitlist = useList<WaitlistEntry>("/api/waitlist");
  const [rejecting, setRejecting] = useState<BookingRequestEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  const todayKey = toDateKey(now);

  const online = onlineStatus === "BEKLIYOR" ? pending : history;
  const onlineRows = useMemo(
    () => [...online.items].sort((a, b) => String(preferredDateKeyOf(a.preferredFrom)).localeCompare(String(preferredDateKeyOf(b.preferredFrom)))),
    [online.items],
  );
  // Eski "Arandı" durumundaki kayıtlar da bekleyen hastadır (arama takibi artık Hasta aramaları'nda).
  const activeWaitlist = useMemo(() => waitlist.items.filter((entry) => entry.status === "BEKLIYOR" || entry.status === "ARANDI"), [waitlist.items]);
  const canScheduleOnline = permissions.canCreate && permissions.canApprove;

  const closeUnlinked = async (request: BookingRequestEntry) => {
    const appointmentId = unlinkedRequests[request.id];
    if (!appointmentId) return;
    setBusyId(request.id);
    const linked = await linkBookingRequest(request.id, appointmentId);
    if (linked.ok) {
      setBusyId(null);
      onUnlinkedResolved(request.id);
      pending.setItems((items) => items.filter((item) => item.id !== request.id));
      onCountsChanged();
      showToastSafe({ message: `${request.fullName} talebi randevuyla kapatıldı.`, type: "success" });
      return;
    }
    const confirmed = await confirmDialog({
      title: "Talep randevuya bağlanamadı",
      message: `${linked.message} Randevu oluşturuldu; talebi “kapandı” olarak işaretleyip listeden kaldırmak ister misiniz? Hastaya mesaj gitmez.`,
      confirmText: "Talebi kapat",
      cancelText: "Vazgeç",
    });
    if (!confirmed) { setBusyId(null); return; }
    try {
      await clientMutation(`/api/booking-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IPTAL", reason: "Randevu verildi; talep randevuya bağlanamadı" }),
      }, "Talep kapatılamadı.");
      onUnlinkedResolved(request.id);
      pending.setItems((items) => items.filter((item) => item.id !== request.id));
      onCountsChanged();
    } catch (closeError) {
      showToastSafe({ message: closeError instanceof Error ? closeError.message : "Talep kapatılamadı.", type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Bekleme listesindeki hastayı Hasta aramaları'na ekler (uygun saat teklif
   * etmek için). Önceden listede ayrı bir "Arandı: ulaşıldı/ulaşılamadı" kaydı
   * tutuluyordu; aynı hasta iki ayrı yerde izleniyordu. Hastaya randevu
   * verilince açık araması kendiliğinden kapanır.
   */
  const addToCalls = async (entry: WaitlistEntry) => {
    setBusyId(entry.id);
    try {
      const from = preferredText(entry.preferredFrom);
      const to = preferredText(entry.preferredTo);
      const when = from ? `${formatDayShort(from.day, now)}${to ? ` – ${formatDayShort(to.day, now)}` : ""}` : "tarih fark etmez";
      await clientMutation("/api/patient-follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: entry.patient.id,
          ...(entry.doctor?.id ? { doctorId: entry.doctor.id } : {}),
          type: "GERI_ARA",
          note: `Bekleme listesi: uygun saat teklif edilecek (${when}${entry.doctor?.fullName ? `, ${entry.doctor.fullName}` : ""}).`,
          nextActionAt: new Date().toISOString(),
        }),
      }, "Hasta aramalarına eklenemedi.");
      showToastSafe({ message: `${entry.patient.fullName} hasta aramalarına eklendi.`, type: "success" });
    } catch (callError) {
      showToastSafe({ message: callError instanceof Error ? callError.message : "Hasta aramalarına eklenemedi.", type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const removeEntry = async (entry: WaitlistEntry) => {
    const confirmed = await confirmDialog({
      title: "Bekleme listesinden çıkarılsın mı?",
      message: `${entry.patient.fullName} listeden çıkarılır. Hastaya mesaj gitmez.`,
      confirmText: "Listeden çıkar",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (!confirmed) return;
    setBusyId(entry.id);
    try {
      await clientMutation(`/api/waitlist/${entry.id}`, { method: "DELETE" }, "Kayıt listeden çıkarılamadı.");
      waitlist.setItems((items) => items.map((item) => (item.id === entry.id ? { ...item, status: "IPTAL" } : item)));
      onCountsChanged();
    } catch (removeError) {
      showToastSafe({ message: removeError instanceof Error ? removeError.message : "Kayıt listeden çıkarılamadı.", type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const contact = (phone: string | null | undefined, extra?: string | null) => {
    if (!permissions.canSeePhone) return null;
    const href = phoneHref(phone);
    const text = formatPhoneDisplay(phone);
    if (!text && !extra) return null;
    return (
      <p className="mt-0.5 text-xs text-slate-500">
        {href ? <a href={href} className="font-semibold text-primary hover:underline">{text}</a> : text}
        {extra ? `${text ? " · " : ""}${extra}` : ""}
      </p>
    );
  };

  function onlineActions(row: BookingRequestEntry) {
    if (row.status !== "BEKLIYOR") {
      return <Badge tone={row.status === "ONAYLANDI" ? "success" : "neutral"}>{row.status === "ONAYLANDI" ? "Randevu verildi" : row.status === "REDDEDILDI" ? "Reddedildi" : "Kapatıldı"}</Badge>;
    }
    if (unlinkedRequests[row.id]) {
      return (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge tone="info">Randevu verildi</Badge>
          {permissions.canApprove && <Button size="sm" variant="secondary" loading={busyId === row.id} onClick={() => void closeUnlinked(row)}>Talebi kapat</Button>}
        </div>
      );
    }
    // Reddetme yalnız onay yetkisi ister (sunucu da öyle); randevu yazma
    // yetkisi olmayan ama onaylayabilen rol talebi reddedebilmeye devam eder.
    if (!permissions.canCreate && !permissions.canApprove) return null;
    const menu: ActionMenuItem[] = permissions.canApprove
      ? [{ key: "reddet", label: "Talebi reddet", icon: X, danger: true, onSelect: () => setRejecting(row) }]
      : [];
    return (
      <div className="flex items-center justify-end gap-2">
        {permissions.canCreate && (
          <Button
            size="sm"
            variant="secondary"
            icon={CalendarPlus}
            disabled={!canScheduleOnline}
            title={canScheduleOnline ? undefined : APPROVE_REQUIRED}
            onClick={() => onSchedule({ type: "online", request: row })}
          >
            Randevu ver
          </Button>
        )}
        <ActionMenu items={menu} label={`${row.fullName} için diğer işlemler`} />
      </div>
    );
  }

  const onlineColumns: ListTableColumn<BookingRequestEntry>[] = [
    {
      key: "hasta",
      header: "Hasta",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">{row.fullName}</p>
          {contact(row.phone, row.tcNo && row.tcNo !== "***" ? `TC ${row.tcNo}` : null)}
        </div>
      ),
    },
    {
      key: "tercih",
      header: "Tercih",
      render: (row) => {
        const pref = preferredText(row.preferredFrom);
        if (!pref) return <EmptyValue />;
        return (
          <div>
            <p className="text-sm text-slate-800">{formatDayShort(pref.day, now)}</p>
            <p className="text-xs text-slate-500">{pref.period}{row.doctor?.fullName ? ` · ${row.doctor.fullName}` : ""}</p>
            {row.status === "BEKLIYOR" && pref.key < todayKey && <Badge tone="warning" className="mt-1">Tarihi geçti</Badge>}
          </div>
        );
      },
    },
    { key: "not", header: "Not", render: (row) => (row.note ? <span className="line-clamp-2 text-xs text-slate-600">{row.note}</span> : <EmptyValue />) },
    { key: "gelis", header: "Gönderildi", cellClassName: "whitespace-nowrap text-xs text-slate-500", render: (row) => sinceText(row.createdAt, now) },
    { key: "actions", header: "", align: "right", render: (row) => onlineActions(row) },
  ];

  function waitlistActions(row: WaitlistEntry) {
    if (!permissions.canCreate) return null;
    return (
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => onSchedule({ type: "waitlist", entry: row })}>Randevu ver</Button>
        <ActionMenu
          label={`${row.patient.fullName} için diğer işlemler`}
          items={[
            ...(canTrackCalls ? [{ key: "ara", label: "Hasta aramalarına ekle", icon: PhoneCall, disabled: busyId === row.id, onSelect: () => void addToCalls(row) }] : []),
            { key: "cikar", label: "Listeden çıkar", icon: X, danger: true, separatorBefore: canTrackCalls, disabled: busyId === row.id, onSelect: () => void removeEntry(row) },
          ]}
        />
      </div>
    );
  }

  const waitlistColumns: ListTableColumn<WaitlistEntry>[] = [
    {
      key: "hasta",
      header: "Hasta",
      cellClassName: "min-w-[11rem]",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">{row.patient.fullName}</p>
          {contact(row.patient.phone)}
        </div>
      ),
    },
    {
      key: "tercih",
      header: "Uygun zaman",
      render: (row) => {
        const from = preferredText(row.preferredFrom);
        const to = preferredText(row.preferredTo);
        // "En geç" tarihi geçtiyse hasta artık o aralıkta beklemiyor olabilir.
        const lastKey = to?.key || null;
        return (
          <div>
            <p className="text-sm text-slate-800">{from ? formatDayShort(from.day, now) : "Tarih fark etmez"}{to ? ` – ${formatDayShort(to.day, now)}` : ""}</p>
            <p className="text-xs text-slate-500">{row.doctor?.fullName || "Doktor fark etmez"}</p>
            {lastKey && lastKey < todayKey && <Badge tone="warning" className="mt-1">Tarihi geçti</Badge>}
          </div>
        );
      },
    },
    {
      key: "not",
      header: "Not",
      render: (row) => {
        const text = String(row.note || "").split("\n").filter((line) => !line.startsWith("[")).join(" ");
        return text ? <span className="line-clamp-2 text-xs text-slate-600">{text}</span> : <EmptyValue />;
      },
    },
    { key: "actions", header: "", align: "right", render: (row) => waitlistActions(row) },
  ];

  const onlineCard = (row: BookingRequestEntry) => {
    const pref = preferredText(row.preferredFrom);
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-slate-800">{row.fullName}</p>
            {contact(row.phone)}
          </div>
          {row.status === "BEKLIYOR" && pref && pref.key < todayKey && <Badge tone="warning">Tarihi geçti</Badge>}
        </div>
        <p className="text-xs text-slate-600">
          {pref ? `${formatDayShort(pref.day, now)} · ${pref.period}` : "Tarih yok"}{row.doctor?.fullName ? ` · ${row.doctor.fullName}` : ""}
          <span className="text-slate-400"> · {sinceText(row.createdAt, now)}</span>
        </p>
        {row.note && <p className="text-xs text-slate-500">{row.note}</p>}
        {onlineActions(row)}
      </div>
    );
  };

  const waitlistCard = (row: WaitlistEntry) => {
    const from = preferredText(row.preferredFrom);
    const text = String(row.note || "").split("\n").filter((line) => !line.startsWith("[")).join(" ");
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-slate-800">{row.patient.fullName}</p>
            {contact(row.patient.phone)}
          </div>
        </div>
        <p className="text-xs text-slate-600">{from ? formatDayShort(from.day, now) : "Tarih fark etmez"} · {row.doctor?.fullName || "Doktor fark etmez"}</p>
        {text && <p className="text-xs text-slate-500">{text}</p>}
        {waitlistActions(row)}
      </div>
    );
  };

  return (
    <>
      <Modal open module="calendar" size="xl" onClose={onClose} trackFormChanges={false} title="Talepler">
        <div className="space-y-3">
          <Tabs
            ariaLabel="Talep listeleri"
            size="sm"
            value={tab}
            onChange={setTab}
            items={[
              { key: "online", label: "Online talepler", count: pending.loaded ? pending.items.length : undefined, countTone: "warning", countLabel: "bekleyen online talep" },
              { key: "bekleme", label: "Bekleme listesi", count: waitlist.loaded ? activeWaitlist.length : undefined, countTone: "neutral", countLabel: "bekleme listesindeki hasta" },
            ]}
          />

          {tab === "online" && permissions.canCreate && !permissions.canApprove && pending.items.length > 0 && (
            // Varsayılan rollerde Banko talepleri görür ama işleyemez; önceden nedeni yazmıyordu (denetim G7).
            <Callout tone="neutral" compact>{APPROVE_REQUIRED}</Callout>
          )}
          {tab === "online" ? (
            <ListTable
              columns={onlineColumns}
              rows={onlineRows}
              rowKey={(row) => row.id}
              header={(
                <div className="border-b border-slate-100 px-4 py-2.5">
                  <ChoiceCards
                    label="Talep durumu"
                    labelHidden
                    variant="pills"
                    value={onlineStatus}
                    onChange={setOnlineStatus}
                    options={[
                      { value: "BEKLIYOR", label: "Bekleyen", count: pending.loaded ? pending.items.length : undefined, countTone: "warning" },
                      { value: "ONAYLANDI", label: "Randevu verilen" },
                      { value: "REDDEDILDI", label: "Reddedilen" },
                    ]}
                  />
                </div>
              )}
              loading={online.loading && !online.loaded}
              error={online.loaded ? null : online.error}
              staleError={online.loaded ? online.error : null}
              onRetry={() => void online.reload()}
              emptyText={onlineStatus === "BEKLIYOR" ? "Bekleyen online talep yok" : onlineStatus === "ONAYLANDI" ? "Randevu verilmiş talep yok" : "Reddedilmiş talep yok"}
              emptyDescription={onlineStatus === "BEKLIYOR" ? "Hastalar kliniğin online randevu bağlantısından talep gönderdiğinde burada görünür." : undefined}
              mobileCard={onlineCard}
            />
          ) : (
            <ListTable
              columns={waitlistColumns}
              rows={activeWaitlist}
              rowKey={(row) => row.id}
              header={permissions.canCreate ? (
                <div className="flex items-center justify-end gap-2 border-b border-slate-100 px-4 py-2.5">
                  <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => setAdding(true)}>Listeye hasta ekle</Button>
                </div>
              ) : undefined}
              loading={waitlist.loading && !waitlist.loaded}
              error={waitlist.loaded ? null : waitlist.error}
              staleError={waitlist.loaded ? waitlist.error : null}
              onRetry={() => void waitlist.reload()}
              emptyText="Bekleme listesi boş"
              emptyDescription="Uygun saat bulunamayan hastayı ekleyin; bir randevu boşalınca buradan randevu verin."
              mobileCard={waitlistCard}
            />
          )}
        </div>
      </Modal>

      {rejecting && (
        <RejectRequestModal
          request={rejecting}
          canSeePhone={permissions.canSeePhone}
          onClose={() => setRejecting(null)}
          onDone={() => {
            pending.setItems((items) => items.filter((item) => item.id !== rejecting.id));
            setRejecting(null);
            onCountsChanged();
          }}
        />
      )}

      {adding && (
        <WaitlistAddModal
          doctors={doctors}
          onClose={() => setAdding(false)}
          onAdded={(entry) => {
            waitlist.setItems((items) => [...items, entry]);
            setAdding(false);
            onCountsChanged();
          }}
        />
      )}
    </>
  );
}

function RejectRequestModal({ request, canSeePhone, onClose, onDone }: { request: BookingRequestEntry; canSeePhone: boolean; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const href = phoneHref(request.phone);

  const reject = async () => {
    setSaving(true);
    setError(null);
    try {
      await clientMutation(`/api/booking-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REDDEDILDI", reason: reason.trim() || undefined }),
      }, "Talep reddedilemedi.");
      showToastSafe({ title: "Talep reddedildi", message: `${request.fullName} — hastaya otomatik mesaj gitmedi.`, type: "success" });
      onDone();
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : "Talep reddedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      open
      size="sm"
      module="calendar"
      onClose={onClose}
      title="Online talebi reddet"
      description={request.fullName}
      onSubmit={() => reject()}
      submitting={saving}
      submitLabel="Reddet"
      submitVariant="danger"
      error={error}
      formClassName="space-y-3"
    >
      <p className="text-sm text-slate-600">
        Hastaya otomatik mesaj gitmez.
        {canSeePhone && href ? <> Gerekirse <a href={href} className="font-semibold text-primary hover:underline">{formatPhoneDisplay(request.phone)}</a> numarasından arayıp bilgi verin.</> : " Gerekirse hastayı arayıp bilgi verin."}
      </p>
      <FormField label="Neden" htmlFor="reject-reason" hint="İsteğe bağlı — işlem kayıtlarına yazılır.">
        <Textarea id="reject-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="Ör. istenen gün dolu, hasta başka güne razı değil" />
      </FormField>
    </FormModal>
  );
}

function WaitlistAddModal({ doctors, onClose, onAdded }: { doctors: CalendarDoctor[]; onClose: () => void; onAdded: (entry: WaitlistEntry) => void }) {
  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [doctorId, setDoctorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const todayKey = toDateKey(new Date());

  const save = async () => {
    setError(null);
    if (!patient) { setError("Hasta seçin."); return; }
    if (from && to && from > to) { setError("Son tarih, ilk tarihten önce olamaz."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patient.id,
          doctorId: doctorId || null,
          // Gün olarak saklanır (UTC gece yarısı = "yalnız gün" işareti).
          preferredFrom: from ? `${from}T00:00:00.000Z` : null,
          preferredTo: to ? `${to}T00:00:00.000Z` : null,
          note: note.trim() || null,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || data?.message || "Bekleme listesine eklenemedi.");
      showToastSafe({ message: `${patient.fullName} bekleme listesine eklendi.`, type: "success" });
      onAdded(data as WaitlistEntry);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Bekleme listesine eklenemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      open
      module="calendar"
      onClose={onClose}
      title="Bekleme listesine ekle"
      onSubmit={() => save()}
      submitting={saving}
      error={error}
      formClassName="space-y-3"
    >
      <FormField label="Hasta" required as="div" htmlFor="wl-patient">
        <PatientPicker id="wl-patient" required value={patient} onChange={setPatient} />
      </FormField>
      <FormField label="Doktor tercihi" htmlFor="wl-doctor">
        <DoctorSelect id="wl-doctor" value={doctorId} doctors={doctors} emptyLabel="Fark etmez" onChange={(id) => setDoctorId(id)} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="En erken" htmlFor="wl-from">
          <Input id="wl-from" type="date" value={from} min={todayKey} onChange={(event) => setFrom(event.target.value)} />
        </FormField>
        <FormField label="En geç" htmlFor="wl-to">
          <Input id="wl-to" type="date" value={to} min={from || todayKey} onChange={(event) => setTo(event.target.value)} />
        </FormField>
      </div>
      <FormField label="Not" htmlFor="wl-note">
        <Textarea id="wl-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ör. yalnız sabah saatleri uygun" maxLength={300} />
      </FormField>
    </FormModal>
  );
}
