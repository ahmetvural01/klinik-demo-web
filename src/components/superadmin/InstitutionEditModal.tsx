"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { clientMutation } from "@/lib/client-mutation";
import { showToastSafe } from "@/lib/toast-client";
import { turkeyDateTimeLocalValue, turkeyLocalDateTimeToUtc } from "@/lib/tz";
import { SUBSCRIPTION_PLANS, type BillingCycleId, type SubscriptionPlanId } from "@/lib/subscription-plans";
import { CYCLE_OPTIONS, PLAN_OPTIONS, SERVICE_MODE_META, type ServiceMode } from "./sa-labels";

export type EditableInstitution = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  taxNo: string | null;
  website: string | null;
  subscriptionPlan: string;
  billingCycle: string;
  serviceMode: string;
  serviceNote: string | null;
  suspendedUntil: string | null;
  maxActiveUsers: number | null;
  maxActiveDoctors: number | null;
};

/** "Hizmet durumu" seçenekleri: geçici askı, servis modu yerine bir bitiş tarihidir (requireAuth suspendedUntil'i ayrıca denetler). */
type AccessChoice = ServiceMode | "SUSPENDED_UNTIL";

const ACCESS_OPTIONS: { value: AccessChoice; label: string; hint: string }[] = [
  { value: "NORMAL", label: "Normal", hint: SERVICE_MODE_META.NORMAL.hint },
  { value: "LIMITED", label: "Kısıtlı", hint: SERVICE_MODE_META.LIMITED.hint },
  { value: "READ_ONLY", label: "Salt okunur", hint: SERVICE_MODE_META.READ_ONLY.hint },
  { value: "SUSPENDED_UNTIL", label: "Askıda — belirli bir tarihe kadar", hint: "Klinik kullanıcıları seçtiğiniz tarih ve saate kadar giremez; tarih geçince klinik kendiliğinden açılır." },
  { value: "SUSPENDED", label: "Askıda — süresiz", hint: "Siz yeniden Normal'e alana kadar klinik kullanıcıları giremez." },
];


type FormState = {
  name: string;
  email: string;
  phone: string;
  address: string;
  taxNo: string;
  website: string;
  subscriptionPlan: SubscriptionPlanId;
  billingCycle: BillingCycleId;
  maxActiveUsers: string;
  maxActiveDoctors: string;
  access: AccessChoice;
  suspendedUntilLocal: string;
  serviceNote: string;
};

function toForm(i: EditableInstitution): FormState {
  const suspendedFuture = Boolean(i.suspendedUntil && new Date(i.suspendedUntil).getTime() > Date.now());
  const access: AccessChoice = suspendedFuture && (i.serviceMode === "NORMAL" || !i.serviceMode) ? "SUSPENDED_UNTIL" : (i.serviceMode as ServiceMode) || "NORMAL";
  return {
    name: i.name || "",
    email: i.email || "",
    phone: i.phone || "",
    address: i.address || "",
    taxNo: i.taxNo || "",
    website: i.website || "",
    subscriptionPlan: (i.subscriptionPlan as SubscriptionPlanId) || "TEMEL",
    billingCycle: (i.billingCycle as BillingCycleId) || "AYLIK",
    maxActiveUsers: i.maxActiveUsers != null ? String(i.maxActiveUsers) : "",
    maxActiveDoctors: i.maxActiveDoctors != null ? String(i.maxActiveDoctors) : "",
    access,
    // Kayıtlı UTC değer Türkiye saatine çevrilerek gösterilir. Önceden ISO
    // metin kesilip yazıldığı için her kayıtta bitiş 3 saat geri kayıyordu.
    suspendedUntilLocal: suspendedFuture && i.suspendedUntil ? turkeyDateTimeLocalValue(new Date(i.suspendedUntil)) : "",
    serviceNote: i.serviceNote || "",
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-1 text-sm font-bold text-slate-900">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Klinik dosyası › Düzenle. Bölümler kart içinde kart değil, sade başlıklı
 * gruplar. "Klinik aktif" kutusu burada YOK: kapatma/açma tek yerde (Özet ›
 * Diğer işlemler), onaylı yapılır. Servis modu kod adları yerine Türkçe ve
 * ne yaptığını anlatan seçenekler. WhatsApp erişimi tek yerden (SMS Yönetimi
 * › WhatsApp) onaylı açılıp kapatılır; reklam ayarı klinik panelinde reklam
 * gösterilen bir alan olmadığı için burada sunulmaz (etkisizdi).
 */
export function InstitutionEditModal({
  open,
  institution,
  onClose,
  onSaved,
}: {
  open: boolean;
  institution: EditableInstitution;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(institution));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const initializedRef = useRef(false);
  const initialAccessRef = useRef<AccessChoice>(form.access);

  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;
    const next = toForm(institution);
    initialAccessRef.current = next.access;
    setForm(next);
    setError(null);
  }, [open, institution]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const plan = SUBSCRIPTION_PLANS[form.subscriptionPlan];
  const accessHint = ACCESS_OPTIONS.find((option) => option.value === form.access)?.hint;

  const save = async () => {
    if (!form.name.trim()) return setError("Klinik adı boş olamaz.");
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError("Geçerli bir e-posta girin.");
    let suspendedUntil: string | null = null;
    if (form.access === "SUSPENDED_UNTIL") {
      const [dateKey, timeKey] = form.suspendedUntilLocal.split("T");
      if (!dateKey || !timeKey) return setError("Askının biteceği tarih ve saati seçin.");
      const until = turkeyLocalDateTimeToUtc(dateKey, timeKey);
      if (until.getTime() <= Date.now()) return setError("Askı bitişi ileri bir tarih olmalı.");
      suspendedUntil = until.toISOString();
    }
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      taxNo: form.taxNo.trim(),
      website: form.website.trim(),
      subscriptionPlan: form.subscriptionPlan,
      billingCycle: form.billingCycle,
      maxActiveUsers: form.maxActiveUsers ? Number(form.maxActiveUsers) : null,
      maxActiveDoctors: form.maxActiveDoctors ? Number(form.maxActiveDoctors) : null,
      serviceMode: form.access === "SUSPENDED_UNTIL" ? "NORMAL" : form.access,
      serviceNote: form.serviceNote.trim(),
    };
    // Askı bitişi yalnız hizmet durumu değiştiyse ya da "tarihe kadar askı"
    // seçiliyse gönderilir; ilgisiz bir alanı kaydetmek askıyı bozmaz.
    if (form.access === "SUSPENDED_UNTIL" || form.access !== initialAccessRef.current) body.suspendedUntil = suspendedUntil;

    setSaving(true);
    setError(null);
    try {
      await clientMutation(
        `/api/superadmin/institutions/${institution.id}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
        "Klinik bilgileri kaydedilemedi.",
      );
      showToastSafe({ type: "success", message: `${form.name.trim()} kaydedildi.`, icon: "institutions" });
      onClose();
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Klinik bilgileri kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Klinik bilgilerini düzenle"
      description={institution.name}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button loading={saving} onClick={() => void save()}>Kaydet</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormErrorBanner message={error} />

        <Section title="Klinik bilgileri">
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Klinik adı" htmlFor="edit-name" required hint="Klinik kullanıcıları girişte bu adı yazar">
              <Input id="edit-name" value={form.name} onChange={(event) => set("name", event.target.value)} />
            </FormField>
            <FormField label="E-posta" htmlFor="edit-email" required>
              <Input id="edit-email" type="email" value={form.email} onChange={(event) => set("email", event.target.value)} />
            </FormField>
            <FormField label="Telefon" htmlFor="edit-phone">
              <Input id="edit-phone" type="tel" inputMode="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} />
            </FormField>
            <FormField label="Vergi no" htmlFor="edit-tax">
              <Input id="edit-tax" inputMode="numeric" value={form.taxNo} onChange={(event) => set("taxNo", event.target.value)} />
            </FormField>
            <FormField label="Web sitesi" htmlFor="edit-web">
              <Input id="edit-web" value={form.website} onChange={(event) => set("website", event.target.value)} placeholder="https://" />
            </FormField>
            <FormField label="Adres" htmlFor="edit-address">
              <Input id="edit-address" value={form.address} onChange={(event) => set("address", event.target.value)} />
            </FormField>
          </div>
        </Section>

        <Section title="Abonelik">
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Plan" htmlFor="edit-plan" hint={`Plan sınırı: ${plan.maxDoctors ?? "sınırsız"} doktor, ${plan.maxUsers ?? "sınırsız"} kullanıcı`}>
              <Select
                id="edit-plan"
                value={form.subscriptionPlan}
                onChange={(event) => {
                  const nextPlan = event.target.value as SubscriptionPlanId;
                  const limits = SUBSCRIPTION_PLANS[nextPlan];
                  // Plan değişince sınırlar yeni planın varsayılanına döner;
                  // gerekirse aşağıdan elle değiştirilebilir.
                  setForm((current) => ({
                    ...current,
                    subscriptionPlan: nextPlan,
                    maxActiveUsers: limits.maxUsers != null ? String(limits.maxUsers) : "",
                    maxActiveDoctors: limits.maxDoctors != null ? String(limits.maxDoctors) : "",
                  }));
                }}
              >
                {PLAN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </FormField>
            <FormField label="Fatura dönemi" htmlFor="edit-cycle">
              <Select id="edit-cycle" value={form.billingCycle} onChange={(event) => set("billingCycle", event.target.value as BillingCycleId)}>
                {CYCLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </FormField>
            <FormField label="En fazla aktif kullanıcı" htmlFor="edit-max-users" hint="Boş = sınırsız">
              <Input id="edit-max-users" type="number" inputMode="numeric" min="1" value={form.maxActiveUsers} onChange={(event) => set("maxActiveUsers", event.target.value)} />
            </FormField>
            <FormField label="En fazla aktif doktor" htmlFor="edit-max-doctors" hint="Boş = sınırsız">
              <Input id="edit-max-doctors" type="number" inputMode="numeric" min="1" value={form.maxActiveDoctors} onChange={(event) => set("maxActiveDoctors", event.target.value)} />
            </FormField>
          </div>
        </Section>

        <Section title="Hizmet durumu">
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Klinik ne yapabilsin?" htmlFor="edit-access" hint={accessHint}>
              <Select
                id="edit-access"
                value={form.access}
                onChange={(event) => {
                  const next = event.target.value as AccessChoice;
                  setForm((current) => ({
                    ...current,
                    access: next,
                    suspendedUntilLocal: next === "SUSPENDED_UNTIL" ? current.suspendedUntilLocal || turkeyDateTimeLocalValue(new Date(Date.now() + 86_400_000)) : current.suspendedUntilLocal,
                  }));
                }}
              >
                {ACCESS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </FormField>
            {form.access === "SUSPENDED_UNTIL" && (
              <FormField label="Askı bitişi (Türkiye saati)" htmlFor="edit-suspended-until" required>
                <Input id="edit-suspended-until" type="datetime-local" value={form.suspendedUntilLocal} onChange={(event) => set("suspendedUntilLocal", event.target.value)} />
              </FormField>
            )}
            <div className="md:col-span-2">
              <FormField label="Kliniğe gösterilecek not" htmlFor="edit-note" hint="Kısıtlama veya askı uyarısında klinik kullanıcılarına gösterilir">
                <Textarea id="edit-note" rows={2} maxLength={300} value={form.serviceNote} onChange={(event) => set("serviceNote", event.target.value)} placeholder="Ör. Ödemeniz alındığında hizmet açılacaktır." />
              </FormField>
            </div>
          </div>
        </Section>

      </div>
    </Modal>
  );
}
