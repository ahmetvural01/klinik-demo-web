"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, MessageSquarePlus, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { showToastSafe } from "@/lib/toast-client";

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  status: string;
  phone: string;
  content: string | null;
  errorDetail: string | null;
  createdAt: string;
  sentAt: string | null;
  patient: { id: string; fullName: string } | null;
};

type PatientOption = {
  id: string;
  fullName: string;
  phone: string;
  whatsappOptInAt?: string | null;
  whatsappOptOutAt?: string | null;
};

function statusTone(status: string) {
  if (status === "FAILED") return "critical" as const;
  if (status === "READ" || status === "DELIVERED" || status === "RECEIVED") return "success" as const;
  return "neutral" as const;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    SENT: "Gönderildi",
    DELIVERED: "Teslim edildi",
    READ: "Okundu",
    FAILED: "Başarısız",
    RECEIVED: "Gelen mesaj",
    PENDING: "Bekliyor",
  };
  return labels[status] || status;
}

export default function WhatsappMessagesTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("ALL");
  const [composerOpen, setComposerOpen] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientOptions, setPatientOptions] = useState<PatientOption[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ take: "150", direction });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/whatsapp/messages?${params}`, { cache: "no-store" });
      const body = await response.json();
      setMessages(response.ok && Array.isArray(body.messages) ? body.messages : []);
    } finally {
      setLoading(false);
    }
  }, [direction, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!composerOpen) return;
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({
        q: patientQuery.trim(),
        take: "20",
        sortBy: "fullName",
        sortDir: "asc",
        summary: "false",
      });
      const response = await fetch(`/api/patients?${params}`, { cache: "no-store" }).catch(() => null);
      const body = response?.ok ? await response.json().catch(() => null) : null;
      const items = Array.isArray(body) ? body : Array.isArray(body?.patients) ? body.patients : [];
      setPatientOptions(items);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [composerOpen, patientQuery]);

  const closeComposer = () => {
    if (sending) return;
    setComposerOpen(false);
    setPatientQuery("");
    setPatientOptions([]);
    setSelectedPatient(null);
    setContent("");
  };

  const sendMessage = async () => {
    if (!selectedPatient || !content.trim() || sending) return;
    setSending(true);
    try {
      const response = await fetch("/api/whatsapp/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: selectedPatient.id, message: content.trim() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        showToastSafe({
          type: "error",
          message: body?.message || "WhatsApp mesajı gönderilemedi.",
        });
        return;
      }
      showToastSafe({ type: "success", message: "WhatsApp mesajı gönderildi." });
      setComposerOpen(false);
      setPatientQuery("");
      setPatientOptions([]);
      setSelectedPatient(null);
      setContent("");
      await load();
    } finally {
      setSending(false);
    }
  };

  const counts = useMemo(() => ({
    inbound: messages.filter((message) => message.direction === "INBOUND").length,
    failed: messages.filter((message) => message.status === "FAILED").length,
  }), [messages]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Hasta veya telefon ara"
            className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="ALL">Tüm mesajlar</option>
          <option value="INBOUND">Gelenler</option>
          <option value="OUTBOUND">Gönderilenler</option>
        </select>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => void load()}>Yenile</Button>
        <Button variant="primary" size="sm" icon={MessageSquarePlus} onClick={() => setComposerOpen(true)}>
          Mesaj Gönder
        </Button>
      </div>

      <div className="flex gap-2 text-xs text-slate-500">
        <span>{messages.length} mesaj</span>
        <span>·</span>
        <span>{counts.inbound} gelen</span>
        {counts.failed > 0 && <><span>·</span><span className="font-semibold text-red-600">{counts.failed} başarısız</span></>}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading && messages.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Mesajlar hazırlanıyor…</div>
        ) : messages.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Bu filtrede WhatsApp mesajı bulunmuyor.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {messages.map((message) => (
              <div key={message.id} className="grid gap-2 px-4 py-3 md:grid-cols-[180px_1fr_130px_150px] md:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{message.patient?.fullName || message.phone}</p>
                  <p className="truncate text-xs text-slate-500">{message.phone}</p>
                </div>
                <div className="flex min-w-0 items-start gap-2">
                  {message.direction === "INBOUND"
                    ? <ArrowDownLeft className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    : <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />}
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm text-slate-700">{message.content || "İçerik yok"}</p>
                    {message.errorDetail && <p className="mt-1 text-xs text-red-600">{message.errorDetail}</p>}
                  </div>
                </div>
                <Badge tone={statusTone(message.status)}>{statusLabel(message.status)}</Badge>
                <span className="text-xs text-slate-500">{new Date(message.createdAt).toLocaleString("tr-TR")}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={composerOpen}
        onClose={closeComposer}
        title="WhatsApp Mesajı Gönder"
        description="Yalnızca WhatsApp iletişim izni bulunan ve son 24 saat içinde mesaj gönderen hastalara serbest metin iletilebilir."
        size="lg"
        closeOnBackdrop={!sending}
        footer={(
          <>
            <Button variant="secondary" onClick={closeComposer} disabled={sending}>Vazgeç</Button>
            <Button
              variant="primary"
              icon={MessageSquarePlus}
              onClick={() => void sendMessage()}
              loading={sending}
              disabled={!selectedPatient || !content.trim()}
            >
              Mesajı Gönder
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <FormField
            label="Hasta"
            required
            hint={selectedPatient
              ? `${selectedPatient.phone} · ${selectedPatient.whatsappOptInAt && !selectedPatient.whatsappOptOutAt ? "WhatsApp izni var" : "WhatsApp izni yok"}`
              : "Ad veya telefon yazarak hastayı bulun."}
          >
            <SearchSelect
              query={patientQuery}
              onQueryChange={(value) => {
                setPatientQuery(value);
                setSelectedPatient(null);
              }}
              options={patientOptions.map((patient) => ({
                id: patient.id,
                label: patient.fullName,
                meta: `${patient.phone || "Telefon yok"} · ${patient.whatsappOptInAt && !patient.whatsappOptOutAt ? "WhatsApp izni var" : "WhatsApp izni yok"}`,
              }))}
              onSelect={(option) => {
                const patient = patientOptions.find((item) => item.id === option.id) || null;
                setSelectedPatient(patient);
                setPatientQuery(patient?.fullName || option.label);
              }}
              placeholder="Hasta adı veya telefon"
              emptyText="Eşleşen hasta bulunamadı"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </FormField>

          <FormField label="Mesaj" required hint={`${content.length}/4096 karakter`}>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value.slice(0, 4096))}
              rows={6}
              placeholder="Hastaya iletilecek mesajı yazın"
              className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </FormField>
        </div>
      </Modal>
    </section>
  );
}
