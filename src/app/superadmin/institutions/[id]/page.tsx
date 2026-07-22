"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil, Plus, Power, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { FormField, FormSection, inputErrorClass } from "@/components/ui/FormField";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { cachedGet } from "@/lib/client-cache";
import {
  SUBSCRIPTION_PLANS,
  getPlanPrice,
  type SubscriptionPlanId,
  type BillingCycleId,
} from "@/lib/subscription-plans";

type ServiceMode = "NORMAL" | "LIMITED" | "READ_ONLY" | "SUSPENDED";
type AdIntensity = "LOW" | "MEDIUM" | "HIGH";
type InvoiceStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";

type UserRow = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  identityNo: string | null;
};

type InvoiceRow = {
  id: string;
  invoiceNo: string;
  amount: number;
  description: string | null;
  status: InvoiceStatus;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
};

type SmsTransactionRow = {
  id: string;
  createdAt: string;
  smsPackage: { name: string; smsCount: number } | null;
  amount?: number | null;
  smsCount?: number | null;
};

type Institution = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  taxNo: string | null;
  registryNo: string | null;
  website: string | null;
  logo: string | null;
  subscriptionPlan: SubscriptionPlanId;
  billingCycle: BillingCycleId;
  smsBalance: number;
  isActive: boolean;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
  adIntensity: AdIntensity;
  adsEnabled: boolean;
  maxActiveDoctors: number | null;
  maxActiveUsers: number | null;
  paymentGraceUntil: string | null;
  serviceMode: ServiceMode;
  serviceNote: string | null;
  suspendedUntil: string | null;
  throttleMs: number;
  isDemo: boolean;
  demoExpiresAt: string | null;
  owner: { id: string; fullName: string; email: string; role: string } | null;
  users: UserRow[];
  smsTransactions: SmsTransactionRow[];
  invoices: InvoiceRow[];
  paymentSummary: { overdueCount: number; pendingCount: number; paidCount: number; unpaidTotal: number };
};

type EditForm = {
  name: string;
  email: string;
  phone: string;
  address: string;
  taxNo: string;
  website: string;
  subscriptionPlan: SubscriptionPlanId;
  billingCycle: BillingCycleId;
  isActive: boolean;
  serviceMode: ServiceMode;
  serviceNote: string;
  suspendedUntil: string;
  maxActiveUsers: string;
  maxActiveDoctors: string;
  adsEnabled: boolean;
  adIntensity: AdIntensity;
};

const SERVICE_MODE_HINTS: Record<ServiceMode, string> = {
  NORMAL: "Kısıtlama yok, klinik tüm işlemleri normal şekilde yapabilir.",
  LIMITED: "LIMITED: randevu/ödeme/hasta/personel yazma işlemleri kapalı, okuma açık.",
  READ_ONLY: "READ_ONLY: tüm yazma işlemleri kapalı, klinik sadece mevcut kayıtları görüntüleyebilir.",
  SUSPENDED: "SUSPENDED: klinik erişimi tamamen askıya alınmış.",
};

const SERVICE_MODE_TONE: Record<ServiceMode, BadgeTone> = {
  NORMAL: "success",
  LIMITED: "warning",
  READ_ONLY: "warning",
  SUSPENDED: "critical",
};

const INVOICE_STATUS_TONE: Record<InvoiceStatus, BadgeTone> = {
  PENDING: "warning",
  OVERDUE: "critical",
  PAID: "success",
  CANCELLED: "neutral",
};

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING: "Bekliyor",
  OVERDUE: "Gecikti",
  PAID: "Ödendi",
  CANCELLED: "İptal",
};

function formToInstitution(i: Institution): EditForm {
  return {
    name: i.name || "",
    email: i.email || "",
    phone: i.phone || "",
    address: i.address || "",
    taxNo: i.taxNo || "",
    website: i.website || "",
    subscriptionPlan: i.subscriptionPlan,
    billingCycle: i.billingCycle,
    isActive: i.isActive,
    serviceMode: i.serviceMode,
    serviceNote: i.serviceNote || "",
    suspendedUntil: i.suspendedUntil ? i.suspendedUntil.slice(0, 16) : "",
    maxActiveUsers: i.maxActiveUsers != null ? String(i.maxActiveUsers) : "",
    maxActiveDoctors: i.maxActiveDoctors != null ? String(i.maxActiveDoctors) : "",
    adsEnabled: i.adsEnabled,
    adIntensity: i.adIntensity,
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("tr-TR");
  } catch {
    return "-";
  }
}

function formatMoney(value: number) {
  return value.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
}

export default function InstitutionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const router = useRouter();

  const [institution, setInstitution] = useState<Institution | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [invoiceDescription, setInvoiceDescription] = useState("");
  const [invoiceSaving, setInvoiceSaving] = useState(false);

  const [ghostOpen, setGhostOpen] = useState(false);
  const [ghostPassword, setGhostPassword] = useState("");
  const [ghostLoading, setGhostLoading] = useState(false);
  const [ghostError, setGhostError] = useState<string | null>(null);

  const [deactivating, setDeactivating] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/superadmin/institutions/${id}`);
    if (res.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    if (!res.ok) {
      showToastSafe({ message: "Klinik bilgisi alınamadı", type: "error" });
      setLoading(false);
      return;
    }
    const data: Institution = await res.json();
    setInstitution(data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const bootstrap = async () => {
      const meData = await cachedGet<{ role?: string } | null>("/api/auth/me", 60_000);
      if (!meData || meData.role !== "SUPERADMIN") {
        router.replace("/superadmin");
        return;
      }
      await load();
    };
    void bootstrap();
  }, [load, router]);

  const nextDue = useMemo(() => {
    if (!institution) return null;
    const unpaid = institution.invoices
      .filter((inv) => inv.status !== "PAID" && inv.status !== "CANCELLED" && inv.dueDate)
      .sort((a, b) => new Date(a.dueDate as string).getTime() - new Date(b.dueDate as string).getTime());
    if (unpaid.length === 0) return null;
    const dueDate = new Date(unpaid[0].dueDate as string);
    const days = Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000);
    return { dueDate, days };
  }, [institution]);

  const dueBadge = useMemo(() => {
    if (!nextDue) return { tone: "success" as BadgeTone, label: "Güncel" };
    if (nextDue.days < 0) return { tone: "critical" as BadgeTone, label: "Gecikti — kısıtlı erişim" };
    if (nextDue.days <= 7) return { tone: "warning" as BadgeTone, label: `${nextDue.days} gün içinde dolacak` };
    return { tone: "success" as BadgeTone, label: "Güncel" };
  }, [nextDue]);

  const openEdit = () => {
    if (!institution) return;
    setEditForm(formToInstitution(institution));
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editForm || !institution) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      name: editForm.name,
      email: editForm.email,
      phone: editForm.phone,
      address: editForm.address,
      taxNo: editForm.taxNo,
      website: editForm.website,
      subscriptionPlan: editForm.subscriptionPlan,
      billingCycle: editForm.billingCycle,
      isActive: editForm.isActive,
      serviceMode: editForm.serviceMode,
      serviceNote: editForm.serviceNote,
      suspendedUntil: editForm.suspendedUntil ? new Date(editForm.suspendedUntil).toISOString() : null,
      maxActiveUsers: editForm.maxActiveUsers ? Number(editForm.maxActiveUsers) : null,
      maxActiveDoctors: editForm.maxActiveDoctors ? Number(editForm.maxActiveDoctors) : null,
      adsEnabled: editForm.adsEnabled,
      adIntensity: editForm.adIntensity,
    };
    const res = await fetch(`/api/superadmin/institutions/${institution.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Güncelleme başarısız" }));
      showToastSafe({ message: err.message || "Güncelleme başarısız", type: "error" });
      return;
    }
    showToastSafe({ message: "Klinik güncellendi", type: "success" });
    setEditOpen(false);
    void load();
  };

  const openInvoiceModal = () => {
    if (!institution) return;
    const price = getPlanPrice(institution.subscriptionPlan, institution.billingCycle);
    setInvoiceAmount(price != null ? String(price) : "");
    const due = new Date();
    if (institution.billingCycle === "YILLIK") due.setFullYear(due.getFullYear() + 1);
    else due.setMonth(due.getMonth() + 1);
    setInvoiceDueDate(due.toISOString().slice(0, 10));
    const planLabel = SUBSCRIPTION_PLANS[institution.subscriptionPlan].label;
    const cycleLabel = institution.billingCycle === "YILLIK" ? "Yıllık" : "Aylık";
    setInvoiceDescription(`${planLabel} Plan — ${cycleLabel}`);
    setInvoiceOpen(true);
  };

  const submitInvoice = async () => {
    if (!institution) return;
    const amountNum = Number(invoiceAmount);
    if (!amountNum || amountNum <= 0) {
      showToastSafe({ message: "Geçerli bir tutar girin", type: "error" });
      return;
    }
    if (!invoiceDueDate) {
      showToastSafe({ message: "Vade tarihi girin", type: "error" });
      return;
    }
    setInvoiceSaving(true);
    const res = await fetch("/api/superadmin/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        institutionId: institution.id,
        amount: amountNum,
        description: invoiceDescription,
        dueDate: new Date(invoiceDueDate).toISOString(),
        status: "PENDING",
      }),
    });
    setInvoiceSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Fatura oluşturulamadı" }));
      showToastSafe({ message: err.message || "Fatura oluşturulamadı", type: "error" });
      return;
    }
    showToastSafe({ message: "Fatura oluşturuldu", type: "success" });
    setInvoiceOpen(false);
    void load();
  };

  const markPaid = async (invoiceId: string) => {
    setMarkingPaidId(invoiceId);
    const res = await fetch(`/api/superadmin/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAID" }),
    });
    setMarkingPaidId(null);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "İşlem başarısız" }));
      showToastSafe({ message: err.message || "İşlem başarısız", type: "error" });
      return;
    }
    showToastSafe({ message: "Fatura ödendi olarak işaretlendi", type: "success" });
    void load();
  };

  const deactivate = async () => {
    if (!institution) return;
    const ok = await confirmDialog({
      title: "Kliniği Pasife Al",
      message: `"${institution.name}" kliniğini pasife almak istediğinize emin misiniz? Klinik kullanıcıları giriş yapamayacak.`,
      confirmText: "Pasife Al",
      danger: true,
    });
    if (!ok) return;
    setDeactivating(true);
    const res = await fetch(`/api/superadmin/institutions/${institution.id}`, { method: "DELETE" });
    setDeactivating(false);
    if (!res.ok) {
      showToastSafe({ message: "İşlem başarısız", type: "error" });
      return;
    }
    showToastSafe({ message: "Klinik pasife alındı", type: "success" });
    void load();
  };

  const activate = async () => {
    if (!institution) return;
    setDeactivating(true);
    const res = await fetch(`/api/superadmin/institutions/${institution.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    setDeactivating(false);
    if (!res.ok) {
      showToastSafe({ message: "İşlem başarısız", type: "error" });
      return;
    }
    showToastSafe({ message: "Klinik aktif edildi", type: "success" });
    void load();
  };

  const enterAsGhost = async () => {
    if (!institution || !ghostPassword) return;
    setGhostLoading(true);
    setGhostError(null);
    const res = await fetch("/api/auth/superadmin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionId: institution.id, password: ghostPassword }),
    });
    setGhostLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Hata" }));
      setGhostError(err.message || "Giriş başarısız");
      return;
    }
    window.open("/anasayfa", "_blank");
    setGhostOpen(false);
    setGhostPassword("");
  };

  const userColumns: ListTableColumn<UserRow>[] = [
    { key: "fullName", header: "Ad Soyad", render: (u) => <span className="font-semibold text-slate-900">{u.fullName}</span> },
    { key: "email", header: "E-posta", render: (u) => u.email },
    { key: "role", header: "Rol", render: (u) => u.role },
    {
      key: "isActive",
      header: "Durum",
      align: "center",
      render: (u) => <Badge tone={u.isActive ? "success" : "critical"}>{u.isActive ? "Aktif" : "Pasif"}</Badge>,
    },
    { key: "createdAt", header: "Kayıt Tarihi", render: (u) => formatDate(u.createdAt) },
  ];

  const invoiceColumns: ListTableColumn<InvoiceRow>[] = [
    { key: "invoiceNo", header: "Fatura No", render: (inv) => <span className="font-semibold text-slate-900">{inv.invoiceNo}</span> },
    { key: "description", header: "Açıklama", render: (inv) => inv.description || "-" },
    { key: "amount", header: "Tutar", align: "right", render: (inv) => formatMoney(inv.amount) },
    { key: "dueDate", header: "Vade", render: (inv) => formatDate(inv.dueDate) },
    {
      key: "status",
      header: "Durum",
      align: "center",
      render: (inv) => <Badge tone={INVOICE_STATUS_TONE[inv.status]}>{INVOICE_STATUS_LABEL[inv.status]}</Badge>,
    },
    { key: "paidAt", header: "Ödeme Tarihi", render: (inv) => formatDate(inv.paidAt) },
    {
      key: "action",
      header: "İşlem",
      align: "center",
      render: (inv) =>
        inv.status !== "PAID" ? (
          <Button size="sm" variant="secondary" loading={markingPaidId === inv.id} onClick={() => void markPaid(inv.id)}>
            Ödendi İşaretle
          </Button>
        ) : (
          <span className="text-xs text-slate-400">-</span>
        ),
    },
  ];

  const smsColumns: ListTableColumn<SmsTransactionRow>[] = [
    { key: "createdAt", header: "Tarih", render: (t) => formatDate(t.createdAt) },
    { key: "package", header: "Paket", render: (t) => t.smsPackage?.name || "-" },
    { key: "smsCount", header: "SMS Adedi", align: "right", render: (t) => (t.smsPackage?.smsCount ?? t.smsCount ?? "-").toLocaleString?.("tr-TR") ?? (t.smsPackage?.smsCount ?? t.smsCount ?? "-") },
    { key: "amount", header: "Tutar", align: "right", render: (t) => (t.amount != null ? formatMoney(t.amount) : "-") },
  ];

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm text-slate-400">Yükleniyor...</p>
        </div>
      </main>
    );
  }

  if (notFound || !institution) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <Button variant="secondary" size="sm" icon={ArrowLeft} href="/superadmin/institutions">
            Geri
          </Button>
          <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            Klinik bulunamadı.
          </div>
        </div>
      </main>
    );
  }

  const price = getPlanPrice(institution.subscriptionPlan, institution.billingCycle);

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Header */}
        <header className="rounded-2xl bg-white p-5 shadow-sm border space-y-3">
          <Button variant="ghost" size="sm" icon={ArrowLeft} href="/superadmin/institutions">
            Geri
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900">{institution.name}</h1>
                <Badge tone={institution.isActive ? "success" : "critical"}>{institution.isActive ? "Aktif" : "Pasif"}</Badge>
                {institution.serviceMode !== "NORMAL" && (
                  <Badge tone={SERVICE_MODE_TONE[institution.serviceMode]} title={SERVICE_MODE_HINTS[institution.serviceMode]}>
                    {institution.serviceMode}
                  </Badge>
                )}
                {institution.isDemo && <Badge tone="info">Demo</Badge>}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Sahip: <span className="font-semibold text-slate-700">{institution.owner?.fullName || "-"}</span>
                {" · "}{institution.email}
                {institution.phone ? ` · ${institution.phone}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={Eye}
                onClick={() => { setGhostOpen(true); setGhostPassword(""); setGhostError(null); }}
              >
                Kliniğe Gir
              </Button>
              <Button variant="primary" size="sm" icon={Pencil} onClick={openEdit}>
                Düzenle
              </Button>
              {institution.isActive ? (
                <Button variant="danger" size="sm" icon={Power} loading={deactivating} onClick={() => void deactivate()}>
                  Kliniği Pasife Al
                </Button>
              ) : (
                <Button variant="primary" size="sm" icon={Power} loading={deactivating} onClick={() => void activate()}>
                  Kliniği Aktif Et
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Payment / subscription status card */}
        <section className="rounded-2xl bg-white p-5 shadow-sm border">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900">Abonelik ve Ödeme Durumu</h2>
            <Button variant="secondary" size="sm" icon={Plus} onClick={openInvoiceModal}>
              Yeni Dönem Faturası Oluştur
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatBox label="Plan" value={`${SUBSCRIPTION_PLANS[institution.subscriptionPlan].label} · ${institution.billingCycle === "YILLIK" ? "Yıllık" : "Aylık"}`} />
            <StatBox label="Tutar" value={price != null ? formatMoney(price) : "Özel Teklif"} />
            <StatBox label="Gecikmiş Fatura" value={String(institution.paymentSummary.overdueCount)} />
            <StatBox label="Bekleyen Fatura" value={String(institution.paymentSummary.pendingCount)} />
            <StatBox label="Ödenmemiş Toplam" value={formatMoney(institution.paymentSummary.unpaidTotal)} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-xs font-semibold text-slate-500">Sıradaki Vade:</span>
            <span className="text-sm font-semibold text-slate-800">{nextDue ? formatDate(nextDue.dueDate.toISOString()) : "-"}</span>
            <Badge tone={dueBadge.tone}>{dueBadge.label}</Badge>
          </div>
        </section>

        {/* Invoices */}
        <section className="space-y-2">
          <h2 className="text-sm font-black text-slate-900">Faturalar</h2>
          <ListTable columns={invoiceColumns} rows={institution.invoices} rowKey={(r) => r.id} emptyText="Fatura bulunamadı" />
        </section>

        {/* Users */}
        <section className="space-y-2">
          <h2 className="text-sm font-black text-slate-900">Kullanıcılar</h2>
          <ListTable columns={userColumns} rows={institution.users} rowKey={(r) => r.id} emptyText="Kullanıcı bulunamadı" />
        </section>

        {/* SMS transactions */}
        <section className="space-y-2">
          <h2 className="text-sm font-black text-slate-900">SMS İşlemleri</h2>
          <ListTable columns={smsColumns} rows={institution.smsTransactions} rowKey={(r) => r.id} emptyText="SMS işlemi bulunamadı" />
        </section>
      </div>

      {/* Edit modal */}
      {editForm && (
        <Modal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title="Klinik Bilgilerini Düzenle"
          size="lg"
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditOpen(false)}>İptal</Button>
              <Button variant="primary" loading={saving} onClick={() => void saveEdit()}>Kaydet</Button>
            </>
          }
        >
          <div className="space-y-4">
            <FormSection icon={Pencil} title="Genel Bilgiler">
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Klinik Adı" required>
                  <input
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => f && { ...f, name: e.target.value })}
                  />
                </FormField>
                <FormField label="E-posta" required>
                  <input
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => f && { ...f, email: e.target.value })}
                  />
                </FormField>
                <FormField label="Telefon">
                  <input
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => f && { ...f, phone: e.target.value })}
                  />
                </FormField>
                <FormField label="Vergi No">
                  <input
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
                    value={editForm.taxNo}
                    onChange={(e) => setEditForm((f) => f && { ...f, taxNo: e.target.value })}
                  />
                </FormField>
                <FormField label="Web Sitesi">
                  <input
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
                    value={editForm.website}
                    onChange={(e) => setEditForm((f) => f && { ...f, website: e.target.value })}
                  />
                </FormField>
                <FormField label="Adres">
                  <input
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
                    value={editForm.address}
                    onChange={(e) => setEditForm((f) => f && { ...f, address: e.target.value })}
                  />
                </FormField>
              </div>
            </FormSection>

            <FormSection icon={ShieldAlert} title="Abonelik">
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Plan">
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    value={editForm.subscriptionPlan}
                    onChange={(e) => setEditForm((f) => f && { ...f, subscriptionPlan: e.target.value as SubscriptionPlanId })}
                  >
                    <option value="TEMEL">Temel</option>
                    <option value="PROFESYONEL">Profesyonel</option>
                    <option value="KURUMSAL">Kurumsal</option>
                  </select>
                </FormField>
                <FormField label="Fatura Periyodu">
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    value={editForm.billingCycle}
                    onChange={(e) => setEditForm((f) => f && { ...f, billingCycle: e.target.value as BillingCycleId })}
                  >
                    <option value="AYLIK">Aylık</option>
                    <option value="YILLIK">Yıllık</option>
                  </select>
                </FormField>
                <FormField label="Maks. Aktif Kullanıcı" hint="Boş bırakılırsa sınırsız">
                  <input
                    type="number"
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
                    value={editForm.maxActiveUsers}
                    onChange={(e) => setEditForm((f) => f && { ...f, maxActiveUsers: e.target.value })}
                  />
                </FormField>
                <FormField label="Maks. Aktif Doktor" hint="Boş bırakılırsa sınırsız">
                  <input
                    type="number"
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
                    value={editForm.maxActiveDoctors}
                    onChange={(e) => setEditForm((f) => f && { ...f, maxActiveDoctors: e.target.value })}
                  />
                </FormField>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(e) => setEditForm((f) => f && { ...f, isActive: e.target.checked })}
                  />
                  Klinik Aktif
                </label>
              </div>
            </FormSection>

            <FormSection icon={ShieldAlert} title="Servis Modu">
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Servis Modu" hint={SERVICE_MODE_HINTS[editForm.serviceMode]}>
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    value={editForm.serviceMode}
                    onChange={(e) => setEditForm((f) => f && { ...f, serviceMode: e.target.value as ServiceMode })}
                  >
                    <option value="NORMAL">NORMAL</option>
                    <option value="LIMITED">LIMITED</option>
                    <option value="READ_ONLY">READ_ONLY</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </FormField>
                <FormField label="Askıya Alma Bitiş Tarihi" hint="SUSPENDED modunda otomatik geri dönüş için">
                  <input
                    type="datetime-local"
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
                    value={editForm.suspendedUntil}
                    onChange={(e) => setEditForm((f) => f && { ...f, suspendedUntil: e.target.value })}
                  />
                </FormField>
                <div className="md:col-span-2">
                  <FormField label="Servis Notu" hint="Klinik yönetici panelinde gösterilebilir">
                    <textarea
                      className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
                      rows={2}
                      value={editForm.serviceNote}
                      onChange={(e) => setEditForm((f) => f && { ...f, serviceNote: e.target.value })}
                    />
                  </FormField>
                </div>
              </div>
            </FormSection>

            <FormSection icon={ShieldAlert} title="Reklamlar">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={editForm.adsEnabled}
                    onChange={(e) => setEditForm((f) => f && { ...f, adsEnabled: e.target.checked })}
                  />
                  Reklamlar Aktif
                </label>
                <FormField label="Reklam Yoğunluğu">
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    value={editForm.adIntensity}
                    onChange={(e) => setEditForm((f) => f && { ...f, adIntensity: e.target.value as AdIntensity })}
                  >
                    <option value="LOW">Düşük</option>
                    <option value="MEDIUM">Orta</option>
                    <option value="HIGH">Yüksek</option>
                  </select>
                </FormField>
              </div>
            </FormSection>
          </div>
        </Modal>
      )}

      {/* Invoice creation modal */}
      <Modal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        title="Yeni Dönem Faturası Oluştur"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInvoiceOpen(false)}>İptal</Button>
            <Button variant="primary" loading={invoiceSaving} onClick={() => void submitInvoice()}>Fatura Oluştur</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Tutar (TL)" required>
            <input
              type="number"
              className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
              value={invoiceAmount}
              onChange={(e) => setInvoiceAmount(e.target.value)}
            />
          </FormField>
          <FormField label="Vade Tarihi" required>
            <input
              type="date"
              className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
              value={invoiceDueDate}
              onChange={(e) => setInvoiceDueDate(e.target.value)}
            />
          </FormField>
          <FormField label="Açıklama">
            <input
              className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
              value={invoiceDescription}
              onChange={(e) => setInvoiceDescription(e.target.value)}
            />
          </FormField>
        </div>
      </Modal>

      {/* Ghost login modal */}
      <Modal
        open={ghostOpen}
        onClose={() => setGhostOpen(false)}
        title="Kliniğe Gizli Giriş"
        description={`${institution.name} kliniğine giriş yapmak için superadmin şifrenizi girin.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGhostOpen(false)}>İptal</Button>
            <Button variant="primary" loading={ghostLoading} disabled={!ghostPassword} onClick={() => void enterAsGhost()}>
              Giriş Yap
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Bu giriş hiçbir log kaydına yansımaz.
          </p>
          <FormField label="Superadmin Şifresi" required>
            <input
              type="password"
              autoFocus
              className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputErrorClass(false)}`}
              value={ghostPassword}
              onChange={(e) => setGhostPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void enterAsGhost()}
            />
          </FormField>
          {ghostError && <p className="text-sm text-red-600">{ghostError}</p>}
        </div>
      </Modal>
    </main>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}
