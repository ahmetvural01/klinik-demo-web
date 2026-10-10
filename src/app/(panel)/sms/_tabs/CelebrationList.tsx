"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Eye } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { Switch } from "@/components/ui/Switch";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { renderSmsPreview } from "@/lib/sms-template-placeholders";
import { formatCount, longDateWithWeekday } from "@/components/sms/communication-labels";
import type { CelebrationDay } from "@/components/sms/communication-status";

function audienceLabel(row: CelebrationDay) {
  return row.targetProfessions.length ? `${row.targetProfessions.join(", ")} mesleğindeki hastalar` : "Tüm hastalar";
}

function reachLabel(row: CelebrationDay) {
  if (!row.audience) return "";
  return `${formatCount(row.audience.total)} hasta · ${formatCount(row.audience.consented)} kişiye gider`;
}

type CelebrationManageModalProps = {
  open: boolean;
  onClose: () => void;
  /** Açıp kapatmak toplu gönderim yetkisi ister (api/celebration-days/[code] → sms:bulk). */
  canToggle: boolean;
  clinicName: string;
  multipleBranches: boolean;
  /**
   * WhatsApp bağlı ve kullanıcı WhatsApp'ı görebiliyor: özel günün WhatsApp
   * metni SMS metninden farklıysa ayrıca gösterilir (kutlama taraması WhatsApp'ta
   * bu metni gönderir — src/lib/celebration-sms.ts).
   */
  showWhatsappText?: boolean;
  /** Açma/kapama kaydedildi — Otomatik mesajlar özet satırı güncellensin. */
  onToggled: (code: string, enabled: boolean) => void;
};

/**
 * Bayram ve özel günler penceresi: sıradaki gerçek tarih, kime gideceği, bu
 * şubede kaç kişiye gideceği (bugünkü kanal ayarıyla) ve otomatik gönderim
 * anahtarı. Otomatik mesajlar listesinde tek satır özet olarak durur;
 * 16 satırlık tablo artık sayfayı uzatmaz. Açmadan önce ne olacağı (her yıl,
 * tüm şubeler, kaç kişi, kredi) onay penceresinde söylenir. Metin satırdaki
 * "Metni gör" ile aynı pencerede açılır (satıra tıklama + içindeki anahtar iç
 * içe etkileşimli öğe oluşturuyordu).
 */
export function CelebrationManageModal({ open, onClose, canToggle, clinicName, multipleBranches, showWhatsappText = false, onToggled }: CelebrationManageModalProps) {
  const [rows, setRows] = useState<CelebrationDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [detailCode, setDetailCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/celebration-days", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Özel günler yüklenemedi.");
      setRows(Array.isArray(data?.days) ? data.days : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Özel günler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Pencere her açılışta güncel sayılarla yüklenir (sayılar hastalar ve kanal ayarıyla değişir).
  useEffect(() => {
    if (!open) return;
    setDetailCode(null);
    void load();
  }, [load, open]);

  const sorted = useMemo(() => [...rows].sort((a, b) => (a.nextDate || "9999").localeCompare(b.nextDate || "9999")), [rows]);
  const detail = detailCode ? rows.find((row) => row.code === detailCode) || null : null;
  const detailWhatsappText = showWhatsappText && detail?.whatsappMessageTemplate && detail.whatsappMessageTemplate !== detail.messageTemplate
    ? detail.whatsappMessageTemplate
    : null;

  const toggle = async (row: CelebrationDay, next: boolean) => {
    if (next) {
      const ok = await confirmDialog({
        title: `“${row.title}” her yıl otomatik gönderilsin mi?`,
        message: [
          row.nextDate ? `Sıradaki: ${longDateWithWeekday(row.nextDate)}.` : "",
          `${audienceLabel(row)}; bu şubede ${formatCount(row.audience?.consented ?? 0)} kişiye gider${multipleBranches ? ", diğer şubelerde de gider" : ""}.`,
          "SMS ile gidenler kredi harcar.",
        ].filter(Boolean).join(" "),
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
      onToggled(row.code, next);
      showToastSafe({ message: next ? `“${row.title}” her yıl otomatik gönderilecek.` : `“${row.title}” artık otomatik gönderilmeyecek.`, type: "success" });
    } catch (toggleError) {
      showToastSafe({ message: toggleError instanceof Error ? toggleError.message : "Güncellenemedi.", type: "error" });
    } finally {
      setSavingCode(null);
    }
  };

  const toggleCell = (row: CelebrationDay) => (
    <Switch
      checked={row.enabled}
      disabled={!canToggle || savingCode === row.code}
      onChange={(checked) => void toggle(row, checked)}
      label={`${row.title} otomatik gönderilsin`}
      labelHidden
    />
  );

  const textButton = (row: CelebrationDay) => (
    <IconButton icon={Eye} size="sm" title={`${row.title} metnini gör`} onClick={() => setDetailCode(row.code)} />
  );

  const columns: ListTableColumn<CelebrationDay>[] = [
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
      headerHint: "Bugünkü kanal ayarıyla (SMS izni, WhatsApp) mesajın gidebileceği hasta sayısı.",
      cellClassName: "whitespace-nowrap text-slate-600",
      render: (row) => reachLabel(row) || <EmptyValue />,
    },
    { key: "text", header: "Metin", align: "center", render: textButton },
    { key: "auto", header: "Otomatik", align: "right", render: toggleCell },
  ];

  const preview = (template: string) => renderSmsPreview(template, { institutionName: clinicName || undefined });

  return (
    <Modal
      module="sms"
      open={open}
      onClose={onClose}
      size="xl"
      title={detail ? detail.title : "Bayram ve özel günler"}
      description={detail
        ? [detail.nextDate ? longDateWithWeekday(detail.nextDate) : "", audienceLabel(detail)].filter(Boolean).join(" · ")
        : canToggle
          ? "Açtığınız gün her yıl, kurumun tüm şubelerindeki uygun hastalara gider."
          : "Açıp kapatmak toplu mesaj yetkisi ister."}
      trackFormChanges={false}
      footer={detail ? (
        <>
          <Button variant="ghost" icon={ChevronLeft} className="mr-auto" onClick={() => setDetailCode(null)}>Listeye dön</Button>
          <Button variant="secondary" onClick={onClose}>Kapat</Button>
        </>
      ) : (
        <Button variant="secondary" onClick={onClose}>Kapat</Button>
      )}
    >
      {detail ? (
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-500">{detailWhatsappText ? "SMS ile giden metin" : "Hastaya giden metin"}</p>
            <p className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-800">{preview(detail.messageTemplate)}</p>
          </div>
          {detailWhatsappText && (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">WhatsApp ile giden metin</p>
              <p className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-800">{preview(detailWhatsappText)}</p>
            </div>
          )}
          <DescriptionList
            layout="rows"
            items={[
              { key: "durum", label: "Otomatik gönderim", value: detail.enabled ? "Açık" : "Kapalı" },
              { key: "bu-sube", label: "Bu şubede", value: reachLabel(detail) },
              { key: "bu-yil", label: "Bu yıl gönderilen", value: typeof detail.sentThisYear === "number" ? `${formatCount(detail.sentThisYear)} hasta` : null },
            ]}
          />
          <p className="text-xs text-slate-500">Metni sistem yöneticisi hazırlar; hata görürseniz Destek&apos;ten bildirin.</p>
        </div>
      ) : (
        <ListTable<CelebrationDay>
          columns={columns}
          rows={sorted}
          rowKey={(row) => row.code}
          loading={loading && rows.length === 0}
          error={rows.length === 0 ? error || null : null}
          staleError={rows.length > 0 ? error || null : null}
          onRetry={() => void load()}
          emptyText="Tanımlı özel gün yok"
          mobileCard={(row) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{row.title}</p>
                <p className="text-xs text-slate-500">{row.nextDate ? longDateWithWeekday(row.nextDate) : "—"} · {audienceLabel(row)}</p>
                {row.audience && <p className="text-xs text-slate-500">Bu şubede {reachLabel(row)}</p>}
                <Button variant="ghost" size="sm" icon={Eye} className="-ml-3 mt-1" onClick={() => setDetailCode(row.code)}>Metni gör</Button>
              </div>
              {toggleCell(row)}
            </div>
          )}
        />
      )}
    </Modal>
  );
}
