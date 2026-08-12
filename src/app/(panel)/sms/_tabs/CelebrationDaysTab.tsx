"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { showToastSafe } from "@/lib/toast-client";
import { BriefcaseBusiness, CalendarDays, Globe2, MessageCircle } from "lucide-react";

type CelebrationDayRow = {
  code: string;
  title: string;
  month: number;
  day: number;
  category: string;
  recurrenceRule: string;
  weekOfMonth: number | null;
  weekday: number | null;
  dateOverrides: string[];
  targetProfessions: string[];
  messageTemplate: string;
  whatsappMessageTemplate: string | null;
  enabled: boolean;
};

function formatDate(month: number, day: number) {
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}`;
}

function formatRule(row: CelebrationDayRow) {
  if (row.recurrenceRule === "DATE_OVERRIDES") return row.dateOverrides.find((date) => date.startsWith(`${new Date().getFullYear()}-`))?.split("-").reverse().join(".") || "Takvime göre";
  if (row.recurrenceRule === "NTH_WEEKDAY") return `${row.month}. ayın ${row.weekOfMonth}. haftası`;
  return formatDate(row.month, row.day);
}

export default function CelebrationDaysTab({ readOnly = false }: { readOnly?: boolean }) {
  const [days, setDays] = useState<CelebrationDayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/celebration-days", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Özel günler yüklenemedi.");
      setDays(Array.isArray(data?.days) ? data.days : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Özel günler yüklenemedi.");
    } finally {
      setLoading(false);
    }
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
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-rose-50 text-rose-600"><CalendarDays className="h-5 w-5" /></span><div><h1 className="text-lg font-black text-slate-900">Özel Gün Otomasyonları</h1>
        <p className="mt-1 text-sm text-slate-500">
          Açılan günler uygun hastalara otomatik gider. Kapalı günler Toplu Gönderim kataloğunda manuel kullanıma devam eder.
        </p>
        </div></div>
      </div>

      <div>
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse bg-slate-50" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
        ) : loadError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            <span>{loadError}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>Yeniden Dene</Button>
          </div>
        ) : days.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-400">Henüz kutlama günü tanımlanmamış</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {days.map((d) => (
              <article key={d.code} className={`flex min-h-[210px] flex-col rounded-lg border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${d.enabled ? "border-primary/35 ring-1 ring-primary/10" : "border-slate-200"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold text-slate-600">{formatRule(d)}</span>
                    <Badge tone={d.enabled ? "success" : "neutral"} size="sm">{d.enabled ? "Otomatik" : "Manuel"}</Badge>
                  </div>
                  <h2 className="mt-3 font-black text-slate-900">{d.title}</h2>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{d.messageTemplate.replaceAll("{{patientName}}", "Hasta").replaceAll("{{institutionName}}", "Kliniğiniz")}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{d.targetProfessions.length === 0 ? <><Globe2 className="h-3.5 w-3.5" />Tüm hastalar</> : <><BriefcaseBusiness className="h-3.5 w-3.5" />{d.targetProfessions.join(", ")}</>}{d.whatsappMessageTemplate && <Badge tone="success" size="sm"><MessageCircle className="mr-1 inline h-3 w-3" />WhatsApp</Badge>}</div>
                </div>
                {!readOnly && <Button className="mt-4"
                  variant={d.enabled ? "primary" : "secondary"}
                  size="sm"
                  loading={savingCode === d.code}
                  onClick={() => void toggle(d)}
                >
                  {d.enabled ? "Açık" : "Kapalı"}
                </Button>}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
