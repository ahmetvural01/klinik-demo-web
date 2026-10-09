"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LifeBuoy, MessageCircle, Plus } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";
import { roleLabel } from "@/lib/staff-roles";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { ActiveFilters, Toolbar } from "@/components/ui/Toolbar";
import { matchesSearch } from "@/components/yonetim/search-text";

type Ticket = {
  id: string;
  subject: string;
  message: string;
  answer: string | null;
  createdAt: string;
  user?: { id: string; fullName: string; role: string } | null;
};

type StatusFilter = "" | "bekliyor" | "yanitlandi";

const SUPPORT_TOPICS = [
  "Giriş ve yetki",
  "Hasta / randevu",
  "Tedavi / laboratuvar",
  "Muhasebe / ödeme",
  "Stok / satın alma",
  "SMS / WhatsApp",
  "Rapor / dışa aktarma",
  "Diğer",
] as const;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "", label: "Tüm talepler" },
  { value: "bekliyor", label: "Yanıt bekleyenler" },
  { value: "yanitlandi", label: "Yanıtlananlar" },
];

const WHATSAPP_URL = "https://api.whatsapp.com/send/?phone=903228028162";
const MESSAGE_MAX = 5000;

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ ticket }: { ticket: Ticket }) {
  return ticket.answer
    ? <Badge tone="success">Yanıtlandı</Badge>
    : <Badge tone="warning">Yanıt bekliyor</Badge>;
}

export default function DestekPage() {
  const { can } = usePermissions();
  const canWrite = can("support:write");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [selected, setSelected] = useState<Ticket | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ topic: SUPPORT_TOPICS[0] as string, customSubject: "", message: "" });
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/support", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) throw new Error(data?.message || "Destek talepleri yüklenemedi.");
      setTickets(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Destek talepleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const waitingCount = tickets.filter((ticket) => !ticket.answer).length;

  const filtered = useMemo(() => tickets.filter((ticket) => {
    if (statusFilter === "bekliyor" && ticket.answer) return false;
    if (statusFilter === "yanitlandi" && !ticket.answer) return false;
    return matchesSearch([ticket.subject, ticket.message, ticket.answer, ticket.user?.fullName], query);
  }), [query, statusFilter, tickets]);

  const subject = form.topic === "Diğer" ? form.customSubject.trim() : form.topic;
  const formErrors = {
    subject: !subject ? "Kısa bir konu başlığı yazın." : subject.length > 120 ? "Konu en fazla 120 karakter olabilir." : undefined,
    message: !form.message.trim() ? "Sorunu veya isteğinizi yazın." : form.message.length > MESSAGE_MAX ? `Mesaj en fazla ${MESSAGE_MAX} karakter olabilir.` : undefined,
  };

  const openForm = () => {
    setForm({ topic: SUPPORT_TOPICS[0], customSubject: "", message: "" });
    setFormSubmitted(false);
    setFormError(null);
    setFormOpen(true);
  };

  const send = async () => {
    setFormSubmitted(true);
    setFormError(null);
    if (formErrors.subject || formErrors.message) return;
    setSending(true);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message: form.message.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setFormError(data?.message || "Talep gönderilemedi.");
        return;
      }
      setFormOpen(false);
      showToastSafe({ message: "Talebiniz destek ekibine iletildi. Yanıt geldiğinde bu listede görünür.", type: "success", duration: 5000 });
      void load();
    } catch {
      setFormError("Talep gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setSending(false);
    }
  };

  const columns: ListTableColumn<Ticket>[] = [
    {
      key: "createdAt",
      header: "Tarih",
      cellClassName: "whitespace-nowrap text-sm text-slate-600 tabular-nums",
      render: (ticket) => formatDateTime(ticket.createdAt),
    },
    {
      key: "subject",
      header: "Konu",
      render: (ticket) => (
        <div className="min-w-0 max-w-xl">
          <p className="font-semibold text-slate-900">{ticket.subject}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{ticket.message}</p>
        </div>
      ),
    },
    {
      key: "user",
      header: "Gönderen",
      render: (ticket) => ticket.user ? (
        <div>
          <p className="text-sm text-slate-800">{ticket.user.fullName}</p>
          <p className="text-xs text-slate-500">{roleLabel(ticket.user.role)}</p>
        </div>
      ) : <EmptyValue />,
    },
    { key: "status", header: "Durum", render: (ticket) => <StatusBadge ticket={ticket} /> },
  ];

  const activeFilters = [
    ...(statusFilter ? [{ key: "durum", label: STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label || "", onRemove: () => setStatusFilter("") }] : []),
  ];

  return (
    <section className="space-y-3">
      <PageHeader
        icon="support"
        title="Destek"
        description="Programla ilgili sorun ve isteklerinizi destek ekibine iletin; yanıtlar burada görünür."
        stats={waitingCount > 0 ? [{ label: "Yanıt bekleyen", value: waitingCount, color: "text-amber-700" }] : undefined}
        actions={(
          <>
            <Button variant="secondary" icon={MessageCircle} onClick={() => window.open(WHATSAPP_URL, "_blank", "noopener,noreferrer")}>
              WhatsApp ile yaz
            </Button>
            {canWrite && <Button icon={Plus} onClick={openForm}>Yeni talep</Button>}
          </>
        )}
      />

      {!canWrite && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          Talep açma izniniz yok. Acil durumlarda WhatsApp destek hattına yazabilir veya klinik yöneticinize iletebilirsiniz.
        </p>
      )}

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Konu, mesaj veya gönderen ara" wrapperClassName="flex-1 min-w-[220px]" />
        <Select aria-label="Durum" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="sm:w-52">
          {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      </Toolbar>
      <ActiveFilters filters={activeFilters} />

      <ListTable
        columns={columns}
        rows={filtered}
        rowKey={(ticket) => ticket.id}
        loading={loading}
        error={loadError}
        onRetry={() => void load()}
        emptyIcon={LifeBuoy}
        emptyText={tickets.length === 0 ? "Henüz destek talebi yok" : "Aramanızla eşleşen talep yok"}
        emptyDescription={tickets.length === 0 && canWrite ? "Programda takıldığınız bir yer olursa buradan yazın; yanıtı bu listede görürsünüz." : undefined}
        emptyAction={tickets.length === 0 && canWrite ? <Button icon={Plus} onClick={openForm}>Yeni talep</Button> : undefined}
        onRowClick={setSelected}
        getRowAriaLabel={(ticket) => `${ticket.subject} talebini aç`}
        mobileCard={(ticket) => (
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-semibold text-slate-900">{ticket.subject}</p>
              <StatusBadge ticket={ticket} />
            </div>
            <p className="truncate text-xs text-slate-500">{ticket.message}</p>
            <p className="text-xs text-slate-400">{formatDateTime(ticket.createdAt)}{ticket.user ? ` · ${ticket.user.fullName}` : ""}</p>
          </div>
        )}
      />

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.subject || "Destek talebi"}
        description={selected ? `${formatDateTime(selected.createdAt)}${selected.user ? ` · ${selected.user.fullName}` : ""}` : undefined}
        size="lg"
        trackFormChanges={false}
        footer={<Button variant="secondary" onClick={() => setSelected(null)}>Kapat</Button>}
      >
        {selected && (
          <div className="space-y-4">
            <StatusBadge ticket={selected} />
            <div>
              <p className="mb-1 text-xs font-bold text-slate-500">Mesaj</p>
              <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-800">{selected.message}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold text-slate-500">Destek ekibinin yanıtı</p>
              {selected.answer ? (
                <p className="whitespace-pre-wrap rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">{selected.answer}</p>
              ) : (
                <p className="text-sm text-slate-500">Henüz yanıt gelmedi. Acil ise WhatsApp destek hattına yazabilirsiniz.</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Yeni destek talebi"
        description="Talebiniz CepKlinik destek ekibine gider; yanıt bu sayfada görünür."
        size="md"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>Vazgeç</Button>
            <Button onClick={() => void send()} loading={sending}>Gönder</Button>
          </>
        )}
      >
        <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <FormField label="Konu" htmlFor="destek-konu" required>
            <Select id="destek-konu" value={form.topic} onChange={(event) => setForm((current) => ({ ...current, topic: event.target.value }))}>
              {SUPPORT_TOPICS.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
            </Select>
          </FormField>
          {form.topic === "Diğer" && (
            <FormField label="Konu başlığı" htmlFor="destek-konu-ozel" required error={formSubmitted ? formErrors.subject : undefined}>
              <Input id="destek-konu-ozel" maxLength={120} value={form.customSubject} placeholder="örn: Yazıcı çıktısı" onChange={(event) => setForm((current) => ({ ...current, customSubject: event.target.value }))} />
            </FormField>
          )}
          <FormField
            label="Mesaj"
            htmlFor="destek-mesaj"
            required
            error={formSubmitted ? formErrors.message : undefined}
            hint="Hangi ekranda, hangi adımda ne olduğunu yazın. Hastanın TC veya telefon numarasını yazmayın."
          >
            <Textarea id="destek-mesaj" rows={5} maxLength={MESSAGE_MAX} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} />
          </FormField>
          <FormErrorBanner message={formError} />
        </form>
      </Modal>
    </section>
  );
}
