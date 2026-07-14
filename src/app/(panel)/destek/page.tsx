"use client";

import { useEffect, useState } from "react";
import { showToastSafe } from "@/lib/toast-client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";

type Ticket = { id: string; subject: string; message: string; answer: string | null; createdAt: string };

const SUPPORT_TOPICS = [
  "Giriş ve yetki problemi",
  "Hasta / randevu işlemleri",
  "Tedavi / laboratuvar akışı",
  "Muhasebe / ödeme işlemleri",
  "Stok / tedarikçi işlemleri",
  "SMS / bildirim problemi",
  "Rapor / dışa aktarım",
  "Diğer",
] as const;

export default function DestekPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTicket, setNewTicket] = useState({ subject: SUPPORT_TOPICS[0] as string, customSubject: "", message: "" });
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");

  const showToast = (type: "success" | "error", text: string) => {
    showToastSafe({ message: text, type });
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
    const subject = newTicket.subject === "Diğer" ? newTicket.customSubject.trim() : newTicket.subject;
    if (!subject) return showToast("error", "Lütfen konu seçin veya yazın");
    setSending(true);
    try {
      const res = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, message: newTicket.message }) });
      if (res.ok) {
        setNewTicket({ subject: SUPPORT_TOPICS[0], customSubject: "", message: "" });
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

  const ticketColumns: ListTableColumn<Ticket>[] = [
    { key: "subject", header: "Konu", render: (t) => <span className="font-medium text-slate-800">{t.subject}</span> },
    { key: "message", header: "Mesaj", cellClassName: "max-w-[240px] truncate", render: (t) => <span className="text-slate-600">{t.message}</span> },
    {
      key: "answer",
      header: "Yanıt",
      render: (t) => (t.answer ? <span className="text-slate-700">{t.answer}</span> : <Badge tone="warning">Bekliyor</Badge>),
    },
    {
      key: "createdAt",
      header: "Tarih",
      render: (t) => <span className="text-xs text-slate-400">{new Date(t.createdAt).toLocaleDateString("tr-TR")}</span>,
    },
  ];

  return (
    <div className="space-y-5">
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
        {/* Görüş Gönder */}
        <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm space-y-3">
          <h3 className="text-base font-black text-slate-900">Yeni Destek Talebi</h3>
          <p className="text-sm text-slate-500">Yaşadığınız sorunu veya önerinizi kısa ve anlaşılır şekilde yazın.</p>
          <FormField label="Konu">
            <select
              value={newTicket.subject}
              onChange={e => setNewTicket({ ...newTicket, subject: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none"
            >
              {SUPPORT_TOPICS.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
            </select>
            {newTicket.subject === "Diğer" && (
              <input
                value={newTicket.customSubject}
                onChange={e => setNewTicket({ ...newTicket, customSubject: e.target.value })}
                placeholder="Kısa konu başlığı"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none"
              />
            )}
          </FormField>
          <FormField label="Mesaj">
            <textarea
              rows={4}
              placeholder="Detaylı açıklayınız…"
              value={newTicket.message}
              onChange={e => setNewTicket({ ...newTicket, message: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none"
            />
          </FormField>
          <Button onClick={sendTicket} disabled={sending || loading} loading={sending} fullWidth>
            Talebi Gönder
          </Button>
        </div>

        {/* Destek Bilgilendirme */}
        <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-800">Destek Süreci</h3>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
            Talep oluştururken hangi ekranda, hangi işlemde ve mümkünse hasta/firma adı gibi bağlam bilgilerini yazmanız çözümü hızlandırır.
          </div>
          <div className="grid gap-2 text-xs text-slate-500">
            <div className="rounded-lg border border-slate-100 px-3 py-2">
              <span className="font-bold text-slate-700">Açık talepler:</span> {tickets.filter((ticket) => !ticket.answer).length}
            </div>
            <div className="rounded-lg border border-slate-100 px-3 py-2">
              <span className="font-bold text-slate-700">Yanıtlanan:</span> {tickets.filter((ticket) => ticket.answer).length}
            </div>
          </div>
        </div>
      </div>

      {/* Görüşler Tablosu */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-5 py-3 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800">Gönderilen Görüşler</h3>
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Ara…"
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs focus:border-primary focus:bg-white focus:outline-none" />
        </div>
        <ListTable<Ticket>
          columns={ticketColumns}
          rows={filteredTickets}
          rowKey={(t) => t.id}
          loading={loading}
          emptyText="Henüz destek talebi gönderilmedi"
        />
      </div>
    </div>
  );
}
