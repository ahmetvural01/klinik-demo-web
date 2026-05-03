"use client";

import { useEffect, useState } from "react";

type Ticket = {
  id: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  institution?: { name: string };
  user?: { fullName: string };
  createdAt: string;
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");

  const load = () => {
    setLoading(true);
    fetch("/api/superadmin/support")
      .then((r) => r.json())
      .then((d) => setTickets(Array.isArray(d) ? d : d.tickets ?? []))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/superadmin/support/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const filtered = filter === "ALL" ? tickets : tickets.filter((t) => t.status === filter);

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🎧</span>
        <h2 className="text-2xl font-bold text-gray-900">Destek Talepleri</h2>
      </div>

      <div className="flex gap-2">
        {["ALL", "OPEN", "IN_PROGRESS", "CLOSED"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === s
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {s === "ALL" ? "Tümü" : s === "OPEN" ? "Açık" : s === "IN_PROGRESS" ? "İşlemde" : "Kapalı"}
            {s === "ALL" && <span className="ml-1 text-xs opacity-70">({tickets.length})</span>}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 divide-y divide-gray-100">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400">Talep bulunamadı</div>
        ) : (
          filtered.map((t) => (
            <div key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">{t.subject}</span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        t.status === "OPEN"
                          ? "bg-blue-100 text-blue-700"
                          : t.status === "IN_PROGRESS"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {t.status === "OPEN" ? "Açık" : t.status === "IN_PROGRESS" ? "İşlemde" : "Kapalı"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">{t.message}</p>
                  <p className="text-xs text-gray-400">
                    {t.user?.fullName ?? "—"} · {t.institution?.name ?? "—"} ·{" "}
                    {new Date(t.createdAt).toLocaleDateString("tr-TR")}
                  </p>
                </div>
                {t.status !== "CLOSED" && (
                  <div className="flex gap-1 shrink-0">
                    {t.status === "OPEN" && (
                      <button
                        onClick={() => updateStatus(t.id, "IN_PROGRESS")}
                        className="rounded-lg bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-700 hover:bg-yellow-100"
                      >
                        Al
                      </button>
                    )}
                    <button
                      onClick={() => updateStatus(t.id, "CLOSED")}
                      className="rounded-lg bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-100"
                    >
                      Kapat
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
