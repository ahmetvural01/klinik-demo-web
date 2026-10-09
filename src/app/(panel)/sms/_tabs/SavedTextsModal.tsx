"use client";

import { useState } from "react";
import { PenSquare, PlusCircle, Trash2, Undo2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
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
  /** Silme/varsayılana dönme hem SMS hem WhatsApp düzenleme yetkisi ister (api/sms/templates DELETE). */
  canDelete: boolean;
  previewContext: Partial<Record<string, string>>;
  onChanged: () => void;
};

/** Mesaj Gönder'de seçilebilen kayıtlı metinlerin yönetimi (ekle, düzenle, sil). */
export function SavedTextsModal({ open, onClose, texts, allCodes, canWriteSms, canWriteWhatsapp, whatsappConnected, canDelete, previewContext, onChanged }: SavedTextsModalProps) {
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const remove = async (text: MessageTemplate) => {
    const resetsToDefault = text.hasDefault;
    const ok = await confirmDialog({
      title: resetsToDefault ? "Varsayılan metne dönülsün mü?" : "Kayıtlı metin silinsin mi?",
      message: resetsToDefault
        ? `“${text.defaultTitle || text.title}” için yaptığınız değişiklik silinir, sistemin hazır metni kullanılır.`
        : `“${text.title}” kalıcı olarak silinir. Daha önce gönderilmiş mesajlar etkilenmez.`,
      confirmText: resetsToDefault ? "Varsayılana dön" : "Sil",
      cancelText: "Vazgeç",
      danger: !resetsToDefault,
    });
    if (!ok) return;
    setBusyCode(text.code);
    try {
      const response = await fetch(`/api/sms/templates?code=${encodeURIComponent(text.code)}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "İşlem tamamlanamadı.");
      showToastSafe({ message: resetsToDefault ? "Hazır metne dönüldü." : "Kayıtlı metin silindi.", type: "success" });
      onChanged();
    } catch (error) {
      showToastSafe({ message: error instanceof Error ? error.message : "İşlem tamamlanamadı.", type: "error" });
    } finally {
      setBusyCode(null);
    }
  };

  const columns: ListTableColumn<MessageTemplate>[] = [
    {
      key: "title",
      header: "Metin",
      render: (text) => (
        <span className="block min-w-0">
          <span className="block font-semibold text-slate-900">{text.title}</span>
          <span className="line-clamp-2 text-xs text-slate-500">{renderSmsPreview(text.content, previewContext)}</span>
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (text) => (
        <span className="inline-flex gap-1">
          {canWriteSms && <IconButton icon={PenSquare} title="Düzenle" onClick={() => setEditing(text)} />}
          {canDelete && (text.isCustom) && (
            <IconButton
              icon={text.hasDefault ? Undo2 : Trash2}
              title={text.hasDefault ? "Hazır metne dön" : "Sil"}
              tone={text.hasDefault ? "neutral" : "danger"}
              disabled={busyCode === text.code}
              onClick={() => void remove(text)}
            />
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <Modal
        module="sms"
        open={open && !editing && !creating}
        onClose={onClose}
        title="Kayıtlı metinler"
        description="Sık gönderdiğiniz duyuru ve bilgilendirme metinleri. Mesaj Gönder'de “Hazır metin” listesinden seçilir."
        size="lg"
        trackFormChanges={false}
        footer={(
          <>
            <Button variant="secondary" onClick={onClose}>Kapat</Button>
            {canWriteSms && <Button icon={PlusCircle} onClick={() => setCreating(true)}>Yeni kayıtlı metin</Button>}
          </>
        )}
      >
        <ListTable<MessageTemplate>
          columns={columns}
          rows={texts}
          rowKey={(text) => text.code}
          emptyText="Henüz kayıtlı metin yok"
          emptyDescription="Mesaj yazarken “Bu metni kaydet” ile ya da aşağıdaki düğmeyle ekleyebilirsiniz."
        />
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
        onSaved={onChanged}
      />
    </>
  );
}
