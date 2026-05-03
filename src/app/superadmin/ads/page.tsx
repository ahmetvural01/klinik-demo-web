"use client";

import { useEffect, useState } from "react";

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
    await fetch(`/api/superadmin/ads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !current }),
    });
    load();
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-3xl">📣</span>
        <h2 className="text-2xl font-bold text-gray-900">Reklamlar</h2>
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {ads.length === 0 ? (
              <div className="px-6 py-10 text-center text-gray-400">Reklam bulunamadı</div>
            ) : (
              ads.map((ad) => (
                <div key={ad.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{ad.title}</span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          ad.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {ad.isActive ? "Aktif" : "Pasif"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{ad.content}</p>
                    {ad.targetUrl && (
                      <p className="text-xs text-blue-500 mt-1">{ad.targetUrl}</p>
                    )}
                  </div>
                  <button
                    onClick={() => toggle(ad.id, ad.isActive)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      ad.isActive
                        ? "bg-red-50 text-red-600 hover:bg-red-100"
                        : "bg-green-50 text-green-600 hover:bg-green-100"
                    }`}
                  >
                    {ad.isActive ? "Durdur" : "Yayınla"}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}
