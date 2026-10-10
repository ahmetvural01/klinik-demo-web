"use client";

import { useState } from "react";
import { Ban, BellRing, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { FormModal } from "@/components/ui/FormModal";
import { Input, Textarea } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import type { InvoiceViewStatus } from "./invoice-status";
import { errorMessage, notifyCountsChanged, saSend } from "./sa-fetch";
import { dateTime, money, shortDate, todayKey } from "./sa-format";

export type InvoiceActionTarget = {
  id: string;
  invoiceNo: string;
  amount: number | string;
  status: InvoiceViewStatus;
  institutionName?: string | null;
  lastReminderAt?: string | null;
  /** Son hatırlatma denemesinin sonucu ("SENT" / "FAILED"). */
  lastReminderStatus?: string | null;
  /** Kliniğe ULAŞAN hatırlatma sayısı (başarısız denemeler sayılmaz). */
  reminderCount?: number;
};

/**
 * Fatura satırının hatırlatma notu: kaç hatırlatma ULAŞTI ve son denemenin
 * sonucu. Önceden başarısız denemeler de sayılıyordu: SMTP kapalıyken 24
 * başarısız deneme "24 hatırlatma" görünüyor, kliniğe hiç ulaşmamış
 * hatırlatma ulaşmış sanılıyordu (canlı test H3).
 */
export function InvoiceReminderNote({ invoice }: { invoice: InvoiceActionTarget }) {
  const isOpen = invoice.status === "PENDING" || invoice.status === "OVERDUE";
  if (!isOpen || !invoice.lastReminderAt) return null;
  const sent = invoice.reminderCount ?? 0;
  const failedLast = invoice.lastReminderStatus === "FAILED";
  return (
    <p className={`mt-0.5 text-xs ${failedLast ? "font-medium text-amber-700" : "text-slate-500"}`}>
      {sent > 0 ? `${sent} hatırlatma ulaştı · ` : ""}
      {failedLast ? `son deneme ulaşmadı (${shortDate(invoice.lastReminderAt)})` : `son ${shortDate(invoice.lastReminderAt)}`}
    </p>
  );
}

/**
 * Fatura satırı eylemleri — Faturalar sayfası ve klinik dosyası AYNI bileşeni
 * kullanır. Yalnız açık (bekleyen / gecikmiş) faturada görünür: en sık iş
 * "Tahsil et" yazılı düğme, hatırlatma ve iptal "…" menüsünde. Önceden üç
 * yalnız-ikon düğme vardı; anlamı ancak üzerine gelince anlaşılıyordu.
 */
export function InvoiceRowActions({ invoice, onChanged }: { invoice: InvoiceActionTarget; onChanged: () => void }) {
  const [paidOpen, setPaidOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reminding, setReminding] = useState(false);
  const isOpen = invoice.status === "PENDING" || invoice.status === "OVERDUE";
  if (!isOpen) return null;

  const remind = async () => {
    const last = invoice.lastReminderAt ? dateTime(invoice.lastReminderAt) : null;
    const sent = invoice.reminderCount ?? 0;
    const history = last
      ? ` Son deneme: ${last}${invoice.lastReminderStatus === "FAILED" ? " (ulaşmadı)" : ""}. Kliniğe ulaşan hatırlatma: ${sent}.`
      : " Bu fatura için daha önce hatırlatma gönderilmedi.";
    const ok = await confirmDialog({
      title: "Hatırlatma gönderilsin mi?",
      message: `${invoice.institutionName ? `${invoice.institutionName} kliniğine` : "Kliniğe"} ${invoice.invoiceNo} numaralı ${money(invoice.amount)} tutarındaki fatura için e-posta ve SMS ile hatırlatma gönderilecek.${history}`,
      confirmText: "Gönder",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    setReminding(true);
    try {
      const data = await saSend<{ results?: Array<{ channel: string; success: boolean }> }>(
        "/api/superadmin/invoices/remind",
        "POST",
        { invoiceId: invoice.id, channels: ["EMAIL", "SMS"] },
        "Hatırlatma gönderilemedi.",
      );
      const results = Array.isArray(data?.results) ? data.results : [];
      const delivered = results.filter((item) => item.success).map((item) => (item.channel === "EMAIL" ? "e-posta" : "SMS"));
      if (results.length > 0 && delivered.length === 0) {
        showToastSafe({ type: "error", message: "Hatırlatma gönderilemedi. Kliniğin e-posta ve telefon bilgisini, Sistem Ayarları › E-posta ayarını kontrol edin." });
      } else {
        showToastSafe({ type: delivered.length === results.length ? "success" : "info", message: `Hatırlatma gönderildi: ${delivered.join(" ve ") || "—"}.` });
      }
      onChanged();
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Hatırlatma gönderilemedi.") });
    } finally {
      setReminding(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button size="sm" variant="secondary" icon={CheckCircle2} onClick={() => setPaidOpen(true)}>Tahsil et</Button>
      <ActionMenu
        label={`${invoice.invoiceNo} için diğer işlemler`}
        items={[
          { key: "remind", label: reminding ? "Gönderiliyor…" : "Hatırlatma gönder", icon: BellRing, disabled: reminding, onSelect: () => void remind() },
          { key: "cancel", label: "Faturayı iptal et", icon: Ban, danger: true, separatorBefore: true, onSelect: () => setCancelOpen(true) },
        ]}
      />
      <InvoicePaidModal invoice={paidOpen ? invoice : null} onClose={() => setPaidOpen(false)} onDone={onChanged} />
      <InvoiceCancelModal invoice={cancelOpen ? invoice : null} onClose={() => setCancelOpen(false)} onDone={onChanged} />
    </div>
  );
}

function InvoicePaidModal({ invoice, onClose, onDone }: { invoice: InvoiceActionTarget | null; onClose: () => void; onDone: () => void }) {
  const [paidDate, setPaidDate] = useState(todayKey());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!invoice) return;
    if (!paidDate || paidDate > todayKey()) {
      setError("Ödeme tarihi bugünden ileri olamaz.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saSend(`/api/superadmin/invoices/${invoice.id}`, "PATCH", { status: "PAID", paidDate, note: note.trim() || undefined }, "Tahsilat kaydedilemedi.");
      showToastSafe({ type: "success", message: `${invoice.invoiceNo} tahsil edildi olarak kaydedildi.`, icon: "finance" });
      setNote("");
      notifyCountsChanged();
      onClose();
      onDone();
    } catch (failure) {
      setError(errorMessage(failure, "Tahsilat kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      open={Boolean(invoice)}
      onClose={onClose}
      title="Tahsilatı kaydet"
      description={invoice ? `${invoice.invoiceNo} · ${money(invoice.amount)}${invoice.institutionName ? ` · ${invoice.institutionName}` : ""}` : undefined}
      size="sm"
      onSubmit={() => save()}
      submitting={saving}
      error={error}
      formClassName="space-y-3"
    >
      <p className="text-xs leading-5 text-slate-500">Yalnız para gerçekten geldiyse kaydedin. Kliniğin ödeme kilidi varsa kendiliğinden kalkar.</p>
      <FormField label="Ödeme tarihi" htmlFor="invoice-paid-date" required>
        <Input id="invoice-paid-date" type="date" max={todayKey()} value={paidDate} onChange={(event) => setPaidDate(event.target.value)} />
      </FormField>
      <FormField label="Not" htmlFor="invoice-paid-note" hint="Ör. Havale — dekont no 12345 (Denetim Günlüğü'ne yazılır)">
        <Input id="invoice-paid-note" value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />
      </FormField>
    </FormModal>
  );
}

function InvoiceCancelModal({ invoice, onClose, onDone }: { invoice: InvoiceActionTarget | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!invoice) return;
    if (reason.trim().length < 3) {
      setError("İptal nedenini yazın (ör. Mükerrer kesildi).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saSend(`/api/superadmin/invoices/${invoice.id}`, "PATCH", { status: "CANCELLED", reason: reason.trim() }, "Fatura iptal edilemedi.");
      showToastSafe({ type: "success", message: `${invoice.invoiceNo} iptal edildi.`, icon: "finance" });
      setReason("");
      notifyCountsChanged();
      onClose();
      onDone();
    } catch (failure) {
      setError(errorMessage(failure, "Fatura iptal edilemedi."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      open={Boolean(invoice)}
      onClose={onClose}
      title="Faturayı iptal et"
      description={invoice ? `${invoice.invoiceNo} · ${money(invoice.amount)}${invoice.institutionName ? ` · ${invoice.institutionName}` : ""}` : undefined}
      size="sm"
      onSubmit={() => save()}
      submitting={saving}
      submitLabel="Faturayı iptal et"
      submitVariant="danger"
      error={error}
      formClassName="space-y-3"
    >
      <p className="text-xs leading-5 text-slate-500">İptal edilen fatura borç toplamlarından çıkar ve geri alınamaz. Para tahsil edildiyse iptal etmeyin, &quot;Tahsil et&quot; ile kaydedin.</p>
      <FormField label="İptal nedeni" htmlFor="invoice-cancel-reason" required>
        <Textarea id="invoice-cancel-reason" rows={3} value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="Ör. Aynı dönem için iki kez kesildi" />
      </FormField>
    </FormModal>
  );
}
