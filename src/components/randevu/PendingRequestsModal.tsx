"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, PhoneCall, UserPlus, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Textarea } from "@/components/ui/Input";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { ActionMenu } from "@/components/randevu/ActionMenu";
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

type ListState<T> = { items: T[]; loading: boolean; error: string | null };

function useList<T>(url: string) {
  const [state, setState] = useState<ListState<T>>({ items: [], loading: true, error: null });
  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) throw new Error(data?.message || data?.error || "Liste yüklenemedi.");
      setState({ items: data as T[], loading: false, error: null });
    } catch (loadError) {
      setState((prev) => ({ ...prev, loading: false, error: loadError instanceof Error ? loadError.message : "Liste yüklenemedi." }));
    }
  }, [url]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let timer: number | null = null;
    const onRealtime = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 400);
    };
    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
    };
  }, [load]);
  return { ...state, reload: load, setItems: (updater: (items: T[]) => T[]) => setState((prev) => ({ ...prev, items: updater(prev.items) })) };
}

function preferredText(iso: string | null | undefined) {
  const key = preferredDateKeyOf(iso);
  const day = fromDateKey(key);
  if (!day || !key) return null;
  return { day, key, period: preferredPeriodLabel(preferredMinutesOf(iso)) };
}

function stampNow() {
  const now = new Date();
  return `${now.getDate()}.${String(now.getMonth() + 1).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/**
 * "Bekleyenler": internetten gelen randevu talepleri ve bekleme listesi tek
 * pencerede, sayaçlı sekmelerle. Önceden iki ayrı düğmeydi, sayaçları
 * pencere açılmadan boş görünüyordu ve liste yüklenirken "yok" yazıyordu.
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
  const online = useList<BookingRequestEntry>("/api/booking-requests");
  const waitlist = useList<WaitlistEntry>("/api/waitlist");
  const [rejecting, setRejecting] = useState<BookingRequestEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const todayKey = toDateKey(new Date());

  const onlineRows = useMemo(
    () => [...online.items].sort((a, b) => String(preferredDateKeyOf(a.preferredFrom)).localeCompare(String(preferredDateKeyOf(b.preferredFrom)))),
    [online.items],
  );
  const activeWaitlist = useMemo(() => waitlist.items.filter((entry) => entry.status === "BEKLIYOR" || entry.status === "ARANDI"), [waitlist.items]);

  const closeUnlinked = async (request: BookingRequestEntry) => {
    const appointmentId = unlinkedRequests[request.id];
    if (!appointmentId) return;
    setBusyId(request.id);
    const linked = await linkBookingRequest(request.id, appointmentId);
    if (linked.ok) {
      setBusyId(null);
      onUnlinkedResolved(request.id);
      online.setItems((items) => items.filter((item) => item.id !== request.id));
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
      online.setItems((items) => items.filter((item) => item.id !== request.id));
      onCountsChanged();
    } catch (closeError) {
      showToastSafe({ message: closeError instanceof Error ? closeError.message : "Talep kapatılamadı.", type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const markCalled = async (entry: WaitlistEntry, outcome: "ulaşıldı" | "ulaşılamadı") => {
    setBusyId(entry.id);
    try {
      const line = `[${stampNow()}] Arandı: ${outcome}`;
      const nextNote = [entry.note || "", line].filter(Boolean).join("\n").slice(-1000);
      await clientMutation(`/api/waitlist/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARANDI", note: nextNote }),
      }, "Bekleme kaydı güncellenemedi.");
      waitlist.setItems((items) => items.map((item) => (item.id === entry.id ? { ...item, status: "ARANDI", note: nextNote } : item)));
      showToastSafe({ message: `${entry.patient.fullName}: arandı (${outcome}).`, type: "success" });
    } catch (callError) {
      showToastSafe({ message: callError instanceof Error ? callError.message : "Bekleme kaydı güncellenemedi.", type: "error" });
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

  const onlineColumns: ListTableColumn<BookingRequestEntry>[] = [
    {
      key: "hasta",
      header: "Hasta",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">{row.fullName}</p>
          {contact(row.phone, row.tcNo ? `TC ${row.tcNo}` : null)}
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
            <p className="text-sm text-slate-800">{formatDayShort(pref.day)}</p>
            <p className="text-xs text-slate-500">{pref.period}{row.doctor?.fullName ? ` · ${row.doctor.fullName}` : ""}</p>
            {pref.key < todayKey && <Badge tone="warning" className="mt-1">Tarihi geçti</Badge>}
          </div>
        );
      },
    },
    { key: "not", header: "Not", render: (row) => (row.note ? <span className="line-clamp-2 text-xs text-slate-600">{row.note}</span> : <EmptyValue />) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => onlineActions(row),
    },
  ];

  function onlineActions(row: BookingRequestEntry) {
    const unlinked = unlinkedRequests[row.id];
    if (unlinked) {
      return (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge tone="info">Randevu verildi</Badge>
          {permissions.canApprove && <Button size="sm" variant="secondary" loading={busyId === row.id} onClick={() => void closeUnlinked(row)}>Talebi kapat</Button>}
        </div>
      );
    }
    return (
      <div className="flex items-center justify-end gap-2">
        {permissions.canCreate && permissions.canApprove && (
          <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => onSchedule({ type: "online", request: row })}>Randevu ver</Button>
        )}
        {permissions.canApprove && <IconButton icon={X} tone="danger" size="sm" title="Talebi reddet" onClick={() => setRejecting(row)} />}
      </div>
    );
  }

  const waitlistColumns: ListTableColumn<WaitlistEntry>[] = [
    {
      key: "hasta",
      header: "Hasta",
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
        return (
          <div>
            <p className="text-sm text-slate-800">{from ? formatDayShort(from.day) : "Tarih fark etmez"}{to ? ` – ${formatDayShort(to.day)}` : ""}</p>
            <p className="text-xs text-slate-500">{row.doctor?.fullName || "Doktor fark etmez"}</p>
          </div>
        );
      },
    },
    { key: "not", header: "Not", render: (row) => (row.note ? <span className="line-clamp-2 whitespace-pre-line text-xs text-slate-600">{row.note}</span> : <EmptyValue />) },
    {
      key: "durum",
      header: "Durum",
      render: (row) => <Badge tone={row.status === "ARANDI" ? "info" : "warning"}>{row.status === "ARANDI" ? "Arandı" : "Aranacak"}</Badge>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => waitlistActions(row),
    },
  ];

  function waitlistActions(row: WaitlistEntry) {
    if (!permissions.canCreate) return null;
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => onSchedule({ type: "waitlist", entry: row })}>Randevu ver</Button>
        <ActionMenu
          label="Arandı"
          size="sm"
          icon={PhoneCall}
          items={[
            { key: "ok", label: "Ulaşıldı", onSelect: () => void markCalled(row, "ulaşıldı") },
            { key: "no", label: "Ulaşılamadı", onSelect: () => void markCalled(row, "ulaşılamadı") },
          ]}
        />
        <IconButton icon={X} tone="danger" size="sm" title="Listeden çıkar" disabled={busyId === row.id} onClick={() => void removeEntry(row)} />
      </div>
    );
  }

  const onlineCard = (row: BookingRequestEntry) => {
    const pref = preferredText(row.preferredFrom);
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-slate-800">{row.fullName}</p>
            {contact(row.phone, row.tcNo ? `TC ${row.tcNo}` : null)}
          </div>
          {pref && pref.key < todayKey && <Badge tone="warning">Tarihi geçti</Badge>}
        </div>
        <p className="text-xs text-slate-600">{pref ? `${formatDayShort(pref.day)} · ${pref.period}` : "Tarih yok"}{row.doctor?.fullName ? ` · ${row.doctor.fullName}` : ""}</p>
        {row.note && <p className="text-xs text-slate-500">{row.note}</p>}
        {onlineActions(row)}
      </div>
    );
  };

  const waitlistCard = (row: WaitlistEntry) => {
    const from = preferredText(row.preferredFrom);
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-slate-800">{row.patient.fullName}</p>
            {contact(row.patient.phone)}
          </div>
          <Badge tone={row.status === "ARANDI" ? "info" : "warning"}>{row.status === "ARANDI" ? "Arandı" : "Aranacak"}</Badge>
        </div>
        <p className="text-xs text-slate-600">{from ? formatDayShort(from.day) : "Tarih fark etmez"} · {row.doctor?.fullName || "Doktor fark etmez"}</p>
        {row.note && <p className="whitespace-pre-line text-xs text-slate-500">{row.note}</p>}
        {waitlistActions(row)}
      </div>
    );
  };

  return (
    <>
      <Modal open module="calendar" size="xl" onClose={onClose} trackFormChanges={false} title="Bekleyenler" description="Randevu verilmeyi bekleyen hastalar: internetten gelen talepler ve bekleme listesi.">
        <div className="space-y-3">
          <Tabs
            ariaLabel="Bekleyen hasta listeleri"
            size="sm"
            value={tab}
            onChange={setTab}
            items={[
              { key: "online", label: "Online talepler", count: online.loading ? undefined : online.items.length, countTone: "warning" },
              { key: "bekleme", label: "Bekleme listesi", count: waitlist.loading ? undefined : activeWaitlist.length, countTone: "neutral" },
            ]}
          />

          {tab === "online" ? (
            <>
              <p className="text-xs text-slate-500">Hasta internetten tercih bildirdi; uygun saati bulup randevu verin. Reddetmek hastaya otomatik mesaj göndermez — gerekirse hastayı arayın.</p>
              <ListTable
                columns={onlineColumns}
                rows={onlineRows}
                rowKey={(row) => row.id}
                loading={online.loading}
                error={online.error}
                onRetry={() => void online.reload()}
                emptyText="Bekleyen online talep yok"
                emptyDescription="Hastalar klinik bağlantınızdan talep gönderdiğinde burada görünür."
                mobileCard={onlineCard}
              />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">Boşalan bir saat için aranacak hastalar. İptal veya gelmeyen randevudan sonra buraya bakın.</p>
                {permissions.canCreate && <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => setAdding(true)}>Listeye hasta ekle</Button>}
              </div>
              <ListTable
                columns={waitlistColumns}
                rows={activeWaitlist}
                rowKey={(row) => row.id}
                loading={waitlist.loading}
                error={waitlist.error}
                onRetry={() => void waitlist.reload()}
                emptyText="Bekleme listesi boş"
                emptyDescription="Uygun saat bulunamayan hastaları ekleyin; bir randevu boşalınca buradan arayın."
                mobileCard={waitlistCard}
              />
            </>
          )}
        </div>
      </Modal>

      {rejecting && (
        <RejectRequestModal
          request={rejecting}
          canSeePhone={permissions.canSeePhone}
          onClose={() => setRejecting(null)}
          onDone={() => {
            online.setItems((items) => items.filter((item) => item.id !== rejecting.id));
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
    <Modal
      open
      size="sm"
      module="calendar"
      onClose={onClose}
      title="Online talebi reddet"
      description={request.fullName}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button variant="danger" loading={saving} onClick={() => void reject()}>Reddet</Button>
        </>
      )}
    >
      <div className="space-y-3">
        <FormErrorBanner message={error} />
        <p className="text-sm text-slate-600">
          Hastaya otomatik mesaj gitmez.
          {canSeePhone && href ? <> Gerekirse <a href={href} className="font-semibold text-primary hover:underline">{formatPhoneDisplay(request.phone)}</a> numarasından arayıp bilgi verin.</> : " Gerekirse hastayı arayıp bilgi verin."}
        </p>
        <FormField label="Neden" htmlFor="reject-reason" hint="İsteğe bağlı — işlem kayıtlarına yazılır.">
          <Textarea id="reject-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="Ör. istenen gün dolu, hasta başka güne razı değil" />
        </FormField>
      </div>
    </Modal>
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
    <Modal
      open
      module="calendar"
      onClose={onClose}
      title="Bekleme listesine ekle"
      description="Uygun saat bulunamayan hastayı ekleyin; bir randevu boşalınca listeden arayın."
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button loading={saving} onClick={() => void save()}>Kaydet</Button>
        </>
      )}
    >
      <div className="space-y-3">
        <FormErrorBanner message={error} />
        <FormField label="Hasta" required htmlFor="wl-patient">
          <PatientPicker id="wl-patient" value={patient} onChange={setPatient} />
        </FormField>
        <FormField label="Doktor tercihi" htmlFor="wl-doctor">
          <DoctorSelect id="wl-doctor" value={doctorId} doctors={doctors} emptyLabel="Fark etmez" onChange={(id) => setDoctorId(id)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="En erken" htmlFor="wl-from">
            <Input id="wl-from" type="date" value={from} min={toDateKey(new Date())} onChange={(event) => setFrom(event.target.value)} />
          </FormField>
          <FormField label="En geç" htmlFor="wl-to">
            <Input id="wl-to" type="date" value={to} min={from || toDateKey(new Date())} onChange={(event) => setTo(event.target.value)} />
          </FormField>
        </div>
        <FormField label="Not" htmlFor="wl-note" hint="İsteğe bağlı">
          <Input id="wl-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ör. yalnız sabah saatleri uygun" maxLength={300} />
        </FormField>
      </div>
    </Modal>
  );
}
