"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Circle, Download, FileText, LogIn, MessageSquarePlus, Pencil, Power, SlidersHorizontal, UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { formatPhoneNumber } from "@/lib/format";
import { getPlanPrice, type BillingCycleId, type SubscriptionPlanId } from "@/lib/subscription-plans";
import { BranchesPanel } from "@/components/superadmin/BranchesPanel";
import { GhostLoginModal } from "@/components/superadmin/GhostLoginModal";
import { InstitutionEditModal, type EditableInstitution } from "@/components/superadmin/InstitutionEditModal";
import { InstitutionUsersPanel, type InstitutionUser } from "@/components/superadmin/InstitutionUsersPanel";
import { InvoiceCreateModal } from "@/components/superadmin/InvoiceCreateModal";
import { InvoiceRowActions } from "@/components/superadmin/InvoiceRowActions";
import { SmsAdjustModal, SmsSaleModal } from "@/components/superadmin/SmsCreditModals";
import type { InvoiceViewStatus } from "@/components/superadmin/invoice-status";
import { INVOICE_STATUS_META, WHATSAPP_STATUS_META, cycleLabel, institutionState, planLabel } from "@/components/superadmin/sa-labels";
import { count, dateTime, daysUntil, money, shortDate } from "@/components/superadmin/sa-format";
import { SaRequestError, errorMessage, saGet, saSend } from "@/components/superadmin/sa-fetch";

type InvoiceRow = {
  id: string;
  invoiceNo: string;
  amount: number;
  description: string | null;
  status: InvoiceViewStatus;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
  lastReminderAt: string | null;
  reminderCount: number;
};

type SmsRow = {
  id: string;
  createdAt: string;
  packageName: string | null;
  quantity: number;
  smsCount: number;
  totalPrice: number;
  balanceAfter: number;
};

type Institution = EditableInstitution & {
  smsBalance: number;
  isActive: boolean;
  isDemo: boolean;
  demoExpiresAt: string | null;
  paymentGraceUntil: string | null;
  createdAt: string;
  whatsappEnabled: boolean;
  owner: { id: string; fullName: string; email: string | null } | null;
  users: InstitutionUser[];
  invoices: InvoiceRow[];
  smsTransactions: SmsRow[];
  whatsappProvider?: { exists: boolean; connectionStatus?: string; verifiedName?: string | null; name?: string; displayPhoneNumber?: string | null };
  usage: { activeUsers: number; activeDoctors: number };
  paymentSummary: {
    overdueCount: number;
    overdueAmount: number;
    pendingCount: number;
    openCount: number;
    paidCount: number;
    unpaidTotal: number;
    upcomingAmount: number;
    nextDueDate: string | null;
    totalInvoices: number;
  };
};

const TAB_KEYS = ["ozet", "faturalar", "sms", "personel", "subeler"] as const;

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-semibold text-slate-900">{children}</dd>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="ui-surface p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Klinik dosyası. Önceden abonelik, şube, fatura, personel ve SMS tek uzun
 * sayfada alt alta; başlıkta beş eylem yan yanaydı. Şimdi sekmeler (adres
 * çubuğunda ?tab=), başlıkta tek birincil eylem (Düzenle) + gizli giriş;
 * seyrek ve riskli işler Özet › Diğer işlemler altında, onaylı.
 */
export default function InstitutionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useTabParam(TAB_KEYS, "ozet");

  const [institution, setInstitution] = useState<Institution | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [editOpen, setEditOpen] = useState(false);
  const [ghostOpen, setGhostOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [justCreated] = useState(() => searchParams.get("yeni") === "1");

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    saGet<Institution>(`/api/superadmin/institutions/${id}`, "Klinik bilgisi yüklenemedi.", controller.signal)
      .then(setInstitution)
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoadError({ message: errorMessage(error, "Klinik bilgisi yüklenemedi."), notFound: error instanceof SaRequestError && error.status === 404 });
      });
    return () => controller.abort();
  }, [id, reloadKey]);

  // ?yeni=1 yalnız ilk açılışta "kurulum adımları"nı vurgulamak için; adres temizlenir.
  useEffect(() => {
    if (searchParams.get("yeni") === "1") {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("yeni");
      router.replace(`/superadmin/institutions/${id}${next.toString() ? `?${next.toString()}` : ""}`, { scroll: false });
    }
  }, [id, router, searchParams]);

  const state = useMemo(() => (institution ? institutionState(institution) : null), [institution]);

  if (loadError && !institution) {
    return (
      <section className="space-y-4">
        <PageHeader icon="institutions" title={loadError.notFound ? "Klinik bulunamadı" : "Klinik dosyası"} back={{ href: "/superadmin/institutions", label: "Klinikler" }} />
        {loadError.notFound ? (
          <EmptyState title="Bu klinik bulunamadı" description="Klinik silinmiş ya da bağlantı hatalı olabilir." action={<Button variant="secondary" href="/superadmin/institutions">Klinik listesine dön</Button>} />
        ) : (
          <LoadErrorState message={loadError.message} onRetry={reload} />
        )}
      </section>
    );
  }

  if (!institution || !state) {
    return (
      <section className="space-y-4">
        <PageHeader icon="institutions" title="Klinik dosyası" back={{ href: "/superadmin/institutions", label: "Klinikler" }} />
        <div className="ui-surface overflow-hidden"><ListRowSkeleton rows={5} /></div>
      </section>
    );
  }

  const summary = institution.paymentSummary;
  const planPrice = getPlanPrice(institution.subscriptionPlan as SubscriptionPlanId, (institution.billingCycle || "AYLIK") as BillingCycleId);
  const nextDueDays = daysUntil(summary.nextDueDate);
  const clinicForModals = { id: institution.id, name: institution.name, smsBalance: institution.smsBalance };

  const exportData = async () => {
    const ok = await confirmDialog({
      title: "Klinik verisi indirilsin mi?",
      message: `${institution.name} kliniğinin tüm hasta, ödeme, tedavi ve reçete kayıtları Excel dosyası olarak bilgisayarınıza inecek. Bu kişisel sağlık verisidir (KVKK): yalnız klinik istediyse indirin, güvenli saklayın, işiniz bitince silin. İndirme Denetim Günlüğü'ne yazılır.`,
      confirmText: "İndir",
      cancelText: "Vazgeç",
    });
    if (ok) window.location.href = `/api/superadmin/institutions/${institution.id}/export`;
  };

  const toggleActive = async () => {
    const closing = institution.isActive;
    const ok = await confirmDialog(closing ? {
      title: "Klinik kapatılsın mı?",
      message: `${institution.name} kliniğinin tüm kullanıcıları hemen sisteme giremez olur. Kayıtlar silinmez; istediğiniz zaman yeniden açabilirsiniz. Ödeme gecikmesi için kapatmak yerine fatura vadesinin işlemesini bekleyin ya da Düzenle › Hizmet durumu'nu kullanın.`,
      confirmText: "Kliniği kapat",
      cancelText: "Vazgeç",
      danger: true,
    } : {
      title: "Klinik yeniden açılsın mı?",
      message: `${institution.name} kliniğinin kullanıcıları yeniden giriş yapabilir.`,
      confirmText: "Yeniden aç",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    setToggling(true);
    try {
      if (closing) await saSend(`/api/superadmin/institutions/${institution.id}`, "DELETE", undefined, "Klinik kapatılamadı.");
      else await saSend(`/api/superadmin/institutions/${institution.id}`, "PUT", { isActive: true }, "Klinik açılamadı.");
      showToastSafe({ type: "success", message: closing ? `${institution.name} kapatıldı.` : `${institution.name} yeniden açıldı.`, icon: "institutions" });
      reload();
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "İşlem yapılamadı.") });
    } finally {
      setToggling(false);
    }
  };

  // Yeni açılan klinik için sıradaki adımlar (ölü uç kalmasın).
  const setupSteps = [
    { key: "invoice", done: summary.totalInvoices > 0, label: "İlk dönem faturasını kesin", action: <Button size="sm" variant="secondary" icon={FileText} onClick={() => setInvoiceOpen(true)}>Fatura kes</Button> },
    { key: "sms", done: institution.smsTransactions.length > 0 || institution.smsBalance > 0, label: "SMS paketi satın (hatırlatma SMS'leri için)", action: <Button size="sm" variant="secondary" icon={MessageSquarePlus} onClick={() => setSaleOpen(true)}>Paket sat</Button> },
    { key: "login", done: false, label: `Klinik yöneticisine giriş bilgisini iletin: klinik adı "${institution.name}", TC kimlik no ve geçici şifre`, action: <Button size="sm" variant="ghost" onClick={() => setTab("personel")}>Personel</Button> },
  ];
  const showSetup = justCreated || summary.totalInvoices === 0;

  const invoiceColumns: ListTableColumn<InvoiceRow>[] = [
    {
      key: "invoice",
      header: "Fatura",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{row.description || "Platform faturası"}</p>
          <p className="text-xs text-slate-500">{row.invoiceNo}</p>
        </div>
      ),
    },
    { key: "amount", header: "Tutar", align: "right", render: (row) => <span className="font-semibold tabular-nums">{money(row.amount)}</span> },
    { key: "dueDate", header: "Vade", render: (row) => shortDate(row.dueDate) || <EmptyValue /> },
    {
      key: "status",
      header: "Durum",
      render: (row) => (
        <div>
          <Badge tone={INVOICE_STATUS_META[row.status].tone}>{INVOICE_STATUS_META[row.status].label}</Badge>
          {row.status === "PAID" && row.paidAt && <p className="mt-0.5 text-xs text-slate-500">{shortDate(row.paidAt)}</p>}
        </div>
      ),
    },
    { key: "actions", header: "", align: "right", render: (row) => <InvoiceRowActions invoice={{ ...row, institutionName: institution.name }} onChanged={reload} /> },
  ];

  const smsColumns: ListTableColumn<SmsRow>[] = [
    { key: "createdAt", header: "Tarih", render: (row) => shortDate(row.createdAt) || <EmptyValue /> },
    { key: "package", header: "Paket", render: (row) => <span>{row.packageName || "—"}{row.quantity > 1 ? ` × ${row.quantity}` : ""}</span> },
    { key: "smsCount", header: "SMS", align: "right", render: (row) => <span className="font-semibold tabular-nums">+{count(row.smsCount)}</span> },
    { key: "totalPrice", header: "Tutar", align: "right", render: (row) => <span className="tabular-nums">{money(row.totalPrice)}</span> },
    { key: "balanceAfter", header: "Sonraki bakiye", align: "right", render: (row) => <span className="tabular-nums text-slate-600">{count(row.balanceAfter)}</span> },
  ];

  const whatsappStatus = institution.whatsappProvider?.exists
    ? WHATSAPP_STATUS_META[institution.whatsappProvider.connectionStatus || ""]?.label || "Durum bilinmiyor"
    : "Bağlanmadı";

  return (
    <section className="space-y-4">
      <PageHeader
        icon="institutions"
        back={{ href: "/superadmin/institutions", label: "Klinikler" }}
        title={institution.name}
        description={`${planLabel(institution.subscriptionPlan, institution.billingCycle)} · ${institution.owner?.fullName || "Klinik yöneticisi atanmamış"}`}
        actions={
          <>
            <Badge tone={state.tone} size="md" title={state.detail}>{state.label}</Badge>
            <Button variant="secondary" icon={LogIn} disabled={!institution.isActive} onClick={() => setGhostOpen(true)}>Gizli giriş</Button>
            <Button icon={Pencil} onClick={() => setEditOpen(true)}>Düzenle</Button>
          </>
        }
      />

      <Tabs
        ariaLabel="Klinik dosyası bölümleri"
        value={tab}
        onChange={setTab}
        items={[
          { key: "ozet", label: "Özet" },
          { key: "faturalar", label: "Faturalar", count: summary.overdueCount || summary.openCount, countTone: summary.overdueCount > 0 ? "critical" : "neutral" },
          { key: "sms", label: "SMS" },
          { key: "personel", label: "Personel", count: institution.usage.activeUsers },
          { key: "subeler", label: "Şubeler" },
        ]}
      />

      {tab === "ozet" && (
        <div className="space-y-4">
          {showSetup && (
            <section className="ui-surface border-primary/30 p-4">
              <h2 className="text-sm font-bold text-slate-900">{justCreated ? "Klinik açıldı — sıradaki adımlar" : "Kurulum adımları"}</h2>
              <ol className="mt-2 divide-y divide-slate-100">
                {setupSteps.map((step) => (
                  <li key={step.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex min-w-0 items-start gap-2 text-sm text-slate-700">
                      {step.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Tamam" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />}
                      <span className={step.done ? "text-slate-500 line-through" : ""}>{step.label}</span>
                    </span>
                    {!step.done && step.action}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {state.key !== "NORMAL" && (
            <p className={`rounded-lg border px-4 py-3 text-sm ${state.tone === "critical" ? "border-red-200 bg-red-50 text-red-800" : state.tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-primary/20 bg-primary/5 text-slate-700"}`}>
              <strong>{state.label}:</strong> {state.detail}
              {institution.serviceNote ? <><br /><span className="text-xs">Kliniğe gösterilen not: {institution.serviceNote}</span></> : null}
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Abonelik ve borç" action={<Button size="sm" variant="ghost" onClick={() => setTab("faturalar")}>Faturalar</Button>}>
              <dl className="divide-y divide-slate-100">
                <InfoRow label="Plan">{planLabel(institution.subscriptionPlan, institution.billingCycle)}</InfoRow>
                <InfoRow label={`Plan ücreti (${cycleLabel(institution.billingCycle).toLocaleLowerCase("tr-TR")})`}>{planPrice != null ? money(planPrice) : "Özel teklif"}</InfoRow>
                <InfoRow label="Açık borç">
                  {summary.openCount === 0 ? <span className="text-emerald-700">Borç yok</span> : <>{money(summary.unpaidTotal)} <span className="text-xs font-normal text-slate-500">({summary.openCount} fatura)</span></>}
                </InfoRow>
                {summary.overdueCount > 0 && (
                  <InfoRow label="Gecikmiş"><span className="text-red-700">{money(summary.overdueAmount)} · {summary.overdueCount} fatura</span></InfoRow>
                )}
                <InfoRow label="Sıradaki vade">
                  {summary.nextDueDate ? (
                    <>{shortDate(summary.nextDueDate)} {nextDueDays != null && <span className={`text-xs font-normal ${nextDueDays < 0 ? "text-red-700" : nextDueDays <= 7 ? "text-amber-700" : "text-slate-500"}`}>({nextDueDays < 0 ? `${-nextDueDays} gün geçti` : nextDueDays === 0 ? "bugün" : `${nextDueDays} gün kaldı`})</span>}</>
                  ) : <EmptyValue />}
                </InfoRow>
                <InfoRow label="Aktif kullanıcı">{institution.usage.activeUsers} / {institution.maxActiveUsers ?? "sınırsız"}</InfoRow>
                <InfoRow label="Aktif doktor">{institution.usage.activeDoctors} / {institution.maxActiveDoctors ?? "sınırsız"}</InfoRow>
                {institution.isDemo && <InfoRow label="Demo bitişi">{shortDate(institution.demoExpiresAt) || "Süresiz"}</InfoRow>}
              </dl>
            </Panel>

            <Panel title="İletişim" action={<Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditOpen(true)}>Düzenle</Button>}>
              <dl className="divide-y divide-slate-100">
                <InfoRow label="Klinik yöneticisi">{institution.owner?.fullName || <EmptyValue />}</InfoRow>
                <InfoRow label="E-posta">{institution.email || <EmptyValue />}</InfoRow>
                <InfoRow label="Telefon">{institution.phone ? formatPhoneNumber(institution.phone) : <EmptyValue />}</InfoRow>
                <InfoRow label="Adres">{institution.address || <EmptyValue />}</InfoRow>
                <InfoRow label="Vergi no">{institution.taxNo || <EmptyValue />}</InfoRow>
                <InfoRow label="SMS bakiyesi">{count(institution.smsBalance)} SMS</InfoRow>
                <InfoRow label="WhatsApp">
                  {institution.whatsappEnabled ? whatsappStatus : "Kapalı"}{" "}
                  <Link href="/superadmin/sms?tab=whatsapp" className="text-xs font-semibold text-primary hover:underline">Yönet</Link>
                </InfoRow>
                <InfoRow label="Açılış">{shortDate(institution.createdAt) || <EmptyValue />}</InfoRow>
              </dl>
            </Panel>
          </div>

          <Panel title="Diğer işlemler">
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="secondary" size="sm" icon={UploadCloud} href={`/superadmin/institutions/${institution.id}/import`}>Toplu veri aktarımı</Button>
              <Button variant="secondary" size="sm" icon={Download} onClick={() => void exportData()}>Verileri indir</Button>
              <Button variant="secondary" size="sm" icon={SlidersHorizontal} href={`/superadmin/audit?institutionId=${institution.id}`}>Bu kliniğin işlem kayıtları</Button>
              <Button variant={institution.isActive ? "danger" : "secondary"} size="sm" icon={Power} loading={toggling} onClick={() => void toggleActive()}>
                {institution.isActive ? "Kliniği kapat" : "Kliniği yeniden aç"}
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {tab === "faturalar" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="text-sm text-slate-500">
              Açık faturaların tamamı ve son kapanan 20 fatura. {summary.totalInvoices > institution.invoices.length && (
                <Link href={`/superadmin/invoices?institutionId=${institution.id}`} className="font-semibold text-primary hover:underline">Tüm faturalar ({summary.totalInvoices})</Link>
              )}
            </p>
            <Button variant="secondary" icon={FileText} onClick={() => setInvoiceOpen(true)}>Dönem faturası kes</Button>
          </div>
          <ListTable<InvoiceRow>
            columns={invoiceColumns}
            rows={institution.invoices}
            rowKey={(row) => row.id}
            emptyText="Henüz fatura yok"
            emptyDescription="İlk dönem faturasını “Dönem faturası kes” ile oluşturun."
            rowClassName={(row) => (row.status === "CANCELLED" ? "opacity-60" : "")}
            mobileCard={(row) => (
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{row.description || "Platform faturası"}</p>
                    <p className="text-xs text-slate-500">{row.invoiceNo} · vade {shortDate(row.dueDate) || "—"}</p>
                  </div>
                  <Badge tone={INVOICE_STATUS_META[row.status].tone}>{INVOICE_STATUS_META[row.status].label}</Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold tabular-nums text-slate-900">{money(row.amount)}</span>
                  <InvoiceRowActions invoice={{ ...row, institutionName: institution.name }} onChanged={reload} />
                </div>
              </div>
            )}
          />
        </div>
      )}

      {tab === "sms" && (
        <div className="space-y-3">
          <div className="ui-surface flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm text-slate-500">SMS bakiyesi</p>
              <p className={`text-2xl font-black tabular-nums ${institution.smsBalance < 50 ? "text-amber-700" : "text-slate-900"}`}>{count(institution.smsBalance)} SMS</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setAdjustOpen(true)}>Bakiyeyi düzelt</Button>
              <Button variant="secondary" icon={MessageSquarePlus} onClick={() => setSaleOpen(true)}>Paket sat</Button>
            </div>
          </div>
          <ListTable<SmsRow>
            columns={smsColumns}
            rows={institution.smsTransactions}
            rowKey={(row) => row.id}
            emptyText="Henüz SMS satışı yok"
            emptyDescription="Paket satışları burada listelenir. Faturasız düzeltmeler Denetim Günlüğü'nde görünür."
            mobileCard={(row) => (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{row.packageName || "SMS paketi"}{row.quantity > 1 ? ` × ${row.quantity}` : ""}</p>
                  <p className="text-xs text-slate-500">{dateTime(row.createdAt)}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold tabular-nums">+{count(row.smsCount)} SMS</p>
                  <p className="text-xs text-slate-500">{money(row.totalPrice)}</p>
                </div>
              </div>
            )}
          />
        </div>
      )}

      {tab === "personel" && (
        <InstitutionUsersPanel
          institutionId={institution.id}
          users={institution.users}
          limits={{ activeUsers: institution.usage.activeUsers, maxUsers: institution.maxActiveUsers, activeDoctors: institution.usage.activeDoctors, maxDoctors: institution.maxActiveDoctors }}
          onChanged={reload}
        />
      )}

      {tab === "subeler" && <BranchesPanel institutionId={institution.id} onChanged={reload} />}

      <InstitutionEditModal open={editOpen} institution={institution} onClose={() => setEditOpen(false)} onSaved={reload} />
      <GhostLoginModal institution={ghostOpen ? institution : null} onClose={() => setGhostOpen(false)} />
      <InvoiceCreateModal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        onCreated={reload}
        lockedClinic={{ id: institution.id, name: institution.name, subscriptionPlan: institution.subscriptionPlan, billingCycle: institution.billingCycle, isActive: institution.isActive }}
        existingInvoices={institution.invoices.map((row) => ({ institutionId: institution.id, description: row.description, status: row.status, invoiceNo: row.invoiceNo }))}
      />
      <SmsSaleModal clinic={saleOpen ? clinicForModals : null} onClose={() => setSaleOpen(false)} onDone={reload} />
      <SmsAdjustModal clinic={adjustOpen ? clinicForModals : null} onClose={() => setAdjustOpen(false)} onDone={reload} />
    </section>
  );
}
