"use client";

import { useEffect, useState } from "react";

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
      <div className="flex items-center gap-3">
        <span className="text-3xl">✉️</span>
        <h2 className="text-2xl font-bold text-gray-900">SMS Şablonları</h2>
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {templates.length === 0 ? (
              <div className="px-6 py-10 text-center text-gray-400">Şablon bulunamadı</div>
            ) : (
              templates.map((t) => (
                <div key={t.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{t.name}</span>
                        <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          {t.type}
                        </span>
                        {!t.isActive && (
                          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            Pasif
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 bg-gray-50 rounded p-2 font-mono">{t.content}</p>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleDateString("tr-TR")}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}
