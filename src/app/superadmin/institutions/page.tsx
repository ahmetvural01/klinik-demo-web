"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Plus } from "lucide-react";
import { cachedGet } from "@/lib/client-cache";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { FormField, inputErrorClass } from "@/components/ui/FormField";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";

type Institution = {
  id: string;
  name: string;
  owner?: { fullName: string };
  email: string;
  phone: string;
  subscriptionPlan: string;
  smsBalance: number;
  isActive: boolean;
  createdAt: string;
};

type FormState = {
  name: string;
  ownerName: string;
  ownerIdentityNo: string;
  ownerPassword: string;
  email: string;
  phone: string;
  address: string;
  taxNo: string;
  subscriptionPlan: "TEMEL" | "PROFESYONEL" | "KURUMSAL";
  smsBalance: number;
};

const emptyForm: FormState = {
  name: "",
  ownerName: "",
  ownerIdentityNo: "",
  ownerPassword: "",
  email: "",
  phone: "",
  address: "",
  taxNo: "",
  subscriptionPlan: "TEMEL",
  smsBalance: 500,
};

export default function InstitutionsPage() {
  const [items, setItems] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  // Ghost giriş modal state
  const [ghostTarget, setGhostTarget] = useState<Institution | null>(null);
  const [ghostPassword, setGhostPassword] = useState("");
  const [ghostLoading, setGhostLoading] = useState(false);
  const [ghostError, setGhostError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/superadmin/institutions");
    if (res.ok) {
      setItems(await res.json());
    } else {
      setMessage("Klinik listesi alınamadı");
    }
    setLoading(false);
  };

  useEffect(() => {
    const bootstrap = async () => {
      const meData = await cachedGet<{ role?: string } | null>("/api/auth/me", 60_000);
      if (!meData) {
        router.replace("/superadmin");
        return;
      }
      if (meData.role !== "SUPERADMIN") {
        router.replace("/superadmin");
        return;
      }

      await load();
    };
    void bootstrap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.owner?.fullName || "").toLowerCase().includes(q) ||
        i.email.toLowerCase().includes(q)
    );
  }, [items, query]);

  const createInstitution = async () => {
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/superadmin/institutions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSaving(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Oluşturma başarısız" }));
      setMessage(err.message || "Oluşturma başarısız");
      return;
    }

    setMessage("Klinik oluşturuldu");
    setShowNew(false);
    setForm(emptyForm);
    void load();
  };

  const enterAsGhost = async () => {
    if (!ghostTarget || !ghostPassword) return;
    setGhostLoading(true);
    setGhostError(null);
    const res = await fetch("/api/auth/superadmin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionId: ghostTarget.id, password: ghostPassword }),
    });
    setGhostLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Hata" }));
      setGhostError(err.message || "Giriş başarısız");
      return;
    }
    // Ghost token set edildi, klinik paneline yönlendir
    window.open("/anasayfa", "_blank");
    setGhostTarget(null);
    setGhostPassword("");
  };

  const columns: ListTableColumn<Institution>[] = [
    {
      key: "name",
      header: "Klinik",
      render: (inst) => (
        <>
          <Link href={`/superadmin/institutions/${inst.id}`} className="font-semibold text-slate-900 hover:text-primary hover:underline">
            {inst.name}
          </Link>
          <p className="text-xs text-slate-500">{inst.email}</p>
        </>
      ),
    },
    { key: "owner", header: "Sahip", render: (inst) => <span className="text-slate-700">{inst.owner?.fullName || "-"}</span> },
    { key: "subscriptionPlan", header: "Plan", render: (inst) => <span>{inst.subscriptionPlan}</span> },
    { key: "smsBalance", header: "SMS", align: "right", render: (inst) => <span className="font-semibold">{inst.smsBalance.toLocaleString()}</span> },
    {
      key: "isActive",
      header: "Durum",
      align: "center",
      render: (inst) => <Badge tone={inst.isActive ? "success" : "critical"}>{inst.isActive ? "Aktif" : "Pasif"}</Badge>,
    },
    {
      key: "actions",
      header: "İşlem",
      align: "center",
      render: (inst) => (
        <div className="flex items-center justify-center gap-2">
          <Button variant="secondary" size="sm" href={`/superadmin/institutions/${inst.id}`}>
            Detay
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Eye}
            onClick={() => { setGhostTarget(inst); setGhostPassword(""); setGhostError(null); }}
          >
            Kliniğe Gir
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
    <section className="space-y-4">
      <header className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Klinik Yönetimi</h1>
            <p className="text-sm text-slate-500">Tüm klinikleri buradan yönetin.</p>
          </div>
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowNew((v) => !v)}>
            {showNew ? "Formu Kapat" : "Yeni Klinik"}
          </Button>
        </div>

        <div className="mt-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Klinik, sahip veya e-posta ara"
            className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
          />
        </div>
      </header>

      {message && <div className="rounded-xl border border-slate-100 bg-white p-3 text-sm text-slate-700 shadow-sm">{message}</div>}

      <ListTable<Institution>
        columns={columns}
        rows={filtered}
        rowKey={(inst) => inst.id}
        loading={loading}
        emptyText="Klinik bulunamadı"
      />
    </section>

      {/* Yeni klinik oluşturma modal */}
      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="Yeni Klinik Oluştur"
        size="lg"
        footer={
          <Button variant="primary" loading={saving} onClick={() => void createInstitution()}>
            Kliniği Kaydet
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Klinik Adı">
            <input
              className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </FormField>
          <FormField label="Sahip Ad Soyad">
            <input
              className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
              value={form.ownerName}
              onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
            />
          </FormField>
          <FormField label="Sahip TC">
            <input
              className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
              value={form.ownerIdentityNo}
              onChange={(e) => setForm((f) => ({ ...f, ownerIdentityNo: e.target.value }))}
            />
          </FormField>
          <FormField label="Sahip Şifre">
            <input
              type="password"
              className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
              value={form.ownerPassword}
              onChange={(e) => setForm((f) => ({ ...f, ownerPassword: e.target.value }))}
            />
          </FormField>
          <FormField label="E-posta">
            <input
              className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </FormField>
          <FormField label="Telefon">
            <input
              className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </FormField>
          <FormField label="Vergi No">
            <input
              className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
              value={form.taxNo}
              onChange={(e) => setForm((f) => ({ ...f, taxNo: e.target.value }))}
            />
          </FormField>
          <FormField label="Adres">
            <input
              className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </FormField>
          <FormField label="Plan">
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={form.subscriptionPlan}
              onChange={(e) =>
                setForm((f) => ({ ...f, subscriptionPlan: e.target.value as FormState["subscriptionPlan"] }))
              }
            >
              <option value="TEMEL">TEMEL</option>
              <option value="PROFESYONEL">PROFESYONEL</option>
              <option value="KURUMSAL">KURUMSAL</option>
            </select>
          </FormField>
          <FormField label="İlk SMS Bakiye">
            <input
              type="number"
              className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
              value={form.smsBalance}
              onChange={(e) => setForm((f) => ({ ...f, smsBalance: Number(e.target.value) || 0 }))}
            />
          </FormField>
        </div>
      </Modal>

      {/* Ghost giriş şifre modal */}
      <Modal
        open={!!ghostTarget}
        onClose={() => { setGhostTarget(null); setGhostPassword(""); }}
        title="Kliniğe Gizli Giriş"
        description={ghostTarget ? `${ghostTarget.name} kliniğine giriş yapmak için superadmin şifrenizi girin.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setGhostTarget(null); setGhostPassword(""); }}>
              İptal
            </Button>
            <Button variant="primary" loading={ghostLoading} disabled={!ghostPassword} onClick={() => void enterAsGhost()}>
              Giriş Yap
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Bu giriş denetim günlüğüne (Denetim Günlüğü) &quot;gizli giriş&quot; olarak kaydedilir.
          </p>
          <FormField label="Superadmin Şifresi">
            <input
              type="password"
              autoFocus
              className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
              value={ghostPassword}
              onChange={(e) => setGhostPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void enterAsGhost()}
            />
          </FormField>
          {ghostError && <p className="text-sm text-red-600">{ghostError}</p>}
        </div>
      </Modal>
    </>
  );
}
