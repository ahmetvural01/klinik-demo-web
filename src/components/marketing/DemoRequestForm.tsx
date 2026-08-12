"use client";

import { FormEvent, useState, type ReactNode } from "react";
import { Check, Copy, ExternalLink, LoaderCircle } from "lucide-react";

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
  const [copied, setCopied] = useState(false);

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
    const copyCredentials = async () => {
      await navigator.clipboard.writeText(`Kurum: ${demo.institution}\nTC / Personel No: ${demo.identityNo}\nŞifre: ${demo.password}\nGiriş: ${demo.loginUrl}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    };

    return (
      <div className="rounded-lg border border-emerald-200 bg-white p-6 text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,.12)] sm:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Check className="h-6 w-6" /></span>
        <p className="mt-5 text-xs font-black uppercase text-emerald-700">Demo erişimi hazır</p>
        <h2 className="mt-2 text-2xl font-black">Size özel demo kurumu oluşturuldu.</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Aşağıdaki geçici bilgilerle ürünü hemen inceleyebilirsiniz.</p>
        <div className="mt-5 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/70 px-4 text-sm">
          <Credential label="Kurum" value={demo.institution} />
          <Credential label="TC / Personel No" value={demo.identityNo} />
          <Credential label="Şifre" value={demo.password} />
          <Credential label="Geçerlilik" value={new Date(demo.expiresAt).toLocaleDateString("tr-TR")} />
        </div>
        <button type="button" onClick={() => void copyCredentials()} className="mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:bg-slate-100" title="Giriş bilgilerini kopyala">
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          {copied ? "Bilgiler kopyalandı" : "Giriş bilgilerini kopyala"}
        </button>
        <a
          href={demo.loginUrl}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#087f73] px-4 py-3 text-sm font-black text-white transition-colors hover:bg-[#066d63] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087f73] focus-visible:ring-offset-2"
        >
          Demo hesabına giriş yap
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#087f73] focus:ring-2 focus:ring-[#087f73]/12";

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-6 text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,.12)] sm:p-8">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
        <div><p className="text-xs font-black uppercase text-[#087f73]">Demo erişim formu</p><h2 className="mt-2 text-xl font-black">Klinik bilgileri</h2></div>
        <span className="text-[11px] font-bold text-slate-400"><span className="text-rose-500">*</span> Zorunlu alan</span>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Ad Soyad" required className="sm:col-span-2"><input required name="name" autoComplete="name" className={inputClass} placeholder="Örn. Deniz Yılmaz" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></Field>
        <Field label="Klinik / Kurum Adı" required className="sm:col-span-2"><input required name="organization" autoComplete="organization" className={inputClass} placeholder="Örn. Modern Ağız ve Diş Sağlığı" value={form.institutionName} onChange={(e) => setForm({ ...form, institutionName: e.target.value })} /></Field>
        <Field label="Telefon"><input name="tel" type="tel" inputMode="tel" autoComplete="tel" className={inputClass} placeholder="05xx xxx xx xx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="E-posta" required><input required name="email" type="email" autoComplete="email" className={inputClass} placeholder="ornek@klinik.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Şehir"><input name="city" autoComplete="address-level2" className={inputClass} placeholder="Örn. İstanbul" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
        <Field label="Klinik Yapısı"><select name="clinicType" className={inputClass} value={form.clinicType} onChange={(e) => setForm({ ...form, clinicType: e.target.value })}><option value="">Seçiniz</option><option value="tek-sube">Tek şube</option><option value="coklu-sube">Çoklu şube</option><option value="ozel">Özel / Hastane</option></select></Field>
        <Field label="Tahmini Kullanıcı Sayısı" className="sm:col-span-2"><select name="userCount" className={inputClass} value={form.userCount} onChange={(e) => setForm({ ...form, userCount: e.target.value })}><option value="">Seçiniz</option><option value="1-5">1–5</option><option value="6-15">6–15</option><option value="16-30">16–30</option><option value="30+">30+</option></select></Field>
        <Field label="İncelemek İstediğiniz Konular" className="sm:col-span-2"><textarea name="note" className={`${inputClass} min-h-24 resize-y`} placeholder="Örn. randevu, hasta takibi ve muhasebe akışı" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      </div>
      {error && <p role="alert" aria-live="polite" className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#087f73] px-4 py-3 text-sm font-black text-white transition-colors hover:bg-[#066d63] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087f73] focus-visible:ring-offset-2"
      >
        {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
        {loading ? "Demo hazırlanıyor..." : "Demo erişimi oluştur"}
      </button>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Demo süreli ve ayrı bir kurum olarak oluşturulur; gerçek klinik kayıtlarıyla karışmaz.
      </p>
    </form>
  );
}

function Field({ label, required, className = "", children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-black text-slate-700">{label}{required && <span className="ml-1 text-rose-500">*</span>}</span>{children}</label>;
}

function Credential({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs font-bold text-slate-500">{label}</span><strong className="break-all text-sm text-slate-900">{value}</strong></div>;
}
