"use client";

import type { ReactNode } from "react";
import { Building2, Clock, CopyCheck, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CopyField } from "@/components/ui/CopyField";
import { FormField } from "@/components/ui/FormField";
import { ImageUploadField } from "@/components/ui/ImageUploadField";
import { Input, Textarea } from "@/components/ui/Input";
import { Section, SectionDivider } from "@/components/ui/Section";
import { Switch } from "@/components/ui/Switch";
import { TimeRangeInput } from "@/components/ui/TimeRangeInput";
import { CLINIC_ADDRESS_MAX, CLINIC_NAME_MAX } from "@/app/api/settings/clinic-contact";
import { contactErrors, dayErrors, type ClinicSettingsForm, type ContactField, type ScheduleRow } from "./settings-form";

// Sunucu sınırı (api/settings validateLogoUrl) 550 bin karakter; 400 KB dosya
// base64 ile bu sınırın altında kalır.
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
const LOGO_MAX_BYTES = 400 * 1024;

type KlinikTabProps = {
  form: ClinicSettingsForm;
  onChange: (patch: Partial<ClinicSettingsForm>) => void;
  canWrite: boolean;
  /** Hastaların online randevu talebi gönderdiği sayfanın tam adresi. */
  bookingLink: string;
  /** Giriş ekranında yazılan kurum adı (Institution.name). */
  loginInstitutionName: string;
  /** Kaydet'e basıldı ve hata var: dokunulmamış alanların hatası da görünür. */
  showErrors: boolean;
  /** Sunucunun reddettiği alan (400 `field`). */
  serverError: { field: ContactField; message: string } | null;
  /** Çok şubeli kurumda "Tüm şubeler" rozeti (tek şubede null). */
  scopeBadge: ReactNode;
  /** Sekmenin en altındaki "İlgili ayarlar" bağlantıları. */
  footer?: ReactNode;
};

/**
 * Ayarlar > Klinik: klinik bilgileri + logo, hasta bağlantıları ve çalışma
 * saatleri TEK formda ve TEK kaydet çubuğuyla. Önceden "Klinik Bilgileri" ve
 * "Çalışma Saatleri" iki ayrı sekmeydi ama aynı kaydı aynı düğmeyle
 * kaydediyordu; başka sekmedeyken de "kaydedilmemiş değişiklik" çubuğu
 * görünüyor, doğrulama hatasında kullanıcı başka sekmeye atılıyordu.
 */
export default function KlinikTab({ form, onChange, canWrite, bookingLink, loginInstitutionName, showErrors, serverError, scopeBadge, footer }: KlinikTabProps) {
  const errors = contactErrors(form);
  // Alan hatası yazarken değil, kaydetmeye çalışınca (ya da sunucu reddedince) görünür.
  const fieldError = (key: ContactField) => (serverError?.field === key ? serverError.message : showErrors ? errors[key] : undefined);
  const firstOpenDay = form.dailySchedules.find((row) => !row.isHoliday);
  const firstOpenDayErrors = firstOpenDay ? dayErrors(firstOpenDay) : {};
  const canCopyFirstDay = Boolean(firstOpenDay && !firstOpenDayErrors.work && !firstOpenDayErrors.lunch);
  const namesDiffer = Boolean(loginInstitutionName && form.institutionName.trim() && loginInstitutionName.trim() !== form.institutionName.trim());

  const updateDay = (index: number, patch: Partial<ScheduleRow>) => {
    onChange({ dailySchedules: form.dailySchedules.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  };

  // Personel her günü tek tek yazmasın: ilk açık günün saatleri (öğle arası
  // dahil) diğer açık günlere kopyalanır. Kaynak gün hatalıyken düğme pasiftir
  // (önceden hatalı saat altı güne çoğalıyordu — canlı H-13).
  const copyFirstDayToOpenDays = () => {
    if (!firstOpenDay || !canCopyFirstDay) return;
    onChange({
      dailySchedules: form.dailySchedules.map((row) => (row.isHoliday ? row : {
        ...row,
        open: firstOpenDay.open,
        close: firstOpenDay.close,
        lunchStart: firstOpenDay.lunchStart,
        lunchEnd: firstOpenDay.lunchEnd,
      })),
    });
  };

  return (
    <div className="space-y-4">
      <Section icon={Building2} title="Klinik bilgileri" badge={scopeBadge} description="Reçete, onam formu ve hastaya giden mesajlarda görünür.">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="grid content-start gap-4 sm:grid-cols-2">
            <FormField
              label="Klinik adı"
              htmlFor="ayar-institutionName"
              required
              error={fieldError("institutionName")}
              hint={namesDiffer ? `Giriş ekranındaki ad: ${loginInstitutionName}` : undefined}
            >
              <Input
                id="ayar-institutionName"
                value={form.institutionName}
                disabled={!canWrite}
                maxLength={CLINIC_NAME_MAX}
                onChange={(event) => onChange({ institutionName: event.target.value })}
              />
            </FormField>
            <FormField label="Telefon" htmlFor="ayar-institutionPhone" error={fieldError("institutionPhone")}>
              <Input
                id="ayar-institutionPhone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={form.institutionPhone}
                disabled={!canWrite}
                placeholder="0216 345 67 89"
                onChange={(event) => onChange({ institutionPhone: event.target.value })}
              />
            </FormField>
            <FormField label="Adres" htmlFor="ayar-institutionAddress" error={fieldError("institutionAddress")} className="sm:col-span-2">
              <Textarea
                id="ayar-institutionAddress"
                rows={2}
                value={form.institutionAddress}
                disabled={!canWrite}
                maxLength={CLINIC_ADDRESS_MAX}
                placeholder="Mahalle, cadde, no, ilçe / il"
                onChange={(event) => onChange({ institutionAddress: event.target.value })}
              />
            </FormField>
            <FormField label="Web sitesi" htmlFor="ayar-institutionWebsite" error={fieldError("institutionWebsite")} className="sm:col-span-2">
              <Input
                id="ayar-institutionWebsite"
                inputMode="url"
                autoComplete="off"
                value={form.institutionWebsite}
                disabled={!canWrite}
                placeholder="gulusdis.com.tr"
                onChange={(event) => onChange({ institutionWebsite: event.target.value })}
              />
            </FormField>
          </div>
          {/* Logo için tek yol: dosya yükleme. Ayrıca "logo bağlantısı" alanı
              vardı; aynı alanı iki ayrı yoldan doldurmak kafa karıştırıyordu.
              Önceden bağlantıyla eklenmiş logo görünmeye devam eder. */}
          <FormField as="div" label="Logo" className="min-w-0">
            <ImageUploadField
              label="Logo"
              value={form.logoUrl}
              onChange={(dataUrl) => onChange({ logoUrl: dataUrl })}
              accept={LOGO_TYPES}
              maxBytes={LOGO_MAX_BYTES}
              hint="Sol menüde ve belgelerde görünür."
              readOnly={!canWrite}
            />
          </FormField>
        </div>

        {/* Hasta bağlantıları aynı kartta ayırıcıyla (sadelik K1): klinik
            kimliğiyle ilgili tüm alanlar tek yüzeyde; ayrı kart açılmaz. */}
        <SectionDivider />
        <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <Link2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          Hasta bağlantıları
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          {bookingLink ? (
            <CopyField
              label="Online randevu bağlantısı"
              value={bookingLink}
              openHref
              hint="Hasta bu bağlantıdan randevu talebi gönderir; talep Randevular'da onayınızı bekler."
            />
          ) : null}
          <FormField
            label="Değerlendirme bağlantısı"
            htmlFor="ayar-reviewLink"
            error={fieldError("reviewLink")}
            hint="Tamamlanan randevudan sonra hastaya giden değerlendirme mesajındaki bağlantı (ör. Google yorum sayfanız). Açıp kapatmak: İletişim › Otomatik mesajlar."
          >
            <Input
              id="ayar-reviewLink"
              inputMode="url"
              autoComplete="off"
              value={form.reviewLink}
              disabled={!canWrite}
              placeholder="https://g.page/r/…/review"
              onChange={(event) => onChange({ reviewLink: event.target.value })}
            />
          </FormField>
        </div>
      </Section>

      <Section
        id="calisma-saatleri"
        icon={Clock}
        title="Çalışma saatleri"
        badge={scopeBadge}
        description="Kapalı günlere, bu saatlerin dışına ve öğle arasına randevu verilmez."
        actions={canWrite && firstOpenDay ? (
          <Button
            variant="ghost"
            size="sm"
            icon={CopyCheck}
            disabled={!canCopyFirstDay}
            title={canCopyFirstDay ? undefined : `${firstOpenDay.day} satırındaki hatayı önce düzeltin.`}
            onClick={copyFirstDayToOpenDays}
          >
            {firstOpenDay.day} saatlerini açık günlere uygula
          </Button>
        ) : undefined}
        padding="none"
      >
        <div className="hidden grid-cols-[11rem_minmax(0,18rem)_minmax(0,18rem)] gap-4 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs font-semibold text-slate-500 md:grid" aria-hidden="true">
          <span>Gün</span>
          <span>Çalışma saati</span>
          <span>Öğle arası (isteğe bağlı)</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {form.dailySchedules.map((row, index) => {
            const rowErrors = dayErrors(row);
            // Sıra hatası alan kendi içinde (ayrıldıktan sonra) gösterilir;
            // aralıklar arası hata (öğle arası mesai dışında) ve kaydetme
            // denemesindeki hatalar dışarıdan verilir.
            const crossLunchError = rowErrors.lunch === "Öğle arası çalışma saatlerinin içinde olmalı." ? rowErrors.lunch : undefined;
            return (
              <li
                key={row.day}
                id={`ayar-gun-${index}`}
                tabIndex={-1}
                className={`grid gap-3 px-4 py-3 outline-none md:grid-cols-[11rem_minmax(0,18rem)_minmax(0,18rem)] md:items-start md:gap-4 ${row.isHoliday ? "bg-slate-50/70" : ""}`}
              >
                <div className="pt-1.5">
                  <Switch
                    checked={!row.isHoliday}
                    onChange={(open) => updateDay(index, { isHoliday: !open })}
                    label={row.day}
                    description={row.isHoliday ? "Kapalı" : undefined}
                    disabled={!canWrite}
                  />
                </div>
                {row.isHoliday ? null : (
                  <>
                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-500 md:hidden" aria-hidden="true">Çalışma saati</p>
                      <TimeRangeInput
                        label={`${row.day} çalışma saati`}
                        labelHidden
                        required
                        startLabel={`${row.day} açılış`}
                        endLabel={`${row.day} kapanış`}
                        size="sm"
                        disabled={!canWrite}
                        value={{ start: row.open, end: row.close }}
                        error={showErrors ? rowErrors.work : undefined}
                        onChange={(range) => updateDay(index, { open: range.start, close: range.end })}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-500 md:hidden" aria-hidden="true">Öğle arası (isteğe bağlı)</p>
                      <TimeRangeInput
                        label={`${row.day} öğle arası`}
                        labelHidden
                        startLabel={`${row.day} öğle arası başlangıcı`}
                        endLabel={`${row.day} öğle arası bitişi`}
                        size="sm"
                        disabled={!canWrite}
                        value={{ start: row.lunchStart, end: row.lunchEnd }}
                        error={crossLunchError || (showErrors ? rowErrors.lunch : undefined)}
                        onChange={(range) => updateDay(index, { lunchStart: range.start, lunchEnd: range.end })}
                      />
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      {footer}
    </div>
  );
}
