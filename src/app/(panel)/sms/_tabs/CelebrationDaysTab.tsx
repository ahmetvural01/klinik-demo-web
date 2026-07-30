"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { showToastSafe } from "@/lib/toast-client";

type CelebrationDayRow = {
  code: string;
  title: string;
  month: number;
  day: number;
  targetProfessions: string[];
  enabled: boolean;
};

function formatDate(month: number, day: number) {
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}`;
}

export default function CelebrationDaysTab() {
  const [days, setDays] = useState<CelebrationDayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/celebration-days")
      .then((r) => r.json())
      .then((d) => setDays(Array.isArray(d?.days) ? d.days : []))
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = async (row: CelebrationDayRow) => {
    setSavingCode(row.code);
    const nextEnabled = !row.enabled;
    try {
      const res = await fetch(`/api/celebration-days/${row.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Güncellenemedi");
      }
      setDays((prev) => prev.map((d) => (d.code === row.code ? { ...d, enabled: nextEnabled } : d)));
      showToastSafe({ message: nextEnabled ? `"${row.title}" açıldı` : `"${row.title}" kapatıldı`, type: "success" });
    } catch (e) {
      showToastSafe({ message: e instanceof Error ? e.message : "Güncellenemedi", type: "error" });
    } finally {
      setSavingCode(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <h1 className="text-lg font-black text-slate-900">Kutlama Günleri</h1>
        <p className="mt-1 text-sm text-slate-500">
          Süperadmin&apos;in tanımladığı meslek günü/resmi bayram kutlamalarından hangilerinin hastalarınıza otomatik
          gönderileceğine burada karar verirsiniz. Meslek bazlı olanlar yalnızca meslek alanı eşleşen hastalara, &quot;Tüm
          hastalar&quot; etiketli olanlar (resmi bayram gibi) tüm hastalarınıza gider. Varsayılan olarak hepsi kapalıdır.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse bg-slate-50" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
        ) : days.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-slate-400">Henüz kutlama günü tanımlanmamış</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {days.map((d) => (
              <div key={d.code} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold text-slate-600">{formatDate(d.month, d.day)}</span>
                    <span className="font-bold text-slate-900">{d.title}</span>
                    {d.targetProfessions.length === 0 ? (
                      <Badge tone="info">Tüm hastalar</Badge>
                    ) : (
                      d.targetProfessions.map((p) => <Badge key={p} tone="success">{p}</Badge>)
                    )}
                  </div>
                </div>
                <Button
                  variant={d.enabled ? "primary" : "secondary"}
                  size="sm"
                  loading={savingCode === d.code}
                  onClick={() => void toggle(d)}
                >
                  {d.enabled ? "Açık" : "Kapalı"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
