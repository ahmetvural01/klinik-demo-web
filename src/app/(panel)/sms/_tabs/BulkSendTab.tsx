"use client";

import { useEffect, useState } from "react";
import { Search, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { SmsMessageEditor } from "@/components/sms/SmsMessageEditor";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";
import { toStoredText, type SmsPlaceholder } from "@/lib/sms-template-placeholders";

type Patient = { id: string; fullName: string; phone: string };

// Toplu gönderimde randevu/ödeme-özel alanlar (doktor, tutar, vade) anlamsız —
// sadece klinik/hasta adı ve klinik telefonu sunulur.
const BULK_PLACEHOLDERS: SmsPlaceholder[] = [
  { token: "institutionName", label: "Klinik Adı", sample: "Beyaz Diş Kliniği" },
  { token: "patientName", label: "Hasta Adı", sample: "Ayşe Yılmaz" },
  { token: "institutionPhone", label: "Klinik Telefonu", sample: "0322 123 45 67" },
];

export default function BulkSendTab() {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      const params = new URLSearchParams({ take: "50" });
      if (query.trim()) params.set("q", query.trim());
      fetch(`/api/patients?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => setPatients(Array.isArray(d?.patients) ? d.patients : []))
        .catch(() => setPatients([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      patients.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const send = async () => {
    if (selected.size === 0 || !message.trim()) return;
    const ok = await confirmDialog({
      title: "Toplu SMS Gönder",
      message: `${selected.size} hastaya SMS gönderilecek. Bu işlem SMS bakiyenizi tüketir ve geri alınamaz. Devam edilsin mi?`,
      confirmText: "Gönder",
      danger: true,
    });
    if (!ok) return;

    setSending(true);
    try {
      const res = await fetch("/api/sms/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientIds: Array.from(selected), content: toStoredText(message) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Gönderilemedi");
      showToastSafe({ title: "Gönderildi", message: d.message, type: d.failed > 0 ? "error" : "success" });
      clearSelection();
      setMessage("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      setSending(false);
    }
  };

  const columns: ListTableColumn<Patient>[] = [
    {
      key: "select",
      header: "",
      headerClassName: "w-10",
      render: (p) => (
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={selected.has(p.id)}
          onChange={() => toggleOne(p.id)}
        />
      ),
    },
    { key: "fullName", header: "Ad Soyad", render: (p) => <span className="font-bold text-slate-900">{p.fullName}</span> },
    { key: "phone", header: "Telefon", render: (p) => <span className="font-mono text-slate-600">{p.phone || "—"}</span> },
  ];

  return (
    <section className="space-y-4">
      <p className="text-sm text-slate-500">
        Bayram, kampanya veya duyuru gibi özel günlerde seçtiğiniz hastalara serbest metinli SMS gönderin. Bu özellik SMS bakiyenizi tüketir.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Hasta adı veya telefon ara..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-3 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <Button variant="secondary" size="sm" onClick={selectAllVisible}>Görünenleri Seç</Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>Seçimi Temizle</Button>
          </div>
          <p className="text-xs font-semibold text-slate-500">{selected.size} hasta seçildi</p>
          <ListTable
            columns={columns}
            rows={patients}
            rowKey={(p) => p.id}
            loading={loading}
            emptyText="Hasta bulunamadı"
          />
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-black text-slate-900">Mesaj</h3>
          <SmsMessageEditor
            value={message}
            onChange={setMessage}
            placeholders={BULK_PLACEHOLDERS}
            rows={5}
            label="Mesaj Metni"
          />
          <Button
            icon={Send}
            onClick={send}
            loading={sending}
            disabled={selected.size === 0 || !message.trim()}
            fullWidth
          >
            {selected.size > 0 ? `${selected.size} Hastaya Gönder` : "Hasta Seçin"}
          </Button>
        </div>
      </div>
    </section>
  );
}
