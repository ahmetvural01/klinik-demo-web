"use client";

import { useEffect, useMemo, useState } from "react";

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
      setError(body.message || "Duyuru yayınlanamadı.");
      return;
    }

    setShowForm(false);
    setText("");
    setSelectedIds([]);
    setTargetMode("all");
    setEndsAt("");
    await load();
  };

  const deactivate = async (id: string) => {
    await fetch(`/api/superadmin/announcements?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Kurum Duyuruları</h2>
          <p className="mt-1 text-sm text-gray-500">Duyurular artık global değil; her kayıt hedef kurumla ilişkilidir.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Yeni Duyuru
        </button>
      </div>

      {showForm && (
        <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <textarea
            className="min-h-28 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Kurumlara gösterilecek duyuru metni..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTargetMode("all")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${targetMode === "all" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
            >
              Tüm aktif kurumlar
            </button>
            <button
              type="button"
              onClick={() => setTargetMode("selected")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${targetMode === "selected" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
            >
              Seçili kurumlar
            </button>
          </div>

          {targetMode === "selected" && (
            <div className="grid max-h-56 grid-cols-1 gap-2 overflow-auto rounded-lg border border-gray-100 p-3 md:grid-cols-2">
              {institutions.map((institution) => (
                <label key={institution.id} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
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
            <label className="text-sm font-medium text-gray-700">
              Bitiş tarihi
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </label>
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
              Hedef kurum sayısı: <strong>{selectedCount}</strong>
            </div>
          </div>

          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Yayınlanıyor..." : "Yayınla"}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">İptal</button>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400">Duyuru bulunamadı</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-4 p-4">
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900">{item.institution?.name || "Kurum yok"}</span>
                  {item.institution?.isDemo && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Demo</span>}
                  {!item.isActive && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">Pasif</span>}
                </div>
                <p className="text-sm text-gray-600">{item.text}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {new Date(item.createdAt).toLocaleDateString("tr-TR")}
                  {item.endsAt ? ` - ${new Date(item.endsAt).toLocaleDateString("tr-TR")} tarihine kadar` : ""}
                </p>
              </div>
              {item.isActive && (
                <button onClick={() => deactivate(item.id)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                  Pasifleştir
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
