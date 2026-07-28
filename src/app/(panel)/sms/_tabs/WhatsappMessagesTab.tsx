"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock3,
  Info,
  MessageSquarePlus,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { showToastSafe } from "@/lib/toast-client";

type PatientOption = {
  id: string;
  fullName: string;
  phone: string;
  whatsappOptInAt?: string | null;
  whatsappOptOutAt?: string | null;
};

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  status: string;
  phone: string;
  content: string | null;
  errorDetail: string | null;
  templateName: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  seenAt: string | null;
  patient: PatientOption | null;
};

type Conversation = {
  phone: string;
  patient: PatientOption | null;
  lastMessage: Message;
  unreadCount: number;
};

const dateTime = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const timeOnly = new Intl.DateTimeFormat("tr-TR", {
  hour: "2-digit",
  minute: "2-digit",
});

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr-TR"))
    .join("");
}

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Bugün";
  if (date.toDateString() === yesterday.toDateString()) return "Dün";
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    SENT: "Gönderildi",
    DELIVERED: "Teslim edildi",
    READ: "Hasta tarafından okundu",
    FAILED: "Gönderilemedi",
    RECEIVED: "Hastadan geldi",
    PENDING: "Gönderiliyor",
  };
  return labels[status] || status;
}

function MessageStatus({ message }: { message: Message }) {
  if (message.direction === "INBOUND") return null;
  if (message.status === "FAILED") {
    return <AlertCircle className="h-3.5 w-3.5 text-red-600" aria-label="Gönderilemedi" />;
  }
  if (message.status === "READ") {
    return <CheckCheck className="h-3.5 w-3.5 text-sky-600" aria-label="Okundu" />;
  }
  if (message.status === "DELIVERED") {
    return <CheckCheck className="h-3.5 w-3.5 text-slate-500" aria-label="Teslim edildi" />;
  }
  if (message.status === "SENT") {
    return <Check className="h-3.5 w-3.5 text-slate-500" aria-label="Gönderildi" />;
  }
  return <Clock3 className="h-3.5 w-3.5 text-slate-400" aria-label="Gönderiliyor" />;
}

function EventRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <span className="text-xs text-slate-800">{dateTime.format(new Date(value))}</span>
    </div>
  );
}

export default function WhatsappMessagesTab() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activePhone, setActivePhone] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [activePatient, setActivePatient] = useState<PatientOption | null>(null);
  const [canReply, setCanReply] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientOptions, setPatientOptions] = useState<PatientOption[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [detailMessage, setDetailMessage] = useState<Message | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ mode: "conversations", take: "200" });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/whatsapp/messages?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      const next = response.ok && Array.isArray(body?.conversations) ? body.conversations : [];
      setConversations(next);
      setActivePhone((current) => {
        if (current && next.some((item: Conversation) => item.phone === current)) return current;
        return next[0]?.phone || "";
      });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [query]);

  const loadThread = useCallback(async (phone: string, silent = false) => {
    if (!phone) {
      setMessages([]);
      setActivePatient(null);
      return;
    }
    if (!silent) setThreadLoading(true);
    try {
      const params = new URLSearchParams({ phone, take: "200" });
      const response = await fetch(`/api/whatsapp/messages?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (response.ok) {
        setMessages(Array.isArray(body?.messages) ? body.messages : []);
        setActivePatient(body?.patient || null);
        setCanReply(Boolean(body?.canReply));
        await fetch("/api/whatsapp/messages", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        }).catch(() => null);
        setConversations((current) => current.map((item) => (
          item.phone === phone ? { ...item, unreadCount: 0 } : item
        )));
      }
    } finally {
      if (!silent) setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadConversations(), 250);
    return () => window.clearTimeout(timer);
  }, [loadConversations]);

  useEffect(() => {
    void loadThread(activePhone);
  }, [activePhone, loadThread]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadConversations(true);
      if (activePhone) void loadThread(activePhone, true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [activePhone, loadConversations, loadThread]);

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
      setPatientOptions(Array.isArray(body) ? body : Array.isArray(body?.patients) ? body.patients : []);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [composerOpen, patientQuery]);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.phone === activePhone) || null,
    [activePhone, conversations],
  );

  const chooseConversation = (phone: string) => {
    setActivePhone(phone);
    setMobileThreadOpen(true);
  };

  const sendMessage = async (patient: PatientOption | null, message: string) => {
    if (!patient || !message.trim() || sending) return null;
    setSending(true);
    try {
      const response = await fetch("/api/whatsapp/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: patient.id, message: message.trim() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        showToastSafe({ type: "error", message: body?.message || "WhatsApp mesajı gönderilemedi." });
        return null;
      }
      showToastSafe({ type: "success", message: "WhatsApp mesajı gönderildi." });
      await loadConversations(true);
      await loadThread(activePhone || patient.phone, true);
      return String(body?.phone || activePhone || patient.phone);
    } finally {
      setSending(false);
    }
  };

  const submitThread = async () => {
    if (await sendMessage(activePatient, content)) setContent("");
  };

  const closeComposer = () => {
    if (sending) return;
    setComposerOpen(false);
    setPatientQuery("");
    setPatientOptions([]);
    setSelectedPatient(null);
    setContent("");
  };

  const submitNewMessage = async () => {
    const phone = await sendMessage(selectedPatient, content);
    if (!phone) return;
    closeComposer();
    setActivePhone(phone);
    setMobileThreadOpen(true);
  };

  let previousDay = "";

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid h-[calc(100dvh-258px)] min-h-[480px] lg:h-[calc(100dvh-190px)] lg:min-h-[620px] lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside className={`${mobileThreadOpen ? "hidden lg:flex" : "flex"} min-w-0 flex-col border-r border-slate-200`}>
          <div className="border-b border-slate-200 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-900">Görüşmeler</h3>
                <p className="text-xs text-slate-500">{conversations.length} aktif konuşma</p>
              </div>
              <Button size="sm" icon={MessageSquarePlus} onClick={() => setComposerOpen(true)}>
                Yeni
              </Button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Hasta veya telefon ara"
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-primary focus:bg-white"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && conversations.length === 0 ? (
              <div className="space-y-2 p-3" aria-label="Görüşmeler yükleniyor">
                {[1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm font-semibold text-slate-700">Görüşme bulunmuyor</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Yeni bir görüşme başlatabilir veya arama ölçütünü temizleyebilirsiniz.</p>
              </div>
            ) : conversations.map((conversation) => {
              const name = conversation.patient?.fullName || conversation.phone;
              return (
                <button
                  key={conversation.phone}
                  type="button"
                  onClick={() => chooseConversation(conversation.phone)}
                  className={`grid w-full grid-cols-[40px_minmax(0,1fr)_auto] gap-3 border-b border-slate-100 px-3 py-3 text-left transition-colors hover:bg-slate-50 ${
                    activePhone === conversation.phone ? "bg-primary/5" : ""
                  }`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                    {initials(name) || "WA"}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900">{name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {conversation.lastMessage.direction === "OUTBOUND" ? "Siz: " : ""}
                      {conversation.lastMessage.content || "İçerik yok"}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-[11px] text-slate-400">{timeOnly.format(new Date(conversation.lastMessage.createdAt))}</span>
                    {conversation.unreadCount > 0 && (
                      <span className="flex min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className={`${mobileThreadOpen ? "flex" : "hidden lg:flex"} min-w-0 flex-col bg-slate-50`}>
          {!activeConversation ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div>
                <p className="text-sm font-bold text-slate-800">Bir görüşme seçin</p>
                <p className="mt-1 text-xs text-slate-500">Hasta ile gelen ve gönderilen mesajlar tek zaman akışında görüntülenir.</p>
              </div>
            </div>
          ) : (
            <>
              <header className="flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white px-3 py-2">
                <button
                  type="button"
                  onClick={() => setMobileThreadOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
                  aria-label="Görüşme listesine dön"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {initials(activeConversation.patient?.fullName || activeConversation.phone) || "WA"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-900">
                    {activeConversation.patient?.fullName || activeConversation.phone}
                  </p>
                  <p className="truncate text-xs text-slate-500">{activeConversation.phone}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={RefreshCw}
                  onClick={() => {
                    void loadConversations(true);
                    void loadThread(activePhone, true);
                  }}
                  aria-label="Görüşmeyi yenile"
                />
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
                {threadLoading && messages.length === 0 ? (
                  <div className="space-y-3" aria-label="Mesajlar yükleniyor">
                    <div className="h-14 w-2/3 animate-pulse rounded-lg bg-slate-200" />
                    <div className="ml-auto h-14 w-1/2 animate-pulse rounded-lg bg-emerald-100" />
                  </div>
                ) : messages.map((message) => {
                  const currentDay = dayLabel(message.createdAt);
                  const showDay = currentDay !== previousDay;
                  previousDay = currentDay;
                  return (
                    <div key={message.id}>
                      {showDay && (
                        <div className="my-4 flex justify-center">
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-500">
                            {currentDay}
                          </span>
                        </div>
                      )}
                      <div className={`mb-2 flex ${message.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}>
                        <button
                          type="button"
                          onClick={() => setDetailMessage(message)}
                          className={`group max-w-[86%] rounded-lg border px-3 py-2 text-left shadow-sm sm:max-w-[72%] ${
                            message.direction === "OUTBOUND"
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <span className="block whitespace-pre-wrap break-words text-sm leading-5 text-slate-800">
                            {message.content || "İçerik yok"}
                          </span>
                          <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                            {timeOnly.format(new Date(message.sentAt || message.createdAt))}
                            <MessageStatus message={message} />
                          </span>
                          {message.errorDetail && <span className="mt-1 block text-xs text-red-600">{message.errorDetail}</span>}
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>

              <footer className="border-t border-slate-200 bg-white p-3">
                {!canReply && (
                  <div className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>24 saatlik serbest mesaj süresi kapalı veya hastanın iletişim izni yok. Görüşme, onaylı bir şablonla yeniden başlatılmalıdır.</span>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value.slice(0, 4096))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void submitThread();
                      }
                    }}
                    rows={2}
                    disabled={!canReply || sending}
                    placeholder={canReply ? "Mesaj yazın" : "Mesaj gönderimi şu anda kapalı"}
                    className="min-h-10 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-slate-100"
                  />
                  <Button
                    icon={Send}
                    onClick={() => void submitThread()}
                    loading={sending}
                    disabled={!canReply || !content.trim()}
                    aria-label="Mesajı gönder"
                  />
                </div>
              </footer>
            </>
          )}
        </div>
      </div>

      <Modal
        open={composerOpen}
        onClose={closeComposer}
        title="Yeni WhatsApp Görüşmesi"
        description="Serbest mesaj için hastanın iletişim izni ve son 24 saat içinde gelen mesajı bulunmalıdır."
        size="lg"
        closeOnBackdrop={!sending}
        footer={(
          <>
            <Button variant="secondary" onClick={closeComposer} disabled={sending}>Vazgeç</Button>
            <Button icon={Send} onClick={() => void submitNewMessage()} loading={sending} disabled={!selectedPatient || !content.trim()}>
              Gönder
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <FormField
            label="Hasta"
            required
            hint={selectedPatient
              ? `${selectedPatient.phone} · ${selectedPatient.whatsappOptInAt && !selectedPatient.whatsappOptOutAt ? "İletişim izni var" : "İletişim izni yok"}`
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
                meta: `${patient.phone || "Telefon yok"} · ${patient.whatsappOptInAt && !patient.whatsappOptOutAt ? "İzin var" : "İzin yok"}`,
              }))}
              onSelect={(option) => {
                const patient = patientOptions.find((item) => item.id === option.id) || null;
                setSelectedPatient(patient);
                setPatientQuery(patient?.fullName || option.label);
              }}
              placeholder="Hasta adı veya telefon"
              emptyText="Eşleşen hasta bulunamadı"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary"
            />
          </FormField>
          <FormField label="Mesaj" required hint={`${content.length}/4096 karakter`}>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value.slice(0, 4096))}
              rows={5}
              placeholder="Hastaya iletilecek mesajı yazın"
              className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-primary"
            />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={Boolean(detailMessage)}
        onClose={() => setDetailMessage(null)}
        title="Mesaj Ayrıntısı"
        description={detailMessage ? `${detailMessage.direction === "INBOUND" ? "Gelen" : "Gönderilen"} mesaj · ${statusLabel(detailMessage.status)}` : undefined}
        size="sm"
        footer={<Button variant="secondary" onClick={() => setDetailMessage(null)}>Kapat</Button>}
      >
        {detailMessage && (
          <div>
            <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm leading-5 text-slate-800">
              {detailMessage.content || "İçerik yok"}
            </div>
            <EventRow label="Kayıt zamanı" value={detailMessage.createdAt} />
            <EventRow label={detailMessage.direction === "INBOUND" ? "Geliş zamanı" : "Gönderim zamanı"} value={detailMessage.sentAt} />
            <EventRow label="Teslim zamanı" value={detailMessage.deliveredAt} />
            <EventRow label="Okunma zamanı" value={detailMessage.readAt} />
            {detailMessage.direction === "INBOUND" && <EventRow label="Klinikte görüldü" value={detailMessage.seenAt} />}
            <EventRow label="Hata zamanı" value={detailMessage.failedAt} />
            {detailMessage.errorDetail && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{detailMessage.errorDetail}</div>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
