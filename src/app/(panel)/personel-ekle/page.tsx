"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { confirmDialog } from "@/lib/confirm-client";
import { downscaleImageToDataUrl } from "@/lib/image-upload";

const isEffectiveDoctorRole = (role: string, showAsDoctor: boolean) => role === "DOKTOR" || (role === "YONETICI" && showAsDoctor);

function PersonelEkleContent() {
  const router = useRouter();
  const search = useSearchParams();
  const editId = search.get("id");
  const isEdit = !!editId;

  const [form, setForm] = useState({
    identityNo: "",
    fullName: "",
    role: "ASISTAN",
    password: "",
    showAsDoctor: false,
    isActive: true,
    workStart: "08:30",
    workEnd: "18:00",
    photoUrl: "",
    kkYuzde: "3",
    genelYuzde: "15",
    maasYuzde: "40",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editId) return;
    setLoadingEdit(true);
    fetch("/api/staff/" + editId)
      .then(r => r.json())
      .then(d => {
        setForm({
          identityNo: d.identityNo || "",
          fullName: d.fullName || "",
          role: d.role || "ASISTAN",
          password: "",
          showAsDoctor: !d.profile?.hideAsDoctor,
          isActive: d.isActive !== false,
          workStart: d.profile?.workStart || "08:30",
          workEnd: d.profile?.workEnd || "18:00",
          photoUrl: d.profile?.photoUrl || "",
          kkYuzde: String(d.kkYuzde ?? 3),
          genelYuzde: String(d.genelYuzde ?? 15),
          maasYuzde: String(d.maasYuzde ?? 40),
        });
        setLoadingEdit(false);
      })
      .catch(() => setLoadingEdit(false));
  }, [editId]);

  const showDoctorRates = isEffectiveDoctorRole(form.role, form.showAsDoctor);

  const save = async () => {
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {
      identityNo: form.identityNo,
      fullName: form.fullName,
      role: form.role,
      hideAsDoctor: !form.showAsDoctor,
      workStart: form.workStart,
      workEnd: form.workEnd,
      photoUrl: form.photoUrl.trim() || null,
    };
    if (form.password) body.password = form.password;
    if (isEdit) {
      body.isActive = form.isActive;
      if (showDoctorRates) {
        body.kkYuzde = parseFloat(form.kkYuzde) || 0;
        body.genelYuzde = parseFloat(form.genelYuzde) || 0;
        body.maasYuzde = parseFloat(form.maasYuzde) || 0;
      }
    }

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

  if (loadingEdit) return <div className="space-y-3 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
    <div className="h-5 w-36 animate-pulse rounded bg-slate-100" />
    <div className="h-10 animate-pulse rounded-lg bg-slate-50" />
    <div className="h-10 animate-pulse rounded-lg bg-slate-50" />
  </div>;

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
  const labelCls = "mb-1 block text-sm font-medium text-gray-700";

  const togglePasif = async () => {
    if (form.isActive) {
      const ok = await confirmDialog({
        message: `${form.fullName || "Bu personel"} pasif yapılsın mı? Pasif personel randevu ve işlem ekranlarında seçilemez.`,
        danger: true,
        confirmText: "Pasif Yap",
      });
      if (!ok) return;
    }
    setForm(f => ({ ...f, isActive: !f.isActive }));
  };

  return (
    <section className="space-y-5">
      <Link href="/personel" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-primary">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        Personellere Dön
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{isEdit ? "Personel Düzenle" : "Yeni Personel Ekle"}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{isEdit ? "Personel bilgilerini, mesai saatlerini ve durumunu buradan yönetin" : "Yeni personel bilgilerini girin"}</p>
        </div>
        {isEdit && (
          <button
            type="button"
            onClick={togglePasif}
            className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${form.isActive ? "border-red-100 bg-red-50 text-red-600 hover:bg-red-100" : "border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}
          >
            {form.isActive ? "Pasif Yap" : "Aktif Yap"}
          </button>
        )}
      </div>

      {isEdit && !form.isActive && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Bu personel şu anda pasif. Kaydettiğinizde pasif durumu korunur; yeniden aktif etmek için yukarıdaki &quot;Aktif Yap&quot; butonunu kullanın.
        </div>
      )}

      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Kimlik Bilgileri</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>Kimlik No (TC) *</label>
            <input
              className={`${inputCls} font-mono ${form.identityNo && !/^\d{11}$/.test(form.identityNo) ? "border-red-300 bg-red-50 text-red-900" : ""}`}
              placeholder="11 haneli TC No"
              inputMode="numeric"
              maxLength={11}
              value={form.identityNo}
              onChange={(e) => setForm((p) => ({ ...p, identityNo: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
            />
            {form.identityNo && !/^\d{11}$/.test(form.identityNo) && (
              <p className="mt-1 text-xs text-amber-600">TC Kimlik No 11 haneli olmalıdır.</p>
            )}
          </div>
          <div>
            <label className={labelCls}>Ad Soyad *</label>
            <input className={inputCls} placeholder="Ad Soyad" value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Unvan</label>
            <select className={inputCls} value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
              <option value="YONETICI">Yönetici</option>
              <option value="DOKTOR">Diş Hekimi</option>
              <option value="ASISTAN">Asistan</option>
              <option value="BANKO">Banko Personeli</option>
              <option value="MUHASEBE">Muhasebe</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{isEdit ? "Yeni Şifre (boş bırakılabilir)" : "Şifre *"}</label>
            <input className={inputCls} placeholder={isEdit ? "Değiştirmek için yazın" : "Şifre belirleyin"} type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
          </div>
          {form.role === "YONETICI" && (
            <div className="flex items-center md:col-span-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.showAsDoctor}
                  onChange={(e) => setForm((p) => ({ ...p, showAsDoctor: e.target.checked }))} />
                Bu yönetici hasta tedavi ediyor, randevu ekranındaki doktor listesinde de görünsün
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">{showDoctorRates ? "Mesai ve Profil" : "Profil Fotoğrafı"}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {showDoctorRates && (
            <>
              <div>
                <label className={labelCls}>Mesai Başlangıç</label>
                <input type="time" className={inputCls} value={form.workStart} onChange={(e) => setForm((p) => ({ ...p, workStart: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Mesai Bitiş</label>
                <input type="time" className={inputCls} value={form.workEnd} onChange={(e) => setForm((p) => ({ ...p, workEnd: e.target.value }))} />
              </div>
            </>
          )}
          <div className="md:col-span-2">
            <label className={labelCls}>Profil Fotoğrafı</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setPhotoError(null);
                if (file.size > 8 * 1024 * 1024) { setPhotoError("Dosya en fazla 8MB olabilir."); return; }
                try {
                  const dataUrl = await downscaleImageToDataUrl(file);
                  setForm((p) => ({ ...p, photoUrl: dataUrl }));
                } catch {
                  setPhotoError("Fotoğraf işlenemedi. Lütfen JPG, PNG veya WEBP deneyin.");
                }
              }}
            />
            <div className="flex items-center gap-3">
              {form.photoUrl.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.photoUrl.trim()} alt="Önizleme" className="h-14 w-14 rounded-full border border-slate-100 object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-slate-200 text-[10px] text-slate-400">Yok</div>
              )}
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                Fotoğraf Seç
              </button>
              {form.photoUrl.trim() && (
                <button type="button" onClick={() => setForm((p) => ({ ...p, photoUrl: "" }))} className="rounded-lg border border-red-100 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50">
                  Kaldır
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">Boş bırakırsanız isim baş harflerinden oluşan bir avatar kullanılır.</p>
            {photoError && <p className="mt-1 text-xs text-red-600">{photoError}</p>}
          </div>
        </div>
      </div>

      {isEdit && showDoctorRates && (
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Doktor Ödeme Oranları</h2>
          <p className="mb-4 text-xs text-slate-500">Bu oranlar doktor raporlarında ve hakediş hesabında kullanılır. Emin değilseniz varsayılan değerleri koruyun.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "KK Masraf %", key: "kkYuzde" as const, help: "Kredi kartı gelirinden düşülecek % (banka komisyonu)" },
              { label: "Genel Masraf %", key: "genelYuzde" as const, help: "Toplam cirodan düşülecek genel gider payı %" },
              { label: "Maaş %", key: "maasYuzde" as const, help: "Brütten doktora ödenecek %" },
            ].map(f => (
              <div key={f.key}>
                <label className={labelCls}>{f.label}</label>
                <input type="number" min={0} max={100} step={0.1}
                  className={inputCls}
                  value={form[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
                <p className="mt-1 text-xs text-slate-400">{f.help}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="flex gap-3">
        <button disabled={saving} onClick={save} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60">
          {saving ? "Kaydediliyor..." : (isEdit ? "Güncelle" : "Personel Kaydet")}
        </button>
        <button onClick={() => router.push("/personel")} className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm text-gray-600 transition hover:bg-gray-50">
          İptal
        </button>
      </div>
    </section>
  );
}

export default function PersonelEklePage() {
  return (
    <Suspense fallback={<div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <PersonelEkleContent />
    </Suspense>
  );
}
