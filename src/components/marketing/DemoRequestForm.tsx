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

const CLINIC_TYPE_LABELS: Record<string, string> = {
  "tek-sube": "Tek şube",
  "coklu-sube": "Çoklu şube",
  ozel: "Özel / Hastane",
};

export function DemoRequestForm() {
  const [form, setForm] = useState({
    contactName: "",
    institutionName: "",
    phone: "",
    email: "",
    city: "",
    clinicType: "",
    userCount: "",
    note: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState<DemoResponse["demo"] | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setDemo(null);
    setLoading(true);

    // API sözleşmesi yalnızca institutionName/contactName/email/phone/notes
    // kabul ediyor (bkz. src/app/api/demo-requests/route.ts) — ek alanları
    // (şehir, klinik türü, kullanıcı sayısı) API/DB şemasını değiştirmeden,
    // okunaklı etiketlerle "notes" alanına katlıyoruz.
    const noteLines = [
      form.city && `Şehir: ${form.city}`,
      form.clinicType && `Klinik türü: ${CLINIC_TYPE_LABELS[form.clinicType] || form.clinicType}`,
      form.userCount && `Tahmini kullanıcı sayısı: ${form.userCount}`,
      form.note && `Not: ${form.note}`,
    ].filter(Boolean);

    const payload = {
      institutionName: form.institutionName,
      contactName: form.contactName,
      email: form.email,
      phone: form.phone,
      notes: noteLines.join("\n"),
    };

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
          className="mt-4 inline-flex w-full justify-center rounded-xl bg-[#0d7d6f] px-4 py-3 text-sm font-bold text-white hover:bg-[#0a655a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7d6f] focus-visible:ring-offset-2"
        >
          Demo hesabına giriş yap
        </a>
      </div>
    );
  }

  const inputClass =
    "rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0d7d6f] focus:ring-2 focus:ring-[#0d7d6f]/12";

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-lg shadow-slate-200/60">
      <p className="text-xs font-bold uppercase text-[#0d7d6f]">Demo talep formu</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          required
          className={`${inputClass} sm:col-span-2`}
          placeholder="Ad Soyad"
          value={form.contactName}
          onChange={(e) => setForm({ ...form, contactName: e.target.value })}
        />
        <input
          required
          className={`${inputClass} sm:col-span-2`}
          placeholder="Klinik / kurum adı"
          value={form.institutionName}
          onChange={(e) => setForm({ ...form, institutionName: e.target.value })}
        />
        <input
          className={inputClass}
          placeholder="Telefon"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <input
          required
          type="email"
          className={inputClass}
          placeholder="E-posta"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          className={inputClass}
          placeholder="Şehir"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        <select
          className={inputClass}
          value={form.clinicType}
          onChange={(e) => setForm({ ...form, clinicType: e.target.value })}
        >
          <option value="">Klinik türü (seçiniz)</option>
          <option value="tek-sube">Tek şube</option>
          <option value="coklu-sube">Çoklu şube</option>
          <option value="ozel">Özel / Hastane</option>
        </select>
        <select
          className={`${inputClass} sm:col-span-2`}
          value={form.userCount}
          onChange={(e) => setForm({ ...form, userCount: e.target.value })}
        >
          <option value="">Kullanıcı sayısı (seçiniz)</option>
          <option value="1-5">1–5</option>
          <option value="6-15">6–15</option>
          <option value="16-30">16–30</option>
          <option value="30+">30+</option>
        </select>
        <textarea
          className={`${inputClass} sm:col-span-2 min-h-20`}
          placeholder="Not (opsiyonel) — görmek istediğiniz modüller, şube sayısı vb."
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
      </div>
      {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-full rounded-xl bg-[#0d7d6f] px-4 py-3 text-sm font-bold text-white hover:bg-[#0a655a] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7d6f] focus-visible:ring-offset-2"
      >
        {loading ? "Demo hazırlanıyor..." : "Demo erişimi oluştur"}
      </button>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Demo hesabı süreli ve izoledir; gerçek müşteri verileriyle karışmaz. Satış baskısı yoktur, kurulum gerektirmez.
      </p>
    </form>
  );
}
