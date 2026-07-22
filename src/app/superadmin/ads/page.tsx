"use client";

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { showToastSafe } from "@/lib/toast-client";

type Ad = {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  targetUrl?: string;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  createdAt: string;
};

export default function AdsPage() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/superadmin/ads")
      .then((r) => r.json())
      .then((d) => setAds(Array.isArray(d) ? d : d.ads ?? []))
      .catch(() => setAds([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = async (id: string, current: boolean) => {
    try {
      await fetch(`/api/superadmin/ads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !current }),
      });
      showToastSafe({ title: current ? "Durduruldu" : "Yayınlandı", message: "Reklam durumu güncellendi", type: "success" });
      load();
    } catch {
      showToastSafe({ title: "Hata", message: "Reklam durumu güncellenemedi", type: "error" });
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Megaphone className="h-4 w-4" />
        </span>
        <h1 className="text-lg font-black text-slate-900">Reklamlar</h1>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse bg-slate-50" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
        ) : ads.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-slate-400">Reklam bulunamadı</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {ads.map((ad) => (
              <div key={ad.id} className="flex items-start justify-between gap-4 p-4 transition hover:bg-slate-50/80">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="font-bold text-slate-900">{ad.title}</span>
                    <Badge tone={ad.isActive ? "success" : "neutral"}>{ad.isActive ? "Aktif" : "Pasif"}</Badge>
                  </div>
                  <p className="text-sm text-slate-600">{ad.content}</p>
                  {ad.targetUrl && (
                    <p className="mt-1 truncate text-xs text-primary">{ad.targetUrl}</p>
                  )}
                </div>
                <Button variant={ad.isActive ? "danger" : "secondary"} size="sm" onClick={() => toggle(ad.id, ad.isActive)}>
                  {ad.isActive ? "Durdur" : "Yayınla"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
