"use client";

import { useState } from "react";
import { Ban, BellRing, CheckCircle2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { clientMutation } from "@/lib/client-mutation";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import type { InvoiceViewStatus } from "./invoice-status";
import { dateTime, money, todayKey } from "./sa-format";

export type InvoiceActionTarget = {
  id: string;
  invoiceNo: string;
  amount: number | string;
  status: InvoiceViewStatus;
  institutionName?: string | null;
  lastReminderAt?: string | null;
  reminderCount?: number;
};

/**
 * Fatura satırı eylemleri — Faturalar sayfası ve klinik dosyası AYNI bileşeni
 * kullanır. Eylemler türetilmiş durumdan üretilir: yalnız açık (bekleyen /
 * gecikmiş) faturada "Tahsil edildi", "Hatırlat" ve "İptal et" görünür.
 * Önceden iptal edilmiş faturada da "Ödendi İşaretle" çıkıyor, onaylanınca
 * sunucu 409 dönüyordu; hatalı kesilen faturayı iptal etmenin yolu yoktu
 * (tek çıkış tahsil edilmemiş parayı "ödendi" saymaktı).
 */
export function InvoiceRowActions({ invoice, onChanged }: { invoice: InvoiceActionTarget; onChanged: () => void }) {
  const [paidOpen, setPaidOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reminding, setReminding] = useState(false);
  const isOpen = invoice.status === "PENDING" || invoice.status === "OVERDUE";
  if (!isOpen) return null;

  const remind = async () => {
    const last = invoice.lastReminderAt ? dateTime(invoice.lastReminderAt) : null;
    const ok = await confirmDialog({
      title: "Hatırlatma gönderilsin mi?",
      message: `${invoice.institutionName ? `${invoice.institutionName} kliniğine` : "Kliniğe"} ${invoice.invoiceNo} numaralı ${money(invoice.amount)} tutarındaki fatura için e-posta ve SMS ile hatırlatma gönderilecek.${last ? ` Son hatırlatma: ${last} (toplam ${invoice.reminderCount ?? 1}).` : " Bu fatura için daha önce hatırlatma gönderilmedi."}`,
      confirmText: "Gönder",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    setReminding(true);
    try {
      const res = await fetch("/api/superadmin/invoices/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, channels: ["EMAIL", "SMS"] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Hatırlatma gönderilemedi.");
      const results: Array<{ channel: string; success: boolean }> = Array.isArray(data?.results) ? data.results : [];
      const sent = results.filter((item) => item.success).map((item) => (item.channel === "EMAIL" ? "e-posta" : "SMS"));
      if (results.length > 0 && sent.length === 0) {
        showToastSafe({ type: "error", message: "Hatırlatma gönderilemedi. Kliniğin e-posta ve telefon bilgisini kontrol edin." });
      } else {
        showToastSafe({ type: sent.length === results.length ? "success" : "info", message: `Hatırlatma gönderildi: ${sent.join(" ve ") || "—"}.` });
      }
      onChanged();
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Hatırlatma gönderilemedi." });
    } finally {
      setReminding(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      <IconButton icon={CheckCircle2} title="Tahsil edildi olarak işaretle" tone="primary" size="sm" onClick={() => setPaidOpen(true)} />
      <IconButton icon={BellRing} title={reminding ? "Gönderiliyor…" : "Hatırlatma gönder"} size="sm" disabled={reminding} onClick={() => void remind()} />
      <IconButton icon={Ban} title="Faturayı iptal et" tone="danger" size="sm" onClick={() => setCancelOpen(true)} />
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
      await clientMutation(
        `/api/superadmin/invoices/${invoice.id}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "PAID", paidDate, note: note.trim() || undefined }) },
        "Tahsilat kaydedilemedi.",
      );
      showToastSafe({ type: "success", message: `${invoice.invoiceNo} tahsil edildi olarak kaydedildi.`, icon: "finance" });
      setNote("");
      onClose();
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Tahsilat kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(invoice)}
      onClose={onClose}
      title="Tahsilatı kaydet"
      description={invoice ? `${invoice.invoiceNo} · ${money(invoice.amount)}${invoice.institutionName ? ` · ${invoice.institutionName}` : ""}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button loading={saving} onClick={() => void save()}>Kaydet</Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormErrorBanner message={error} />
        <p className="text-xs leading-5 text-slate-500">Yalnız para gerçekten geldiyse kaydedin. Kliniğin ödeme kilidi varsa kendiliğinden kalkar.</p>
        <FormField label="Ödeme tarihi" htmlFor="invoice-paid-date" required>
          <Input id="invoice-paid-date" type="date" max={todayKey()} value={paidDate} onChange={(event) => setPaidDate(event.target.value)} />
        </FormField>
        <FormField label="Not" htmlFor="invoice-paid-note" hint="Ör. Havale — dekont no 12345 (Denetim Günlüğü'ne yazılır)">
          <Input id="invoice-paid-note" value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />
        </FormField>
      </div>
    </Modal>
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
      await clientMutation(
        `/api/superadmin/invoices/${invoice.id}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CANCELLED", reason: reason.trim() }) },
        "Fatura iptal edilemedi.",
      );
      showToastSafe({ type: "success", message: `${invoice.invoiceNo} iptal edildi.`, icon: "finance" });
      setReason("");
      onClose();
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Fatura iptal edilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(invoice)}
      onClose={onClose}
      title="Faturayı iptal et"
      description={invoice ? `${invoice.invoiceNo} · ${money(invoice.amount)}${invoice.institutionName ? ` · ${invoice.institutionName}` : ""}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button variant="danger" loading={saving} onClick={() => void save()}>Faturayı iptal et</Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormErrorBanner message={error} />
        <p className="text-xs leading-5 text-slate-500">İptal edilen fatura borç toplamlarından çıkar ve geri alınamaz. Para tahsil edildiyse iptal etmeyin, &quot;Tahsil edildi&quot; olarak kaydedin.</p>
        <FormField label="İptal nedeni" htmlFor="invoice-cancel-reason" required>
          <Textarea id="invoice-cancel-reason" rows={3} value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="Ör. Aynı dönem için iki kez kesildi" />
        </FormField>
      </div>
    </Modal>
  );
}
