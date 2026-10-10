"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { showToastSafe } from "@/lib/toast-client";
import { patchAppointment } from "@/components/randevu/appointment-api";
import { STATUS_ICON, displayStatus, formatClock, formatDayShort, statusChipLabel, statusTone } from "@/components/randevu/appointment-utils";
import { CONNECTION_ERROR, readApiError } from "./home-data";

type OpenPastItem = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  patient: { id: string; fullName: string } | null;
  doctor: { id: string; fullName: string } | null;
};

type OpenPastState = { items: OpenPastItem[]; count: number; lookbackDays: number };

type OpenPastModalProps = {
  open: boolean;
  onClose: () => void;
  /** Bir randevu kapatıldı — sayılar yenilensin. */
  onChanged: () => void;
};

/**
 * Önceki günlerden durumu işaretlenmemiş randevular ("Planlandı"/"Bekliyor"
 * kalmış). Durum kendiliğinden değişmez; personel burada tek tıkla
 * Tamamlandı ya da Gelmedi seçer (hatırlatma, paket seansı ve hakediş doğru
 * kapanır). Randevular sayfasındaki "Anasayfada kapat" bağlantısı bu pencereyi
 * açar (#acik-kalanlar).
 */
export function OpenPastModal({ open, onClose, onChanged }: OpenPastModalProps) {
  const [state, setState] = useState<OpenPastState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/dashboard/today", { cache: "no-store" });
      if (!response.ok) throw new Error(await readApiError(response, "Açık kalan randevular yüklenemedi."));
      const data = await response.json();
      const openPast = data?.openPast;
      setState({
        items: Array.isArray(openPast?.items) ? openPast.items : [],
        count: Number(openPast?.count || 0),
        lookbackDays: Number(openPast?.lookbackDays || 60),
      });
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof TypeError ? CONNECTION_ERROR : loadError instanceof Error ? loadError.message : "Açık kalan randevular yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const mark = async (item: OpenPastItem, status: "TAMAMLANDI" | "GELMEDI") => {
    if (busy) return;
    setBusy(`${item.id}:${status}`);
    const result = await patchAppointment(item.id, { status });
    setBusy(null);
    if (!result.ok) {
      // Boş ileti: kullanıcı sunucunun onay sorusunu reddetti — gösterilecek hata yok.
      if (result.message) showToastSafe({ title: "Randevu güncellenemedi", message: result.message, type: "error" });
      return;
    }
    const remaining = (state?.items.length || 1) - 1;
    const remainingCount = Math.max(0, (state?.count || 1) - 1);
    setState((current) => current && { ...current, items: current.items.filter((row) => row.id !== item.id), count: Math.max(0, current.count - 1) });
    showToastSafe({ message: `${item.patient?.fullName || "Hasta"} · ${statusChipLabel(status)}`, type: "success" });
    onChanged();
    // Gösterilenlerin hepsi kapandıysa sıradaki açık randevular getirilir.
    if (remaining === 0 && remainingCount > 0) void load();
  };

  const appointmentCell = (row: OpenPastItem) => {
    const Icon = STATUS_ICON[displayStatus(row.status)];
    return (
      <div className="min-w-0 space-y-1">
        <p className="truncate font-semibold text-slate-800">{row.patient?.fullName || "Hasta"}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className="tabular-nums">{formatDayShort(new Date(row.startAt))} · {formatClock(row.startAt)}</span>
          <Badge tone={statusTone(row.status)} icon={Icon}>{statusChipLabel(row.status)}</Badge>
        </p>
      </div>
    );
  };

  const actions = (row: OpenPastItem) => (
    <div className="flex flex-wrap justify-end gap-2">
      <Button size="sm" variant="secondary" icon={Check} loading={busy === `${row.id}:TAMAMLANDI`} disabled={Boolean(busy)} onClick={() => void mark(row, "TAMAMLANDI")}>
        Tamamlandı
      </Button>
      {/* Gelmiş (Bekliyor) hasta için "Gelmedi" anlamsız: yalnız Planlandı kalanlarda. */}
      {row.status !== "GELDI" && (
        <Button size="sm" variant="secondary" icon={AlertTriangle} loading={busy === `${row.id}:GELMEDI`} disabled={Boolean(busy)} onClick={() => void mark(row, "GELMEDI")}>
          Gelmedi
        </Button>
      )}
    </div>
  );

  const columns: ListTableColumn<OpenPastItem>[] = [
    { key: "randevu", header: "Randevu", render: appointmentCell },
    { key: "doktor", header: "Doktor", cellClassName: "whitespace-nowrap", render: (row) => row.doctor?.fullName || <EmptyValue /> },
    { key: "actions", header: "", align: "right", render: actions },
  ];

  const shown = state?.items.length || 0;
  const hidden = state ? Math.max(0, state.count - shown) : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      module="calendar"
      size="lg"
      trackFormChanges={false}
      title="Açık kalan randevular"
      description={`Son ${state?.lookbackDays || 60} günde durumu işaretlenmemiş randevular. Durum kendiliğinden değişmez.`}
      footer={<Button variant="secondary" onClick={onClose}>Kapat</Button>}
    >
      <div className="space-y-3">
        {hidden > 0 && (
          <Callout tone="neutral" compact>
            En yeni {shown} randevu gösteriliyor. Bunları işaretleyince kalan {hidden} randevu listelenir.
          </Callout>
        )}
        <ListTable
          columns={columns}
          rows={state?.items || []}
          rowKey={(row) => row.id}
          loading={loading && !state}
          skeletonRows={3}
          error={!state ? error : null}
          staleError={state ? error : null}
          onRetry={() => void load()}
          emptyText="Açık kalan randevu yok"
          emptyDescription="Önceki günlerin bütün randevuları işaretlenmiş."
          mobileCard={(row) => (
            <div className="space-y-2">
              {appointmentCell(row)}
              <p className="text-xs text-slate-500">{row.doctor?.fullName || "—"}</p>
              {actions(row)}
            </div>
          )}
        />
      </div>
    </Modal>
  );
}
