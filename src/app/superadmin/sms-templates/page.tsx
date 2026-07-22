"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

type Template = {
  id: string;
  name: string;
  content: string;
  type: string;
  isActive: boolean;
  createdAt: string;
};

export default function SmsTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/superadmin/sms-templates")
      .then((r) => r.json())
      .then((d) => setTemplates(Array.isArray(d) ? d : d.templates ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MessageCircle className="h-4 w-4" />
        </span>
        <h1 className="text-lg font-black text-slate-900">SMS Şablonları</h1>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse bg-slate-50" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-slate-400">Şablon bulunamadı</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {templates.map((t) => (
              <div key={t.id} className="p-4 transition hover:bg-slate-50/80">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{t.name}</span>
                      <Badge tone="info">{t.type}</Badge>
                      {!t.isActive && <Badge tone="neutral">Pasif</Badge>}
                    </div>
                    <p className="rounded-lg bg-slate-50 p-2 font-mono text-sm text-slate-600">{t.content}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-400">
                    {new Date(t.createdAt).toLocaleDateString("tr-TR")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
