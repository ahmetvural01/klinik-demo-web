"use client";

import { useEffect, useState } from "react";
import { PlusCircle } from "lucide-react";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import { showToastSafe } from "@/lib/toast-client";

type Institution = { id: string; name: string; isActive: boolean; smsBalance: number };
type Purchase = { id: string; quantity: number; unitCost: number | null; totalCost: number | null; provider: string; note: string; createdAt: string };
type StockData = {
  wallet: { availableBalance: number };
  providerSync: { ok: boolean; providerCode?: string; providerBalance?: number; message?: string };
  totals: { totalAssignedToClinics: number; totalProviderBalance: number; totalSystemSms: number; clinicCountWithSms: number };
  institutions: Institution[];
  purchases: Purchase[];
};

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function StockTab() {
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ quantity: "", unitCost: "", provider: "", note: "" });

  const load = () => {
    setLoading(true);
    fetch("/api/superadmin/sms-wallet")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const addStock = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/superadmin/sms-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: Number(form.quantity),
          unitCost: form.unitCost ? Number(form.unitCost) : null,
          provider: form.provider,
          note: form.note,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Eklenemedi");
      showToastSafe({ title: "Eklendi", message: d.message ?? "Stok güncellendi", type: "success" });
      setForm({ quantity: "", unitCost: "", provider: "", note: "" });
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const institutionColumns: ListTableColumn<Institution>[] = [
    { key: "name", header: "Klinik", render: (i) => <span className="font-bold text-slate-900">{i.name}</span> },
    {
      key: "smsBalance",
      header: "Kalan Kredi",
      align: "right",
      render: (i) => (
        <span className={`font-semibold ${i.smsBalance < 50 ? "text-red-600" : "text-emerald-600"}`}>
          {i.smsBalance.toLocaleString("tr-TR")}
        </span>
      ),
    },
    {
      key: "isActive",
      header: "Durum",
      render: (i) => <Badge tone={i.isActive ? "success" : "neutral"}>{i.isActive ? "Aktif" : "Pasif"}</Badge>,
    },
  ];

  const purchaseColumns: ListTableColumn<Purchase>[] = [
    { key: "createdAt", header: "Tarih", render: (p) => <span className="text-xs text-slate-500">{new Date(p.createdAt).toLocaleString("tr-TR")}</span> },
    { key: "provider", header: "Sağlayıcı", render: (p) => <span className="font-semibold text-slate-800">{p.provider}</span> },
    { key: "quantity", header: "Adet", align: "right", render: (p) => <span className="text-slate-700">{p.quantity.toLocaleString("tr-TR")}</span> },
    { key: "totalCost", header: "Toplam Maliyet", align: "right", render: (p) => <span className="text-slate-700">{p.totalCost != null ? `₺${p.totalCost.toLocaleString("tr-TR")}` : "—"}</span> },
    { key: "note", header: "Not", cellClassName: "max-w-xs truncate", render: (p) => <span className="text-slate-500">{p.note}</span> },
  ];

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-100 bg-white py-16 shadow-sm">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">Veri yüklenemedi</div>;
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Platform Stoğu (Ayrılmamış)</p>
          <p className="mt-1 text-2xl font-black text-primary">{data.wallet.availableBalance.toLocaleString("tr-TR")}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Kliniklere Ayrılan</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{data.totals.totalAssignedToClinics.toLocaleString("tr-TR")}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Sistem Toplamı</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{data.totals.totalSystemSms.toLocaleString("tr-TR")}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Sağlayıcı Senkronizasyonu</p>
        {data.providerSync.ok ? (
          <p className="text-sm text-emerald-700">
            {data.providerSync.providerCode}: sağlayıcı bakiyesi {data.providerSync.providerBalance?.toLocaleString("tr-TR")} — {data.providerSync.message}
          </p>
        ) : (
          <p className="text-sm text-amber-700">{data.providerSync.message}</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-black text-slate-900">Platforma Stok Ekle</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <FormField label="Adet">
            <input type="number" className={inputClass} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </FormField>
          <FormField label="Birim Maliyet (₺)">
            <input type="number" step="0.01" className={inputClass} value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} />
          </FormField>
          <FormField label="Sağlayıcı">
            <input className={inputClass} value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
          </FormField>
          <FormField label="Not">
            <input className={inputClass} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </FormField>
        </div>
        <div className="mt-3">
          <Button icon={PlusCircle} loading={saving} onClick={addStock} disabled={!form.quantity || !form.provider || !form.note}>
            Stok Ekle
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-black text-slate-900">Klinik Bakiyeleri</h3>
        <ListTable columns={institutionColumns} rows={data.institutions} rowKey={(i) => i.id} emptyText="Klinik bulunamadı" />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-black text-slate-900">Son Stok Alımları</h3>
        <ListTable columns={purchaseColumns} rows={data.purchases} rowKey={(p) => p.id} emptyText="Kayıt yok" />
      </div>
    </section>
  );
}
