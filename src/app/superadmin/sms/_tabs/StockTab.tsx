"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { StatsCard } from "@/components/ui/Premium";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { showToastSafe } from "@/lib/toast-client";
import { TabIntro } from "@/components/superadmin/TabIntro";
import { count, dateTime, money } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet, saSend } from "@/components/superadmin/sa-fetch";

const LOW_SMS = 50;

type Institution = { id: string; name: string; isActive: boolean; smsBalance: number };
type Purchase = { id: string; quantity: number; unitCost: number | null; totalCost: number | null; provider: string; note: string; createdAt: string };
type StockData = {
  wallet: { availableBalance: number };
  totals: { totalAssignedToClinics: number; clinicCountWithSms: number };
  institutions: Institution[];
  purchases: Purchase[];
};
type Provider = { id: string; code: string; name: string; isActive: boolean };

const EMPTY = { quantity: "", unitCost: "", provider: "", note: "" };

/**
 * Platform SMS stoğu: sağlayıcıdan toplu alınan SMS'ler buraya eklenir,
 * kliniklere paket satıldıkça düşer. Önceden sayfada her açılışta anlamsız
 * bir "Senkronizasyon GET sırasında yapılmaz" uyarısı, diğer iki kutunun
 * toplamını tekrar eden "Sistem toplamı" ve nedeni söylenmeden pasif kalan
 * "Stok Ekle" düğmesi vardı.
 */
export default function StockTab() {
  const router = useRouter();
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [providers, setProviders] = useState<Provider[]>([]);
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

  const openAdd = () => {
    setForm(EMPTY);
    setFormError(null);
    setOpen(true);
    if (providers.length === 0) {
      saGet<{ providers: Provider[] }>("/api/superadmin/sms-provider", "")
        .then((result) => {
          const list = Array.isArray(result?.providers) ? result.providers.filter((item) => item.code !== "MOCK") : [];
          setProviders(list);
          const active = list.find((item) => item.isActive) || list[0];
          if (active) setForm((current) => (current.provider ? current : { ...current, provider: active.name }));
        })
        .catch(() => undefined);
    }
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

  const clinics = useMemo(() => {
    const list = data?.institutions ?? [];
    return [...list].sort((a, b) => (a.isActive === b.isActive ? a.smsBalance - b.smsBalance : a.isActive ? -1 : 1));
  }, [data]);

  const balanceBadge = (item: Institution) => {
    if (!item.isActive) return <Badge tone="neutral">Kapalı klinik</Badge>;
    if (item.smsBalance < LOW_SMS) return <Badge tone="warning">Az ({`<${LOW_SMS}`})</Badge>;
    return null;
  };

  const clinicColumns: ListTableColumn<Institution>[] = [
    { key: "name", header: "Klinik", render: (item) => <span className="font-semibold text-slate-900">{item.name}</span> },
    { key: "smsBalance", header: "SMS bakiyesi", align: "right", render: (item) => <span className="font-semibold tabular-nums">{count(item.smsBalance)}</span> },
    { key: "state", header: "", render: (item) => balanceBadge(item) || <span /> },
  ];

  const purchaseColumns: ListTableColumn<Purchase>[] = [
    { key: "createdAt", header: "Tarih", render: (item) => <span className="whitespace-nowrap text-sm text-slate-600">{dateTime(item.createdAt)}</span> },
    { key: "provider", header: "Sağlayıcı", render: (item) => <span className="font-semibold text-slate-800">{item.provider}</span> },
    { key: "quantity", header: "Adet", align: "right", render: (item) => <span className="tabular-nums">{count(item.quantity)}</span> },
    { key: "totalCost", header: "Maliyet", align: "right", render: (item) => (item.totalCost != null ? <span className="tabular-nums">{money(item.totalCost)}</span> : <EmptyValue />) },
    { key: "note", header: "Not", cellClassName: "max-w-xs truncate", render: (item) => <span className="text-slate-600">{item.note}</span> },
  ];

  if (loadError && !data) return <LoadErrorState message={loadError} onRetry={reload} />;

  const stock = data?.wallet.availableBalance ?? 0;

  return (
    <section className="space-y-4">
      <TabIntro
        text="Sağlayıcıdan aldığınız SMS'leri stoğa ekleyin; kliniklere paket satıldıkça stoktan düşer."
        actions={<Button icon={PackagePlus} onClick={openAdd}>Stok ekle</Button>}
      />

      <div className="grid grid-cols-2 gap-3">
        <StatsCard label="Satılabilir stok" value={data ? count(stock) : "—"} description={stock <= 0 && data ? "Stok bitti: klinik satışı yapılamaz" : "Kliniklere satılabilecek SMS"} tone={data && stock <= 0 ? "warning" : "neutral"} />
        <StatsCard label="Kliniklerdeki toplam" value={data ? count(data.totals.totalAssignedToClinics) : "—"} description={data ? `${count(data.totals.clinicCountWithSms)} klinikte bakiye var` : undefined} />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-slate-900">Klinik bakiyeleri</h2>
        <ListTable<Institution>
          columns={clinicColumns}
          rows={clinics}
          rowKey={(item) => item.id}
          loading={loading}
          onRowClick={(item) => router.push(`/superadmin/institutions/${item.id}?tab=sms`)}
          getRowAriaLabel={(item) => `${item.name} SMS bölümünü aç`}
          rowClassName={(item) => (item.isActive ? "" : "opacity-60")}
          emptyText="Klinik yok"
          mobileCard={(item) => (
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-semibold text-slate-900">{item.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                {balanceBadge(item)}
                <span className="font-semibold tabular-nums">{count(item.smsBalance)}</span>
              </span>
            </div>
          )}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-slate-900">Son stok alımları</h2>
        <ListTable<Purchase>
          columns={purchaseColumns}
          rows={data?.purchases ?? []}
          rowKey={(item) => item.id}
          loading={loading}
          emptyText="Henüz stok alımı yok"
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
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Platform stoğuna SMS ekle"
        description="Sağlayıcıdan satın aldığınız SMS'leri kaydedin."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button loading={saving} onClick={() => void save()}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormErrorBanner message={formError} />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="SMS adedi" htmlFor="stock-qty" required>
              <Input id="stock-qty" type="number" inputMode="numeric" min="1" step="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} />
            </FormField>
            <FormField label="SMS başına maliyet (₺)" htmlFor="stock-cost" hint="İsteğe bağlı; kâr hesabı için">
              <Input id="stock-cost" type="number" inputMode="decimal" min="0" step="0.001" value={form.unitCost} onChange={(event) => setForm((current) => ({ ...current, unitCost: event.target.value }))} />
            </FormField>
          </div>
          <FormField label="Sağlayıcı" htmlFor="stock-provider" required hint={providers.length === 0 ? "Tanımlı sağlayıcı bulunamadı; adını yazın" : undefined}>
            {providers.length > 0 ? (
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
        </div>
      </Modal>
    </section>
  );
}
