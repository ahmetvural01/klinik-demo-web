"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { Disclosure } from "@/components/ui/Disclosure";
import { FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";

type DemoAccess = {
  institution: string;
  identityNo: string;
  doctorIdentityNo?: string;
  bankoIdentityNo?: string;
  password: string;
  expiresAt: string;
  loginUrl: string;
};

type DemoResponse = { demo?: DemoAccess; message?: string };

const CLINIC_TYPE_LABELS: Record<string, string> = {
  "tek-sube": "Tek şube",
  "coklu-sube": "Çoklu şube",
  ozel: "Özel / Hastane",
};

const EMPTY_FORM = { contactName: "", institutionName: "", phone: "", email: "", city: "", clinicType: "", userCount: "", note: "" };

export function DemoRequestForm() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState<DemoAccess | null>(null);
  const set = (key: keyof typeof EMPTY_FORM, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError("");
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

    try {
      const res = await fetch("/api/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionName: form.institutionName,
          contactName: form.contactName,
          email: form.email,
          phone: form.phone,
          notes: noteLines.join("\n"),
        }),
      });
      const body: DemoResponse = await res.json().catch(() => ({}));
      if (!res.ok || !body.demo) {
        setError(body.message || "Demo erişimi oluşturulamadı.");
        return;
      }
      setDemo(body.demo);
    } catch {
      setError("Bağlantı kurulamadı. Bilgileriniz formda korundu; lütfen yeniden deneyin.");
    } finally {
      setLoading(false);
    }
  };

  if (demo) return <DemoReady demo={demo} />;

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Ad soyad" required className="sm:col-span-2">
          <Input required name="name" autoComplete="name" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
        </FormField>
        <FormField label="Klinik adı" required className="sm:col-span-2">
          <Input required name="organization" autoComplete="organization" value={form.institutionName} onChange={(e) => set("institutionName", e.target.value)} />
        </FormField>
        <FormField label="E-posta" required>
          <Input required name="email" type="email" autoComplete="email" placeholder="ornek@klinik.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </FormField>
        <FormField label="Telefon">
          <Input name="tel" type="tel" inputMode="tel" autoComplete="tel" placeholder="05xx xxx xx xx" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </FormField>
      </div>
      {/* Kapalıyken de içerik DOM'da kalır: yazılanlar gönderilir (testli). */}
      <Disclosure title="Ek bilgiler (isteğe bağlı)">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Şehir">
            <Input name="city" autoComplete="address-level2" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </FormField>
          <FormField label="Klinik yapısı">
            <Select name="clinicType" value={form.clinicType} onChange={(e) => set("clinicType", e.target.value)}>
              <option value="">Seçin</option>
              <option value="tek-sube">Tek şube</option>
              <option value="coklu-sube">Çoklu şube</option>
              <option value="ozel">Özel / Hastane</option>
            </Select>
          </FormField>
          <FormField label="Tahmini kullanıcı sayısı" className="sm:col-span-2">
            <Select name="userCount" value={form.userCount} onChange={(e) => set("userCount", e.target.value)}>
              <option value="">Seçin</option>
              <option value="1-5">1–5</option>
              <option value="6-15">6–15</option>
              <option value="16-30">16–30</option>
              <option value="30+">30+</option>
            </Select>
          </FormField>
          <FormField label="İncelemek istediğiniz konular" className="sm:col-span-2">
            <Textarea name="note" placeholder="Örn. randevu, hasta takibi ve muhasebe" value={form.note} onChange={(e) => set("note", e.target.value)} />
          </FormField>
        </div>
      </Disclosure>
      {error && <Callout tone="critical" role="alert">{error}</Callout>}
      <Button type="submit" loading={loading} fullWidth>
        {loading ? "Demo hazırlanıyor…" : "Demo erişimi oluştur"}
      </Button>
      <p className="text-xs leading-5 text-slate-500">Bilgileriniz yalnız demo hesabını açmak ve sizinle iletişim kurmak için kullanılır.</p>
    </form>
  );
}

/**
 * Demo hazır: bilgiler ekranda kalır ve tek tıkla oturum açılır. Önceden boş
 * giriş formu açılıyor, aday müşteri "…-demo-3f9a1c2b" biçimindeki kurum adını,
 * 11 haneli numarayı ve 19 karakterlik şifreyi elle yazmak zorunda kalıyordu.
 */
function DemoReady({ demo }: { demo: DemoAccess }) {
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [loginError, setLoginError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const loginHref = demo.loginUrl || "/klinik/giris";

  const loginAs = async (identityNo: string) => {
    if (loggingIn) return;
    setLoginError("");
    setLoggingIn(identityNo);
    // Başarılı girişte panel açılana kadar düğmeler kilitli kalır (ikinci rol girişi gitmesin).
    let navigating = false;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institution: demo.institution, identityNo, password: demo.password, rememberMe: false }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.requires2FA || payload.requiresTwoFactor) {
        setLoginError(payload.message || "Otomatik giriş yapılamadı. Bilgilerle giriş ekranından girebilirsiniz.");
        return;
      }
      navigating = true;
      window.location.href = payload.mustChangePassword ? "/profil?forcePasswordChange=1" : "/anasayfa";
    } catch {
      navigating = false;
      setLoginError("Bağlantı kurulamadı. Lütfen yeniden deneyin.");
    } finally {
      if (!navigating) setLoggingIn(null);
    }
  };

  const copyCredentials = async () => {
    const lines = [
      `Kurum adı: ${demo.institution}`,
      `Yönetici no: ${demo.identityNo}`,
      demo.doctorIdentityNo && `Doktor no: ${demo.doctorIdentityNo}`,
      demo.bankoIdentityNo && `Banko no: ${demo.bankoIdentityNo}`,
      `Şifre: ${demo.password}`,
      `Giriş: ${window.location.origin}${loginHref}`,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyState("copied");
    } catch {
      // İzin verilmemiş / güvenli olmayan bağlam: bilgiler ekranda duruyor.
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  };

  const expires = new Date(demo.expiresAt).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
  const sharedPassword = Boolean(demo.doctorIdentityNo || demo.bankoIdentityNo);

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600" aria-hidden="true"><Check className="h-5 w-5" /></span>
        <div>
          <h2 className="font-display text-lg font-extrabold text-slate-900">Size özel demo kurumu oluşturuldu.</h2>
          <p className="mt-0.5 text-sm text-slate-600">Son gün {expires}. Bu bilgileri saklayın; demo boyunca aynı bilgilerle girersiniz.</p>
        </div>
      </div>
      <DescriptionList
        layout="rows"
        className="rounded-lg border border-slate-200 p-3"
        items={[
          { key: "kurum", label: "Kurum adı", value: <span className="break-all font-mono text-[13px]">{demo.institution}</span> },
          { key: "yonetici", label: "Yönetici no", value: <span className="font-mono tabular-nums">{demo.identityNo}</span> },
          { key: "doktor", label: "Doktor no", value: <span className="font-mono tabular-nums">{demo.doctorIdentityNo}</span>, hidden: !demo.doctorIdentityNo },
          { key: "banko", label: "Banko no", value: <span className="font-mono tabular-nums">{demo.bankoIdentityNo}</span>, hidden: !demo.bankoIdentityNo },
          { key: "sifre", label: sharedPassword ? "Şifre (hepsinde aynı)" : "Şifre", value: <span className="break-all font-mono text-[13px]">{demo.password}</span> },
        ]}
      />
      {loginError && (
        <Callout tone="critical" role="alert" action={<Button size="sm" variant="secondary" href={loginHref}>Giriş ekranı</Button>}>
          {loginError}
        </Callout>
      )}
      <Button fullWidth icon={ArrowRight} iconPosition="right" loading={loggingIn === demo.identityNo} disabled={Boolean(loggingIn)} onClick={() => void loginAs(demo.identityNo)}>
        Yönetici olarak giriş yap
      </Button>
      {sharedPassword && (
        <div className="grid gap-2 sm:grid-cols-2">
          {demo.doctorIdentityNo && (
            <Button variant="secondary" loading={loggingIn === demo.doctorIdentityNo} disabled={Boolean(loggingIn)} onClick={() => void loginAs(demo.doctorIdentityNo as string)}>
              Doktor olarak giriş yap
            </Button>
          )}
          {demo.bankoIdentityNo && (
            <Button variant="secondary" loading={loggingIn === demo.bankoIdentityNo} disabled={Boolean(loggingIn)} onClick={() => void loginAs(demo.bankoIdentityNo as string)}>
              Banko olarak giriş yap
            </Button>
          )}
        </div>
      )}
      <Button variant="ghost" size="sm" icon={copyState === "copied" ? Check : Copy} onClick={() => void copyCredentials()}>
        {copyState === "copied" ? "Kopyalandı" : copyState === "failed" ? "Kopyalanamadı — bilgileri elle not alın" : "Bilgileri kopyala"}
      </Button>
    </div>
  );
}
