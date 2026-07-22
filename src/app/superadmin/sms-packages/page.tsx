"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputErrorClass } from "@/components/ui/FormField";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { showToastSafe } from "@/lib/toast-client";

type Package = {
  id: string;
  name: string;
  smsCount: number;
  price: number;
  isActive: boolean;
  createdAt: string;
};

export default function SmsPackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", smsCount: "", price: "" });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/superadmin/sms-packages")
      .then((r) => r.json())
      .then((d) => setPackages(Array.isArray(d) ? d : d.packages ?? []))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.name || !form.smsCount || !form.price) {
      showToastSafe({ title: "Eksik bilgi", message: "Tüm alanları doldurun", type: "error" });
      return;
    }
    setSaving(true);
    try {
      await fetch("/api/superadmin/sms-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          smsCount: parseInt(form.smsCount),
          price: parseFloat(form.price),
        }),
      });
      showToastSafe({ title: "Kaydedildi", message: "SMS paketi oluşturuldu", type: "success" });
      setShowForm(false);
      setForm({ name: "", smsCount: "", price: "" });
      load();
    } catch {
      showToastSafe({ title: "Hata", message: "Paket kaydedilemedi", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    try {
      await fetch(`/api/superadmin/sms-packages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !current }),
      });
      showToastSafe({ title: current ? "Pasife alındı" : "Aktif edildi", message: "Paket durumu güncellendi", type: "success" });
      load();
    } catch {
      showToastSafe({ title: "Hata", message: "Durum güncellenemedi", type: "error" });
    }
  };

  const columns: ListTableColumn<Package>[] = [
    { key: "name", header: "Paket Adı", render: (p) => <span className="font-bold text-slate-900">{p.name}</span> },
    { key: "smsCount", header: "SMS Adedi", align: "right", render: (p) => <span className="font-semibold text-slate-700">{p.smsCount.toLocaleString("tr-TR")}</span> },
    { key: "price", header: "Fiyat", align: "right", render: (p) => <span className="font-semibold text-slate-700">₺{p.price.toLocaleString("tr-TR")}</span> },
    { key: "unitPrice", header: "Birim Fiyat", align: "right", render: (p) => <span className="text-xs text-slate-500">₺{(p.price / p.smsCount).toFixed(3)}/SMS</span> },
    { key: "status", header: "Durum", render: (p) => <Badge tone={p.isActive ? "success" : "neutral"}>{p.isActive ? "Aktif" : "Pasif"}</Badge> },
    {
      key: "actions",
      header: "İşlem",
      render: (p) => (
        <Button variant={p.isActive ? "danger" : "secondary"} size="sm" onClick={() => toggleActive(p.id, p.isActive)}>
          {p.isActive ? "Pasif Et" : "Aktif Et"}
        </Button>
      ),
    },
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="h-4 w-4" />
          </span>
          <h1 className="text-lg font-black text-slate-900">SMS Paketleri</h1>
        </div>
        <Button icon={Plus} onClick={() => setShowForm(true)}>Yeni Paket</Button>
      </div>

      <ListTable<Package>
        columns={columns}
        rows={packages}
        rowKey={(p) => p.id}
        loading={loading}
        emptyText="Paket bulunamadı"
      />

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Yeni SMS Paketi"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>İptal</Button>
            <Button onClick={handleSave} loading={saving}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Paket Adı" required>
            <input
              className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${inputErrorClass(false)}`}
              placeholder="Başlangıç Paketi"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormField>
          <FormField label="SMS Adedi" required>
            <input
              type="number"
              className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${inputErrorClass(false)}`}
              placeholder="500"
              value={form.smsCount}
              onChange={(e) => setForm({ ...form, smsCount: e.target.value })}
            />
          </FormField>
          <FormField label="Fiyat (₺)" required>
            <input
              type="number"
              className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${inputErrorClass(false)}`}
              placeholder="150.00"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </FormField>
        </div>
      </Modal>
    </section>
  );
}
