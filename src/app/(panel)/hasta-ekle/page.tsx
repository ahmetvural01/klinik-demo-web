"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PhoneInput from "@/components/PhoneInput";

function HastaEkleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const isEdit = !!editId;

  const [form, setForm] = useState({
    tcNo: "", fullName: "", phone: "", gender: "",
    birthDate: "", insurance: "", referrer: "", discountRate: 0, address: "", notes: "",
    surgeries: "", medications: "", bloodType: "", otherDiseases: "",
    hasAllergy: false, hasHepatitis: false, hasKidney: false,
    hasDiabetes: false, hasHeart: false, hasBloodIssue: false
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);

  useEffect(() => {
    if (!editId) return;
    setLoadingEdit(true);
    fetch("/api/patients/" + editId)
      .then(r => r.json())
      .then(d => {
        setForm({
          tcNo: d.tcNo || "",
          fullName: d.fullName || "",
          phone: d.phone || "",
          gender: d.gender || "",
          birthDate: d.birthDate ? new Date(d.birthDate).toISOString().slice(0,10) : "",
          insurance: d.insurance || "",
          referrer: d.referrer || "",
          discountRate: d.discountRate || 0,
          address: d.address || "",
          notes: d.notes || "",
          surgeries: d.surgeries || "",
          medications: d.medications || "",
          bloodType: d.bloodType || "",
          otherDiseases: d.otherDiseases || "",
          hasAllergy: d.hasAllergy || false,
          hasHepatitis: d.hasHepatitis || false,
          hasKidney: d.hasKidney || false,
          hasDiabetes: d.hasDiabetes || false,
          hasHeart: d.hasHeart || false,
          hasBloodIssue: d.hasBloodIssue || false,
        });
      })
      .catch(() => setError("Hasta bilgileri alınamadı"))
      .finally(() => setLoadingEdit(false));
  }, [editId]);

  const onSave = async () => {
    if (!form.fullName.trim()) return setError("Ad Soyad zorunludur");
    if (!/^[1-9]\d{10}$/.test(form.tcNo)) return setError("TC Kimlik No 11 haneli olmalı ve rakamla başlamalıdır (0 hariç)");
    if (!/^0\d{10}$/.test(form.phone)) return setError("Telefon 11 haneli olmalı ve 0 ile başlamalıdır");
    if (!form.gender) return setError("Cinsiyet seçimi zorunludur");
    setSaving(true);
    setError(null);

    const body = {
      ...form,
      birthDate: form.birthDate ? new Date(`${form.birthDate}T00:00:00.000Z`).toISOString() : undefined
    };

    const res = await fetch(isEdit ? `/api/patients/${editId}` : "/api/patients", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    setSaving(false);

    if (!res.ok) {
      const b = await res.json().catch(() => ({ message: "Kayıt başarısız" }));
      setError(b.message || "Kayıt başarısız");
      return;
    }

    router.push("/hasta");
  };

  if (loadingEdit) return <div className="flex items-center justify-center h-40"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">{isEdit ? "Hasta Düzenle" : "Yeni Hasta Kayıt"}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{isEdit ? "Hasta bilgilerini güncelleyin" : "Yeni hasta bilgilerini girin"}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">TC Kimlik No *</label>
          <input
            className={`w-full rounded-lg border px-3 py-2 text-sm font-mono ${form.tcNo && !/^[1-9]\d{10}$/.test(form.tcNo) ? "border-red-300 bg-red-50 text-red-900" : "border-gray-300"}`}
            placeholder="11 haneli TC No"
            inputMode="numeric"
            maxLength={11}
            value={form.tcNo}
            onChange={(e) => setForm((p) => ({ ...p, tcNo: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
          />
          {form.tcNo && !/^[1-9]\d{10}$/.test(form.tcNo) && (
            <p className="mt-1 text-xs text-amber-600">TC Kimlik No 11 haneli olmalı ve rakamla başlamalıdır (0 hariç).</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Ad Soyad *</label>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Ad Soyad" value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Telefon *</label>
          <PhoneInput value={form.phone} onChange={(phone) => setForm((p) => ({ ...p, phone }))} label={""} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Cinsiyet *</label>
          <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}>
            <option value="">Seçiniz</option>
            <option value="ERKEK">Erkek</option>
            <option value="KADIN">Kadın</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Doğum Tarihi</label>
          <input type="date" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={form.birthDate} onChange={(e) => setForm((p) => ({ ...p, birthDate: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Anlaşmalı Kurum</label>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Kurum adı (varsa)" value={form.insurance} onChange={(e) => setForm((p) => ({ ...p, insurance: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Referans Eden Kişi</label>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Örn: Mehmet" value={form.referrer} onChange={(e) => setForm((p) => ({ ...p, referrer: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">İndirim Oranı (%)</label>
          <input type="number" min={0} max={100} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="0" value={form.discountRate} onChange={(e) => setForm((p) => ({ ...p, discountRate: Math.min(100, Math.max(0, Number(e.target.value || 0))) }))} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Kan Grubu</label>
          <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={form.bloodType} onChange={(e) => setForm((p) => ({ ...p, bloodType: e.target.value }))}>
            <option value="">Bilinmiyor</option>
            {["A+","A-","B+","B-","AB+","AB-","0+","0-"].map(g=><option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">Adres</label>
          <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Adres" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Geçirdiği Ameliyatlar</label>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Geçirdiği ameliyatlar" value={form.surgeries} onChange={(e) => setForm((p) => ({ ...p, surgeries: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Kullandığı İlaçlar</label>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Kullandığı ilaçlar" value={form.medications} onChange={(e) => setForm((p) => ({ ...p, medications: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Diğer Hastalıklar</label>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Diğer hastalıklar" value={form.otherDiseases} onChange={(e) => setForm((p) => ({ ...p, otherDiseases: e.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">Not</label>
          <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Hasta notu" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <p className="mb-2 text-sm font-medium text-gray-700">Sağlık Durumu</p>
          <div className="flex flex-wrap gap-3">
            {([["hasAllergy","Alerji"],["hasHeart","Kalp Hastalığı"],["hasDiabetes","Diyabet"],["hasKidney","Böbrek Hastalığı"],["hasHepatitis","Hepatit"],["hasBloodIssue","Kan Sorunu"]] as [string,string][]).map(([field, label]) => (
              <label key={field} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 transition">
                <input type="checkbox" className="accent-primary" checked={form[field as keyof typeof form] as boolean} onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.checked }))} />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mt-6 flex gap-3">
        <button disabled={saving} onClick={onSave} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60 hover:bg-primary/90 transition">
          {saving ? "Kaydediliyor..." : isEdit ? "Güncelle" : "Hasta Kaydet"}
        </button>
        <button onClick={() => router.push("/hasta")} className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition">
          İptal
        </button>
      </div>
    </section>
  );
}

export default function HastaEklePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-40"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <HastaEkleContent />
    </Suspense>
  );
}
