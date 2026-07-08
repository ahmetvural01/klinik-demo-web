"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
      const me = await fetch("/api/auth/me");
      if (!me.ok) {
        router.replace("/superadmin");
        return;
      }
      const meData = (await me.json()) as { role?: string };
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

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-2xl bg-white p-5 shadow-sm border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-slate-900">Klinik Yönetimi</h1>
              <p className="text-sm text-slate-500">Tüm klinikleri buradan yönetin.</p>
            </div>
            <button
              onClick={() => setShowNew((v) => !v)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
            >
              {showNew ? "Formu Kapat" : "Yeni Klinik"}
            </button>
          </div>

          <div className="mt-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Klinik, sahip veya e-posta ara"
              className="w-full rounded-xl border px-3 py-2.5 text-sm"
            />
          </div>
        </header>

        {showNew && (
          <section className="rounded-2xl bg-white p-5 shadow-sm border space-y-3">
            <h2 className="font-bold text-slate-900">Yeni Klinik Oluştur</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Klinik Adı" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
              <Input label="Sahip Ad Soyad" value={form.ownerName} onChange={(v) => setForm((f) => ({ ...f, ownerName: v }))} />
              <Input label="Sahip TC" value={form.ownerIdentityNo} onChange={(v) => setForm((f) => ({ ...f, ownerIdentityNo: v }))} />
              <Input label="Sahip Şifre" value={form.ownerPassword} onChange={(v) => setForm((f) => ({ ...f, ownerPassword: v }))} type="password" />
              <Input label="E-posta" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
              <Input label="Telefon" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
              <Input label="Vergi No" value={form.taxNo} onChange={(v) => setForm((f) => ({ ...f, taxNo: v }))} />
              <Input label="Adres" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
              <label className="text-sm font-semibold text-slate-700">
                Plan
                <select
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
                  value={form.subscriptionPlan}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, subscriptionPlan: e.target.value as FormState["subscriptionPlan"] }))
                  }
                >
                  <option value="TEMEL">TEMEL</option>
                  <option value="PROFESYONEL">PROFESYONEL</option>
                  <option value="KURUMSAL">KURUMSAL</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                İlk SMS Bakiye
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
                  value={form.smsBalance}
                  onChange={(e) => setForm((f) => ({ ...f, smsBalance: Number(e.target.value) || 0 }))}
                />
              </label>
            </div>
            <button
              disabled={saving}
              onClick={() => void createInstitution()}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? "Kaydediliyor..." : "Kliniği Kaydet"}
            </button>
          </section>
        )}

        {message && <div className="rounded-xl border bg-white p-3 text-sm text-slate-700">{message}</div>}

        <section className="rounded-2xl bg-white border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">Klinik</th>
                <th className="px-4 py-3 text-left">Sahip</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-right">SMS</th>
                <th className="px-4 py-3 text-center">Durum</th>
                <th className="px-4 py-3 text-center">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Yükleniyor...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Klinik bulunamadı
                  </td>
                </tr>
              ) : (
                filtered.map((inst) => (
                  <tr key={inst.id} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{inst.name}</p>
                      <p className="text-xs text-slate-500">{inst.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{inst.owner?.fullName || "-"}</td>
                    <td className="px-4 py-3">{inst.subscriptionPlan}</td>
                    <td className="px-4 py-3 text-right font-semibold">{inst.smsBalance.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          inst.isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {inst.isActive ? "Aktif" : "Pasif"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => { setGhostTarget(inst); setGhostPassword(""); setGhostError(null); }}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                        title="Kliniğe gizli giriş yap"
                      >
                        Kliniğe Gir
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* Ghost giriş şifre modal */}
        {ghostTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border space-y-4">
              <h3 className="text-lg font-black text-slate-900">Kliniğe Gizli Giriş</h3>
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-indigo-700">{ghostTarget.name}</span> kliniğine giriş yapmak için superadmin şifrenizi girin.
              </p>
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                Bu giriş hiçbir log kaydına yansımaz.
              </p>
              <input
                type="password"
                placeholder="Superadmin şifresi"
                value={ghostPassword}
                onChange={(e) => setGhostPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void enterAsGhost()}
                className="w-full rounded-xl border px-3 py-2.5 text-sm"
                autoFocus
              />
              {ghostError && <p className="text-sm text-rose-600">{ghostError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => void enterAsGhost()}
                  disabled={ghostLoading || !ghostPassword}
                  className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {ghostLoading ? "Giriliyor..." : "Giriş Yap"}
                </button>
                <button
                  onClick={() => { setGhostTarget(null); setGhostPassword(""); }}
                  className="flex-1 rounded-xl border py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  İptal
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
      />
    </label>
  );
}
