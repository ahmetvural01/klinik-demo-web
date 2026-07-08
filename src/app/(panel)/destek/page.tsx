"use client";

import { useEffect, useState } from "react";

type Ticket = { id: string; subject: string; message: string; answer: string | null; createdAt: string };

const UPDATE_NOTES = [
  {
    version: "v1.10",
    date: "21.05.2024",
    notes: [
      "Eğitim modülüyle ilgili bir problem giderildi.",
      "Tedavi ücretleri TDB 2024 tarifesine göre güncellendi."
    ]
  },
  {
    version: "v1.09",
    date: "16.12.2023",
    notes: [
      "Yeni SMS sistemi (Beta) aktif edildi.",
      "Hızlı hasta aramada telefon numarası ile arama eklendi."
    ]
  },
  {
    version: "v1.08",
    date: "04.12.2022",
    notes: [
      "Randevu modülü tek ekranda tüm doktorları gösterecek şekilde yenilendi.",
      "Doktor mesai saatleri ayarlanabilir hale getirildi."
    ]
  },
  {
    version: "v1.07",
    date: "30.11.2022",
    notes: ["Tedavi kayıtlarında sonradan düzenleme desteği eklendi."]
  }
];

export default function DestekPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTicket, setNewTicket] = useState({ subject: "Destek Talebi", message: "" });
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => { fetchTickets(); }, []);

  const fetchTickets = async () => {
    try {
      const res = await fetch("/api/support");
      const data = await res.json();
      setTickets(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const sendTicket = async () => {
    if (!newTicket.message.trim()) return showToast("error", "Lütfen görüşünüzü yazın");
    setSending(true);
    try {
      const res = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newTicket) });
      if (res.ok) {
        setNewTicket({ subject: "Destek Talebi", message: "" });
        showToast("success", "Destek talebiniz gönderildi");
        fetchTickets();
      }
    } catch { showToast("error", "Gönderme sırasında hata oluştu"); } finally { setSending(false); }
  };

  const filteredTickets = tickets.filter((t) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (t.subject || "").toLowerCase().includes(q) ||
      (t.message || "").toLowerCase().includes(q) ||
      (t.answer || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-5 top-5 z-[100] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
          toast.type === "success" ? "bg-emerald-500" : "bg-red-500"
        }`}>
          {toast.type === "success" ? "✓" : "✕"} {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">Destek</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{tickets.length} talep</span>
        </div>
      </div>

      {/* WhatsApp */}
      <div className="flex items-center gap-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shrink-0">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-emerald-800">WhatsApp Destek Hattı</p>
          <p className="text-xs text-emerald-600">Hızlı destek için WhatsApp üzerinden ulaşabilirsiniz.</p>
        </div>
        <a href="https://api.whatsapp.com/send/?phone=03228028162" target="_blank" rel="noopener noreferrer"
          className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700">
          WhatsApp ile Yaz
        </a>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Görüş Gönder */}
        <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm space-y-3">
          <h3 className="text-base font-black text-slate-900">Yeni Destek Talebi</h3>
          <p className="text-sm text-slate-500">Yaşadığınız sorunu veya önerinizi kısa ve anlaşılır şekilde yazın.</p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase">Konu</label>
            <input
              value={newTicket.subject}
              onChange={e => setNewTicket({ ...newTicket, subject: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase">Mesaj</label>
            <textarea
              rows={4}
              placeholder="Detaylı açıklayınız…"
              value={newTicket.message}
              onChange={e => setNewTicket({ ...newTicket, message: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none"
            />
          </div>
          <button onClick={sendTicket} disabled={sending || loading}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
            {sending ? "Gönderiliyor…" : "Talebi Gönder"}
          </button>
        </div>

        {/* Sistem Güncellemeleri */}
        <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-800">Sistem Güncellemeleri</h3>
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-700">
            Yazılımınız güncel
          </div>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-3">
            {UPDATE_NOTES.map((row) => (
              <div key={row.version} className="border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                <p className="text-xs font-bold text-primary">{row.version} <span className="text-slate-400 font-normal">— {row.date}</span></p>
                {row.notes.map((n, i) => (
                  <p key={i} className="text-xs text-slate-600 mt-0.5">{n}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Görüşler Tablosu */}
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-bold text-slate-800">Gönderilen Görüşler</h3>
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Ara…"
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs focus:border-primary focus:bg-white focus:outline-none" />
        </div>
        {(
          <>
          <div className="divide-y divide-slate-100 md:hidden">
            {filteredTickets.length === 0 ? (
              <div className="py-8 text-center text-slate-400">Henüz destek talebi gönderilmedi</div>
            ) : filteredTickets.map(t => (
              <div key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-bold text-slate-900">{t.subject}</p>
                  {t.answer
                    ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">Yanıtlandı</span>
                    : <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">Bekliyor</span>
                  }
                </div>
                <p className="mt-2 text-sm text-slate-600">{t.message}</p>
                {t.answer && <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{t.answer}</p>}
                <p className="mt-2 text-xs text-slate-400">{new Date(t.createdAt).toLocaleDateString("tr-TR")}</p>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left">Konu</th>
                  <th className="px-4 py-3 text-left">Mesaj</th>
                  <th className="px-4 py-3 text-left">Yanıt</th>
                  <th className="px-4 py-3 text-left">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredTickets.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-slate-400">Henüz destek talebi gönderilmedi</td></tr>
                ) : filteredTickets.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{t.subject}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{t.message}</td>
                    <td className="px-4 py-3">
                      {t.answer
                        ? <span className="text-slate-700">{t.answer}</span>
                        : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Bekliyor</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(t.createdAt).toLocaleDateString("tr-TR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
