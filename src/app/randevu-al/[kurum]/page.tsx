"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Doctor = { id: string; fullName: string };

export default function RandevuAlPage() {
  const params = useParams();
  const kurum = String(params?.kurum || "");

  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [institutionName, setInstitutionName] = useState("");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [notFound, setNotFound] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [tcNo, setTcNo] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!kurum) return;
    fetch(`/api/public/booking/doctors?kurum=${encodeURIComponent(kurum)}`)
      .then(async (r) => {
        if (!r.ok) { setNotFound(true); return; }
        const data = await r.json();
        setInstitutionName(data.institutionName || "");
        setDoctors(Array.isArray(data.doctors) ? data.doctors : []);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingDoctors(false));
  }, [kurum]);

  const submit = async () => {
    setError("");
    if (fullName.trim().length < 3) { setError("Lütfen ad soyad girin."); return; }
    if (!/^0\d{10}$/.test(phone)) { setError("Telefon numarası 0 ile başlamalı ve 11 haneli olmalı."); return; }
    if (!preferredDate) { setError("Lütfen tercih ettiğiniz tarihi seçin."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/public/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kurum,
          fullName: fullName.trim(),
          phone,
          tcNo: tcNo.trim() || undefined,
          doctorId: doctorId || undefined,
          preferredFrom: new Date(preferredDate).toISOString(),
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Talep gönderilemedi, lütfen tekrar deneyin.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Bağlantı hatası, lütfen tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  };

  const minDate = new Date().toISOString().slice(0, 10);

  if (loadingDoctors) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-700">Klinik bulunamadı.</p>
          <p className="mt-1 text-xs text-slate-500">Bağlantıyı kliniğinizden tekrar isteyin.</p>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-sm rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">✓</div>
          <p className="text-base font-bold text-emerald-800">Talebiniz alındı</p>
          <p className="mt-1 text-sm text-emerald-700">{institutionName} en kısa sürede sizinle iletişime geçerek randevunuzu netleştirecektir.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-black text-slate-900">{institutionName || "Randevu Talebi"}</h1>
        <p className="mt-1 text-sm text-slate-500">Aşağıdaki formu doldurun, klinik ekibimiz sizi arayarak randevunuzu kesinleştirsin.</p>

        <div className="mt-5 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Ad Soyad *</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Telefon *</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="05XXXXXXXXX" inputMode="numeric" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">TC Kimlik No (opsiyonel)</label>
            <input value={tcNo} onChange={(e) => setTcNo(e.target.value.replace(/\D/g, "").slice(0, 11))} inputMode="numeric" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          {doctors.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Tercih Ettiğiniz Doktor (opsiyonel)</label>
              <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="">— Fark etmez —</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Tercih Ettiğiniz Tarih *</label>
            <input type="date" min={minDate} value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Not (opsiyonel)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Şikayetiniz veya tercih ettiğiniz saat aralığı…" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}

          <button onClick={submit} disabled={submitting} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
            {submitting ? "Gönderiliyor…" : "Randevu Talebi Gönder"}
          </button>
          <p className="text-center text-[11px] text-slate-400">Bu bir kesin randevu değildir; talebiniz klinik tarafından onaylandığında randevunuz oluşturulur.</p>
        </div>
      </div>
    </main>
  );
}
