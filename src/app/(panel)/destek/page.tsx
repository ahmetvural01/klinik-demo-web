"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LifeBuoy, MessageCircle, Plus } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";
import { roleLabel } from "@/lib/staff-roles";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { FormField } from "@/components/ui/FormField";
import { FormModal } from "@/components/ui/FormModal";
import { Textarea } from "@/components/ui/Input";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Modal } from "@/components/ui/Modal";
import { formatDateText } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { SearchInput } from "@/components/ui/SearchInput";
import { useTabParam } from "@/components/ui/Tabs";
import { Toolbar } from "@/components/ui/Toolbar";
import { matchesSearch } from "@/components/yonetim/search-text";
import { refreshPanelSummary } from "@/components/layout/use-panel-alerts";

type Ticket = {
  id: string;
  subject: string;
  message: string;
  answer: string | null;
  /** Yanıt zamanı ve kliniğin yanıtı açtığı an (açılmamışsa "Yeni yanıt"). */
  answeredAt?: string | null;
  answerSeenAt?: string | null;
  status?: string | null;
  closedAt?: string | null;
  createdAt: string;
  user?: { id: string; fullName: string; role: string } | null;
};

type TicketState = "bekliyor" | "yanitlandi" | "kapandi";
type StatusFilter = "tum" | TicketState;
const STATUS_FILTERS: readonly StatusFilter[] = ["tum", "bekliyor", "yanitlandi", "kapandi"];

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
type SupportTopic = (typeof SUPPORT_TOPICS)[number];

const WHATSAPP_URL = "https://api.whatsapp.com/send/?phone=903228028162";
const MESSAGE_MAX = 5000;
const SUBJECT_MAX = 120;

/**
 * Süperadmin listesiyle aynı kural: kapatılan talep (status CLOSED) yanıtsız
 * olsa da "Kapandı"dır. Önceden durum yalnız yanıta bakıyordu; kapatılmış
 * yanıtsız talep sonsuza dek "Yanıt bekliyor" görünüyordu.
 */
function ticketState(ticket: Ticket): TicketState {
  if (ticket.status === "CLOSED") return "kapandi";
  return ticket.answer ? "yanitlandi" : "bekliyor";
}

const STATE_BADGE: Record<TicketState, { tone: "warning" | "success" | "neutral"; label: string }> = {
  bekliyor: { tone: "warning", label: "Yanıt bekliyor" },
  yanitlandi: { tone: "success", label: "Yanıtlandı" },
  kapandi: { tone: "neutral", label: "Kapandı" },
};

const hasUnreadAnswer = (ticket: Ticket) => Boolean(ticket.answer && ticket.answeredAt && !ticket.answerSeenAt);

function StatusBadge({ ticket }: { ticket: Ticket }) {
  if (hasUnreadAnswer(ticket)) return <Badge tone="info">Yeni yanıt</Badge>;
  const state = STATE_BADGE[ticketState(ticket)];
  return <Badge tone={state.tone}>{state.label}</Badge>;
}

/**
 * Ayrı "Konu başlığı" alanı yok: konu + mesajın ilk satırı başlık olur.
 * Listede aynı konudan beş talep aynı adla görünmez; form iki alana iner.
 */
/**
 * Derin bağlantıdaki konu: tam ad ("SMS / WhatsApp") ya da adın bir parçası
 * ("SMS"). Listede olmayan değer yok sayılır (serbest başlık yazdırılmaz).
 */
function topicFromParam(value: string | null): SupportTopic | null {
  const wanted = (value || "").trim().toLocaleLowerCase("tr-TR");
  if (!wanted) return null;
  return SUPPORT_TOPICS.find((topic) => topic.toLocaleLowerCase("tr-TR") === wanted)
    ?? SUPPORT_TOPICS.find((topic) => topic.toLocaleLowerCase("tr-TR").split(" / ").includes(wanted))
    ?? null;
}

/** Ön doldurulan mesaj: en fazla 500 karakter (adres çubuğundan gelen metin kısa tutulur). */
const PREFILL_MAX = 500;

function buildSubject(topic: SupportTopic, message: string) {
  const firstLine = message.trim().split(/\r?\n/)[0]?.trim() || "";
  const text = firstLine ? `${topic} · ${firstLine}` : topic;
  return text.length > SUBJECT_MAX ? `${text.slice(0, SUBJECT_MAX - 1).trimEnd()}…` : text;
}

function DestekContent() {
  const { can } = usePermissions();
  const canWrite = can("support:write");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useTabParam<StatusFilter>(STATUS_FILTERS, "tum", "durum");
  const [selected, setSelected] = useState<Ticket | null>(null);
  // Yanıtlanmış talep açılınca yanıt "görüldü" olur; zildeki satır kalkar.
  const openTicket = useCallback((ticket: Ticket) => {
    setSelected(ticket);
    if (!hasUnreadAnswer(ticket)) return;
    const seenAt = new Date().toISOString();
    setTickets((current) => current.map((item) => (item.id === ticket.id ? { ...item, answerSeenAt: seenAt } : item)));
    void fetch(`/api/support/${encodeURIComponent(ticket.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seen: true }),
    }).then(() => refreshPanelSummary()).catch(() => undefined);
  }, []);

  const [formOpen, setFormOpen] = useState(false);
  const [topic, setTopic] = useState<SupportTopic>(SUPPORT_TOPICS[0]);
  const [message, setMessage] = useState("");
  // Formun açıldığı metin (ör. "Kredi iste" ön doldurması): dokunulmadan kapatılınca
  // "Değişiklikler kaybolsun mu?" sorulmasın; yalnız kullanıcının yazdığı değişiklik sayılır.
  const [initialMessage, setInitialMessage] = useState("");
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
      setLoaded(true);
    } catch (error) {
      // Eldeki liste korunur; üstte "yenilenemedi" şeridi görünür.
      setLoadError(error instanceof Error ? error.message : "Destek talepleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openForm = useCallback((prefill = "", initialTopic: SupportTopic = SUPPORT_TOPICS[0]) => {
    setTopic(initialTopic);
    setMessage(prefill);
    setInitialMessage(prefill);
    setFormSubmitted(false);
    setFormError(null);
    setFormOpen(true);
  }, []);

  // Derin bağlantı: ?yeni=1 formu açar (hesap menüsü, hata ekranındaki "Destek talebi aç");
  // ?hata=<kod> mesajın başına hata kodunu yazar; ?konu= konuyu seçer, ?metin= mesajı
  // doldurur (İletişim › "Kredi iste": boş form yerine hazır istek). Parametreler bir
  // kez okunup adresten silinir.
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || searchParams.get("yeni") !== "1") return;
    deepLinkHandled.current = true;
    const errorCode = (searchParams.get("hata") || "").replace(/[^\w-]/g, "").slice(0, 64);
    const prefillText = (searchParams.get("metin") || "").trim().slice(0, PREFILL_MAX);
    const prefillTopic = topicFromParam(searchParams.get("konu"));
    // Hata ekranından gelen talep hiçbir modüle ait değildir: konu "Diğer" seçili gelir.
    const prefill = errorCode ? `Hata kodu: ${errorCode}\n${prefillText}` : prefillText;
    if (canWrite) openForm(prefill, prefillTopic ?? (errorCode ? "Diğer" : SUPPORT_TOPICS[0]));
    const params = new URLSearchParams(searchParams.toString());
    params.delete("yeni");
    params.delete("hata");
    params.delete("konu");
    params.delete("metin");
    const rest = params.toString();
    window.history.replaceState(null, "", rest ? `${pathname}?${rest}` : pathname);
  }, [canWrite, openForm, pathname, searchParams]);

  const counts = useMemo(() => {
    const result: Record<TicketState, number> = { bekliyor: 0, yanitlandi: 0, kapandi: 0 };
    for (const ticket of tickets) result[ticketState(ticket)] += 1;
    return result;
  }, [tickets]);

  const filtered = useMemo(() => tickets.filter((ticket) => {
    if (statusFilter !== "tum" && ticketState(ticket) !== statusFilter) return false;
    return matchesSearch([ticket.subject, ticket.message, ticket.answer, ticket.user?.fullName], query);
  }), [query, statusFilter, tickets]);

  const messageError = !message.trim()
    ? "Sorunu veya isteğinizi yazın."
    : message.length > MESSAGE_MAX ? `Mesaj en fazla ${MESSAGE_MAX} karakter olabilir.` : undefined;

  const send = async () => {
    setFormSubmitted(true);
    setFormError(null);
    if (messageError) return;
    setSending(true);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: buildSubject(topic, message), message: message.trim() }),
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
      render: (ticket) => formatDateText(ticket.createdAt, "datetime"),
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
      // Tek satır: ad. Rol talep ayrıntısında yazar (her satırda ikinci satır gereksizdi).
      render: (ticket) => ticket.user ? <span className="text-sm text-slate-800">{ticket.user.fullName}</span> : <EmptyValue />,
    },
    { key: "status", header: "Durum", render: (ticket) => <StatusBadge ticket={ticket} /> },
  ];

  const selectedState = selected ? ticketState(selected) : null;
  const narrowed = statusFilter !== "tum" || Boolean(query.trim());

  return (
    <section className="space-y-3">
      <PageHeader
        icon="support"
        title="Destek"
        actions={(
          <>
            <Button variant="secondary" icon={MessageCircle} href={WHATSAPP_URL} target="_blank" title="WhatsApp destek hattı yeni sekmede açılır">
              WhatsApp ile yaz
            </Button>
            {canWrite && <Button icon={Plus} onClick={() => openForm()}>Yeni talep</Button>}
          </>
        )}
      />

      {!canWrite && (
        <Callout tone="neutral" role="note">
          Talep açma izniniz yok. Acil durumda WhatsApp destek hattına yazın veya klinik yöneticinize iletin.
        </Callout>
      )}

      <ListTable
        // Arama ve durum çipleri listenin kartının üst şeridinde (sadelik K1);
        // hiç talep yokken süzülecek bir şey olmadığı için şerit çizilmez.
        toolbar={loaded && tickets.length === 0 ? undefined : (
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder="Konu, mesaj veya gönderen ara" wrapperClassName="flex-1 min-w-[220px]" />
            <ChoiceCards
              label="Durum"
              labelHidden
              variant="pills"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "tum", label: "Tümü" },
                { value: "bekliyor", label: "Yanıt bekleyen", count: counts.bekliyor, countTone: "warning" },
                { value: "yanitlandi", label: "Yanıtlanan" },
                { value: "kapandi", label: "Kapanan" },
              ]}
            />
          </Toolbar>
        )}
        columns={columns}
        rows={filtered}
        rowKey={(ticket) => ticket.id}
        loading={loading && !loaded}
        error={loaded ? null : loadError}
        staleError={loaded ? loadError : null}
        onRetry={() => void load()}
        emptyIcon={LifeBuoy}
        emptyText={tickets.length === 0 ? "Henüz destek talebi yok" : query.trim() ? "Aramanızla eşleşen talep yok" : "Bu durumda talep yok"}
        emptyDescription={tickets.length === 0 && canWrite ? "Programda takıldığınız bir yer olursa buradan yazın." : undefined}
        emptyAction={tickets.length === 0 && canWrite
          ? <Button icon={Plus} onClick={() => openForm()}>Yeni talep</Button>
          : narrowed ? <Button variant="secondary" onClick={() => { setQuery(""); setStatusFilter("tum"); }}>Filtreleri temizle</Button> : undefined}
        onRowClick={openTicket}
        getRowAriaLabel={(ticket) => `${ticket.subject} talebini aç`}
        mobileCard={(ticket) => (
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-semibold text-slate-900">{ticket.subject}</p>
              <StatusBadge ticket={ticket} />
            </div>
            <p className="truncate text-xs text-slate-500">{ticket.message}</p>
            <p className="text-xs text-slate-400">{formatDateText(ticket.createdAt, "datetime")}{ticket.user ? ` · ${ticket.user.fullName}` : ""}</p>
          </div>
        )}
      />

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.subject || "Destek talebi"}
        description={selected ? `${formatDateText(selected.createdAt, "datetime")}${selected.user ? ` · ${selected.user.fullName}${selected.user.role ? ` (${roleLabel(selected.user.role)})` : ""}` : ""}` : undefined}
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
              ) : selectedState === "kapandi" ? (
                <p className="text-sm text-slate-500">
                  Talep destek ekibi tarafından kapatıldı{selected.closedAt ? ` (${formatDateText(selected.closedAt, "datetime")})` : ""}. Sorun sürüyorsa yeni talep açın.
                </p>
              ) : (
                <p className="text-sm text-slate-500">Henüz yanıt gelmedi. Acil ise WhatsApp destek hattına yazabilirsiniz.</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      <FormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Yeni destek talebi"
        size="md"
        onSubmit={() => send()}
        submitLabel="Gönder"
        submitting={sending}
        error={formError}
        isDirty={message.trim() !== initialMessage.trim()}
      >
        {/* Konu çip olarak seçilir (düğme); pencere açılınca odak doğrudan mesaja gelir. */}
        <ChoiceCards
          label="Konu"
          variant="pills"
          value={topic}
          onChange={setTopic}
          options={SUPPORT_TOPICS.map((item) => ({ value: item, label: item }))}
        />
        <FormField
          label="Mesaj"
          htmlFor="destek-mesaj"
          required
          error={formSubmitted ? messageError : undefined}
          hint="Hangi ekranda, hangi adımda ne olduğunu yazın. Hastanın TC veya telefon numarasını yazmayın."
        >
          <Textarea id="destek-mesaj" rows={5} maxLength={MESSAGE_MAX} value={message} onChange={(event) => setMessage(event.target.value)} />
        </FormField>
      </FormModal>
    </section>
  );
}

export default function DestekPage() {
  return (
    <Suspense fallback={<PageSkeleton toolbar body="table" rows={6} columns={4} label="Destek yükleniyor" />}>
      <DestekContent />
    </Suspense>
  );
}
