"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { FormModal } from "@/components/ui/FormModal";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Input";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { CONNECTION_ERROR, readApiError, type Announcement } from "./home-data";
import { shortDayLabel } from "./home-utils";
import { StaleNotice } from "./StaleNotice";

const MAX_TEXT = 2000;
const VISIBLE_COUNT = 3;

type Duration = "suresiz" | "1" | "7" | "30";
const DURATION_OPTIONS: Array<{ value: Duration; label: string }> = [
  { value: "suresiz", label: "Kaldırılana kadar" },
  { value: "1", label: "1 gün" },
  { value: "7", label: "1 hafta" },
  { value: "30", label: "1 ay" },
];

type AnnouncementsCardProps = {
  items: Announcement[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  update: (updater: (current: Announcement[] | null) => Announcement[] | null) => void;
  /** Duyuru ekleyebilir (yazma izni; sistem sahibinin görünmez oturumunda yazılamaz). */
  canCreate: boolean;
  /** Duyuruyu yayından kaldırabilir (yazma izni). */
  canRemove: boolean;
  todayKey: string | null;
  className?: string;
};

function AnnouncementFormModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (item: Announcement) => void }) {
  const [text, setText] = useState("");
  const [duration, setDuration] = useState<Duration>("suresiz");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);

  const close = () => {
    if (saving) return;
    setText("");
    setDuration("suresiz");
    setError(null);
    setFieldError(undefined);
    onClose();
  };

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setFieldError("Duyuru metnini yazın.");
      return;
    }
    setFieldError(undefined);
    setSaving(true);
    setError(null);
    try {
      const endsAt = duration === "suresiz" ? null : new Date(Date.now() + Number(duration) * 24 * 60 * 60 * 1000).toISOString();
      const response = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, endsAt }),
      });
      if (!response.ok) {
        setError(await readApiError(response, "Duyuru yayınlanamadı."));
        return;
      }
      const created = (await response.json()) as Announcement;
      onCreated(created);
      showToastSafe({ message: "Duyuru yayınlandı.", type: "success" });
      setText("");
      setDuration("suresiz");
      onClose();
    } catch {
      setError(CONNECTION_ERROR);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      open={open}
      onClose={close}
      title="Duyuru ekle"
      description="Kliniğin bütün personeli ana sayfada görür."
      submitLabel="Yayınla"
      submitting={saving}
      error={error}
      isDirty={Boolean(text.trim())}
      onSubmit={submit}
    >
      <FormField label="Duyuru metni" htmlFor="duyuru-metni" required error={fieldError} hint={`${text.length}/${MAX_TEXT}`}>
        <Textarea
          id="duyuru-metni"
          rows={4}
          maxLength={MAX_TEXT}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ör. Pazartesi 09:00–11:00 arası su kesintisi var."
        />
      </FormField>
      <ChoiceCards<Duration> label="Yayında kalsın" variant="pills" value={duration} onChange={setDuration} options={DURATION_OPTIONS} />
    </FormModal>
  );
}

/**
 * Duyurular: tek metin + yazan ve tarih. Önceden başlık metnin ":" öncesinden
 * kesiliyor ("Pazartesi 09"), aynı metin altında tekrar ediyordu; "Yeni"
 * etiketi her zaman yanıyor, "Tümünü Gör" aynı listeye çapa oluyordu, metin
 * kutusunda Enter'a basmak duyuruyu önizlemesiz herkese yayınlıyordu.
 */
export function AnnouncementsCard({ items, loading, error, onRetry, update, canCreate, canRemove, todayKey, className = "" }: AnnouncementsCardProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // Duyurusu olmayan ve ekleyemeyen kullanıcıda kart hiç çizilmez: kararı
  // sayfa verir (anasayfa/page.tsx `showAnnouncements`), mesaj kartı o zaman
  // satırı tek başına doldurur.

  const remove = async (item: Announcement) => {
    const confirmed = await confirmDialog({
      title: "Duyuru yayından kaldırılsın mı?",
      message: item.text.length > 140 ? `${item.text.slice(0, 140)}…` : item.text,
      confirmText: "Yayından kaldır",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (!confirmed) return;
    setRemovingId(item.id);
    try {
      const response = await fetch("/api/announcements", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      if (!response.ok) {
        showToastSafe({ title: "Duyuru kaldırılamadı", message: await readApiError(response, "Lütfen tekrar deneyin."), type: "error" });
        return;
      }
      update((current) => (current || []).filter((row) => row.id !== item.id));
      showToastSafe({ message: "Duyuru yayından kaldırıldı.", type: "success" });
    } catch {
      showToastSafe({ title: "Duyuru kaldırılamadı", message: CONNECTION_ERROR, type: "error" });
    } finally {
      setRemovingId(null);
    }
  };

  const list = items || [];
  const shown = showAll ? list : list.slice(0, VISIBLE_COUNT);

  return (
    <Section
      title="Duyurular"
      padding="none"
      className={className}
      actions={canCreate ? <Button size="sm" variant="ghost" icon={Plus} onClick={() => setFormOpen(true)}>Duyuru ekle</Button> : undefined}
    >
      {!items ? (
        error && !loading ? (
          <div className="p-3"><LoadErrorState compact message={error} onRetry={onRetry} /></div>
        ) : (
          <ListRowSkeleton variant="row" rows={2} />
        )
      ) : list.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500">Yayında duyuru yok.</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {shown.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-line break-words text-sm leading-5 text-slate-800">{item.text}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {[
                      item.createdByName,
                      todayKey ? shortDayLabel(item.createdAt, todayKey) : "",
                      item.endsAt && todayKey ? `${shortDayLabel(item.endsAt, todayKey)} tarihine kadar` : "",
                    ].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {canRemove && (
                  // "…" menüsü (ekip mesajlarıyla aynı): sağ kenardaki ipucu balonu sayfayı yatay kaydırmasın.
                  <ActionMenu
                    label="Duyuru işlemleri"
                    items={[{
                      key: "remove",
                      label: removingId === item.id ? "Kaldırılıyor…" : "Yayından kaldır",
                      icon: Trash2,
                      danger: true,
                      disabled: removingId === item.id,
                      onSelect: () => void remove(item),
                    }]}
                  />
                )}
              </li>
            ))}
          </ul>
          {list.length > VISIBLE_COUNT && (
            <div className="border-t border-slate-100 px-4 py-2">
              <Button size="sm" variant="ghost" onClick={() => setShowAll((value) => !value)}>
                {showAll ? "Daha az göster" : `Tümünü göster (${list.length})`}
              </Button>
            </div>
          )}
        </>
      )}
      {/* Yenileme başarısız: eldeki duyurular kalır, yalnız uyarı (önceden sessizce eski liste görünüyordu). */}
      {items && error && <StaleNotice onRetry={onRetry} busy={loading}>{error} Son yüklenen liste gösteriliyor.</StaleNotice>}
      {canCreate && (
        <AnnouncementFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onCreated={(created) => update((current) => [created, ...(current || [])])}
        />
      )}
    </Section>
  );
}
