"use client";

import { useEffect, useState } from "react";
import { Headset, Reply, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";

// SupportTicket modelinde status/priority/institution alanları YOK (bkz.
// prisma/schema.prisma) — sadece answer (nullable). "Açık/Yanıtlandı" ayrımı
// bu yüzden answer'ın dolu olup olmamasına dayanıyor, uydurma bir status
// alanına değil.
type Ticket = {
  id: string;
  subject: string;
  message: string;
  answer?: string | null;
  user?: { fullName: string; role?: string; email?: string } | null;
  createdAt: string;
};

type Filter = "ALL" | "OPEN" | "ANSWERED";

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [replyTicket, setReplyTicket] = useState<Ticket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/superadmin/support")
      .then((r) => r.json())
      .then((d) => setTickets(Array.isArray(d) ? d : d.tickets ?? []))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openReply = (t: Ticket) => {
    setReplyTicket(t);
    setReplyText(t.answer ?? "");
  };

  const submitReply = async () => {
    if (!replyTicket || !replyText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/superadmin/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: replyTicket.id, answer: replyText.trim() }),
      });
      if (!res.ok) throw new Error("Yanıt gönderilemedi");
      showToastSafe({ title: "Gönderildi", message: "Yanıt kaydedildi.", type: "success" });
      setReplyTicket(null);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: Ticket) => {
    const ok = await confirmDialog({
      title: "Talebi Sil",
      message: `"${t.subject}" başlıklı destek talebi kalıcı olarak silinecek. Emin misiniz?`,
      danger: true,
      confirmText: "Sil",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/superadmin/support?id=${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silinemedi");
      showToastSafe({ title: "Silindi", message: "Destek talebi silindi.", type: "success" });
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    }
  };

  const filtered = tickets.filter((t) => {
    if (filter === "OPEN") return !t.answer;
    if (filter === "ANSWERED") return !!t.answer;
    return true;
  });

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">Destek Talepleri</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{tickets.length} talep</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          { key: "ALL", label: "Tümü" },
          { key: "OPEN", label: "Açık" },
          { key: "ANSWERED", label: "Yanıtlandı" },
        ] as const).map((s) => (
          <Button
            key={s.key}
            variant={filter === s.key ? "primary" : "secondary"}
            size="sm"
            onClick={() => setFilter(s.key)}
          >
            {s.label}
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
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{t.subject}</span>
                      <Badge tone={t.answer ? "success" : "warning"}>{t.answer ? "Yanıtlandı" : "Açık"}</Badge>
                    </div>
                    <p className="mb-1 text-sm text-slate-600">{t.message}</p>
                    {t.answer && (
                      <div className="mb-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        <span className="font-bold">Yanıt: </span>{t.answer}
                      </div>
                    )}
                    <p className="text-xs text-slate-400">
                      {t.user?.fullName ?? "—"} · {t.user?.email ?? "—"} ·{" "}
                      {new Date(t.createdAt).toLocaleDateString("tr-TR")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <IconButton icon={Reply} title="Yanıtla" tone="primary" onClick={() => openReply(t)} />
                    <IconButton icon={Trash2} title="Sil" tone="danger" onClick={() => remove(t)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={!!replyTicket}
        onClose={() => setReplyTicket(null)}
        title={`Yanıtla: ${replyTicket?.subject ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReplyTicket(null)}>İptal</Button>
            <Button variant="primary" loading={saving} onClick={submitReply} disabled={!replyText.trim()}>
              {replyTicket?.answer ? "Yanıtı Güncelle" : "Yanıtı Gönder"}
            </Button>
          </>
        }
      >
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{replyTicket?.message}</p>
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          rows={5}
          placeholder="Yanıtınızı yazın..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm placeholder-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </Modal>
    </section>
  );
}
