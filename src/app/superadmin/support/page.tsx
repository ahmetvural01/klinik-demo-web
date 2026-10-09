"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Reply } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Toolbar } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { createModuleEmptyIcon } from "@/components/ui/ModuleIcon";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { roleLabel } from "@/lib/staff-roles";
import { dateTime } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet, saSend } from "@/components/superadmin/sa-fetch";

const SupportEmptyIcon = createModuleEmptyIcon("support");

type Ticket = {
  id: string;
  subject: string;
  message: string;
  answer: string | null;
  status: string;
  closedAt: string | null;
  createdAt: string;
  user: { fullName: string; role: string; email: string | null } | null;
  institution: { id: string; name: string } | null;
};

const STATUS_KEYS = ["open", "answered", "closed", "all"] as const;

function ticketState(ticket: Ticket): { label: string; tone: BadgeTone } {
  if (ticket.status === "CLOSED") return { label: "Kapatıldı", tone: "neutral" };
  if (ticket.answer) return { label: "Yanıtlandı", tone: "success" };
  return { label: "Yanıt bekliyor", tone: "warning" };
}

/**
 * Destek talepleri — iş kuyruğu: varsayılan sekme yanıt bekleyenler (en eski
 * üstte). Filtre ve sayaçlar sunucudan gelir, sayfalanır. Talep silinmez,
 * kapatılır (yeniden açılabilir).
 */
export default function SupportPage() {
  const [status, setStatus] = useTabParam(STATUS_KEYS, "open", "durum");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [counts, setCounts] = useState({ open: 0, answered: 0, closed: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [replyTicket, setReplyTicket] = useState<Ticket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => { setPage(1); }, [status, debouncedQuery]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ page: String(page) });
    if (status !== "all") params.set("status", status);
    if (debouncedQuery) params.set("q", debouncedQuery);
    saGet<{ tickets: Ticket[]; total: number; totalPages: number; counts: typeof counts }>(`/api/superadmin/support?${params.toString()}`, "Destek talepleri yüklenemedi.", controller.signal)
      .then((data) => {
        setTickets(Array.isArray(data?.tickets) ? data.tickets : []);
        setTotal(data?.total ?? 0);
        setTotalPages(data?.totalPages ?? 1);
        if (data?.counts) setCounts(data.counts);
      })
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "Destek talepleri yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [status, page, debouncedQuery, reloadKey]);

  const openReply = (ticket: Ticket) => {
    setReplyTicket(ticket);
    setReplyText(ticket.answer ?? "");
    setReplyError(null);
  };

  const submitReply = async () => {
    if (!replyTicket) return;
    if (!replyText.trim()) return setReplyError("Yanıtınızı yazın.");
    setSaving(true);
    setReplyError(null);
    try {
      await saSend("/api/superadmin/support", "PATCH", { id: replyTicket.id, answer: replyText.trim() }, "Yanıt kaydedilemedi.");
      showToastSafe({ type: "success", message: "Yanıt kaydedildi; kliniğin Destek ekranında görünür.", icon: "support" });
      setReplyTicket(null);
      reload();
    } catch (error) {
      setReplyError(errorMessage(error, "Yanıt kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const toggleClosed = async (ticket: Ticket) => {
    const closing = ticket.status !== "CLOSED";
    if (closing && !ticket.answer) {
      const ok = await confirmDialog({
        title: "Yanıtsız talep kapatılsın mı?",
        message: `"${ticket.subject}" talebine henüz yanıt yazılmadı. Kapatılırsa yanıt bekleyenler listesinden çıkar; gerekirse “Kapatılanlar”dan yeniden açabilirsiniz.`,
        confirmText: "Kapat",
        cancelText: "Vazgeç",
      });
      if (!ok) return;
    }
    setBusyId(ticket.id);
    try {
      await saSend("/api/superadmin/support", "PATCH", { id: ticket.id, action: closing ? "close" : "reopen" }, "Talep güncellenemedi.");
      showToastSafe({ type: "success", message: closing ? "Talep kapatıldı." : "Talep yeniden açıldı.", icon: "support" });
      reload();
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Talep güncellenemedi.") });
    } finally {
      setBusyId(null);
    }
  };

  const who = (ticket: Ticket) => (
    <span className="text-xs text-slate-500">
      {ticket.institution ? <Link href={`/superadmin/institutions/${ticket.institution.id}`} className="font-semibold text-primary hover:underline">{ticket.institution.name}</Link> : "Klinik bilinmiyor"}
      {ticket.user ? ` · ${ticket.user.fullName} (${roleLabel(ticket.user.role)})` : ""}
      {ticket.user?.email ? ` · ${ticket.user.email}` : ""}
    </span>
  );

  const actions = (ticket: Ticket) => (
    <div className="flex items-center justify-end gap-1.5">
      {ticket.status !== "CLOSED" && (
        <Button size="sm" variant="secondary" icon={Reply} onClick={() => openReply(ticket)}>
          {ticket.answer ? "Yanıtı düzenle" : "Yanıtla"}
        </Button>
      )}
      <IconButton
        icon={ticket.status === "CLOSED" ? ArchiveRestore : Archive}
        title={ticket.status === "CLOSED" ? "Yeniden aç" : "Kapat"}
        size="sm"
        disabled={busyId === ticket.id}
        onClick={() => void toggleClosed(ticket)}
      />
    </div>
  );

  const columns: ListTableColumn<Ticket>[] = [
    {
      key: "ticket",
      header: "Talep",
      render: (ticket) => (
        <div className="min-w-0 max-w-2xl space-y-0.5">
          <p className="font-semibold text-slate-900">{ticket.subject}</p>
          <p className="line-clamp-2 text-sm text-slate-600">{ticket.message}</p>
          {ticket.answer && <p className="line-clamp-2 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800"><span className="font-semibold">Yanıt:</span> {ticket.answer}</p>}
          {who(ticket)}
        </div>
      ),
    },
    { key: "date", header: "Tarih", render: (ticket) => <span className="whitespace-nowrap text-sm text-slate-600">{dateTime(ticket.createdAt)}</span> },
    { key: "status", header: "Durum", render: (ticket) => { const state = ticketState(ticket); return <Badge tone={state.tone}>{state.label}</Badge>; } },
    { key: "actions", header: "", align: "right", render: actions },
  ];

  return (
    <section className="space-y-4">
      <PageHeader icon="support" title="Destek Talepleri" description="Kliniklerden gelen soruları yanıtlayın. Yanıt kliniğin Destek ekranında görünür." />

      <Tabs
        ariaLabel="Talep durumu"
        size="sm"
        value={status}
        onChange={setStatus}
        items={[
          { key: "open", label: "Yanıt bekleyen", count: counts.open, countTone: "warning" },
          { key: "answered", label: "Yanıtlanan", count: counts.answered },
          { key: "closed", label: "Kapatılan", count: counts.closed },
          { key: "all", label: "Tümü" },
        ]}
      />

      <ListTable<Ticket>
        header={
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder="Konu, mesaj, klinik veya kişi" wrapperClassName="flex-1 min-w-[220px]" />
          </Toolbar>
        }
        columns={columns}
        rows={tickets}
        rowKey={(ticket) => ticket.id}
        loading={loading}
        error={loadError}
        onRetry={reload}
        rowClassName={(ticket) => (ticket.status === "CLOSED" ? "opacity-60" : "")}
        emptyText={status === "open" && !debouncedQuery ? "Yanıt bekleyen talep yok" : "Bu filtrede talep yok"}
        emptyIcon={SupportEmptyIcon}
        emptyIllustrative
        pager={{ page, pageCount: totalPages, pageSize: 30, total, onPageChange: setPage }}
        mobileCard={(ticket) => {
          const state = ticketState(ticket);
          return (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-semibold text-slate-900">{ticket.subject}</p>
                <Badge tone={state.tone}>{state.label}</Badge>
              </div>
              <p className="line-clamp-3 text-sm text-slate-600">{ticket.message}</p>
              {who(ticket)}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">{dateTime(ticket.createdAt)}</span>
                {actions(ticket)}
              </div>
            </div>
          );
        }}
      />

      <Modal
        open={Boolean(replyTicket)}
        onClose={() => setReplyTicket(null)}
        title={replyTicket?.answer ? "Yanıtı düzenle" : "Talebi yanıtla"}
        description={replyTicket ? `${replyTicket.institution?.name ?? "Klinik"} · ${replyTicket.subject}` : undefined}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReplyTicket(null)}>Vazgeç</Button>
            <Button loading={saving} onClick={() => void submitReply()}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormErrorBanner message={replyError} />
          <p className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{replyTicket?.message}</p>
          <FormField label="Yanıtınız" htmlFor="support-reply" required hint="Kliniğin Destek ekranında görünür; kliniğe ayrıca SMS/e-posta bildirimi gitmez.">
            <Textarea id="support-reply" rows={5} maxLength={5000} value={replyText} onChange={(event) => setReplyText(event.target.value)} />
          </FormField>
        </div>
      </Modal>
    </section>
  );
}
