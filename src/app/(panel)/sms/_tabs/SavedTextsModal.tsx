"use client";

import { useState } from "react";
import { PenSquare, PlusCircle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SettingsList, SettingsRow } from "@/components/ui/SettingsList";
import { MessageTextModal } from "@/components/sms/MessageTextModal";
import type { MessageTemplate } from "@/components/sms/communication-status";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { renderSmsPreview } from "@/lib/sms-template-placeholders";

type SavedTextsModalProps = {
  open: boolean;
  onClose: () => void;
  texts: MessageTemplate[];
  allCodes: Set<string>;
  canWriteSms: boolean;
  canWriteWhatsapp: boolean;
  whatsappConnected: boolean;
  /** Silme/hazır metne dönme hem SMS hem WhatsApp düzenleme yetkisi ister (api/sms/templates DELETE). */
  canDelete: boolean;
  previewContext: Partial<Record<string, string>>;
  /** Eklenen/düzenlenen ya da hazır metne dönen metin — liste beklemeden güncellenir. */
  onSaved: (template: MessageTemplate) => void;
  /** Silinen kliniğe özel metin. */
  onRemoved: (code: string) => void;
};

/**
 * Mesaj gönder'de seçilebilen kayıtlı metinlerin yönetimi (ekle, düzenle, sil).
 * Kliniğin değiştirdiği sistem metni ("Genel bilgilendirme") silinmez; düzenleme
 * penceresinde "Hazır metne dön" ile eski haline döner.
 */
export function SavedTextsModal({ open, onClose, texts, allCodes, canWriteSms, canWriteWhatsapp, whatsappConnected, canDelete, previewContext, onSaved, onRemoved }: SavedTextsModalProps) {
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const remove = async (text: MessageTemplate) => {
    const ok = await confirmDialog({
      title: "Kayıtlı metin silinsin mi?",
      message: `“${text.title}” kalıcı olarak silinir. Daha önce gönderilmiş mesajlar etkilenmez.`,
      confirmText: "Sil",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (!ok) return;
    setBusyCode(text.code);
    try {
      const response = await fetch(`/api/sms/templates?code=${encodeURIComponent(text.code)}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Silinemedi.");
      onRemoved(text.code);
      showToastSafe({ message: "Kayıtlı metin silindi.", type: "success" });
    } catch (error) {
      showToastSafe({ message: error instanceof Error ? error.message : "Silinemedi.", type: "error" });
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <>
      <Modal
        module="sms"
        open={open && !editing && !creating}
        onClose={onClose}
        title="Kayıtlı metinler"
        description="Mesaj gönderirken “Hazır metin” listesinden seçilir."
        size="lg"
        trackFormChanges={false}
        footer={(
          <>
            <Button variant="secondary" onClick={onClose}>Kapat</Button>
            {canWriteSms && <Button icon={PlusCircle} onClick={() => setCreating(true)}>Yeni kayıtlı metin</Button>}
          </>
        )}
      >
        {texts.length === 0 ? (
          <EmptyState compact title="Henüz kayıtlı metin yok" description="Mesaj yazarken “Bu metni kaydet” ile ya da aşağıdaki düğmeyle ekleyebilirsiniz." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <SettingsList aria-label="Kayıtlı metinler">
              {texts.map((text) => (
                <SettingsRow
                  key={text.code}
                  title={text.title}
                  status={text.isCustom && text.hasDefault ? <Badge tone="neutral">Değiştirildi</Badge> : undefined}
                  description={<span className="line-clamp-1 break-words">{renderSmsPreview(text.content, previewContext)}</span>}
                  actions={(
                    <>
                      <IconButton icon={PenSquare} size="sm" title={canWriteSms ? "Düzenle" : "Metni gör"} onClick={() => setEditing(text)} />
                      {canDelete && text.isCustom && !text.hasDefault && (
                        <IconButton icon={Trash2} size="sm" tone="danger" title="Sil" disabled={busyCode === text.code} onClick={() => void remove(text)} />
                      )}
                    </>
                  )}
                />
              ))}
            </SettingsList>
          </div>
        )}
      </Modal>
      <MessageTextModal
        open={Boolean(editing) || creating}
        onClose={() => { setEditing(null); setCreating(false); }}
        mode="custom"
        template={editing}
        existingCodes={allCodes}
        canWriteSms={canWriteSms}
        canWriteWhatsapp={canWriteWhatsapp}
        whatsappConnected={whatsappConnected}
        previewContext={previewContext}
        readOnly={!canWriteSms}
        canResetToDefault={canDelete}
        onSaved={(saved) => { if (saved) onSaved(saved); }}
        onReset={onSaved}
      />
    </>
  );
}
