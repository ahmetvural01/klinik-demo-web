"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { Callout } from "@/components/ui/Callout";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { FormField } from "@/components/ui/FormField";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { showToastSafe } from "@/lib/toast-client";
import { moneyInputError, toMoneyValue } from "@/lib/money-input";
import { getPlanPrice, type BillingCycleId, type SubscriptionPlanId } from "@/lib/subscription-plans";
import { cycleLabel, planLabel } from "./sa-labels";
import { todayKey } from "./sa-format";
import { errorMessage, notifyCountsChanged, saGet, saSend } from "./sa-fetch";

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
  return { amount: price != null ? toMoneyValue(price) ?? "" : "", description: defaultDescription(clinic), dueDate: defaultDueDate(clinic.billingCycle) };
}

/**
 * Fatura kesme penceresi — Faturalar sayfası ("Yeni fatura") ve klinik
 * dosyası ("Fatura kes") AYNI kuralları kullanır: tutar kliniğin
 * plan ücretinden, vade fatura döneminden önerilir; vade zorunludur (vadesiz
 * fatura ödeme takibine hiç girmez). Aynı açıklamalı açık fatura varsa
 * mükerrer kesime karşı uyarır — klinik seçilince o kliniğin açık faturaları
 * sunucudan okunur. Önceden yalnız ekranda o an süzülmüş liste
 * karşılaştırılıyordu: "Ödendi" sekmesindeyken açık fatura listede olmadığı
 * için uyarı hiç çıkmıyordu.
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
  /** Elde olan faturalar (sunucu yanıtı gelene kadar karşılaştırmada kullanılır). */
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
  const [openInvoices, setOpenInvoices] = useState<{ clinicId: string; list: ExistingInvoice[] } | null>(null);

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
    saGet<InvoiceClinicOption[]>("/api/superadmin/institutions", "Klinik listesi alınamadı.")
      .then((data) => {
        if (!Array.isArray(data)) throw new Error("Klinik listesi alınamadı.");
        setClinics(data.map((item) => ({ id: item.id, name: item.name, subscriptionPlan: item.subscriptionPlan, billingCycle: item.billingCycle, isActive: item.isActive })));
      })
      .catch((error) => {
        clinicsRequestedRef.current = false;
        setClinicsError(errorMessage(error, "Klinik listesi alınamadı."));
      })
      .finally(() => setClinicsLoading(false));
  }, [open, lockedClinic]);

  // Seçilen kliniğin TÜM açık faturaları (mükerrer kontrolü için). Klinik
  // dosyasından (lockedClinic) açılınca istek atılmaz: dosya o kliniğin tüm
  // açık faturalarını zaten yükledi ve existingInvoices ile verir.
  const clinicId = clinic?.id ?? null;
  const hasLockedClinic = Boolean(lockedClinic);
  useEffect(() => {
    if (!open || !clinicId || hasLockedClinic) return;
    const controller = new AbortController();
    saGet<{ invoices: Array<{ description: string | null; status: string; invoiceNo: string }> }>(
      `/api/superadmin/invoices?institutionId=${encodeURIComponent(clinicId)}&status=OPEN`,
      "",
      controller.signal,
    )
      .then((data) => setOpenInvoices({ clinicId, list: (data?.invoices ?? []).map((item) => ({ ...item, institutionId: clinicId })) }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [open, clinicId, hasLockedClinic]);

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
    const source = openInvoices?.clinicId === clinic.id ? openInvoices.list : existingInvoices;
    return source.find((inv) =>
      (inv.institutionId ? inv.institutionId === clinic.id : true)
      && (inv.status === "PENDING" || inv.status === "OVERDUE")
      && (inv.description || "").trim().toLocaleLowerCase("tr-TR") === desc,
    ) || null;
  }, [clinic, description, existingInvoices, openInvoices]);

  const submit = async () => {
    const nextErrors: typeof errors = {};
    if (!clinic) nextErrors.clinic = "Klinik seçin.";
    const amountError = moneyInputError(amount, { required: true });
    if (amountError) nextErrors.amount = amountError;
    if (!dueDate) nextErrors.dueDate = "Vade tarihi zorunlu.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !clinic) return;
    setSaving(true);
    setFormError(null);
    try {
      const data = await saSend<{ invoiceNo?: string }>("/api/superadmin/invoices", "POST", {
        institutionId: clinic.id,
        // MoneyInput değeri "1250.50" biçiminde metindir (JS sayısıyla para hesabı yok).
        amount,
        description: description.trim() || undefined,
        // Gün olarak gönderilir; sunucu Türkiye saatiyle gün sonunu yazar.
        dueDate,
      }, "Fatura kesilemedi.");
      showToastSafe({ type: "success", message: `${clinic.name} için ${data?.invoiceNo ?? "fatura"} kesildi.`, icon: "finance" });
      notifyCountsChanged();
      onClose();
      onCreated();
    } catch (error) {
      setFormError(errorMessage(error, "Fatura kesilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const planPrice = clinic?.subscriptionPlan ? getPlanPrice(clinic.subscriptionPlan as SubscriptionPlanId, (clinic.billingCycle || "AYLIK") as BillingCycleId) : null;

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={lockedClinic ? "Fatura kes" : "Yeni fatura"}
      description={`${lockedClinic ? `${lockedClinic.name} · ${planLabel(lockedClinic.subscriptionPlan, lockedClinic.billingCycle)} · ` : ""}Abonelik faturası her ayın 1'inde otomatik kesilir; buradan açılış ayı ya da ek ücret faturası kesin.`}
      size="md"
      onSubmit={() => submit()}
      submitting={saving}
      error={formError}
    >
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
          label="Tutar"
          htmlFor="invoice-amount"
          required
          error={errors.amount}
          hint={clinic ? (planPrice != null ? `Plan ücreti önerildi (${planLabel(clinic.subscriptionPlan, clinic.billingCycle)})` : "Bu planın sabit ücreti yok; teklif tutarını girin") : undefined}
        >
          <MoneyInput id="invoice-amount" value={amount} onChange={setAmount} />
        </FormField>
        <FormField label="Vade tarihi" htmlFor="invoice-due" required error={errors.dueDate} hint="Vade geçip ödenmezse klinik kayıt ekleyemez">
          <Input id="invoice-due" type="date" min={todayKey()} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </FormField>
      </div>
      <FormField label="Açıklama" htmlFor="invoice-description" hint="Klinik faturasında görünür">
        <Input id="invoice-description" value={description} maxLength={200} onChange={(event) => setDescription(event.target.value)} placeholder="Ör. Profesyonel — aylık abonelik (Ekim 2026)" />
      </FormField>
      {duplicate && (
        <Callout tone="warning" compact>
          Bu klinik için aynı açıklamayla ödenmemiş bir fatura zaten var ({duplicate.invoiceNo}). Mükerrer kesmediğinizden emin olun.
        </Callout>
      )}
    </FormModal>
  );
}
