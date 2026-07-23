"use client";

import { useRef } from "react";
import { FormField } from "@/components/ui/FormField";
import { renderSmsPreview, toStoredText, type SmsPlaceholder } from "@/lib/sms-template-placeholders";

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export interface SmsMessageEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholders: SmsPlaceholder[];
  rows?: number;
  label?: string;
  hint?: string;
}

// SMS metni giriş kutusuna okunaklı yer tutucu ekleme + canlı önizleme —
// TemplatesTab.tsx'ten çıkarıldı, toplu SMS gönderiminde de kullanılır.
// `value`/`onChange` HER ZAMAN okunaklı ("[Hasta Adı]") biçimdedir; ham
// {{token}} biçimine çevirme sorumluluğu kullanan tarafa aittir (bkz.
// toStoredText import'u sadece önizleme için burada kullanılıyor).
export function SmsMessageEditor({
  value,
  onChange,
  placeholders,
  rows = 4,
  label = "Mesaj Metni",
  hint = "Aşağıdaki butonlara tıklayarak imleç konumuna otomatik dolacak bilgiyi ekleyebilirsiniz — köşeli parantezli alanlar gönderim sırasında gerçek bilgiyle değiştirilir",
}: SmsMessageEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertPlaceholder = (placeholderLabel: string) => {
    const el = textareaRef.current;
    const insertText = `[${placeholderLabel}]`;
    if (!el) {
      onChange(value + insertText);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const nextValue = value.slice(0, start) + insertText + value.slice(end);
    onChange(nextValue);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + insertText.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Otomatik Doldurulacak Bilgiler</p>
        <div className="flex flex-wrap gap-1.5">
          {placeholders.map((p) => (
            <button
              key={p.token}
              type="button"
              onClick={() => insertPlaceholder(p.label)}
              className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10"
            >
              + {p.label}
            </button>
          ))}
        </div>
      </div>
      <FormField label={label} required hint={hint}>
        <textarea
          ref={textareaRef}
          className={inputClass}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </FormField>
      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Örnek Önizleme</p>
        <p className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
          {value.trim() ? renderSmsPreview(toStoredText(value)) : "Mesaj metni girildikçe burada örnek bir hastaya nasıl göründüğünü görürsünüz."}
        </p>
      </div>
    </div>
  );
}
