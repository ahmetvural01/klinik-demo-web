"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, Plus, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Toolbar } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { ListTable, type ListSort, type ListTableColumn } from "@/components/ui/ListTable";
import { createModuleEmptyIcon } from "@/components/ui/ModuleIcon";
import { formatPhoneNumber } from "@/lib/format";
import { GhostLoginModal } from "@/components/superadmin/GhostLoginModal";
import { CYCLE_OPTIONS, PLAN_OPTIONS, institutionState, planLabel } from "@/components/superadmin/sa-labels";
import { count, money, shortDate } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet, saSend } from "@/components/superadmin/sa-fetch";
import type { BillingCycleId, SubscriptionPlanId } from "@/lib/subscription-plans";

const InstitutionEmptyIcon = createModuleEmptyIcon("institutions");
const LOW_SMS = 50;
const PAGE_SIZE = 25;

type Institution = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subscriptionPlan: string;
  billingCycle: string;
  smsBalance: number;
  isActive: boolean;
  serviceMode: string;
  suspendedUntil: string | null;
  paymentGraceUntil: string | null;
  isDemo: boolean;
  demoExpiresAt: string | null;
  createdAt: string;
  contactName: string | null;
  activeUserCount: number;
  openAmount: number;
  openCount: number;
  overdueCount: number;
  overdueAmount: number;
  nextDueDate: string | null;
};

const FILTER_KEYS = ["tumu", "sorunlu", "borclu", "demo", "sms-az", "kapali"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

type FormState = {
  name: string;
  email: string;
  phone: string;
  taxNo: string;
  address: string;
  subscriptionPlan: SubscriptionPlanId;
  billingCycle: BillingCycleId;
  ownerName: string;
  ownerIdentityNo: string;
  ownerPassword: string;
  smsBalance: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  phone: "",
  taxNo: "",
  address: "",
  subscriptionPlan: "TEMEL",
  billingCycle: "AYLIK",
  ownerName: "",
  ownerIdentityNo: "",
  ownerPassword: "",
  smsBalance: "0",
};

type FormErrors = Partial<Record<keyof FormState, string>>;

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const values = new Uint32Array(10);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function matchesFilter(item: Institution, filter: FilterKey): boolean {
  const state = institutionState(item);
  switch (filter) {
    case "sorunlu": return item.isActive && state.blocked;
    case "borclu": return item.openCount > 0;
    case "demo": return item.isActive && item.isDemo;
    case "sms-az": return item.isActive && item.smsBalance < LOW_SMS;
    case "kapali": return !item.isActive;
    default: return true;
  }
}

/**
 * Klinikler — "hangi kliniğin sorunu var?" sorusunu tek bakışta yanıtlar:
 * tek durum rozeti (kapalı / askıda / ödeme kilidi / kısıtlı / demo /
 * normal), açık borç ve gecikme, SMS bakiyesi. Satıra tıklayınca klinik
 * dosyası açılır; gizli giriş satır sonunda ikincil bir simge.
 */
export default function InstitutionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useTabParam(FILTER_KEYS, "tumu", "durum");
  const [sort, setSort] = useState<ListSort>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [ghostTarget, setGhostTarget] = useState<Institution | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    saGet<Institution[]>("/api/superadmin/institutions", "Klinik listesi yüklenemedi.", controller.signal)
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "Klinik listesi yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  // Kontrol Paneli ve üst menüdeki "Yeni klinik" bağlantısı (?yeni=1) formu açar.
  useEffect(() => {
    if (searchParams.get("yeni") === "1") {
      setCreateOpen(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("yeni");
      router.replace(`/superadmin/institutions${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
    }
  }, [router, searchParams]);

  useEffect(() => { setPage(1); }, [query, filter]);

  const counts = useMemo(() => {
    const result: Record<FilterKey, number> = { tumu: items.length, sorunlu: 0, borclu: 0, demo: 0, "sms-az": 0, kapali: 0 };
    for (const item of items) {
      for (const key of FILTER_KEYS) if (key !== "tumu" && matchesFilter(item, key)) result[key] += 1;
    }
    return result;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    const digits = q.replace(/\D/g, "");
    const list = items.filter((item) => {
      if (!matchesFilter(item, filter)) return false;
      if (!q) return true;
      return item.name.toLocaleLowerCase("tr-TR").includes(q)
        || (item.contactName || "").toLocaleLowerCase("tr-TR").includes(q)
        || item.email.toLocaleLowerCase("tr-TR").includes(q)
        || (digits.length >= 3 && (item.phone || "").replace(/\D/g, "").includes(digits));
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case "openAmount": return (a.openAmount - b.openAmount) * dir;
        case "smsBalance": return (a.smsBalance - b.smsBalance) * dir;
        case "createdAt": return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
        default: return a.name.localeCompare(b.name, "tr") * dir;
      }
    });
  }, [items, query, filter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const changeSort = (key: string) => setSort((current) => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : key === "name" ? "asc" : "desc" }));

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!form.name.trim()) next.name = "Klinik adını yazın.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "Geçerli bir e-posta yazın.";
    if (!form.ownerName.trim()) next.ownerName = "Klinik yöneticisinin adını yazın.";
    if (!/^\d{11}$/.test(form.ownerIdentityNo.trim())) next.ownerIdentityNo = "TC kimlik numarası 11 rakam olmalı.";
    if (form.ownerPassword.length < 8 || form.ownerPassword.length > 72) next.ownerPassword = "Şifre 8-72 karakter olmalı.";
    const sms = Number(form.smsBalance || 0);
    if (!Number.isInteger(sms) || sms < 0) next.smsBalance = "0 veya daha büyük bir tam sayı yazın.";
    return next;
  };

  const create = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      setFormError("Kırmızı işaretli alanları düzeltin.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await saSend<{ id: string; name: string }>("/api/superadmin/institutions", "POST", {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        taxNo: form.taxNo.trim(),
        address: form.address.trim(),
        subscriptionPlan: form.subscriptionPlan,
        billingCycle: form.billingCycle,
        ownerName: form.ownerName.trim(),
        ownerIdentityNo: form.ownerIdentityNo.trim(),
        ownerPassword: form.ownerPassword,
        smsBalance: Number(form.smsBalance || 0),
      }, "Klinik oluşturulamadı.");
      setForm(EMPTY_FORM);
      setCreateOpen(false);
      // Sıradaki adımlar (ilk fatura, SMS, giriş bilgisi) klinik dosyasında gösterilir.
      router.push(`/superadmin/institutions/${created.id}?yeni=1`);
    } catch (error) {
      setFormError(errorMessage(error, "Klinik oluşturulamadı."));
    } finally {
      setSaving(false);
    }
  };

  const stateBadge = (item: Institution) => {
    const state = institutionState(item);
    return <Badge tone={state.tone} title={state.detail}>{state.label}</Badge>;
  };

  const debtCell = (item: Institution) => {
    if (item.openCount === 0) return <span className="text-sm text-slate-500">Borç yok</span>;
    return (
      <div className="text-right">
        <p className={`font-semibold tabular-nums ${item.overdueCount > 0 ? "text-red-700" : "text-slate-900"}`}>{money(item.openAmount)}</p>
        <p className="text-xs text-slate-500">
          {item.overdueCount > 0 ? `${item.overdueCount} gecikmiş` : item.nextDueDate ? `Vade ${shortDate(item.nextDueDate)}` : `${item.openCount} fatura`}
        </p>
      </div>
    );
  };

  const smsCell = (item: Institution) => (
    <span className={`font-semibold tabular-nums ${item.isActive && item.smsBalance < LOW_SMS ? "text-amber-700" : "text-slate-700"}`} title={item.isActive && item.smsBalance < LOW_SMS ? `${LOW_SMS} SMS'in altında` : undefined}>
      {count(item.smsBalance)}
    </span>
  );

  const ghostButton = (item: Institution) => (
    <IconButton icon={LogIn} title="Kliniğe gizli giriş" size="sm" disabled={!item.isActive} onClick={() => setGhostTarget(item)} />
  );

  const columns: ListTableColumn<Institution>[] = [
    {
      key: "name",
      header: "Klinik",
      sortKey: "name",
      render: (item) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{item.name}</p>
          <p className="truncate text-xs text-slate-500">
            {[item.contactName, item.phone ? formatPhoneNumber(item.phone) : item.email].filter(Boolean).join(" · ")}
          </p>
        </div>
      ),
    },
    { key: "plan", header: "Plan", render: (item) => <span className="text-sm text-slate-700">{planLabel(item.subscriptionPlan, item.billingCycle)}</span> },
    { key: "state", header: "Durum", render: stateBadge },
    { key: "openAmount", header: "Açık borç", align: "right", sortKey: "openAmount", render: debtCell },
    { key: "smsBalance", header: "SMS", align: "right", sortKey: "smsBalance", render: smsCell },
    { key: "actions", header: "", align: "right", render: ghostButton },
  ];

  const tabItems = [
    { key: "tumu" as const, label: "Tümü", count: counts.tumu },
    { key: "sorunlu" as const, label: "Kısıtlı / kilitli", count: counts.sorunlu, countTone: "critical" as const },
    { key: "borclu" as const, label: "Borçlu", count: counts.borclu, countTone: "warning" as const },
    { key: "demo" as const, label: "Demo", count: counts.demo },
    { key: "sms-az" as const, label: "SMS azalan", count: counts["sms-az"] },
    { key: "kapali" as const, label: "Kapalı", count: counts.kapali },
  ];

  const totalOpen = items.reduce((sum, item) => sum + item.openAmount, 0);

  return (
    <section className="space-y-4">
      <PageHeader
        icon="institutions"
        title="Klinikler"
        description="Klinik bulun, durumunu görün, dosyasını açın."
        stats={items.length > 0 ? [
          { label: "Aktif", value: count(items.filter((item) => item.isActive).length) },
          { label: "Açık alacak", value: money(totalOpen), color: totalOpen > 0 ? "text-red-700" : undefined },
        ] : undefined}
        actions={<Button icon={Plus} onClick={() => setCreateOpen(true)}>Yeni klinik</Button>}
      />

      <Tabs ariaLabel="Klinik durumu filtresi" size="sm" items={tabItems} value={filter} onChange={setFilter} />

      <ListTable<Institution>
        header={
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder="Klinik adı, yetkili, e-posta veya telefon" slashShortcut wrapperClassName="flex-1 min-w-[220px]" />
          </Toolbar>
        }
        columns={columns}
        rows={rows}
        rowKey={(item) => item.id}
        loading={loading}
        error={loadError}
        onRetry={() => setReloadKey((value) => value + 1)}
        sort={sort}
        onSortChange={changeSort}
        onRowClick={(item) => router.push(`/superadmin/institutions/${item.id}`)}
        getRowAriaLabel={(item) => `${item.name} klinik dosyasını aç`}
        rowClassName={(item) => (item.isActive ? "" : "opacity-60")}
        emptyText={query || filter !== "tumu" ? "Bu aramaya uyan klinik yok" : "Henüz klinik yok"}
        emptyDescription={query || filter !== "tumu" ? "Aramayı veya üstteki filtreyi değiştirin." : "İlk kliniği \"Yeni klinik\" ile açın."}
        emptyIcon={InstitutionEmptyIcon}
        emptyIllustrative
        pager={{ page, pageCount, pageSize: PAGE_SIZE, total: filtered.length, onPageChange: setPage }}
        mobileCard={(item) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{item.name}</p>
                <p className="truncate text-xs text-slate-500">{planLabel(item.subscriptionPlan, item.billingCycle)}{item.contactName ? ` · ${item.contactName}` : ""}</p>
              </div>
              {stateBadge(item)}
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={item.overdueCount > 0 ? "font-semibold text-red-700" : "text-slate-600"}>
                {item.openCount === 0 ? "Borç yok" : `Borç ${money(item.openAmount)}${item.overdueCount > 0 ? ` · ${item.overdueCount} gecikmiş` : ""}`}
              </span>
              <span className="flex items-center gap-2 text-slate-600">SMS {smsCell(item)} {ghostButton(item)}</span>
            </div>
          </div>
        )}
      />

      <GhostLoginModal institution={ghostTarget} onClose={() => setGhostTarget(null)} />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni klinik"
        description="Klinik ve ilk klinik yöneticisi hesabı birlikte açılır. Kapatırsanız yazdıklarınız kaybolmaz."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Vazgeç</Button>
            <Button loading={saving} onClick={() => void create()}>Kaydet</Button>
          </>
        }
      >
        <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void create(); }} noValidate>
          <FormErrorBanner message={formError} />

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-bold text-slate-900">Klinik</legend>
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Klinik adı" htmlFor="new-name" required error={errors.name} hint="Klinik kullanıcıları girişte bu adı yazar">
                <Input id="new-name" value={form.name} onChange={(event) => setField("name", event.target.value)} />
              </FormField>
              <FormField label="E-posta" htmlFor="new-email" required error={errors.email} hint="Fatura ve hatırlatmalar bu adrese gider">
                <Input id="new-email" type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} />
              </FormField>
              <FormField label="Telefon" htmlFor="new-phone">
                <Input id="new-phone" type="tel" inputMode="tel" value={form.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="05xx xxx xx xx" />
              </FormField>
              <FormField label="Vergi no" htmlFor="new-tax">
                <Input id="new-tax" inputMode="numeric" value={form.taxNo} onChange={(event) => setField("taxNo", event.target.value)} />
              </FormField>
              <div className="md:col-span-2">
                <FormField label="Adres" htmlFor="new-address">
                  <Input id="new-address" value={form.address} onChange={(event) => setField("address", event.target.value)} />
                </FormField>
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-slate-100 pt-4">
            <legend className="mb-1 text-sm font-bold text-slate-900">Abonelik</legend>
            <div className="grid gap-3 md:grid-cols-3">
              <FormField label="Plan" htmlFor="new-plan" required>
                <Select id="new-plan" value={form.subscriptionPlan} onChange={(event) => setField("subscriptionPlan", event.target.value as SubscriptionPlanId)}>
                  {PLAN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </FormField>
              <FormField label="Fatura dönemi" htmlFor="new-cycle" required>
                <Select id="new-cycle" value={form.billingCycle} onChange={(event) => setField("billingCycle", event.target.value as BillingCycleId)}>
                  {CYCLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </FormField>
              <FormField label="Açılış hediyesi SMS" htmlFor="new-sms" error={errors.smsBalance} hint="Faturasızdır, platform stoğundan düşer. Ücretli SMS için açılıştan sonra Paket sat.">
                <Input id="new-sms" type="number" inputMode="numeric" min="0" step="1" value={form.smsBalance} onChange={(event) => setField("smsBalance", event.target.value)} />
              </FormField>
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-slate-100 pt-4">
            <legend className="mb-1 text-sm font-bold text-slate-900">Klinik yöneticisi (sahip)</legend>
            <div className="grid gap-3 md:grid-cols-3">
              <FormField label="Ad soyad" htmlFor="new-owner" required error={errors.ownerName}>
                <Input id="new-owner" value={form.ownerName} onChange={(event) => setField("ownerName", event.target.value)} />
              </FormField>
              <FormField label="TC kimlik no" htmlFor="new-owner-tc" required error={errors.ownerIdentityNo} hint="Girişte kullanılır">
                <Input id="new-owner-tc" inputMode="numeric" maxLength={11} value={form.ownerIdentityNo} onChange={(event) => setField("ownerIdentityNo", event.target.value.replace(/\D/g, ""))} />
              </FormField>
              <FormField label="Geçici şifre" htmlFor="new-owner-password" required error={errors.ownerPassword} hint="En az 8 karakter. Sahibe iletin.">
                <div className="flex gap-1.5">
                  <Input id="new-owner-password" value={form.ownerPassword} onChange={(event) => setField("ownerPassword", event.target.value)} autoComplete="new-password" />
                  <IconButton icon={Wand2} title="Şifre üret" onClick={() => setField("ownerPassword", generatePassword())} />
                </div>
              </FormField>
            </div>
          </fieldset>
        </form>
      </Modal>
    </section>
  );
}
