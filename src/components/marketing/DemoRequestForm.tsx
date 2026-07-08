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
  const [form, setForm] = useState({ institutionName: "", contactName: "", email: "", phone: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState<DemoResponse["demo"] | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setDemo(null);
    setLoading(true);

    const res = await fetch("/api/demo-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
      <div className="rounded-2xl border border-white/20 bg-white p-5 text-slate-900 shadow-2xl">
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
          className="mt-4 inline-flex w-full justify-center rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white hover:bg-cyan-700"
        >
          Demo hesabına giriş yap
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-white/20 bg-white p-5 text-slate-900 shadow-2xl">
      <p className="text-xs font-bold uppercase text-cyan-600">Demo talep formu</p>
      <div className="mt-4 grid gap-3">
        <input
          required
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          placeholder="Klinik / kurum adı"
          value={form.institutionName}
          onChange={(e) => setForm({ ...form, institutionName: e.target.value })}
        />
        <input
          required
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          placeholder="Yetkili kişi"
          value={form.contactName}
          onChange={(e) => setForm({ ...form, contactName: e.target.value })}
        />
        <input
          required
          type="email"
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          placeholder="E-posta"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          placeholder="Telefon"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <textarea
          className="min-h-20 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          placeholder="Klinik büyüklüğü, şube sayısı veya görmek istediğiniz modüller"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-full rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white hover:bg-cyan-700 disabled:opacity-60"
      >
        {loading ? "Demo hazırlanıyor..." : "Demo erişimi oluştur"}
      </button>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Demo hesabı süreli ve izoledir; gerçek müşteri verileriyle karışmaz.
      </p>
    </form>
  );
}
