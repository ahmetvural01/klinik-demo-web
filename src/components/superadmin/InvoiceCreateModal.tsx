"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { showToastSafe } from "@/lib/toast-client";
import { getPlanPrice, type BillingCycleId, type SubscriptionPlanId } from "@/lib/subscription-plans";
import { cycleLabel, planLabel } from "./sa-labels";
import { todayKey } from "./sa-format";

export type InvoiceClinicOption = {
  id: string;
  name: string;
  subscriptionPlan?: string | null;
  billingCycle?: string | null;
  isActive?: boolean;
};

export type ExistingInvoice = { institutionId?: string | null; description?: string | null; status: string; invoiceNo: string };

function defaultDueDate(cycle: string | null | undefined): string {
  const due = new Date(`${todayKey()}T12:00:00.000Z`);
  if (cycle === "YILLIK") due.setUTCFullYear(due.getUTCFullYear() + 1);
  else due.setUTCMonth(due.getUTCMonth() + 1);
  return due.toISOString().slice(0, 10);
}

function defaultDescription(clinic: InvoiceClinicOption | null): string {
  if (!clinic?.subscriptionPlan) return "";
  const month = new Date().toLocaleDateString("tr-TR", { month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
  return `${planLabel(clinic.subscriptionPlan)} — ${cycleLabel(clinic.billingCycle).toLocaleLowerCase("tr-TR")} abonelik (${month})`;
}

function clinicDefaults(clinic: InvoiceClinicOption | null): { amount: string; description: string; dueDate: string } {
  if (!clinic) return { amount: "", description: "", dueDate: defaultDueDate("AYLIK") };
  const price = clinic.subscriptionPlan ? getPlanPrice(clinic.subscriptionPlan as SubscriptionPlanId, (clinic.billingCycle || "AYLIK") as BillingCycleId) : null;
  return { amount: price != null ? String(price) : "", description: defaultDescription(clinic), dueDate: defaultDueDate(clinic.billingCycle) };
}

/**
 * Fatura kesme penceresi — Faturalar sayfası ("Yeni Fatura") ve klinik
 * dosyası ("Dönem faturası kes") AYNI kuralları kullanır: tutar kliniğin
 * plan ücretinden, vade fatura döneminden önerilir; vade zorunludur (vadesiz
 * fatura ödeme takibine hiç girmez). Aynı açıklamalı açık fatura varsa
 * mükerrer kesime karşı uyarır.
 */
export function InvoiceCreateModal({
  open,
  onClose,
  onCreated,
  lockedClinic,
  existingInvoices = [],
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** Klinik dosyasından açılınca klinik sabittir. */
  lockedClinic?: InvoiceClinicOption | null;
  existingInvoices?: ExistingInvoice[];
}) {
  const [clinics, setClinics] = useState<InvoiceClinicOption[]>([]);
  const [clinicsLoading, setClinicsLoading] = useState(false);
  const [clinicsError, setClinicsError] = useState<string | undefined>();
  const [clinic, setClinic] = useState<InvoiceClinicOption | null>(lockedClinic ?? null);
  const [clinicQuery, setClinicQuery] = useState(lockedClinic?.name ?? "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [errors, setErrors] = useState<{ clinic?: string; amount?: string; dueDate?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const initializedRef = useRef(false);
  const clinicsRequestedRef = useRef(false);

  const applyClinic = (next: InvoiceClinicOption | null) => {
    setClinic(next);
    setClinicQuery(next?.name ?? "");
    if (!next) return;
    const defaults = clinicDefaults(next);
    setAmount(defaults.amount);
    setDescription(defaults.description);
    setDueDate(defaults.dueDate);
  };

  // Pencere her açılışında bir kez hazırlanır (üst bileşen yeniden çizilse
  // de kullanıcının yazdıkları sıfırlanmaz).
  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;
    const start = lockedClinic ?? null;
    const defaults = clinicDefaults(start);
    setErrors({});
    setFormError(null);
    setClinic(start);
    setClinicQuery(start?.name ?? "");
    setAmount(defaults.amount);
    setDescription(defaults.description);
    setDueDate(defaults.dueDate);
  }, [open, lockedClinic]);

  useEffect(() => {
    if (!open || lockedClinic || clinicsRequestedRef.current) return;
    clinicsRequestedRef.current = true;
    setClinicsLoading(true);
    setClinicsError(undefined);
    fetch("/api/superadmin/institutions", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !Array.isArray(data)) throw new Error(data?.message || "Klinik listesi alınamadı.");
        setClinics(data.map((item: InvoiceClinicOption) => ({ id: item.id, name: item.name, subscriptionPlan: item.subscriptionPlan, billingCycle: item.billingCycle, isActive: item.isActive })));
      })
      .catch((error) => {
        clinicsRequestedRef.current = false;
        setClinicsError(error instanceof Error ? error.message : "Klinik listesi alınamadı.");
      })
      .finally(() => setClinicsLoading(false));
  }, [open, lockedClinic]);

  const clinicOptions = useMemo(() => {
    const q = clinicQuery.trim().toLocaleLowerCase("tr-TR");
    return clinics
      .filter((item) => !q || item.name.toLocaleLowerCase("tr-TR").includes(q))
      .slice(0, 30)
      .map((item) => ({ id: item.id, label: item.name, meta: [planLabel(item.subscriptionPlan, item.billingCycle), item.isActive === false ? "Kapalı" : null].filter(Boolean).join(" · ") }));
  }, [clinics, clinicQuery]);

  const duplicate = useMemo(() => {
    if (!clinic || !description.trim()) return null;
    const desc = description.trim().toLocaleLowerCase("tr-TR");
    return existingInvoices.find((inv) =>
      (inv.institutionId ? inv.institutionId === clinic.id : true)
      && (inv.status === "PENDING" || inv.status === "OVERDUE")
      && (inv.description || "").trim().toLocaleLowerCase("tr-TR") === desc,
    ) || null;
  }, [clinic, description, existingInvoices]);

  const submit = async () => {
    const nextErrors: typeof errors = {};
    if (!clinic) nextErrors.clinic = "Klinik seçin.";
    const amountNum = Number(amount.replace(",", "."));
    if (!amount || !Number.isFinite(amountNum) || amountNum <= 0) nextErrors.amount = "Geçerli bir tutar girin.";
    if (!dueDate) nextErrors.dueDate = "Vade tarihi zorunlu.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !clinic) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/superadmin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionId: clinic.id,
          amount: amountNum,
          description: description.trim() || undefined,
          // Gün olarak gönderilir; sunucu Türkiye saatiyle gün sonunu yazar.
          dueDate,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Fatura kesilemedi.");
      showToastSafe({ type: "success", message: `${clinic.name} için ${data?.invoiceNo ?? "fatura"} kesildi.`, icon: "finance" });
      onClose();
      onCreated();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Fatura kesilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const planPrice = clinic?.subscriptionPlan ? getPlanPrice(clinic.subscriptionPlan as SubscriptionPlanId, (clinic.billingCycle || "AYLIK") as BillingCycleId) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lockedClinic ? "Dönem faturası kes" : "Yeni fatura"}
      description={lockedClinic ? `${lockedClinic.name} · ${planLabel(lockedClinic.subscriptionPlan, lockedClinic.billingCycle)}` : "Kliniğe platform kullanım faturası keser."}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button loading={saving} onClick={() => void submit()}>Kaydet</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormErrorBanner message={formError} />
        {!lockedClinic && (
          <FormField label="Klinik" htmlFor="invoice-clinic" required error={errors.clinic}>
            <SearchSelect
              id="invoice-clinic"
              query={clinicQuery}
              onQueryChange={(value) => {
                setClinicQuery(value);
                if (clinic && value !== clinic.name) setClinic(null);
              }}
              options={clinicOptions}
              onSelect={(option) => applyClinic(clinics.find((item) => item.id === option.id) || null)}
              placeholder="Klinik adı yazın"
              emptyText="Bu adla klinik yok"
              loading={clinicsLoading}
              error={clinicsError}
            />
          </FormField>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Tutar (₺)"
            htmlFor="invoice-amount"
            required
            error={errors.amount}
            hint={clinic ? (planPrice != null ? `Plan ücreti önerildi (${planLabel(clinic.subscriptionPlan, clinic.billingCycle)})` : "Bu planın sabit ücreti yok; teklif tutarını girin") : undefined}
          >
            <Input id="invoice-amount" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </FormField>
          <FormField label="Vade tarihi" htmlFor="invoice-due" required error={errors.dueDate} hint="Vade geçip ödenmezse klinik kayıt ekleyemez">
            <Input id="invoice-due" type="date" min={todayKey()} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </FormField>
        </div>
        <FormField label="Açıklama" htmlFor="invoice-description" hint="Klinik faturasında görünür">
          <Input id="invoice-description" value={description} maxLength={200} onChange={(event) => setDescription(event.target.value)} placeholder="Ör. Profesyonel — aylık abonelik (Ekim 2026)" />
        </FormField>
        {duplicate && (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Bu klinik için aynı açıklamayla ödenmemiş bir fatura zaten var ({duplicate.invoiceNo}). Mükerrer kesmediğinizden emin olun.
          </p>
        )}
      </div>
    </Modal>
  );
}
