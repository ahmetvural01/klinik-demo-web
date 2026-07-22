"use client";

import { useEffect, useState } from "react";
import { Headset } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { showToastSafe } from "@/lib/toast-client";

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

const STATUS_LABEL: Record<string, string> = { ALL: "Tümü", OPEN: "Açık", IN_PROGRESS: "İşlemde", CLOSED: "Kapalı" };

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
    try {
      const res = await fetch(`/api/superadmin/support/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Güncellenemedi");
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    }
  };

  const filtered = filter === "ALL" ? tickets : tickets.filter((t) => t.status === filter);

  const statusTone = (status: string): "info" | "warning" | "neutral" =>
    status === "OPEN" ? "info" : status === "IN_PROGRESS" ? "warning" : "neutral";

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">Destek Talepleri</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{tickets.length} talep</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {["ALL", "OPEN", "IN_PROGRESS", "CLOSED"].map((s) => (
          <Button
            key={s}
            variant={filter === s ? "primary" : "secondary"}
            size="sm"
            onClick={() => setFilter(s)}
          >
            {STATUS_LABEL[s]}
          </Button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Headset className="mb-2 h-10 w-10 text-slate-200" />
            <p className="text-sm">Talep bulunamadı</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((t) => (
              <div key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{t.subject}</span>
                      <Badge tone={statusTone(t.status)}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
                    </div>
                    <p className="mb-1 text-sm text-slate-600">{t.message}</p>
                    <p className="text-xs text-slate-400">
                      {t.user?.fullName ?? "—"} · {t.institution?.name ?? "—"} ·{" "}
                      {new Date(t.createdAt).toLocaleDateString("tr-TR")}
                    </p>
                  </div>
                  {t.status !== "CLOSED" && (
                    <div className="flex shrink-0 gap-1">
                      {t.status === "OPEN" && (
                        <Button variant="secondary" size="sm" onClick={() => updateStatus(t.id, "IN_PROGRESS")}>
                          Al
                        </Button>
                      )}
                      <Button variant="primary" size="sm" onClick={() => updateStatus(t.id, "CLOSED")}>
                        Kapat
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
