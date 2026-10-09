"use client";

import { useId, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Input";
import { renderSmsPreview, toStoredText, type SmsPlaceholder } from "@/lib/sms-template-placeholders";

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
}

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
  hint = "Köşeli parantezli bilgiler gönderimde her hastanın kendi bilgisiyle doldurulur.",
  required = true,
  error,
  previewWarning,
  maxLength,
  disabled = false,
  showPreview = true,
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

  return (
    <div className="space-y-2">
      <FormField label={label} htmlFor={fieldId} required={required} error={error} hint={error ? undefined : `${hint} ${counter}.`}>
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
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Metne bilgi ekle">
          <span className="text-xs font-semibold text-slate-500">Ekle:</span>
          {placeholders.map((p) => (
            <button
              key={p.token}
              type="button"
              onClick={() => insertPlaceholder(p)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-primary/40 hover:text-primary"
            >
              + {p.label}
            </button>
          ))}
        </div>
      )}
      {showPreview && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="mb-1 text-xs font-semibold text-slate-500">Hastaya böyle görünür</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-5 text-slate-800">
            {value.trim() ? renderSmsPreview(toStoredText(value), previewContext) : "Metin yazdıkça örnek bir hastaya nasıl görüneceği burada çıkar."}
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
