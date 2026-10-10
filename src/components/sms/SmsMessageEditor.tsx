"use client";

import { useId, useRef } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Input";
import { SMS_PLACEHOLDERS, renderSmsPreview, toStoredText, type SmsPlaceholder } from "@/lib/sms-template-placeholders";

export interface SmsMessageEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Bu mesajda gerçekten doldurulan bilgiler (bkz. components/sms/message-catalog.ts). */
  placeholders: SmsPlaceholder[];
  // Verilirse, ilgili düğmeye tıklamak metne DOĞRUDAN bu değeri ekler
  // ({{token}} yerine). Yeni ekranlarda kullanılmaz: klinik adı gibi bilgiler
  // etiket olarak kalır ve gönderimde sunucu doldurur.
  insertContext?: Partial<Record<string, string>>;
  // Verilirse önizleme jenerik örnek yerine bu gerçek değerleri gösterir
  // (ör. kliniğin gerçek adı, değerlendirme bağlantısı).
  previewContext?: Partial<Record<string, string>>;
  rows?: number;
  label?: string;
  hint?: string;
  required?: boolean;
  /** Alanın altında kırmızı hata (ör. bu mesajda doldurulamayan bilgi). */
  error?: string;
  /** Önizlemenin altında sarı uyarı (ör. "değerlendirme bağlantısı tanımlı değil"). */
  previewWarning?: string;
  maxLength?: number;
  disabled?: boolean;
  showPreview?: boolean;
  /**
   * "always" (varsayılan): önizleme kutusu hep görünür. "auto": yalnız metinde
   * doldurulacak bir bilgi varsa görünür — değişkensiz metnin önizlemesi metnin
   * aynısıdır, ekranda iki kez durmasın.
   */
  previewMode?: "always" | "auto";
}

const PLACEHOLDER_TAGS = SMS_PLACEHOLDERS.map((item) => `[${item.label}]`);

// SMS/WhatsApp metni yazma kutusu: imleç konumuna okunaklı bilgi etiketi
// ("[Hasta Adı]") ekleme + canlı önizleme. `value`/`onChange` HER ZAMAN
// okunaklı biçimdedir; ham {{token}} biçimine çevirmek kullanan tarafın işidir
// (toStoredText). İletişim ekranları ve süperadmin şablonları ortak kullanır.
export function SmsMessageEditor({
  value,
  onChange,
  placeholders,
  insertContext,
  previewContext,
  rows = 4,
  label = "Mesaj metni",
  hint = "Köşeli parantezli bilgiler her hastaya göre doldurulur.",
  required = true,
  error,
  previewWarning,
  maxLength,
  disabled = false,
  showPreview = true,
  previewMode = "always",
}: SmsMessageEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();

  const insertPlaceholder = (p: SmsPlaceholder) => {
    const literal = insertContext?.[p.token];
    const insertText = literal !== undefined ? literal : `[${p.label}]`;
    const el = textareaRef.current;
    if (!el) {
      onChange(value + insertText);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const nextValue = value.slice(0, start) + insertText + value.slice(end);
    onChange(maxLength ? nextValue.slice(0, maxLength) : nextValue);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + insertText.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const counter = maxLength ? `${value.length}/${maxLength} karakter` : `${value.length} karakter`;
  // Bu mesajda doldurulamayan bilgi önizlemede de boş görünür: hata "hastaya
  // boş gider" derken önizleme örnek değer gösterip çelişmesin.
  const allowed = new Set(placeholders.map((item) => item.token));
  const blanks = Object.fromEntries(SMS_PLACEHOLDERS.filter((item) => !allowed.has(item.token)).map((item) => [item.token, ""]));
  const hasPlaceholder = PLACEHOLDER_TAGS.some((tag) => value.includes(tag)) || /{{\s*\w+\s*}}/.test(value);
  const previewVisible = showPreview && (previewMode === "always" || (hasPlaceholder && value.trim().length > 0));

  return (
    <div className="space-y-2">
      <FormField label={label} htmlFor={fieldId} required={required} error={error} hint={error ? undefined : [hint, `${counter}.`].filter(Boolean).join(" ")}>
        <Textarea
          id={fieldId}
          ref={textareaRef}
          rows={rows}
          value={value}
          maxLength={maxLength}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </FormField>
      {!disabled && placeholders.length > 0 && (
        // role="group": aria-label rolsüz <div>'de yok sayılıyordu. Çipler ortak
        // Button (odak halkası, dokunma alanı ve görünüm her yerdekiyle aynı).
        <div role="group" className="flex flex-wrap items-center gap-1.5" aria-label="Metne bilgi ekle">
          <span className="text-xs font-semibold text-slate-500">Ekle:</span>
          {placeholders.map((p) => (
            <Button key={p.token} variant="secondary" size="sm" icon={Plus} onClick={() => insertPlaceholder(p)}>
              {p.label}
            </Button>
          ))}
        </div>
      )}
      {previewVisible && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="mb-1 text-xs font-semibold text-slate-500">Hastaya böyle görünür</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-5 text-slate-800">
            {value.trim() ? renderSmsPreview(toStoredText(value), { ...previewContext, ...blanks }) : "Metin yazdıkça örnek bir hastaya nasıl görüneceği burada çıkar."}
          </p>
          {previewWarning && (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {previewWarning}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
