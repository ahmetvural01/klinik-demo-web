"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { Switch } from "@/components/ui/Switch";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { renderSmsPreview } from "@/lib/sms-template-placeholders";
import { formatCount, longDateWithWeekday } from "@/components/sms/communication-labels";

type CelebrationRow = {
  code: string;
  title: string;
  targetProfessions: string[];
  messageTemplate: string;
  whatsappMessageTemplate: string | null;
  enabled: boolean;
  nextDate: string | null;
  audience?: { total: number; consented: number };
  sentThisYear?: number;
};

function audienceLabel(row: CelebrationRow) {
  return row.targetProfessions.length ? `${row.targetProfessions.join(", ")} mesleğindeki hastalar` : "Tüm hastalar";
}

/**
 * Bayram ve özel günler: sıradaki gerçek tarih, kime gideceği, bu şubedeki
 * alıcı sayısı ve otomatik gönderim anahtarı. Açarken ne olacağı (her yıl,
 * tüm şubeler, kaç kişi, kredi) onay penceresinde söylenir. Açma/kapama
 * toplu gönderim yetkisi ister (api/celebration-days/[code] → sms:bulk).
 */
export function CelebrationList({ canToggle, clinicName, showWhatsapp }: { canToggle: boolean; clinicName: string; showWhatsapp: boolean }) {
  const [rows, setRows] = useState<CelebrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<CelebrationRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/celebration-days", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Özel günler yüklenemedi.");
      setRows(Array.isArray(data?.days) ? data.days : []);
    } catch (loadError) {
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : "Özel günler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sorted = useMemo(() => [...rows].sort((a, b) => (a.nextDate || "9999").localeCompare(b.nextDate || "9999")), [rows]);

  const toggle = async (row: CelebrationRow, next: boolean) => {
    if (next) {
      const consented = row.audience?.consented ?? 0;
      const total = row.audience?.total ?? 0;
      const ok = await confirmDialog({
        title: `“${row.title}” otomatik gönderilsin mi?`,
        message: [
          row.nextDate ? `Her yıl bu gün (sıradaki: ${longDateWithWeekday(row.nextDate)})` : "Her yıl bu gün",
          `kurumun tüm şubelerindeki ${row.targetProfessions.length ? `${row.targetProfessions.join(", ")} mesleğindeki ` : ""}hastalara kutlama mesajı gider.`,
          `Bu şubede ${formatCount(total)} hasta var; izni olan ${formatCount(consented)} hastaya gider, izni olmayana gitmez.`,
          "Her SMS 1 kredi harcar.",
        ].join(" "),
        confirmText: "Otomatik gönder",
        cancelText: "Vazgeç",
      });
      if (!ok) return;
    }
    setSavingCode(row.code);
    try {
      const response = await fetch(`/api/celebration-days/${encodeURIComponent(row.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Güncellenemedi.");
      setRows((current) => current.map((item) => (item.code === row.code ? { ...item, enabled: next } : item)));
      showToastSafe({ message: next ? `“${row.title}” her yıl otomatik gönderilecek.` : `“${row.title}” artık otomatik gönderilmeyecek.`, type: "success" });
    } catch (toggleError) {
      showToastSafe({ message: toggleError instanceof Error ? toggleError.message : "Güncellenemedi.", type: "error" });
    } finally {
      setSavingCode(null);
    }
  };

  const toggleCell = (row: CelebrationRow) => (
    <Switch
      checked={row.enabled}
      disabled={!canToggle || savingCode === row.code}
      onChange={(checked) => void toggle(row, checked)}
      label={<span className="sr-only">{row.title} otomatik gönderilsin</span>}
      aria-label={`${row.title} otomatik gönderilsin`}
    />
  );

  const columns: ListTableColumn<CelebrationRow>[] = [
    { key: "date", header: "Sıradaki tarih", cellClassName: "whitespace-nowrap text-slate-700", render: (row) => (row.nextDate ? longDateWithWeekday(row.nextDate) : <EmptyValue />) },
    {
      key: "title",
      header: "Gün",
      render: (row) => (
        <span className="flex flex-col">
          <span className="font-semibold text-slate-900">{row.title}</span>
          <span className="text-xs text-slate-500">{audienceLabel(row)}</span>
        </span>
      ),
    },
    {
      key: "audience",
      header: "Bu şubede",
      cellClassName: "whitespace-nowrap text-slate-600",
      render: (row) => (row.audience ? `${formatCount(row.audience.total)} hasta · ${formatCount(row.audience.consented)} izinli` : <EmptyValue />),
    },
    { key: "auto", header: "Otomatik gönder", align: "right", render: toggleCell },
  ];

  const preview = (template: string) => renderSmsPreview(template, { institutionName: clinicName || undefined });

  return (
    <div className="space-y-2">
      {!canToggle && <p className="text-xs text-slate-500">Açıp kapatmak toplu mesaj yetkisi ister; yetkiniz yoksa yalnız görüntüleyebilirsiniz.</p>}
      <ListTable<CelebrationRow>
        columns={columns}
        rows={sorted}
        rowKey={(row) => row.code}
        loading={loading}
        error={error || null}
        onRetry={() => void load()}
        emptyText="Tanımlı özel gün yok"
        onRowClick={setDetail}
        getRowAriaLabel={(row) => `${row.title} mesaj metni`}
        mobileCard={(row) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{row.title}</p>
              <p className="text-xs text-slate-500">{row.nextDate ? longDateWithWeekday(row.nextDate) : "—"}</p>
              <p className="text-xs text-slate-500">{audienceLabel(row)}{row.audience ? ` · bu şubede ${formatCount(row.audience.consented)} izinli` : ""}</p>
            </div>
            {toggleCell(row)}
          </div>
        )}
      />
      <Modal
        module="sms"
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.title || "Özel gün"}
        description={detail ? `${detail.nextDate ? longDateWithWeekday(detail.nextDate) : ""} · ${audienceLabel(detail)}` : undefined}
        trackFormChanges={false}
        footer={<Button variant="secondary" onClick={() => setDetail(null)}>Kapat</Button>}
      >
        {detail && (
          <div className="space-y-3 text-sm">
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">Hastaya giden metin (SMS)</p>
              <p className="rounded-lg bg-slate-50 px-3 py-2 leading-5 text-slate-800">{preview(detail.messageTemplate)}</p>
            </div>
            {showWhatsapp && detail.whatsappMessageTemplate && detail.whatsappMessageTemplate !== detail.messageTemplate && (
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-500">WhatsApp metni</p>
                <p className="rounded-lg bg-emerald-50/60 px-3 py-2 leading-5 text-slate-800">{preview(detail.whatsappMessageTemplate)}</p>
              </div>
            )}
            <p className="text-slate-600">
              {detail.enabled ? "Otomatik gönderim açık." : "Otomatik gönderim kapalı; Mesaj Gönder'de hazır metin olarak elle kullanılabilir."}
              {typeof detail.sentThisYear === "number" ? ` Bu yıl bu şubede ${formatCount(detail.sentThisYear)} hastaya gönderildi.` : ""}
            </p>
            <p className="text-xs text-slate-500">Bu metinler sistem yöneticisi tarafından hazırlanır; metinde hata görürseniz Destek&apos;ten bildirin.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
