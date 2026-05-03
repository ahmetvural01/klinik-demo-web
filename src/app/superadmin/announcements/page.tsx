"use client";

import { useEffect, useState } from "react";

type Announcement = {
  id: string;
  title: string;
  content: string;
  priority: string;
  isActive: boolean;
  createdAt: string;
};

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", priority: "NORMAL" });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/superadmin/announcements")
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : d.announcements ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.title || !form.content) return;
    setSaving(true);
    await fetch("/api/superadmin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ title: "", content: "", priority: "NORMAL" });
    load();
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">📢</span>
          <h2 className="text-2xl font-bold text-gray-900">Duyurular</h2>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Yeni Duyuru
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">Yeni Duyuru</h3>
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Başlık"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <textarea
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            rows={3}
            placeholder="İçerik..."
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
          <select
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
          >
            <option value="LOW">Düşük</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">Yüksek</option>
            <option value="URGENT">Acil</option>
          </select>
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

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 divide-y divide-gray-100">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400">Duyuru bulunamadı</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-gray-900">{item.title}</span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                    item.priority === "URGENT"
                      ? "bg-red-100 text-red-700"
                      : item.priority === "HIGH"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {item.priority}
                </span>
                {!item.isActive && (
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">Pasif</span>
                )}
              </div>
              <p className="text-sm text-gray-600">{item.content}</p>
              <p className="text-xs text-gray-400 mt-1">{new Date(item.createdAt).toLocaleDateString("tr-TR")}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
