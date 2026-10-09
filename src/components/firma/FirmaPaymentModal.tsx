"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { formatCurrency } from "@/lib/format";
import { showToastSafe } from "@/lib/toast-client";
import { newRequestKey, todayKey } from "@/components/stock/stock-shared";

export const PAYMENT_METHODS = [
  { value: "HAVALE_EFT", label: "Havale / EFT" },
  { value: "NAKIT", label: "Nakit" },
  { value: "KREDI_KARTI", label: "Kredi kartı" },
  { value: "MAIL_ORDER", label: "Mail order" },
  { value: "DIGER", label: "Diğer" },
] as const;

export function paymentMethodLabel(value?: string | null) {
  return PAYMENT_METHODS.find((method) => method.value === value)?.label || "";
}

export type FirmaPaymentTarget = { id: string; name: string; bakiye: number };

type FirmaPaymentModalProps = {
  open: boolean;
  onClose: () => void;
  firma: FirmaPaymentTarget | null;
  /** Önerilen tutar (ör. bir satın almanın kalanı). Verilmezse firmanın kalan borcu önerilir. */
  suggestedAmount?: number;
  /** Ödemenin karşılığı olan belge (ör. "Fatura DENEME-001"); açıklama boşsa kullanılır. */
  reference?: string;
  onSaved: () => void | Promise<void>;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Firmaya (tedarikçi/laboratuvar) yapılan ödeme. Önceden ödeme yalnız
 * Muhasebe > İşlem ekle > Firma ödemesi'nden, firma yeniden seçilerek
 * yapılabiliyordu; firma ekranında "kalan borç" görünüp ödeme düğmesi yoktu.
 * Kayıt aynı uç noktaya (POST /api/firma/[id]/islemler, ODEME) ve aynı
 * Idempotency-Key korumasıyla gider; ödeme en eski açık borçtan düşülür ve
 * Muhasebe'de "Firma Ödemesi" gideri olarak görünür.
 */
export function FirmaPaymentModal({ open, onClose, firma, suggestedAmount, reference, onSaved }: FirmaPaymentModalProps) {
  const [form, setForm] = useState({ tutar: "", tarih: todayKey(), yontem: "HAVALE_EFT", aciklama: "" });
  const [errors, setErrors] = useState<{ tutar?: string; tarih?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestKeyRef = useRef("");
  const balance = round2(Math.max(0, firma?.bakiye || 0));

  useEffect(() => {
    if (!open) return;
    const proposed = suggestedAmount && suggestedAmount > 0 ? Math.min(round2(suggestedAmount), balance) : balance;
    setForm({ tutar: proposed > 0 ? String(proposed) : "", tarih: todayKey(), yontem: "HAVALE_EFT", aciklama: "" });
    setErrors({});
    setFormError(null);
    requestKeyRef.current = newRequestKey("firma-odeme");
  }, [open, suggestedAmount, balance]);

  const submit = async () => {
    if (!firma || saving) return;
    const amount = round2(Number(form.tutar));
    const nextErrors: { tutar?: string; tarih?: string } = {};
    if (!form.tutar || !Number.isFinite(amount) || amount <= 0) nextErrors.tutar = "Ödenen tutarı girin.";
    else if (amount > balance) nextErrors.tutar = `Tutar kalan borcu (${formatCurrency(balance)}) aşamaz.`;
    if (!form.tarih) nextErrors.tarih = "Ödeme tarihini seçin.";
    setErrors(nextErrors);
    if (nextErrors.tutar || nextErrors.tarih) return;

    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch(`/api/firma/${firma.id}/islemler`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current || newRequestKey("firma-odeme") },
        body: JSON.stringify({
          tarih: form.tarih,
          islemTipi: "ODEME",
          tutar: amount,
          yontem: form.yontem,
          aciklama: form.aciklama.trim() || reference || "Firma ödemesi",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || payload?.message || "Ödeme kaydedilemedi. Bilgileri kontrol edip tekrar deneyin.");
      requestKeyRef.current = "";
      showToastSafe({
        title: "Ödeme kaydedildi",
        message: `${firma.name} için ${formatCurrency(amount)} ödeme işlendi; Muhasebe'de gider olarak görünür.`,
        type: "success",
        icon: "firma",
      });
      onClose();
      await onSaved();
    } catch (error) {
      // İstek anahtarı korunur: "Kaydet"e yeniden basılırsa sunucu aynı ödemeyi ikinci kez yazmaz.
      setFormError(error instanceof Error ? error.message : "Bağlantı kurulamadı. Bilgiler korundu, tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open && Boolean(firma)}
      onClose={onClose}
      module="firma"
      title="Ödeme Yap"
      description={firma ? `${firma.name} · Kalan borç ${formatCurrency(balance)}` : undefined}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button>
          <Button onClick={() => void submit()} loading={saving}>Kaydet</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <FormErrorBanner message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tutar (₺)" htmlFor="firma-odeme-tutar" required error={errors.tutar} hint="Kalan borcun tamamı önerildi; kısmi ödemede değiştirin.">
            <Input
              id="firma-odeme-tutar"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.tutar}
              onChange={(event) => { setForm((current) => ({ ...current, tutar: event.target.value })); setErrors((current) => ({ ...current, tutar: undefined })); }}
              data-autofocus
            />
          </FormField>
          <FormField label="Ödeme tarihi" htmlFor="firma-odeme-tarih" required error={errors.tarih}>
            <Input
              id="firma-odeme-tarih"
              type="date"
              max={todayKey()}
              value={form.tarih}
              onChange={(event) => { setForm((current) => ({ ...current, tarih: event.target.value })); setErrors((current) => ({ ...current, tarih: undefined })); }}
            />
          </FormField>
          <FormField label="Ödeme yöntemi" htmlFor="firma-odeme-yontem" required>
            <Select id="firma-odeme-yontem" value={form.yontem} onChange={(event) => setForm((current) => ({ ...current, yontem: event.target.value }))}>
              {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
            </Select>
          </FormField>
          <FormField label="Açıklama" htmlFor="firma-odeme-aciklama">
            <Input
              id="firma-odeme-aciklama"
              value={form.aciklama}
              onChange={(event) => setForm((current) => ({ ...current, aciklama: event.target.value }))}
              placeholder={reference || "Ör. Ekim ayı faturaları"}
            />
          </FormField>
        </div>
        <p className="text-xs leading-5 text-slate-500">
          Ödeme bu firmanın en eski açık borcundan başlayarak düşülür ve Muhasebe&apos;de &quot;Firma Ödemesi&quot; gideri olarak görünür.
        </p>
      </div>
    </Modal>
  );
}
