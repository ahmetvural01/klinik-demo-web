"use client";

import { FormEvent, useState } from "react";

type DemoResponse = {
  demo?: {
    institution: string;
    identityNo: string;
    password: string;
    expiresAt: string;
    loginUrl: string;
  };
  message?: string;
};

export function DemoRequestForm() {
  const [form, setForm] = useState({ institutionName: "", contactName: "", email: "", phone: "", clinicType: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState<DemoResponse["demo"] | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setDemo(null);
    setLoading(true);

    const payload = { ...form, notes: form.clinicType };
    const res = await fetch("/api/demo-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({} as DemoResponse));
    setLoading(false);

    if (!res.ok || !body.demo) {
      setError(body.message || "Demo erişimi oluşturulamadı.");
      return;
    }

    setDemo(body.demo);
  };

  if (demo) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-lg shadow-slate-200/60">
        <p className="text-xs font-bold uppercase text-emerald-600">Demo erişimi hazır</p>
        <h4 className="mt-2 text-xl font-black">Size özel demo kurumu oluşturuldu.</h4>
        <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
          <p><strong>Kurum:</strong> {demo.institution}</p>
          <p><strong>TC / Personel No:</strong> {demo.identityNo}</p>
          <p><strong>Şifre:</strong> {demo.password}</p>
          <p><strong>Geçerlilik:</strong> {new Date(demo.expiresAt).toLocaleDateString("tr-TR")}</p>
        </div>
        <a
          href={demo.loginUrl}
          className="mt-4 inline-flex w-full justify-center rounded-xl bg-[#0d7d6f] px-4 py-3 text-sm font-bold text-white hover:bg-[#0a655a]"
        >
          Demo hesabına giriş yap
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-lg shadow-slate-200/60">
      <p className="text-xs font-bold uppercase text-[#0d7d6f]">Demo talep formu</p>
      <div className="mt-4 grid gap-3">
        <input
          required
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0d7d6f] focus:ring-2 focus:ring-[#0d7d6f]/12"
          placeholder="Klinik / kurum adı"
          value={form.institutionName}
          onChange={(e) => setForm({ ...form, institutionName: e.target.value })}
        />
        <input
          required
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0d7d6f] focus:ring-2 focus:ring-[#0d7d6f]/12"
          placeholder="Yetkili kişi"
          value={form.contactName}
          onChange={(e) => setForm({ ...form, contactName: e.target.value })}
        />
        <input
          required
          type="email"
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0d7d6f] focus:ring-2 focus:ring-[#0d7d6f]/12"
          placeholder="E-posta"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0d7d6f] focus:ring-2 focus:ring-[#0d7d6f]/12"
          placeholder="Telefon"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <select
          required
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0d7d6f] focus:ring-2 focus:ring-[#0d7d6f]/12"
          value={form.clinicType}
          onChange={(e) => setForm({ ...form, clinicType: e.target.value })}
        >
          <option value="">Klinik tipi (seçiniz)</option>
          <option value="tek-sub">Tek şube</option>
          <option value="coklu-sub">Çoklu şube</option>
          <option value="ozel">Özel / Hastane</option>
        </select>
      </div>
      {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-full rounded-xl bg-[#0d7d6f] px-4 py-3 text-sm font-bold text-white hover:bg-[#0a655a] disabled:opacity-60"
      >
        {loading ? "Demo hazırlanıyor..." : "Demo erişimi oluştur"}
      </button>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Demo hesabı süreli ve izoledir; gerçek müşteri verileriyle karışmaz.
      </p>
    </form>
  );
}
