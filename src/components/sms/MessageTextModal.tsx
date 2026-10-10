"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormModal } from "@/components/ui/FormModal";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { SmsMessageEditor } from "@/components/sms/SmsMessageEditor";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { renderSmsPreview, toReadableText, toStoredText } from "@/lib/sms-template-placeholders";
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
  /** Yalnız görüntüleme: metin ve (varsa) ek ayarlar salt okunur, altta "Kapat". */
  readOnly?: boolean;
  /** Metin kaydedildi; `saved` listeyi sunucuya yeniden sormadan güncellemek için. */
  onSaved: (saved?: MessageTemplate) => void;
  /** Pencere açıklaması; verilmezse olay metninin kuralı. */
  description?: string;
  /** Metnin üstünde ek ayar alanları (ör. ödeme hatırlatma günleri). */
  settings?: ReactNode;
  /** Ek ayarlar değişti mi (Kaydet ve kaydedilmemiş değişiklik uyarısı için). */
  settingsDirty?: boolean;
  /** Ek ayar hatası (alanın altında gösterilir); varken kaydedilmez. */
  settingsError?: string | null;
  /** Kaydet: ek ayar değiştiyse metinden önce çağrılır; hata fırlatırsa pencere açık kalır. */
  onSaveSettings?: () => Promise<void>;
  /** Kliniğe özel metni silip sistemin hazır metnine dönme yetkisi (api/sms/templates DELETE). */
  canResetToDefault?: boolean;
  /** Hazır metne dönüldü; hazır metin (biliniyorsa) listeyi yerelde güncellemek için. */
  onReset?: (template: MessageTemplate) => void;
};

type FormState = { title: string; content: string };

const SMS_MAX = 1600;

function messageOf(data: unknown, fallback: string) {
  const message = data && typeof data === "object" ? (data as { message?: unknown }).message : undefined;
  return typeof message === "string" && message.trim() ? message : fallback;
}

/**
 * Mesaj metni penceresi — hem otomatik olay metinleri ("Randevu hatırlatma"
 * metni) hem kliniğin kayıtlı metinleri için TEK pencere. Olay metninde yalnız
 * metin (ve varsa zamanlama gibi ek ayar) değişir; kod alanı kullanıcıdan
 * istenmez. Metni değiştirme yetkisi olmayan (ör. yalnız WhatsApp yetkili)
 * kullanıcı metni salt okunur görür — önceden boş bir pencere açılıyordu.
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
  description,
  settings,
  settingsDirty = false,
  settingsError,
  onSaveSettings,
  canResetToDefault = false,
  onReset,
}: MessageTextModalProps) {
  const initial = useMemo<FormState>(() => ({
    title: template?.title || "",
    content: template ? toReadableText(template.content) : initialContent || "",
  }), [initialContent, template]);
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial);
    setErrors({});
    setSaveError("");
  }, [initial, open]);

  const viewOnly = readOnly || !canWriteSms;
  const tokens = mode === "event" && event ? event.placeholders : MANUAL_PLACEHOLDER_TOKENS;
  const placeholders = placeholdersFor(tokens);
  const textDirty = form.title !== initial.title || form.content !== initial.content;
  const dirty = textDirty || settingsDirty;
  const title = mode === "event"
    ? `${event?.title || template?.title || "Mesaj"} metni`
    : template ? "Kayıtlı metni düzenle" : "Yeni kayıtlı metin";
  const modalDescription = description ?? (mode === "event" ? event?.detail : "Mesaj gönderirken “Hazır metin” listesinden seçilir.");
  const canReset = !viewOnly && canResetToDefault && Boolean(template?.isCustom && template.hasDefault);

  const validate = () => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (mode === "custom" && !form.title.trim()) next.title = "Metne kısa bir ad verin (ör. “Tatil duyurusu”).";
    if (!form.content.trim()) next.content = "Mesaj metni boş olamaz.";
    next.content = next.content || unsupportedPlaceholderError(form.content, tokens);
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, value]) => Boolean(value)));
    setErrors(cleaned);
    return Object.keys(cleaned).length === 0;
  };

  const saveText = async (): Promise<MessageTemplate> => {
    const code = template?.code || customTextCode(form.title, existingCodes);
    const content = toStoredText(form.content.trim());
    const titleToSave = mode === "custom" ? form.title.trim() : template?.title || event?.title || code;
    const response = await fetch("/api/sms/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        title: titleToSave,
        description: template?.description || undefined,
        category: template?.category || "GENERAL",
        content,
        // Tek metin: eski, ayrı WhatsApp metni ve Meta kalıp adı temizlenir.
        whatsappContent: canWriteWhatsapp ? "" : undefined,
        whatsappTemplateName: canWriteWhatsapp ? "" : undefined,
        // Metni kaydetmek "bu metin kullanılsın" demektir; eski bir "pasif"
        // işareti metni sessizce devre dışı bırakmasın.
        isActive: true,
      }),
    });
    const data = await response.json().catch(() => null) as Partial<MessageTemplate> | null;
    if (!response.ok) throw new Error(messageOf(data, "Metin kaydedilemedi."));
    // Liste ekranda hemen güncellensin (önceden tüm liste yeniden çekiliyor,
    // satır ~3 sn eski metni gösteriyordu). Hazır metne dönebilmek için
    // sistem metni de saklanır.
    return {
      code,
      title: data?.title || titleToSave,
      description: data?.description ?? template?.description ?? null,
      category: data?.category || template?.category || "GENERAL",
      content: data?.content || content,
      whatsappContent: data?.whatsappContent ?? null,
      whatsappTemplateName: data?.whatsappTemplateName ?? null,
      whatsappTemplateLanguage: data?.whatsappTemplateLanguage || "tr",
      isActive: data?.isActive ?? true,
      isCustom: true,
      hasDefault: template?.hasDefault ?? false,
      defaultTitle: template?.defaultTitle ?? (template && !template.isCustom ? template.title : undefined),
      defaultContent: template?.defaultContent ?? (template && !template.isCustom ? template.content : undefined),
      updatedAt: data?.updatedAt || new Date().toISOString(),
    };
  };

  const submit = async (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (viewOnly || !dirty) return;
    if (settingsError) return;
    if (textDirty && !validate()) return;
    setSaving(true);
    setSaveError("");
    try {
      if (settingsDirty && onSaveSettings) await onSaveSettings();
      if (textDirty) onSaved(await saveText());
      showToastSafe({
        message: mode === "event" ? "Kaydedildi. Bundan sonraki mesajlarda bu ayar kullanılır." : "Kayıtlı metin kaydedildi.",
        type: "success",
      });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    if (!template) return;
    const ok = await confirmDialog({
      title: "Hazır metne dönülsün mü?",
      message: `“${event?.title || template.defaultTitle || template.title}” için kliniğinize özel yazdığınız metin silinir; sistemin hazır metni kullanılır.`,
      confirmText: "Hazır metne dön",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    setResetting(true);
    setSaveError("");
    try {
      const response = await fetch(`/api/sms/templates?code=${encodeURIComponent(template.code)}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(data, "Hazır metne dönülemedi."));
      onReset?.({
        ...template,
        title: template.defaultTitle || template.title,
        content: template.defaultContent || template.content,
        isCustom: false,
      });
      showToastSafe({ message: "Hazır metne dönüldü.", type: "success" });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Hazır metne dönülemedi.");
    } finally {
      setResetting(false);
    }
  };

  if (viewOnly) {
    return (
      <Modal
        module="sms"
        open={open}
        onClose={onClose}
        title={mode === "event" ? title : template?.title || "Kayıtlı metin"}
        description={modalDescription}
        size="lg"
        trackFormChanges={false}
        footer={<Button variant="secondary" onClick={onClose}>Kapat</Button>}
      >
        <div className="space-y-4">
          {settings}
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-500">Hastaya giden metin</p>
            <p className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-800">
              {template ? renderSmsPreview(template.content, previewContext) : "—"}
            </p>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <FormModal
      module="sms"
      open={open}
      onClose={onClose}
      isDirty={dirty}
      title={title}
      description={modalDescription}
      size="lg"
      onSubmit={submit}
      submitting={saving}
      submitDisabled={!dirty || Boolean(settingsError) || resetting}
      error={saveError || null}
      footerExtra={canReset ? (
        <Button variant="ghost" icon={Undo2} loading={resetting} disabled={saving} onClick={() => void resetToDefault()}>
          Hazır metne dön
        </Button>
      ) : undefined}
    >
      {settings}
      {mode === "custom" && (
        <FormField label="Metnin adı" required error={errors.title} hint="Listede bu adla görünür; hastaya gitmez.">
          <Input value={form.title} maxLength={80} autoFocus onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ör. Bayram tatili duyurusu" />
        </FormField>
      )}
      <SmsMessageEditor
        value={form.content}
        onChange={(content) => {
          setForm({ ...form, content });
          if (errors.content) setErrors({ ...errors, content: undefined });
        }}
        placeholders={placeholders}
        previewContext={previewContext}
        previewWarning={previewWarning}
        previewMode="auto"
        label="Mesaj metni"
        hint={canWriteWhatsapp && whatsappConnected ? "WhatsApp bağlıyken aynı metin WhatsApp'tan gider." : ""}
        error={errors.content}
        maxLength={SMS_MAX}
      />
    </FormModal>
  );
}
