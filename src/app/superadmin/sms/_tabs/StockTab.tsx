"use client";

import { useCallback, useEffect, useState } from "react";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormModal } from "@/components/ui/FormModal";
import { Input, Select } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { StatStrip, type StatItem } from "@/components/ui/StatStrip";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { showToastSafe } from "@/lib/toast-client";
import { LOW_SMS_THRESHOLD } from "@/components/superadmin/sa-labels";
import { count, dateTime, money } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet, saSend } from "@/components/superadmin/sa-fetch";

type Institution = { id: string; name: string; isActive: boolean; smsBalance: number };
type Purchase = { id: string; quantity: number; unitCost: number | null; totalCost: number | null; provider: string; note: string; createdAt: string };
type StockData = {
  wallet: { availableBalance: number };
  totals: { totalAssignedToClinics: number; clinicCountWithSms: number };
  /** Eski yanıtlarda yok; o zaman listeden sayılır. */
  lowClinicCount?: number;
  institutions: Institution[];
  purchases: Purchase[];
};
type Provider = { id: string; code: string; name: string; isActive: boolean };

const EMPTY = { quantity: "", unitCost: "", provider: "", note: "" };

/**
 * Platform SMS stoğu: sağlayıcıdan toplu alınan SMS'ler buraya eklenir,
 * kliniklere paket satıldıkça düşer. Paketlerle aynı sekmede ("Satış ve
 * stok"): satış için iki ön koşul tek ekranda. Önceden burada tüm kliniklerin
 * SMS bakiye tablosu da vardı — Klinikler listesindeki SMS sütununu ve "SMS
 * azalan" süzgecini tekrar ediyordu; yerine o süzgece giden tek sayı.
 */
export default function StockTab() {
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    saGet<StockData>("/api/superadmin/sms-wallet", "SMS stoğu yüklenemedi.", controller.signal)
      .then(setData)
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "SMS stoğu yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  // Sağlayıcı listesi yalnız pencere açılınca (bir kez) okunur. Yanıt
  // gelene kadar "yükleniyor", hata olursa nedeni yazılır; önceden bu sürede
  // (canlıda ~5 sn) "Tanımlı sağlayıcı bulunamadı" görünüyor, hata olursa
  // liste sessizce boş kalıyordu (canlı test H19).
  const pickDefault = (list: Provider[]) => {
    const active = list.find((item) => item.isActive) || list[0];
    if (active) setForm((current) => (current.provider ? current : { ...current, provider: active.name }));
  };

  const openAdd = () => {
    setForm(EMPTY);
    setFormError(null);
    setOpen(true);
    if (providers && !providersError) {
      pickDefault(providers);
      return;
    }
    setProviders(null);
    setProvidersError(null);
    saGet<{ providers: Provider[] }>("/api/superadmin/sms-provider", "SMS sağlayıcıları alınamadı.")
      .then((result) => {
        const list = Array.isArray(result?.providers) ? result.providers.filter((item) => item.code !== "MOCK") : [];
        setProviders(list);
        pickDefault(list);
      })
      .catch((error) => {
        setProviders([]);
        setProvidersError(errorMessage(error, "SMS sağlayıcıları alınamadı."));
      });
  };

  const save = async () => {
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) return setFormError("Eklenecek SMS adedini yazın.");
    if (!form.provider.trim()) return setFormError("SMS'lerin alındığı sağlayıcıyı seçin.");
    if (form.note.trim().length < 3) return setFormError("Not yazın (ör. sağlayıcı fatura veya sipariş no).");
    const unitCost = form.unitCost ? Number(form.unitCost.replace(",", ".")) : null;
    if (unitCost != null && (!Number.isFinite(unitCost) || unitCost < 0)) return setFormError("Birim maliyet geçersiz.");
    setSaving(true);
    setFormError(null);
    try {
      const result = await saSend<{ message?: string }>("/api/superadmin/sms-wallet", "POST", { quantity, unitCost, provider: form.provider.trim(), note: form.note.trim() }, "Stok eklenemedi.");
      showToastSafe({ type: "success", message: result?.message || "Stok eklendi.", icon: "sms" });
      setOpen(false);
      reload();
    } catch (error) {
      setFormError(errorMessage(error, "Stok eklenemedi."));
    } finally {
      setSaving(false);
    }
  };

  const purchaseColumns: ListTableColumn<Purchase>[] = [
    { key: "createdAt", header: "Tarih", render: (item) => <span className="whitespace-nowrap text-sm text-slate-600">{dateTime(item.createdAt)}</span> },
    { key: "provider", header: "Sağlayıcı", render: (item) => <span className="font-semibold text-slate-800">{item.provider}</span> },
    { key: "quantity", header: "Adet", align: "right", render: (item) => <span className="tabular-nums">{count(item.quantity)}</span> },
    { key: "totalCost", header: "Maliyet", align: "right", render: (item) => (item.totalCost != null ? <span className="tabular-nums">{money(item.totalCost)}</span> : <EmptyValue />) },
    { key: "note", header: "Not", cellClassName: "max-w-xs truncate", render: (item) => <span className="text-slate-600">{item.note}</span> },
  ];

  if (loadError && !data) return <LoadErrorState message={loadError} onRetry={reload} />;

  const stock = data?.wallet.availableBalance ?? 0;
  const lowClinics = data?.lowClinicCount ?? (data?.institutions ?? []).filter((item) => item.isActive && item.smsBalance < LOW_SMS_THRESHOLD).length;
  const stats: StatItem[] = [
    {
      key: "stock",
      label: "Satılabilir stok",
      value: count(stock),
      tone: stock <= 0 ? "warning" : "neutral",
      hint: data ? (stock <= 0 ? "Stok bitti: klinik satışı yapılamaz" : "Kliniklere satılabilecek SMS") : undefined,
    },
    {
      key: "assigned",
      label: "Kliniklerdeki toplam",
      value: count(data?.totals.totalAssignedToClinics),
      hint: data ? `${count(data.totals.clinicCountWithSms)} klinikte bakiye var` : undefined,
    },
    {
      key: "low",
      label: "SMS'i azalan klinik",
      value: count(lowClinics),
      tone: lowClinics > 0 ? "warning" : "neutral",
      hint: `${LOW_SMS_THRESHOLD} SMS'in altında · listeyi aç`,
      href: "/superadmin/institutions?durum=sms-az",
    },
  ];

  const providerHint = providers === null
    ? "Sağlayıcı listesi yükleniyor…"
    : providersError
      ? `${providersError} Adını yazın.`
      : providers.length === 0 ? "Tanımlı sağlayıcı yok; adını yazın" : undefined;

  return (
    <section className="space-y-3">
      <StatStrip items={stats} columns={3} loading={!data} aria-label="SMS stoğu" />

      <ListTable<Purchase>
        title="Stok alımları"
        subtitle="Sağlayıcıdan alınan SMS'ler; kliniklere paket satıldıkça stoktan düşer."
        actions={<Button size="sm" variant="secondary" icon={PackagePlus} onClick={openAdd}>Stok ekle</Button>}
        columns={purchaseColumns}
        rows={data?.purchases ?? []}
        rowKey={(item) => item.id}
        loading={loading && !data}
        // İlk yükleme hatası tam ekran gösterilir (yukarıda); veri varken yenileme hatası şerittir.
        staleError={data ? loadError : null}
        onRetry={reload}
        emptyText="Henüz stok alımı yok"
        emptyDescription="Sağlayıcıdan aldığınız SMS'leri “Stok ekle” ile kaydedin; satış stoktan yapılır."
        mobileCard={(item) => (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{item.provider}</p>
              <p className="truncate text-xs text-slate-500">{dateTime(item.createdAt)} · {item.note}</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold tabular-nums">+{count(item.quantity)}</p>
              {item.totalCost != null && <p className="text-xs text-slate-500">{money(item.totalCost)}</p>}
            </div>
          </div>
        )}
      />

      <FormModal
        open={open}
        onClose={() => setOpen(false)}
        title="Platform stoğuna SMS ekle"
        description="Sağlayıcıdan satın aldığınız SMS'leri kaydedin."
        size="md"
        onSubmit={() => save()}
        submitting={saving}
        error={formError}
        formClassName="space-y-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="SMS adedi" htmlFor="stock-qty" required>
            <Input id="stock-qty" autoFocus type="number" inputMode="numeric" min="1" step="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} />
          </FormField>
          <FormField label="SMS başına maliyet (₺)" htmlFor="stock-cost" hint="İsteğe bağlı; kâr hesabı için">
            <Input id="stock-cost" type="number" inputMode="decimal" min="0" step="0.001" value={form.unitCost} onChange={(event) => setForm((current) => ({ ...current, unitCost: event.target.value }))} />
          </FormField>
        </div>
        <FormField label="Sağlayıcı" htmlFor="stock-provider" required hint={providerHint}>
          {providers && providers.length > 0 ? (
            <Select id="stock-provider" value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}>
              {providers.map((item) => <option key={item.id} value={item.name}>{item.name}{item.isActive ? " (aktif)" : ""}</option>)}
            </Select>
          ) : (
            <Input id="stock-provider" value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))} placeholder="Ör. NetGSM" />
          )}
        </FormField>
        <FormField label="Not" htmlFor="stock-note" required hint="Sağlayıcı fatura veya sipariş numarası">
          <Input id="stock-note" value={form.note} maxLength={500} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Ör. NetGSM fatura 2026-1045" />
        </FormField>
      </FormModal>
    </section>
  );
}
