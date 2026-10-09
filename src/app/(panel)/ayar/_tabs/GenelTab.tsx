"use client";

import { useRef, useState } from "react";
import { Building2, Copy, ExternalLink, ImageIcon, Link2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, FormSection } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { showToastSafe } from "@/lib/toast-client";
import type { ClinicSettingsForm } from "./settings-form";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const LOGO_MAX_BYTES = 400 * 1024;

type GenelTabProps = {
  form: ClinicSettingsForm;
  onChange: (patch: Partial<ClinicSettingsForm>) => void;
  canWrite: boolean;
  /** Hastaların online randevu talebi gönderdiği sayfanın tam adresi. */
  bookingLink: string;
  /** Giriş ekranında yazılan kurum adı; "Klinik adı" değişse de değişmez. */
  loginInstitutionName: string;
};

export default function GenelTab({ form, onChange, canWrite, bookingLink, loginInstitutionName }: GenelTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  // Yüklenen logo veritabanında "data:image/..." metni olarak durur; bu uzun
  // ham metin kullanıcıya gösterilmez — yalnız önizleme görünür.
  const hasUploadedLogo = form.logoUrl.startsWith("data:");
  const logoLink = hasUploadedLogo ? "" : form.logoUrl;

  const selectLogoFile = (file?: File) => {
    if (!file) return;
    setLogoError(null);
    if (!LOGO_TYPES.includes(file.type)) {
      setLogoError("Logo PNG, JPG, WEBP veya GIF biçiminde olmalıdır.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError("Logo dosyası en fazla 400 KB olabilir. Daha küçük bir görsel seçin.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange({ logoUrl: String(reader.result || "") });
    reader.onerror = () => setLogoError("Dosya okunamadı. Başka bir görsel deneyin.");
    reader.readAsDataURL(file);
  };

  const copyBookingLink = async () => {
    try {
      await navigator.clipboard.writeText(bookingLink);
      showToastSafe({ message: "Bağlantı kopyalandı. Hastalarınıza mesajla gönderebilirsiniz.", type: "success" });
    } catch {
      showToastSafe({ message: "Bağlantı kopyalanamadı. Kutudaki adresi seçip elle kopyalayın.", type: "error" });
    }
  };

  return (
    <div className="space-y-4">
      <FormSection icon={Building2} title="Klinik bilgileri" description="Reçete, onam formu ve dışa aktarılan belgelerin üst bilgisinde görünür.">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Klinik adı"
            htmlFor="ayar-klinik-adi"
            required
            hint={loginInstitutionName ? `Girişte yazılan kurum adı "${loginInstitutionName}" olarak kalır; bu alan yalnız belgelerde görünür.` : undefined}
          >
            <Input
              id="ayar-klinik-adi"
              value={form.institutionName}
              disabled={!canWrite}
              maxLength={120}
              onChange={(event) => onChange({ institutionName: event.target.value })}
            />
          </FormField>
          <FormField label="Telefon" htmlFor="ayar-telefon">
            <Input
              id="ayar-telefon"
              type="tel"
              inputMode="tel"
              value={form.institutionPhone}
              disabled={!canWrite}
              placeholder="0 (5xx) xxx xx xx"
              onChange={(event) => onChange({ institutionPhone: event.target.value })}
            />
          </FormField>
          <FormField label="Adres" htmlFor="ayar-adres">
            <Input
              id="ayar-adres"
              value={form.institutionAddress}
              disabled={!canWrite}
              placeholder="Mahalle, cadde, no, ilçe / il"
              onChange={(event) => onChange({ institutionAddress: event.target.value })}
            />
          </FormField>
          <FormField label="Web sitesi" htmlFor="ayar-web">
            <Input
              id="ayar-web"
              type="url"
              value={form.institutionWebsite}
              disabled={!canWrite}
              placeholder="https://"
              onChange={(event) => onChange({ institutionWebsite: event.target.value })}
            />
          </FormField>
        </div>
      </FormSection>

      <FormSection icon={ImageIcon} title="Logo" description="Sol menüde, hasta belgelerinde ve çıktılarda görünür.">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {form.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.logoUrl} alt="Klinik logosu" className="h-full w-full object-contain p-1" />
            ) : (
              <span className="text-xs font-semibold text-slate-400">Logo yok</span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            {canWrite && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={LOGO_TYPES.join(",")}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(event) => {
                    selectLogoFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <Button variant="secondary" size="sm" icon={Upload} onClick={() => fileInputRef.current?.click()}>
                  {form.logoUrl ? "Logoyu değiştir" : "Logo yükle"}
                </Button>
                {form.logoUrl && (
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => { setLogoError(null); onChange({ logoUrl: "" }); }}>
                    Logoyu kaldır
                  </Button>
                )}
              </div>
            )}
            {logoError ? (
              <p role="alert" className="text-xs font-medium text-red-600">{logoError}</p>
            ) : (
              <p className="text-xs text-slate-500">
                {hasUploadedLogo ? "Yüklediğiniz dosya kullanılıyor. " : ""}PNG, JPG, WEBP veya GIF; en fazla 400 KB. Arka planı şeffaf PNG en iyi görünür.
              </p>
            )}
            {canWrite && (
              <FormField
                label="Logo bağlantısı (isteğe bağlı)"
                htmlFor="ayar-logo-baglanti"
                hint={hasUploadedLogo ? "Bir bağlantı yazarsanız yüklediğiniz dosyanın yerine geçer." : "Logonuz bir web adresindeyse buraya yapıştırabilirsiniz (https:// ile başlamalı)."}
              >
                <Input
                  id="ayar-logo-baglanti"
                  type="url"
                  value={logoLink}
                  placeholder="https://"
                  onChange={(event) => { setLogoError(null); onChange({ logoUrl: event.target.value }); }}
                />
              </FormField>
            )}
          </div>
        </div>
      </FormSection>

      {bookingLink && (
        <FormSection icon={Link2} title="Online randevu bağlantısı" description="Hastalarınız bu bağlantıdan randevu talebi gönderir; talepler Randevular sayfasında onayınızı bekler.">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input readOnly value={bookingLink} aria-label="Online randevu bağlantısı" onFocus={(event) => event.currentTarget.select()} className="sm:flex-1" />
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" icon={Copy} onClick={() => void copyBookingLink()}>Kopyala</Button>
              <Button variant="ghost" icon={ExternalLink} onClick={() => window.open(bookingLink, "_blank", "noopener,noreferrer")}>Aç</Button>
            </div>
          </div>
        </FormSection>
      )}
    </div>
  );
}
