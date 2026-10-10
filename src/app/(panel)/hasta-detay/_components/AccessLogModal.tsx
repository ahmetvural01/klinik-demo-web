"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { formatDateText } from "@/components/ui/Money";
import { roleLabel } from "@/lib/staff-roles";
import { errorMessageOf } from "./patient-file-shared";

type AccessRecord = {
  id: string;
  action: string;
  purpose?: string | null;
  createdAt: string;
  user?: { id: string; fullName: string; role: string } | null;
};

const ACTION_LABELS: Record<string, string> = {
  DOSYA_GORUNTULEME: "Dosyayı açtı",
  VERI_DISA_AKTARMA: "Dosyayı indirdi",
  BELGE_ONIZLEME: "Belge görüntüledi",
};

/**
 * Hasta dosyasının KVKK erişim kaydı: kim, ne zaman, ne yaptı. Kayıt sunucuda
 * her dosya açılışında ve indirmede zaten tutuluyordu ama hiçbir ekranda
 * görünmüyordu. Yalnız Denetim Günlüğü yetkisi olan (varsayılan: yönetici)
 * görür; son 200 kayıt.
 */
export function AccessLogModal({ open, onClose, patientId, patientName }: { open: boolean; onClose: () => void; patientId: string; patientName: string }) {
  const [records, setRecords] = useState<AccessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/patients/${encodeURIComponent(patientId)}/access-log`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(errorMessageOf(body, "Erişim kaydı yüklenemedi."));
        setRecords(Array.isArray(body) ? body : []);
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Erişim kaydı yüklenemedi.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, patientId, reloadKey]);

  const columns: ListTableColumn<AccessRecord>[] = [
    { key: "date", header: "Tarih", render: (record) => <span className="whitespace-nowrap tabular-nums">{formatDateText(record.createdAt, "datetime")}</span> },
    { key: "user", header: "Personel", render: (record) => (record.user ? <span>{record.user.fullName} <span className="text-xs text-slate-500">· {roleLabel(record.user.role)}</span></span> : <EmptyValue />) },
    { key: "action", header: "İşlem", render: (record) => ACTION_LABELS[record.action] || record.action },
    { key: "purpose", header: "Amaç / ayrıntı", render: (record) => record.purpose || <EmptyValue /> },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Erişim kaydı"
      description={`${patientName} · dosyayı kimin ne zaman açtığı (son 200 kayıt)`}
      size="xl"
      trackFormChanges={false}
    >
      <ListTable
        columns={columns}
        rows={records}
        rowKey={(record) => record.id}
        loading={loading}
        error={error || null}
        onRetry={() => setReloadKey((key) => key + 1)}
        emptyIcon={History}
        emptyText="Erişim kaydı yok"
        mobileCard={(record) => (
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-slate-800">{record.user?.fullName || "—"} · {ACTION_LABELS[record.action] || record.action}</p>
            <p className="text-xs text-slate-500">{[formatDateText(record.createdAt, "datetime"), record.purpose].filter(Boolean).join(" · ")}</p>
          </div>
        )}
      />
    </Modal>
  );
}
