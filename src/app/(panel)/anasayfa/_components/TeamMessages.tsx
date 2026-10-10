"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Pencil, Send, Trash2 } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { roleLabel } from "@/lib/staff-roles";
import { scopedStorageKey } from "@/lib/scoped-client-storage";
import { CONNECTION_ERROR, readApiError, type TeamMessage } from "./home-data";
import { messageTimeLabel } from "./home-utils";
import { StaleNotice } from "./StaleNotice";

const MAX_TEXT = 1000;
/** Bağlantı çapası: src/lib/routes.ts → teamMessages() ("/anasayfa#ekip-mesajlari"). */
const ANCHOR_ID = "ekip-mesajlari";

type TeamMessagesProps = {
  messages: TeamMessage[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  update: (updater: (current: TeamMessage[] | null) => TeamMessage[] | null) => void;
  /** Mesaj yazabilir (yazma izni; sistem sahibinin görünmez oturumunda yazılamaz). */
  canSend: boolean;
  ghost: boolean;
  viewerId: string | null;
  scopeKey: string;
  todayKey: string | null;
  className?: string;
};

function readLastSeen(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    const time = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  } catch {
    return 0;
  }
}

/**
 * Ekip mesajları (şube içi). Düzenle/Sil yalnız sunucunun izin verdiği
 * mesajda (kendi mesajı ya da yönetici) "…" menüsünde. Okundu bilgisi kart
 * ekranda görününce işlenir — önceden sayfa açılır açılmaz, mesajlar sayfanın
 * en altında görünmeden menüdeki rozet sıfırlanıyordu. Mesaj metni tarayıcı
 * deposuna yazılmaz.
 */
export function TeamMessages({ messages, loading, error, onRetry, update, canSend, ghost, viewerId, scopeKey, todayKey, className = "" }: TeamMessagesProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [inView, setInView] = useState(false);
  // Sayfa açıldığında okunmuş sayılan son an: bundan yeni mesajlar bu oturumda "yeni" işaretli kalır.
  const [seenBefore, setSeenBefore] = useState<number | null>(null);
  const lastSeenKey = scopedStorageKey("clinic-messages-last-seen", scopeKey);
  // Düzenleme alanı açılınca (yalnız bir kez) kaydırmalı listede görünür alana gelir.
  const revealEditArea = useCallback((element: HTMLDivElement | null) => {
    element?.scrollIntoView({ block: "nearest" });
  }, []);
  const unreadKey = scopedStorageKey("clinic-unread-messages", scopeKey);

  useEffect(() => {
    setSeenBefore(readLastSeen(lastSeenKey));
  }, [lastSeenKey]);

  useEffect(() => {
    const element = listRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { threshold: 0.3 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Okundu: kart ekranda görününce en yeni mesajın zamanı kaydedilir; menü
  // rozeti (okunmamış ekip mesajı, sunucudan sayılır) bu andan sonrasını sayar.
  // Görünmezken hiçbir şey yazılmaz — gereksiz rozet yenilemesi tetiklenmez.
  const newestAt = messages?.[messages.length - 1]?.createdAt;
  useEffect(() => {
    if (!inView || !newestAt) return;
    try {
      const stored = localStorage.getItem(lastSeenKey);
      if (stored && new Date(stored).getTime() >= new Date(newestAt).getTime()) return;
      localStorage.setItem(lastSeenKey, newestAt);
      localStorage.setItem(unreadKey, "0");
      window.dispatchEvent(new Event("clinic-unread-messages-change"));
    } catch {
      // Tarayıcı deposu kapalıysa rozet güncellenmez; mesajlar yine görünür.
    }
  }, [inView, lastSeenKey, newestAt, unreadKey]);

  // Yeni mesaj gelince liste sona kayar (kullanıcı yukarıda eski mesaj okumuyorsa).
  const lastMessageId = messages?.[messages.length - 1]?.id;
  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    if (nearBottom || element.dataset.scrolled !== "1") {
      element.scrollTop = element.scrollHeight;
      element.dataset.scrolled = "1";
    }
  }, [lastMessageId]);

  // Üst bar zilindeki "ekip mesajı" satırı /anasayfa#ekip-mesajlari adresine gelir:
  // diğer bölümler yüklenip sayfa uzayınca da kart görünür alana getirilir.
  const [hashRequested, setHashRequested] = useState(false);
  useEffect(() => {
    const check = () => {
      if (window.location.hash === `#${ANCHOR_ID}`) setHashRequested(true);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);
  const messagesLoaded = messages !== null;
  useEffect(() => {
    if (!hashRequested || !messagesLoaded) return;
    setHashRequested(false);
    document.getElementById(ANCHOR_ID)?.scrollIntoView({ block: "start" });
  }, [hashRequested, messagesLoaded]);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!response.ok) {
        showToastSafe({ title: "Mesaj gönderilemedi", message: await readApiError(response, "Lütfen tekrar deneyin."), type: "error" });
        return;
      }
      const created = (await response.json()) as TeamMessage;
      update((current) => [...(current || []), created]);
      setText("");
      if (listRef.current) listRef.current.dataset.scrolled = "0";
    } catch {
      showToastSafe({ title: "Mesaj gönderilemedi", message: CONNECTION_ERROR, type: "error" });
    } finally {
      setSending(false);
    }
  };

  const startEdit = (message: TeamMessage) => {
    setEditingId(message.id);
    setEditingText(message.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const saveEdit = async () => {
    const trimmed = editingText.trim();
    if (!editingId || !trimmed || savingEdit) return;
    setSavingEdit(true);
    try {
      const response = await fetch(`/api/messages/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!response.ok) {
        showToastSafe({ title: "Mesaj güncellenemedi", message: await readApiError(response, "Lütfen tekrar deneyin."), type: "error" });
        return;
      }
      const updated = (await response.json()) as TeamMessage;
      update((current) => (current || []).map((message) => (message.id === updated.id ? { ...message, ...updated } : message)));
      cancelEdit();
    } catch {
      showToastSafe({ title: "Mesaj güncellenemedi", message: CONNECTION_ERROR, type: "error" });
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (message: TeamMessage) => {
    const confirmed = await confirmDialog({
      title: "Mesaj silinsin mi?",
      message: "Mesaj kalıcı olarak silinir; geri alınamaz.",
      confirmText: "Sil",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/messages/${message.id}`, { method: "DELETE" });
      if (!response.ok) {
        showToastSafe({ title: "Mesaj silinemedi", message: await readApiError(response, "Lütfen tekrar deneyin."), type: "error" });
        return;
      }
      update((current) => (current || []).filter((row) => row.id !== message.id));
      if (editingId === message.id) cancelEdit();
    } catch {
      showToastSafe({ title: "Mesaj silinemedi", message: CONNECTION_ERROR, type: "error" });
    }
  };

  // Enter kaydeder (Shift+Enter yeni satır), Esc vazgeçer.
  const onEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void saveEdit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  };

  return (
    <Section id={ANCHOR_ID} title="Ekip mesajları" padding="none" className={className}>
      <div ref={listRef} className="max-h-80 overflow-y-auto overscroll-contain">
        {!messages ? (
          error && !loading ? (
            <div className="p-3"><LoadErrorState compact message={error} onRetry={onRetry} /></div>
          ) : (
            <ListRowSkeleton variant="row" leading="avatar" rows={3} />
          )
        ) : messages.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">Henüz mesaj yok.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {messages.map((message) => {
              const isNew = seenBefore !== null && viewerId !== null && message.userId !== viewerId && new Date(message.createdAt).getTime() > seenBefore;
              const editing = editingId === message.id;
              return (
                <li key={message.id} className={`flex items-start gap-3 px-4 py-3 ${isNew ? "bg-primary/[0.04]" : ""}`}>
                  <Avatar name={message.user?.fullName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
                      <span className="text-sm font-semibold text-slate-800">{message.user?.fullName || "Personel"}</span>
                      <span>{roleLabel(message.user?.role)}</span>
                      <span className="tabular-nums">{todayKey ? messageTimeLabel(message.createdAt, todayKey) : ""}</span>
                      {isNew && <span className="font-semibold text-primary">Yeni</span>}
                    </p>
                    {editing ? (
                      <div className="mt-1.5 space-y-2" ref={revealEditArea}>
                        <Textarea
                          rows={2}
                          aria-label="Mesajı düzenle"
                          value={editingText}
                          maxLength={MAX_TEXT}
                          autoFocus
                          onChange={(event) => setEditingText(event.target.value)}
                          onKeyDown={onEditKeyDown}
                          className="w-full text-sm"
                        />
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="secondary" loading={savingEdit} disabled={!editingText.trim()} onClick={() => void saveEdit()}>Kaydet</Button>
                          <Button size="sm" variant="ghost" onClick={cancelEdit}>Vazgeç</Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-0.5 whitespace-pre-line break-words text-sm leading-5 text-slate-700">{message.text}</p>
                    )}
                  </div>
                  {message.canEdit && !editing && (
                    <ActionMenu
                      label="Mesaj işlemleri"
                      items={[
                        { key: "edit", label: "Düzenle", icon: Pencil, onSelect: () => startEdit(message) },
                        { key: "delete", label: "Sil", icon: Trash2, danger: true, onSelect: () => void remove(message) },
                      ]}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {messages && error && (
        <StaleNotice onRetry={onRetry} busy={loading}>{error} Son yüklenen liste gösteriliyor.</StaleNotice>
      )}
      {canSend ? (
        <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-3">
          <Input
            aria-label="Ekibe mesaj yazın"
            placeholder="Ekibe mesaj yazın"
            value={text}
            maxLength={MAX_TEXT}
            onChange={(event) => setText(event.target.value)}
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="secondary" icon={Send} loading={sending} disabled={!text.trim()}>Gönder</Button>
        </form>
      ) : ghost ? (
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">Sistem sahibi oturumunda ekip mesajı yazılamaz.</p>
      ) : null}
    </Section>
  );
}
