"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function PersonelEkleContent() {
  const router = useRouter();
  const search = useSearchParams();
  const editId = search.get("id");
  const isEdit = !!editId;

  const [form, setForm] = useState({
    institution: "whitedental",
    identityNo: "",
    fullName: "",
    role: "ASISTAN",
    password: ""
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);

  useEffect(() => {
    if (!editId) return;
    setLoadingEdit(true);
    fetch("/api/staff/" + editId)
      .then(r => r.json())
      .then(d => {
        setForm({
          institution: d.institution || "whitedental",
          identityNo: d.identityNo || "",
          fullName: d.fullName || "",
          role: d.role || "ASISTAN",
          password: ""
        });
        setLoadingEdit(false);
      })
      .catch(() => setLoadingEdit(false));
  }, [editId]);

  const save = async () => {
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {
      institution: form.institution,
      identityNo: form.identityNo,
      fullName: form.fullName,
      role: form.role
    };
    if (form.password) body.password = form.password;

    const res = await fetch(isEdit ? "/api/staff/" + editId : "/api/staff", {
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

    router.push("/personel");
  };

  if (loadingEdit) return <p className="py-4 text-gray-500">Yükleniyor...</p>;

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">{isEdit ? "Personel Düzenle" : "Yeni Personel Ekle"}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{isEdit ? "Personel bilgilerini güncelleyin" : "Yeni personel bilgilerini girin"}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Kurum</label>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Kurum kodu" value={form.institution} onChange={(e) => setForm((p) => ({ ...p, institution: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Kimlik No (TC)</label>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="11 haneli TC No" maxLength={11} value={form.identityNo} onChange={(e) => setForm((p) => ({ ...p, identityNo: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Ad Soyad *</label>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Ad Soyad" value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Unvan</label>
          <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
            <option value="YONETICI">Yönetici</option>
            <option value="DOKTOR">Diş Hekimi</option>
            <option value="ASISTAN">Asistan</option>
            <option value="BANKO">Banko Personeli</option>
            <option value="MUHASEBE">Muhasebe</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{isEdit ? "Yeni Şifre (boş bırakılabilir)" : "Şifre *"}</label>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder={isEdit ? "Değiştirmek için yazın" : "Şifre belirleyin"} type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
        </div>
      </div>
      {error && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="mt-6 flex gap-3">
        <button disabled={saving} onClick={save} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60 hover:bg-primary/90 transition">
          {saving ? "Kaydediliyor..." : (isEdit ? "Güncelle" : "Personel Kaydet")}
        </button>
        <button onClick={() => router.push("/personel")} className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition">
          İptal
        </button>
      </div>
    </section>
  );
}

export default function PersonelEklePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-40"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <PersonelEkleContent />
    </Suspense>
  );
}
