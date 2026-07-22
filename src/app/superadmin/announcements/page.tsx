"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputErrorClass } from "@/components/ui/FormField";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";

type Institution = { id: string; name: string; isActive?: boolean; isDemo?: boolean };
type Announcement = {
  id: string;
  text: string;
  isActive: boolean;
  createdAt: string;
  endsAt?: string | null;
  institution?: { id: string; name: string; isDemo?: boolean } | null;
};

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const [targetMode, setTargetMode] = useState<"all" | "selected">("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedCount = useMemo(
    () => targetMode === "all" ? institutions.filter((i) => i.isActive !== false).length : selectedIds.length,
    [institutions, selectedIds.length, targetMode],
  );

  const load = async () => {
    setLoading(true);
    const [annRes, instRes] = await Promise.all([
      fetch("/api/superadmin/announcements").catch(() => null),
      fetch("/api/superadmin/institutions").catch(() => null),
    ]);
    const annData = await annRes?.json().catch(() => ({}));
    const instData = await instRes?.json().catch(() => []);
    setItems(Array.isArray(annData) ? annData : annData.announcements ?? []);
    setInstitutions(Array.isArray(instData) ? instData : []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const toggleInstitution = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  };

  const closeForm = () => {
    setShowForm(false);
    setText("");
    setSelectedIds([]);
    setTargetMode("all");
    setEndsAt("");
    setError("");
  };

  const handleSave = async () => {
    setError("");
    if (!text.trim()) {
      setError("Duyuru metni zorunlu.");
      return;
    }
    if (targetMode === "selected" && selectedIds.length === 0) {
      setError("En az bir kurum seçin.");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/superadmin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        allInstitutions: targetMode === "all",
        institutionIds: targetMode === "selected" ? selectedIds : [],
        endsAt: endsAt || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body.message || "Duyuru yayınlanamadı.";
      setError(msg);
      showToastSafe({ title: "Hata", message: msg, type: "error" });
      return;
    }

    showToastSafe({ title: "Yayınlandı", message: "Duyuru başarıyla yayınlandı", type: "success" });
    closeForm();
    await load();
  };

  const deactivate = async (id: string) => {
    const confirmed = await confirmDialog({
      title: "Duyuruyu pasifleştir",
      message: "Bu duyuru pasifleştirilecek ve kurumlara artık gösterilmeyecek. Emin misiniz?",
      confirmText: "Pasifleştir",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await fetch(`/api/superadmin/announcements?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      showToastSafe({ title: "Pasifleştirildi", message: "Duyuru pasife alındı", type: "success" });
      await load();
    } catch {
      showToastSafe({ title: "Hata", message: "Duyuru pasifleştirilemedi", type: "error" });
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bell className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-lg font-black text-slate-900">Kurum Duyuruları</h1>
            <p className="text-xs text-slate-500">Duyurular artık global değil; her kayıt hedef kurumla ilişkilidir.</p>
          </div>
        </div>
        <Button icon={Plus} onClick={() => setShowForm(true)}>Yeni Duyuru</Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse bg-slate-50" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-slate-400">Duyuru bulunamadı</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 p-4 transition hover:bg-slate-50/80">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">{item.institution?.name || "Kurum yok"}</span>
                    {item.institution?.isDemo && <Badge tone="warning">Demo</Badge>}
                    {!item.isActive && <Badge tone="neutral">Pasif</Badge>}
                  </div>
                  <p className="text-sm text-slate-600">{item.text}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(item.createdAt).toLocaleDateString("tr-TR")}
                    {item.endsAt ? ` - ${new Date(item.endsAt).toLocaleDateString("tr-TR")} tarihine kadar` : ""}
                  </p>
                </div>
                {item.isActive && (
                  <Button variant="secondary" size="sm" onClick={() => deactivate(item.id)}>
                    Pasifleştir
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={showForm}
        onClose={closeForm}
        title="Yeni Duyuru"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>İptal</Button>
            <Button onClick={handleSave} loading={saving}>Yayınla</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Duyuru Metni" required>
            <textarea
              className={`min-h-28 w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${inputErrorClass(false)}`}
              placeholder="Kurumlara gösterilecek duyuru metni..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </FormField>

          <div>
            <span className="mb-1 block text-sm font-bold text-slate-700">Hedef Kurumlar</span>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={targetMode === "all" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setTargetMode("all")}
              >
                Tüm aktif kurumlar
              </Button>
              <Button
                variant={targetMode === "selected" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setTargetMode("selected")}
              >
                Seçili kurumlar
              </Button>
            </div>
          </div>

          {targetMode === "selected" && (
            <div className="grid max-h-56 grid-cols-1 gap-2 overflow-auto rounded-xl border border-slate-100 p-3 md:grid-cols-2">
              {institutions.map((institution) => (
                <label key={institution.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(institution.id)}
                    onChange={() => toggleInstitution(institution.id)}
                  />
                  <span>{institution.name}</span>
                </label>
              ))}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Bitiş Tarihi">
              <input
                type="date"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${inputErrorClass(false)}`}
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </FormField>
            <div className="flex items-center rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">
              Hedef kurum sayısı: <strong className="ml-1">{selectedCount}</strong>
            </div>
          </div>

          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        </div>
      </Modal>
    </section>
  );
}
