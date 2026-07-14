"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  FileText,
  Info,
  Loader2,
  Save,
  ShieldAlert,
  UserRound,
  WalletCards,
} from "lucide-react";
import PhoneInput from "@/components/PhoneInput";
import { Button } from "@/components/ui/Button";
import { FormField, FormSection, FormErrorBanner, inputErrorClass } from "@/components/ui/FormField";

type PatientFormState = {
  tcNo: string;
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
  birthDate?: string | null;
};

type HealthFlagKey =
  | "hasAllergy"
  | "hasHepatitis"
  | "hasKidney"
  | "hasDiabetes"
  | "hasHeart"
  | "hasBloodIssue"
  | "hasContagiousDisease";

const INITIAL_FORM: PatientFormState = {
  tcNo: "",
  fullName: "",
  phone: "",
  profession: "",
  gender: "",
  birthDate: "",
  insurance: "",
  referrer: "",
  discountRate: 0,
  address: "",
  notes: "",
  surgeries: "",
  medications: "",
  bloodType: "",
  otherDiseases: "",
  hasAllergy: false,
  hasHepatitis: false,
  hasKidney: false,
  hasDiabetes: false,
  hasHeart: false,
  hasBloodIssue: false,
  hasContagiousDisease: false,
  contagiousDiseaseNote: "",
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

function HastaEkleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const isEdit = Boolean(editId);

  const [form, setForm] = useState<PatientFormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicatePatient[]>([]);
  const [duplicateLoading, setDuplicateLoading] = useState(false);

  const medicalRiskCount = HEALTH_FLAGS.filter(([field]) => Boolean(form[field])).length +
    [form.surgeries, form.medications, form.otherDiseases].filter((value) => String(value || "").trim()).length;

  const completion = useMemo(() => {
    const required = [form.tcNo, form.fullName, form.phone, form.gender];
    const requiredDone = required.filter((value) => String(value || "").trim()).length;
    const recommended = [form.birthDate, form.address, form.bloodType];
    const recommendedDone = recommended.filter((value) => String(value || "").trim()).length;
    return Math.round(((requiredDone + recommendedDone) / (required.length + recommended.length)) * 100);
  }, [form]);

  useEffect(() => {
    if (!editId) return;
    setLoadingEdit(true);
    setError(null);
    fetch(`/api/patients/${editId}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || "Hasta bilgileri alınamadı");
        setForm({
          tcNo: body.tcNo || "",
          fullName: body.fullName || "",
          phone: body.phone === "***" ? "" : body.phone || "",
          profession: body.profession || "",
          gender: body.gender || "",
          birthDate: toDateInput(body.birthDate),
          insurance: body.insurance || "",
          referrer: body.referrer || "",
          discountRate: body.discountRate || 0,
          address: body.address || "",
          notes: body.notes || "",
          surgeries: body.surgeries || "",
          medications: body.medications || "",
          bloodType: body.bloodType || "",
          otherDiseases: body.otherDiseases || "",
          hasAllergy: body.hasAllergy || false,
          hasHepatitis: body.hasHepatitis || false,
          hasKidney: body.hasKidney || false,
          hasDiabetes: body.hasDiabetes || false,
          hasHeart: body.hasHeart || false,
          hasBloodIssue: body.hasBloodIssue || false,
          hasContagiousDisease: body.hasContagiousDisease || false,
          contagiousDiseaseNote: body.contagiousDiseaseNote || "",
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Hasta bilgileri alınamadı"))
      .finally(() => setLoadingEdit(false));
  }, [editId]);

  useEffect(() => {
    const searchValue =
      form.tcNo.length >= 5
        ? form.tcNo
        : form.phone.length >= 7
          ? form.phone
          : form.fullName.trim().length >= 3
            ? form.fullName.trim()
            : "";

    if (!searchValue) {
      setDuplicates([]);
      setDuplicateLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setDuplicateLoading(true);
      try {
        const res = await fetch(`/api/patients?q=${encodeURIComponent(searchValue)}&take=5`, { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        const rows = Array.isArray(body?.patients) ? body.patients : [];
        setDuplicates(rows.filter((row: DuplicatePatient) => row.id !== editId));
      } catch {
        setDuplicates([]);
      } finally {
        setDuplicateLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [editId, form.fullName, form.phone, form.tcNo]);

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
    if (!/^[1-9]\d{10}$/.test(form.tcNo)) errors.tcNo = "TC Kimlik No 11 haneli olmalı ve 0 ile başlamamalıdır.";
    if (!/^0\d{10}$/.test(form.phone)) errors.phone = "Telefon 11 haneli olmalı ve 0 ile başlamalıdır.";
    if (!form.gender) errors.gender = "Cinsiyet seçimi zorunludur.";
    if (form.birthDate && Number.isNaN(new Date(form.birthDate).getTime())) errors.birthDate = "Geçerli bir doğum tarihi girin.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const onSave = async () => {
    if (!validate()) {
      setError("Lütfen zorunlu alanları kontrol edin.");
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});

    const body = {
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

    try {
      const res = await fetch(isEdit ? `/api/patients/${editId}` : "/api/patients", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = Array.isArray(result?.errors) ? ` ${result.errors.join(" ")}` : "";
        throw new Error((result?.message || "Kayıt başarısız") + details);
      }
      router.push(result?.id ? `/hasta-detay?id=${result.id}` : "/hasta");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  };

  if (loadingEdit) {
    return (
      <div className="flex h-56 items-center justify-center">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Hasta bilgileri yükleniyor
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Link href="/hasta" className="mt-0.5 rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Hasta listesine dön">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-lg font-black text-slate-900">{isEdit ? "Hasta Bilgilerini Düzenle" : "Yeni Hasta Kaydı"}</h1>
              <p className="mt-1 text-sm text-slate-500">Kimlik, iletişim, medikal anamnez ve finansal notları tek standart formda yönetin.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Doluluk %{completion}</span>
            {medicalRiskCount > 0 && <span className="rounded-full bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700">{medicalRiskCount} medikal uyarı</span>}
          </div>
        </div>
      </div>

      {duplicates.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-black">Benzer hasta kaydı bulundu</p>
              <p className="mt-1 text-amber-800">Yeni kayıt açmadan önce aynı hastanın daha önce eklenip eklenmediğini kontrol edin.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {duplicates.map((patient) => (
                  <Link key={patient.id} href={`/hasta-detay?id=${patient.id}`} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100">
                    {patient.fullName} {patient.tcNo ? `· ${patient.tcNo}` : ""} {patient.phone ? `· ${patient.phone}` : ""}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {duplicateLoading && <p className="text-xs font-semibold text-slate-400">Benzer hasta kayıtları kontrol ediliyor...</p>}
      <FormErrorBanner message={error} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <FormSection icon={UserRound} title="Kimlik Bilgileri" description="Hasta dosyasının temel ve zorunlu alanları.">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="TC Kimlik No" required error={fieldErrors.tcNo}>
                <input
                  className={`h-10 w-full rounded-lg border px-3 text-sm font-mono outline-none transition focus:ring-2 ${inputErrorClass(Boolean(fieldErrors.tcNo))}`}
                  placeholder="11 haneli TC No"
                  inputMode="numeric"
                  maxLength={11}
                  value={form.tcNo}
                  onChange={(event) => setField("tcNo", event.target.value.replace(/\D/g, "").slice(0, 11))}
                />
              </FormField>
              <FormField label="Ad Soyad" required error={fieldErrors.fullName}>
                <input
                  className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 ${inputErrorClass(Boolean(fieldErrors.fullName))}`}
                  placeholder="Ad Soyad"
                  value={form.fullName}
                  onChange={(event) => setField("fullName", event.target.value)}
                />
              </FormField>
              <FormField label="Cinsiyet" required error={fieldErrors.gender}>
                <select
                  className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 ${inputErrorClass(Boolean(fieldErrors.gender))}`}
                  value={form.gender}
                  onChange={(event) => setField("gender", event.target.value)}
                >
                  <option value="">Seçiniz</option>
                  <option value="ERKEK">Erkek</option>
                  <option value="KADIN">Kadın</option>
                </select>
              </FormField>
              <FormField label="Doğum Tarihi" error={fieldErrors.birthDate}>
                <input
                  type="date"
                  className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2 ${inputErrorClass(Boolean(fieldErrors.birthDate))}`}
                  value={form.birthDate}
                  onChange={(event) => setField("birthDate", event.target.value)}
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection icon={WalletCards} title="İletişim ve Kurum Bilgileri" description="Banko, randevu ve finans süreçlerinde kullanılan alanlar.">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <PhoneInput value={form.phone} onChange={(phone) => setField("phone", phone)} label="Telefon *" />
                {fieldErrors.phone && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.phone}</p>}
              </div>
              <FormField label="Anlaşmalı Kurum">
                <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Kurum adı" value={form.insurance} onChange={(event) => setField("insurance", event.target.value)} />
              </FormField>
              <FormField label="Referans Eden Kişi">
                <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Örn. Mehmet Yılmaz" value={form.referrer} onChange={(event) => setField("referrer", event.target.value)} />
              </FormField>
              <FormField label="Meslek">
                <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Örn. Öğretmen, mühendis" value={form.profession} onChange={(event) => setField("profession", event.target.value)} />
              </FormField>
              <FormField label="İndirim Oranı (%)">
                <input type="number" min={0} max={100} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" value={form.discountRate} onChange={(event) => setField("discountRate", Math.min(100, Math.max(0, Number(event.target.value || 0))))} />
              </FormField>
              <FormField label="Adres" htmlFor="hasta-ekle-address">
                <textarea id="hasta-ekle-address" rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Adres" value={form.address} onChange={(event) => setField("address", event.target.value)} />
              </FormField>
            </div>
          </FormSection>

          <FormSection icon={ShieldAlert} title="Medikal Anamnez" description="Tedavi ve reçete öncesi görülecek klinik risk bilgileri.">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Kan Grubu">
                <select className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" value={form.bloodType} onChange={(event) => setField("bloodType", event.target.value)}>
                  <option value="">Bilinmiyor</option>
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "0+", "0-"].map((bloodType) => <option key={bloodType} value={bloodType}>{bloodType}</option>)}
                </select>
              </FormField>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="flex gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>İşaretlenen riskler hasta kartında uyarı olarak gösterilir. Klinik ekip tedavi öncesi bu alanları kontrol etmelidir.</p>
                </div>
              </div>
              <div className="md:col-span-2">
                <p className="mb-2 text-sm font-bold text-slate-700">Sağlık Durumu</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {HEALTH_FLAGS.map(([field, label, description]) => (
                    <label key={field} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition ${form[field] ? "border-red-200 bg-red-50" : "border-slate-200 hover:bg-slate-50"}`}>
                      <input type="checkbox" className="mt-1 accent-primary" checked={Boolean(form[field])} onChange={(event) => setField(field, event.target.checked)} />
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
                  <textarea rows={2} className="w-full rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-sm outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-200" placeholder="Hangi bulaşıcı hastalık? (ör. Hepatit B, Tüberküloz)" value={form.contagiousDiseaseNote} onChange={(event) => setField("contagiousDiseaseNote", event.target.value)} />
                </FormField>
              )}
              <FormField label="Geçirdiği Ameliyatlar">
                <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Varsa operasyon öyküsü" value={form.surgeries} onChange={(event) => setField("surgeries", event.target.value)} />
              </FormField>
              <FormField label="Kullandığı İlaçlar">
                <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Düzenli ilaçlar" value={form.medications} onChange={(event) => setField("medications", event.target.value)} />
              </FormField>
              <FormField label="Diğer Hastalıklar / Klinik Not">
                <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Ek hastalık veya tedavi öncesi bilinmesi gerekenler" value={form.otherDiseases} onChange={(event) => setField("otherDiseases", event.target.value)} />
              </FormField>
            </div>
          </FormSection>

          <FormSection icon={FileText} title="Hasta Notu" description="Banko ve klinik ekip tarafından görülecek genel notlar.">
            <textarea rows={4} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Hasta notu" value={form.notes} onChange={(event) => setField("notes", event.target.value)} />
          </FormSection>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-24">
            <h2 className="text-sm font-black text-slate-900">Kayıt Özeti</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Hasta</span><span className="text-right font-bold text-slate-800">{form.fullName || "-"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">TC</span><span className="font-mono text-xs text-slate-700">{form.tcNo || "-"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Telefon</span><span className="text-slate-700">{form.phone || "-"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Medikal uyarı</span><span className={medicalRiskCount ? "font-bold text-red-700" : "text-slate-700"}>{medicalRiskCount ? `${medicalRiskCount} kayıt` : "Yok"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">İndirim</span><span className="font-bold text-orange-700">%{form.discountRate}</span></div>
            </div>
            <div className="mt-4 rounded-lg bg-slate-50 p-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span>Form doluluğu</span>
                <span>%{completion}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${completion}%` }} />
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <Button
                variant="primary"
                icon={Save}
                onClick={() => void onSave()}
                loading={saving}
                fullWidth
              >
                {isEdit ? "Güncelle" : "Kaydet ve Kartı Aç"}
              </Button>
              <Button variant="secondary" onClick={() => router.push("/hasta")} fullWidth>
                Vazgeç
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="flex gap-2">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Kaydedilen hasta kartı randevu, tedavi, finans, reçete, belge ve onam ekranlarında kullanılabilir.</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default function HastaEklePage() {
  return (
    <Suspense fallback={<div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <HastaEkleContent />
    </Suspense>
  );
}
