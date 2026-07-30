"use client";

import { useEffect, useState } from "react";
import { Pencil, PlusCircle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { confirmDialog } from "@/lib/confirm-client";
import { SmsMessageEditor } from "@/components/sms/SmsMessageEditor";
import { showToastSafe } from "@/lib/toast-client";
import { SMS_PLACEHOLDERS, renderSmsPreview, toReadableText, toStoredText } from "@/lib/sms-template-placeholders";
import { PROFESSIONS } from "@/lib/professions";

type CelebrationDay = {
  id: string;
  code: string;
  title: string;
  month: number;
  day: number;
  targetProfessions: string[];
  messageTemplate: string;
  isActive: boolean;
};

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const emptyForm = { code: "", title: "", month: 1, day: 1, targetProfessions: [] as string[], messageTemplate: "", isActive: true };

function formatDate(month: number, day: number) {
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}`;
}

export default function CelebrationDaysTab() {
  const [days, setDays] = useState<CelebrationDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CelebrationDay | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/superadmin/celebration-days")
      .then((r) => r.json())
      .then((d) => setDays(Array.isArray(d) ? d : []))
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (d: CelebrationDay) => {
    setEditing(d);
    setForm({ code: d.code, title: d.title, month: d.month, day: d.day, targetProfessions: d.targetProfessions, messageTemplate: toReadableText(d.messageTemplate), isActive: d.isActive });
    setShowForm(true);
  };

  const toggleProfession = (p: string) => {
    setForm((f) => ({
      ...f,
      targetProfessions: f.targetProfessions.includes(p) ? f.targetProfessions.filter((x) => x !== p) : [...f.targetProfessions, p],
    }));
  };

  const submit = async () => {
    if (!form.title.trim() || !form.messageTemplate.trim() || (!editing && !form.code.trim())) {
      showToastSafe({ title: "Eksik alan", message: "Kod, başlık ve mesaj içeriği zorunlu", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const storedMessage = toStoredText(form.messageTemplate);
      const res = await fetch("/api/superadmin/celebration-days", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? { id: editing.id, title: form.title, month: form.month, day: form.day, targetProfessions: form.targetProfessions, messageTemplate: storedMessage, isActive: form.isActive }
            : { code: form.code.toUpperCase(), title: form.title, month: form.month, day: form.day, targetProfessions: form.targetProfessions, messageTemplate: storedMessage, isActive: form.isActive }
        ),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Kaydedilemedi");
      showToastSafe({ title: "Kaydedildi", message: `${d.title} kaydedildi`, type: "success" });
      setShowForm(false);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d: CelebrationDay) => {
    if (!(await confirmDialog({ message: `"${d.title}" kalıcı olarak silinsin mi? Bu günü açmış olan kliniklerde de artık gönderilmez.`, danger: true, confirmText: "Sil" }))) return;
    try {
      const res = await fetch(`/api/superadmin/celebration-days?id=${d.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Silinemedi");
      showToastSafe({ message: "Silindi", type: "success" });
      load();
    } catch (e) {
      showToastSafe({ message: e instanceof Error ? e.message : "Silinemedi", type: "error" });
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Bu liste tüm klinikler için ortak bir kataloğu oluşturur. Her klinik kendi Ayarlar &gt; SMS &gt; Kutlama Günleri
          ekranından bu listedeki günlerden hangilerinin kendi hastalarına otomatik gönderileceğine ayrı ayrı karar verir
          — burada eklemek hiçbir kliniğe otomatik SMS göndermeye başlamaz.
        </p>
        <Button icon={PlusCircle} size="sm" onClick={openCreate}>Yeni Gün</Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse bg-slate-50" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
        ) : days.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-slate-400">Henüz kutlama günü tanımlanmamış</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {days.map((d) => (
              <div key={d.id} className="p-4 transition hover:bg-slate-50/80">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold text-slate-600">{formatDate(d.month, d.day)}</span>
                      <span className="font-bold text-slate-900">{d.title}</span>
                      {!d.isActive && <Badge tone="neutral">Pasif</Badge>}
                      {d.targetProfessions.length === 0 ? (
                        <Badge tone="info">Tüm hastalar</Badge>
                      ) : (
                        d.targetProfessions.map((p) => <Badge key={p} tone="success">{p}</Badge>)
                      )}
                    </div>
                    <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">{renderSmsPreview(d.messageTemplate, { title: d.title })}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <IconButton icon={Pencil} title="Düzenle" tone="neutral" onClick={() => openEdit(d)} />
                    <IconButton icon={Trash2} title="Sil" tone="danger" onClick={() => remove(d)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? `Düzenle: ${editing.title}` : "Yeni Kutlama Günü"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>İptal</Button>
            <Button loading={saving} onClick={submit}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Başlık" required hint="Örn. Tıp Bayramı, Öğretmenler Günü, Yılbaşı">
            <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </FormField>
          {!editing && (
            <FormField label="Kod" required hint="Sistem içi kısa tanımlayıcı, sonradan değiştirilemez — örn. TIP_BAYRAMI">
              <input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </FormField>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Ay" required>
              <select className={inputClass} value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </FormField>
            <FormField label="Gün" required>
              <select className={inputClass} value={form.day} onChange={(e) => setForm({ ...form, day: Number(e.target.value) })}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Hedef Meslekler" hint="Hiçbiri seçilmezse resmi bayram gibi TÜM hastalara gönderilir. Seçilirse yalnızca meslek alanı bunlardan biri olan hastalara gönderilir.">
            <div className="flex flex-wrap gap-1.5">
              {PROFESSIONS.filter((p) => p !== "Diğer").map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => toggleProfession(p)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                    form.targetProfessions.includes(p) ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </FormField>
          <SmsMessageEditor
            value={form.messageTemplate}
            onChange={(messageTemplate) => setForm({ ...form, messageTemplate })}
            placeholders={SMS_PLACEHOLDERS}
          />
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded border-slate-300 text-primary focus:ring-primary/30"
            />
            <span className="text-sm text-slate-700">Aktif (pasifse hiçbir klinikte gönderilmez)</span>
          </label>
        </div>
      </Modal>
    </section>
  );
}
