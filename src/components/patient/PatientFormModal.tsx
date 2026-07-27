"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, Info, ShieldAlert, UserRound, WalletCards } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, FormSection, FormErrorBanner, inputErrorClass } from "@/components/ui/FormField";
import { PhoneCountrySelect } from "@/components/ui/PhoneCountrySelect";

type PatientFormState = {
  tcNo: string;
  isForeigner: boolean;
  phoneCountryCode: string;
  fullName: string;
  phone: string;
  profession: string;
  gender: string;
  birthDate: string;
  insurance: string;
  referrer: string;
  discountRate: number;
  address: string;
  notes: string;
  surgeries: string;
  medications: string;
  bloodType: string;
  otherDiseases: string;
  hasAllergy: boolean;
  hasHepatitis: boolean;
  hasKidney: boolean;
  hasDiabetes: boolean;
  hasHeart: boolean;
  hasBloodIssue: boolean;
  hasContagiousDisease: boolean;
  contagiousDiseaseNote: string;
};

type DuplicatePatient = {
  id: string;
  fullName: string;
  tcNo?: string | null;
  phone?: string | null;
};

type HealthFlagKey =
  | "hasAllergy" | "hasHepatitis" | "hasKidney" | "hasDiabetes"
  | "hasHeart" | "hasBloodIssue" | "hasContagiousDisease";

const INITIAL_FORM: PatientFormState = {
  tcNo: "", isForeigner: false, phoneCountryCode: "+90", fullName: "", phone: "",
  profession: "", gender: "", birthDate: "", insurance: "", referrer: "", discountRate: 0,
  address: "", notes: "", surgeries: "", medications: "", bloodType: "", otherDiseases: "",
  hasAllergy: false, hasHepatitis: false, hasKidney: false, hasDiabetes: false,
  hasHeart: false, hasBloodIssue: false, hasContagiousDisease: false, contagiousDiseaseNote: "",
};

const HEALTH_FLAGS: Array<[HealthFlagKey, string, string]> = [
  ["hasAllergy", "Alerji", "İlaç, lateks, anestezi veya gıda alerjisi"],
  ["hasHeart", "Kalp Hastalığı", "Kalp ritmi, kapak, tansiyon veya operasyon öyküsü"],
  ["hasDiabetes", "Diyabet", "Kan şekeri takibi ve yara iyileşmesi açısından önemli"],
  ["hasKidney", "Böbrek Hastalığı", "İlaç ve anestezi planlaması için kritik"],
  ["hasHepatitis", "Hepatit", "Enfeksiyon kontrol süreçleri için işaretlenir"],
  ["hasBloodIssue", "Kan Sorunu", "Kanama, pıhtılaşma veya kan hastalığı öyküsü"],
  ["hasContagiousDisease", "Bulaşıcı Hastalık", "HIV, tüberküloz, COVID-19 gibi enfeksiyon kontrolü gerektiren durumlar"],
];

function toDateInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

type PatientFormModalProps = {
  open: boolean;
  onClose: () => void;
  patientId?: string;
  /** DOKTOR/ASISTAN rolünde telefon alanı hiç gösterilmez/değiştirilemez (bkz. hasta kartı davranışı). */
  hidePhoneField?: boolean;
  onSaved?: (patient: { id: string; fullName: string }) => void;
};

export function PatientFormModal({ open, onClose, patientId, hidePhoneField = false, onSaved }: PatientFormModalProps) {
  const isEdit = Boolean(patientId);
  const [form, setForm] = useState<PatientFormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<DuplicatePatient[]>([]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldErrors({});
    setDuplicates([]);
    if (!patientId) {
      setForm(INITIAL_FORM);
      return;
    }
    setLoading(true);
    fetch(`/api/patients/${patientId}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || "Hasta bilgileri alınamadı");
        setForm({
          tcNo: body.tcNo || "", isForeigner: body.isForeigner || false,
          phoneCountryCode: body.phoneCountryCode || "+90", fullName: body.fullName || "",
          phone: body.phone === "***" ? "" : body.phone || "", profession: body.profession || "",
          gender: body.gender || "", birthDate: toDateInput(body.birthDate),
          insurance: body.insurance || "", referrer: body.referrer || "", discountRate: body.discountRate || 0,
          address: body.address || "", notes: body.notes || "", surgeries: body.surgeries || "",
          medications: body.medications || "", bloodType: body.bloodType || "", otherDiseases: body.otherDiseases || "",
          hasAllergy: body.hasAllergy || false, hasHepatitis: body.hasHepatitis || false,
          hasKidney: body.hasKidney || false, hasDiabetes: body.hasDiabetes || false,
          hasHeart: body.hasHeart || false, hasBloodIssue: body.hasBloodIssue || false,
          hasContagiousDisease: body.hasContagiousDisease || false, contagiousDiseaseNote: body.contagiousDiseaseNote || "",
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Hasta bilgileri alınamadı"))
      .finally(() => setLoading(false));
  }, [open, patientId]);

  // Olası mükerrer kayıt uyarısı — sadece yeni kayıtta anlamlı.
  useEffect(() => {
    if (isEdit || !open) { setDuplicates([]); return; }
    const searchValue = form.tcNo.length >= 5 ? form.tcNo : form.phone.length >= 7 ? form.phone : form.fullName.trim().length >= 3 ? form.fullName.trim() : "";
    if (!searchValue) { setDuplicates([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients?q=${encodeURIComponent(searchValue)}&take=5&summary=false`, { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        setDuplicates(Array.isArray(body?.patients) ? body.patients : []);
      } catch { setDuplicates([]); }
    }, 350);
    return () => clearTimeout(timer);
  }, [isEdit, open, form.fullName, form.phone, form.tcNo]);

  const medicalRiskCount = useMemo(
    () => HEALTH_FLAGS.filter(([field]) => Boolean(form[field])).length +
      [form.surgeries, form.medications, form.otherDiseases].filter((v) => String(v || "").trim()).length,
    [form],
  );

  function setField<K extends keyof PatientFormState>(field: K, value: PatientFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field as string]) return current;
      const next = { ...current };
      delete next[field as string];
      return next;
    });
  }

  function validate() {
    const errors: Record<string, string> = {};
    if (!form.fullName.trim()) errors.fullName = "Ad soyad zorunludur.";
    if (!hidePhoneField) {
      if (!form.isForeigner) {
        if (!/^\d{11}$/.test(form.tcNo)) errors.tcNo = "TC Kimlik No 11 haneli rakamdan oluşmalıdır.";
        if (!/^\d{4,15}$/.test(form.phone)) errors.phone = "Telefon 4-15 haneli rakamdan oluşmalıdır.";
        if (form.phoneCountryCode === "+90" && !/^5\d{9}$/.test(form.phone)) errors.phone = "Türkiye cep telefonu 5 ile başlayan 10 haneli numara olmalıdır.";
      } else if (!/^\d{4,15}$/.test(form.phone)) {
        errors.phone = "Telefon 4-15 haneli rakamdan oluşmalıdır.";
      }
    } else if (!form.isForeigner && !/^\d{11}$/.test(form.tcNo)) {
      errors.tcNo = "TC Kimlik No 11 haneli rakamdan oluşmalıdır.";
    }
    if (!form.gender) errors.gender = "Cinsiyet seçimi zorunludur.";
    if (form.birthDate && Number.isNaN(new Date(form.birthDate).getTime())) errors.birthDate = "Geçerli bir doğum tarihi girin.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const save = async () => {
    if (!validate()) { setError("Lütfen zorunlu alanları kontrol edin."); return; }
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {
      ...form,
      fullName: form.fullName.trim(),
      profession: form.profession.trim() || undefined,
      insurance: form.insurance.trim() || undefined,
      referrer: form.referrer.trim() || undefined,
      address: form.address.trim() || undefined,
      notes: form.notes.trim() || undefined,
      surgeries: form.surgeries.trim() || undefined,
      medications: form.medications.trim() || undefined,
      otherDiseases: form.otherDiseases.trim() || undefined,
      contagiousDiseaseNote: form.contagiousDiseaseNote.trim() || undefined,
      bloodType: form.bloodType || undefined,
      birthDate: form.birthDate ? new Date(`${form.birthDate}T00:00:00.000Z`).toISOString() : undefined,
    };
    if (hidePhoneField) { delete body.phone; delete body.phoneCountryCode; }

    try {
      const res = await fetch(isEdit ? `/api/patients/${patientId}` : "/api/patients", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = Array.isArray(result?.errors) ? ` ${result.errors.join(" ")}` : "";
        throw new Error((result?.message || "Kayıt başarısız") + details);
      }
      onSaved?.(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title={isEdit ? "Hasta Bilgilerini Düzenle" : "Yeni Hasta Kaydı"}
      description="Kimlik, iletişim, medikal anamnez ve finansal notları tek standart formda yönetin."
      size="xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button>
          <Button variant="primary" loading={saving} onClick={save}>{isEdit ? "Güncelle" : "Kaydet ve Kartı Aç"}</Button>
        </>
      )}
    >
      {loading ? (
        <div className="flex h-56 items-center justify-center text-sm font-semibold text-slate-500">Hasta bilgileri yükleniyor…</div>
      ) : (
        <div className="space-y-4">
          {!isEdit && duplicates.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-black">Benzer hasta kaydı bulundu</p>
                  <p className="mt-1 text-amber-800">Yeni kayıt açmadan önce aynı hastanın daha önce eklenip eklenmediğini kontrol edin.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {duplicates.map((p) => (
                      <span key={p.id} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-900">
                        {p.fullName} {p.tcNo ? `· ${p.tcNo}` : ""} {p.phone ? `· ${p.phone}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          <FormErrorBanner message={error} />

          <FormSection icon={UserRound} title="Kimlik Bilgileri" description="Hasta dosyasının temel ve zorunlu alanları.">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center md:col-span-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.isForeigner} onChange={(e) => setField("isForeigner", e.target.checked)} />
                  Yabancı uyruklu (TC vatandaşı değil)
                </label>
              </div>
              <FormField label={form.isForeigner ? "Pasaport / Kimlik No" : "TC Kimlik No"} required={!form.isForeigner} error={fieldErrors.tcNo}>
                <input
                  className={`h-10 w-full rounded-lg border px-3 text-sm font-mono outline-none transition focus:ring-2 ${inputErrorClass(Boolean(fieldErrors.tcNo))}`}
                  placeholder={form.isForeigner ? "Opsiyonel" : "11 haneli TC No"}
                  inputMode={form.isForeigner ? "text" : "numeric"}
                  maxLength={form.isForeigner ? undefined : 11}
                  value={form.tcNo}
                  onChange={(e) => setField("tcNo", form.isForeigner ? e.target.value.trim() : e.target.value.replace(/\D/g, "").slice(0, 11))}
                />
              </FormField>
              <FormField label="Ad Soyad" required error={fieldErrors.fullName}>
                <input className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 ${inputErrorClass(Boolean(fieldErrors.fullName))}`} placeholder="Ad Soyad" value={form.fullName} onChange={(e) => setField("fullName", e.target.value)} />
              </FormField>
              <FormField label="Cinsiyet" required error={fieldErrors.gender}>
                <select className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 ${inputErrorClass(Boolean(fieldErrors.gender))}`} value={form.gender} onChange={(e) => setField("gender", e.target.value)}>
                  <option value="">Seçiniz</option>
                  <option value="ERKEK">Erkek</option>
                  <option value="KADIN">Kadın</option>
                </select>
              </FormField>
              <FormField label="Doğum Tarihi" error={fieldErrors.birthDate}>
                <input type="date" className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 ${inputErrorClass(Boolean(fieldErrors.birthDate))}`} value={form.birthDate} onChange={(e) => setField("birthDate", e.target.value)} />
              </FormField>
            </div>
          </FormSection>

          <FormSection icon={WalletCards} title="İletişim ve Kurum Bilgileri" description="Banko, randevu ve finans süreçlerinde kullanılan alanlar.">
            <div className="grid gap-4 md:grid-cols-2">
              {!hidePhoneField && (
                <FormField label="Telefon" required error={fieldErrors.phone}>
                  <div className={`flex overflow-visible rounded-lg border bg-white transition focus-within:ring-2 ${inputErrorClass(Boolean(fieldErrors.phone))}`}>
                    <PhoneCountrySelect value={form.phoneCountryCode} onChange={(value) => setField("phoneCountryCode", value)} className="w-[132px] shrink-0" />
                    <input className="h-10 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm font-mono outline-none" placeholder="Telefon numarası" inputMode="numeric" value={form.phone} onChange={(e) => setField("phone", e.target.value.replace(/\D/g, "").slice(0, 15))} />
                  </div>
                </FormField>
              )}
              <FormField label="Anlaşmalı Kurum">
                <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Kurum adı" value={form.insurance} onChange={(e) => setField("insurance", e.target.value)} />
              </FormField>
              <FormField label="Referans Eden Kişi">
                <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Örn. Mehmet Yılmaz" value={form.referrer} onChange={(e) => setField("referrer", e.target.value)} />
              </FormField>
              <FormField label="Meslek">
                <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Örn. Öğretmen, mühendis" value={form.profession} onChange={(e) => setField("profession", e.target.value)} />
              </FormField>
              <FormField label="İndirim Oranı (%)">
                <input type="number" min={0} max={100} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" value={form.discountRate} onChange={(e) => setField("discountRate", Math.min(100, Math.max(0, Number(e.target.value || 0))))} />
              </FormField>
              <FormField label="Adres">
                <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Adres" value={form.address} onChange={(e) => setField("address", e.target.value)} />
              </FormField>
            </div>
          </FormSection>

          <FormSection icon={ShieldAlert} title="Medikal Anamnez" description="Tedavi ve reçete öncesi görülecek klinik risk bilgileri.">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Kan Grubu">
                <select className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" value={form.bloodType} onChange={(e) => setField("bloodType", e.target.value)}>
                  <option value="">Bilinmiyor</option>
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "0+", "0-"].map((bt) => <option key={bt} value={bt}>{bt}</option>)}
                </select>
              </FormField>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="flex gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>İşaretlenen riskler hasta kartında uyarı olarak gösterilir.</p>
                </div>
              </div>
              <div className="md:col-span-2">
                <p className="mb-2 text-sm font-bold text-slate-700">Sağlık Durumu</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {HEALTH_FLAGS.map(([field, label, description]) => (
                    <label key={field} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition ${form[field] ? "border-red-200 bg-red-50" : "border-slate-200 hover:bg-slate-50"}`}>
                      <input type="checkbox" className="mt-1 accent-primary" checked={Boolean(form[field])} onChange={(e) => setField(field, e.target.checked)} />
                      <span>
                        <span className="block text-sm font-bold text-slate-800">{label}</span>
                        <span className="block text-xs text-slate-500">{description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {form.hasContagiousDisease && (
                <FormField label="Bulaşıcı Hastalık Detayı">
                  <textarea rows={2} className="w-full rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-sm outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-200" placeholder="Hangi bulaşıcı hastalık? (ör. Hepatit B, Tüberküloz)" value={form.contagiousDiseaseNote} onChange={(e) => setField("contagiousDiseaseNote", e.target.value)} />
                </FormField>
              )}
              <FormField label="Geçirdiği Ameliyatlar">
                <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Varsa operasyon öyküsü" value={form.surgeries} onChange={(e) => setField("surgeries", e.target.value)} />
              </FormField>
              <FormField label="Kullandığı İlaçlar">
                <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Düzenli ilaçlar" value={form.medications} onChange={(e) => setField("medications", e.target.value)} />
              </FormField>
              <FormField label="Diğer Hastalıklar / Klinik Not">
                <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Ek hastalık veya tedavi öncesi bilinmesi gerekenler" value={form.otherDiseases} onChange={(e) => setField("otherDiseases", e.target.value)} />
              </FormField>
            </div>
          </FormSection>

          <FormSection icon={FileText} title="Hasta Notu" description="Banko ve klinik ekip tarafından görülecek genel notlar.">
            <textarea rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Hasta notu" value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
          </FormSection>

          {medicalRiskCount > 0 && (
            <p className="text-xs font-bold text-red-700">{medicalRiskCount} medikal uyarı işaretli</p>
          )}
        </div>
      )}
    </Modal>
  );
}
