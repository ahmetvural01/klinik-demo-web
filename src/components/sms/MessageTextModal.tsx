"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { SmsMessageEditor } from "@/components/sms/SmsMessageEditor";
import { showToastSafe } from "@/lib/toast-client";
import { toReadableText, toStoredText } from "@/lib/sms-template-placeholders";
import {
  MANUAL_PLACEHOLDER_TOKENS,
  customTextCode,
  placeholdersFor,
  unsupportedPlaceholderError,
  type EventMessage,
} from "@/components/sms/message-catalog";
import type { MessageTemplate } from "@/components/sms/communication-status";

type MessageTextModalProps = {
  open: boolean;
  onClose: () => void;
  /** "event": otomatik bir olayın metni (yalnız metin değişir); "custom": kliniğin kayıtlı metni. */
  mode: "event" | "custom";
  /** Düzenlenen metin; yeni kayıtlı metinde null. */
  template: MessageTemplate | null;
  event?: EventMessage;
  /** Yeni kayıtlı metin "Bu metni kaydet" ile açıldıysa başlangıç metni (okunaklı biçim). */
  initialContent?: string;
  existingCodes: Set<string>;
  canWriteSms: boolean;
  /** WhatsApp modülü açık + yazma yetkisi var. */
  canWriteWhatsapp: boolean;
  whatsappConnected: boolean;
  previewContext: Partial<Record<string, string>>;
  previewWarning?: string;
  readOnly?: boolean;
  onSaved: () => void;
};

type FormState = {
  title: string;
  content: string;
  whatsappContent: string;
  whatsappTemplateName: string;
  whatsappTemplateLanguage: string;
};

const SMS_MAX = 1600;

/**
 * Mesaj metni penceresi — hem otomatik olay metinleri ("Randevu hatırlatma"
 * metnini düzenle) hem kliniğin kayıtlı metinleri için TEK pencere. Olay
 * metninde yalnız metin değişir: başlık, kategori veya "aktif" gibi gönderimi
 * etkilemeyen alanlar gösterilmez. Kod alanı kullanıcıdan istenmez.
 */
export function MessageTextModal({
  open,
  onClose,
  mode,
  template,
  event,
  initialContent,
  existingCodes,
  canWriteSms,
  canWriteWhatsapp,
  whatsappConnected,
  previewContext,
  previewWarning,
  readOnly = false,
  onSaved,
}: MessageTextModalProps) {
  const initial = useMemo<FormState>(() => ({
    title: template?.title || "",
    content: template ? toReadableText(template.content) : initialContent || "",
    whatsappContent: template?.whatsappContent && template.whatsappContent !== template.content ? toReadableText(template.whatsappContent) : "",
    whatsappTemplateName: template?.whatsappTemplateName || "",
    whatsappTemplateLanguage: template?.whatsappTemplateLanguage || "tr",
  }), [initialContent, template]);
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial);
    setErrors({});
    setSaveError("");
  }, [initial, open]);

  const tokens = mode === "event" && event ? event.placeholders : MANUAL_PLACEHOLDER_TOKENS;
  const placeholders = placeholdersFor(tokens);
  const showWhatsapp = canWriteWhatsapp && whatsappConnected;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const title = mode === "event"
    ? `${event?.title || template?.title || "Mesaj"} metni`
    : template ? "Kayıtlı metni düzenle" : "Yeni kayıtlı metin";

  const validate = () => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (mode === "custom" && !form.title.trim()) next.title = "Metne kısa bir ad verin (ör. “Tatil duyurusu”).";
    if (canWriteSms && !form.content.trim()) next.content = "SMS metni boş olamaz.";
    next.content = next.content || unsupportedPlaceholderError(form.content, tokens);
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, value]) => Boolean(value)));
    setErrors(cleaned);
    return Object.keys(cleaned).length === 0;
  };

  const save = async () => {
    if (readOnly || !validate()) return;
    setSaving(true);
    setSaveError("");
    try {
      const code = template?.code || customTextCode(form.title, existingCodes);
      const response = await fetch("/api/sms/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          title: mode === "custom" ? form.title.trim() : template?.title || event?.title || code,
          description: template?.description || undefined,
          category: template?.category || "GENERAL",
          content: canWriteSms ? toStoredText(form.content.trim()) : undefined,
          // Tek metin: eski, ayrı WhatsApp metni ve Meta kalıp adı temizlenir.
          whatsappContent: canWriteWhatsapp ? "" : undefined,
          whatsappTemplateName: canWriteWhatsapp ? "" : undefined,
          // Metni kaydetmek "bu metin kullanılsın" demektir; eski bir "pasif"
          // işareti metni sessizce devre dışı bırakmasın.
          isActive: true,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Metin kaydedilemedi.");
      showToastSafe({ message: mode === "event" ? "Mesaj metni kaydedildi. Bundan sonraki mesajlarda bu metin kullanılır." : "Kayıtlı metin kaydedildi. Mesaj Gönder'de seçebilirsiniz.", type: "success" });
      onSaved();
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Metin kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      module="sms"
      open={open}
      onClose={onClose}
      isDirty={!readOnly && dirty}
      title={title}
      description={mode === "event" ? event?.when : "Mesaj Gönder ekranında seçip tekrar kullanabileceğiniz metin."}
      size="lg"
      footer={readOnly ? (
        <Button variant="secondary" onClick={onClose}>Kapat</Button>
      ) : (
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button>
          <Button onClick={() => void save()} loading={saving}>Kaydet</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <FormErrorBanner message={saveError} />
        {mode === "custom" && (
          <FormField label="Metnin adı" required error={errors.title} hint="Listede bu adla görünür; hastaya gitmez.">
            <Input value={form.title} maxLength={80} disabled={readOnly} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ör. Bayram tatili duyurusu" />
          </FormField>
        )}
        {canWriteSms || readOnly ? (
          <SmsMessageEditor
            value={form.content}
            onChange={(content) => setForm({ ...form, content })}
            placeholders={placeholders}
            previewContext={previewContext}
            previewWarning={previewWarning}
            label="Mesaj metni"
            hint={showWhatsapp ? "WhatsApp bağlıysa bu metin WhatsApp'tan, değilse SMS ile gider." : undefined}
            error={errors.content}
            maxLength={SMS_MAX}
            disabled={readOnly}
            required={!readOnly}
          />
        ) : null}
      </div>
    </Modal>
  );
}
