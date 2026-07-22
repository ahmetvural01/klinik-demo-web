"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { showToastSafe } from "@/lib/toast-client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { FormField, inputErrorClass } from "@/components/ui/FormField";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { ListPager } from "@/components/ui/ListPager";

type Invoice = {
  id: string;
  amount: number;
  status: string;
  description?: string;
  dueDate?: string | null;
  institutionId?: string;
  institution?: { id: string; name: string };
  createdAt: string;
  paidAt?: string;
};

type Summary = {
  total: number;
  pending: number;
  overdue: number;
  paid: number;
  totalAmount: number;
  unpaidAmount: number;
};

type InstitutionOption = { id: string; name: string };

const EMPTY_SUMMARY: Summary = { total: 0, pending: 0, overdue: 0, paid: 0, totalAmount: 0, unpaidAmount: 0 };

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Bekliyor", tone: "warning" },
  OVERDUE: { label: "Gecikti", tone: "critical" },
  PAID: { label: "Ödendi", tone: "success" },
  CANCELLED: { label: "İptal", tone: "neutral" },
};

const INP = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none";
const MONEY = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 });
const fmt = (n: number | string | null | undefined) => MONEY.format(Number(n) || 0);
const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("tr-TR"); } catch { return d; }
};

const PAGE_SIZE = 20;

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [markingOverdue, setMarkingOverdue] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => { setPage(1); }, [debouncedQ, status]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (debouncedQ) params.set("q", debouncedQ);
    fetch(`/api/superadmin/invoices?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setInvoices(Array.isArray(d) ? d : d.invoices ?? []);
        setSummary(d?.summary ?? EMPTY_SUMMARY);
      })
      .catch(() => {
        setInvoices([]);
        setSummary(EMPTY_SUMMARY);
        showToastSafe({ message: "Faturalar yüklenemedi", type: "error" });
      })
      .finally(() => setLoading(false));
  }, [status, debouncedQ]);

  useEffect(() => { load(); }, [load]);

  const pageCount = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));
  const pagedInvoices = useMemo(
    () => invoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [invoices, page],
  );

  const overdueAmount = useMemo(
    () => invoices.filter((i) => i.status === "OVERDUE").reduce((s, i) => s + Number(i.amount || 0), 0),
    [invoices],
  );

  const markPaid = async (id: string) => {
    const r = await fetch(`/api/superadmin/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAID" }),
    }).catch(() => null);
    if (r?.ok) {
      showToastSafe({ message: "Fatura ödendi olarak işaretlendi", type: "success" });
      load();
    } else {
      showToastSafe({ message: "Fatura güncellenemedi", type: "error" });
    }
  };

  const markOverdue = async () => {
    setMarkingOverdue(true);
    const r = await fetch("/api/superadmin/invoices/mark-overdue", { method: "POST" }).catch(() => null);
    setMarkingOverdue(false);
    if (r?.ok) {
      const d = await r.json().catch(() => ({}));
      const count = typeof d?.updated === "number" ? d.updated : null;
      showToastSafe({
        message: count !== null ? `${count} fatura gecikmiş olarak işaretlendi` : "Gecikmiş faturalar işaretlendi",
        type: "success",
      });
      load();
    } else {
      showToastSafe({ message: "Gecikmiş faturalar işaretlenemedi", type: "error" });
    }
  };

  const sendReminder = async (invoice: Invoice) => {
    setRemindingId(invoice.id);
    const r = await fetch("/api/superadmin/invoices/remind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: invoice.id, channels: ["EMAIL", "SMS"] }),
    }).catch(() => null);
    setRemindingId(null);
    if (r?.ok) {
      const d = await r.json().catch(() => ({ results: [] }));
      const results: Array<{ channel: string; success: boolean }> = Array.isArray(d?.results) ? d.results : [];
      const successCount = results.filter((res) => res.success).length;
      if (successCount === 0 && results.length > 0) {
        showToastSafe({ message: "Hatırlatma gönderilemedi", type: "error" });
      } else {
        showToastSafe({
          message: `Hatırlatma gönderildi (${successCount}/${results.length} kanal başarılı)`,
          type: successCount === results.length ? "success" : "info",
        });
      }
    } else {
      const e = await r?.json().catch(() => ({}));
      showToastSafe({ message: e?.message || "Hatırlatma gönderilemedi", type: "error" });
    }
  };

  // ── Yeni fatura oluşturma ────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [form, setForm] = useState({ institutionId: "", amount: "", description: "", dueDate: "" });
  const [formErrors, setFormErrors] = useState<{ institutionId?: string; amount?: string }>({});
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setCreateOpen(true);
    if (institutions.length === 0) {
      fetch("/api/superadmin/institutions", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setInstitutions(Array.isArray(d) ? d.map((i: { id: string; name: string }) => ({ id: i.id, name: i.name })) : []))
        .catch(() => setInstitutions([]));
    }
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setForm({ institutionId: "", amount: "", description: "", dueDate: "" });
    setFormErrors({});
  };

  const submitCreate = async () => {
    const errors: { institutionId?: string; amount?: string } = {};
    if (!form.institutionId) errors.institutionId = "Klinik seçimi zorunlu";
    if (!form.amount || Number(form.amount) <= 0) errors.amount = "Geçerli bir tutar giriniz";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    const r = await fetch("/api/superadmin/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        institutionId: form.institutionId,
        amount: Number(form.amount),
        description: form.description || undefined,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
      }),
    }).catch(() => null);
    setSaving(false);

    if (r?.ok) {
      showToastSafe({ message: "Fatura oluşturuldu", type: "success" });
      closeCreate();
      load();
    } else {
      const e = await r?.json().catch(() => ({}));
      showToastSafe({ message: e?.message || "Fatura oluşturulamadı", type: "error" });
    }
  };

  const columns: ListTableColumn<Invoice>[] = [
    { key: "klinik", header: "Klinik", render: (inv) => <span className="font-medium text-slate-900">{inv.institution?.name ?? "—"}</span> },
    { key: "aciklama", header: "Açıklama", render: (inv) => <span className="text-slate-600">{inv.description ?? "—"}</span> },
    { key: "tutar", header: "Tutar", align: "right", render: (inv) => <span className="font-semibold text-slate-900">{fmt(inv.amount)}</span> },
    { key: "vade", header: "Vade Tarihi", render: (inv) => <span className="text-slate-500">{fmtDate(inv.dueDate)}</span> },
    {
      key: "durum",
      header: "Durum",
      render: (inv) => {
        const meta = STATUS_META[inv.status] ?? { label: inv.status, tone: "neutral" as BadgeTone };
        return <Badge tone={meta.tone}>{meta.label}</Badge>;
      },
    },
    { key: "olusturma", header: "Oluşturma Tarihi", render: (inv) => <span className="text-slate-500">{fmtDate(inv.createdAt)}</span> },
    {
      key: "islem",
      header: "İşlem",
      render: (inv) => (
        <div className="flex flex-wrap items-center gap-2">
          {inv.status !== "PAID" && (
            <Button size="sm" variant="primary" onClick={() => markPaid(inv.id)}>
              Ödendi İşaretle
            </Button>
          )}
          {(inv.status === "PENDING" || inv.status === "OVERDUE") && (
            <Button
              size="sm"
              variant="secondary"
              loading={remindingId === inv.id}
              onClick={() => sendReminder(inv)}
            >
              Hatırlatma Gönder
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">💳</span>
          <h2 className="text-2xl font-bold text-gray-900">Faturalar</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Klinik / açıklama ara…"
            className="w-52 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Tümü</option>
            <option value="PENDING">Bekliyor</option>
            <option value="OVERDUE">Gecikti</option>
            <option value="PAID">Ödendi</option>
            <option value="CANCELLED">İptal</option>
          </select>
          <Button variant="secondary" onClick={load}>Yenile</Button>
          <Button variant="secondary" loading={markingOverdue} onClick={markOverdue}>
            Gecikmiş Faturaları İşaretle
          </Button>
          <Button variant="primary" onClick={openCreate}>Yeni Fatura Oluştur</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm sm:grid-cols-4 sm:divide-y-0">
        {[
          { label: "Toplam", value: fmt(summary.totalAmount), tone: "text-primary" },
          { label: "Ödendi", value: String(summary.paid), tone: "text-emerald-700" },
          { label: "Bekliyor", value: fmt(summary.unpaidAmount), tone: "text-amber-700" },
          { label: "Gecikmiş", value: fmt(overdueAmount), tone: "text-red-700" },
        ].map((stat) => (
          <div key={stat.label} className="p-4">
            <p className="text-xs font-bold uppercase text-slate-500">{stat.label}</p>
            <p className={`mt-1 text-xl font-black ${stat.tone}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <ListTable
        columns={columns}
        rows={pagedInvoices}
        rowKey={(inv) => inv.id}
        loading={loading}
        emptyText="Fatura bulunamadı"
      />
      {invoices.length > 0 && (
        <ListPager
          page={page}
          pageCount={pageCount}
          pageSize={PAGE_SIZE}
          total={invoices.length}
          onPageChange={setPage}
          loading={loading}
        />
      )}

      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="Yeni Fatura Oluştur"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closeCreate}>İptal</Button>
            <Button variant="primary" loading={saving} onClick={submitCreate}>Fatura Oluştur</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Klinik" required error={formErrors.institutionId}>
            <select
              value={form.institutionId}
              onChange={(e) => setForm((f) => ({ ...f, institutionId: e.target.value }))}
              className={`${INP} ${inputErrorClass(Boolean(formErrors.institutionId))}`}
            >
              <option value="">Seçiniz…</option>
              {institutions.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Tutar" required error={formErrors.amount}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className={`${INP} ${inputErrorClass(Boolean(formErrors.amount))}`}
              placeholder="0.00"
            />
          </FormField>
          <FormField label="Açıklama">
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={INP}
              placeholder="Örn. Temmuz 2026 abonelik ücreti"
            />
          </FormField>
          <FormField label="Vade Tarihi">
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className={INP}
            />
          </FormField>
        </div>
      </Modal>
    </section>
  );
}
