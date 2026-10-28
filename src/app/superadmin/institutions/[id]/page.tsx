"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Circle, Download, FileText, LogIn, MessageSquarePlus, Pencil, Power, ScrollText, UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Callout } from "@/components/ui/Callout";
import { Section } from "@/components/ui/Section";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { SettingsList, SettingsRow } from "@/components/ui/SettingsList";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
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
import { InvoiceRowActions, InvoiceReminderNote } from "@/components/superadmin/InvoiceRowActions";
import { SmsAdjustModal, SmsSaleModal } from "@/components/superadmin/SmsCreditModals";
import type { InvoiceViewStatus } from "@/components/superadmin/invoice-status";
import { INVOICE_STATUS_META, LOW_SMS_THRESHOLD, WHATSAPP_STATUS_META, cycleLabel, institutionState, planLabel } from "@/components/superadmin/sa-labels";
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
  lastReminderStatus?: string | null;
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
  /** Sahip, yoksa ilk aktif klinik yöneticisi (Klinikler listesiyle aynı kural). */
  contact?: { fullName: string; email: string | null; isOwner: boolean } | null;
  users: InstitutionUser[];
  invoices: InvoiceRow[];
  smsTransactions: SmsRow[];
  whatsappProvider?: { exists: boolean; connectionStatus?: string; verifiedName?: string | null; name?: string; displayPhoneNumber?: string | null };
  usage: { activeBranches?: number; activeUsers: number; activeDoctors: number };
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

/**
 * Klinik dosyası. Başlıkta tek birincil eylem (Düzenle), gizli giriş ve
 * seyrek/riskli işler "…" menüsünde (toplu aktarım, verileri indir, işlem
 * kayıtları, kliniği kapat — hepsi onaylı). Önceden aynı işler Özet'in
 * altında ayrı bir "Diğer işlemler" kartındaydı; plan ve yönetici adı hem
 * başlıkta hem Özet'te, "Düzenle" hem başlıkta hem İletişim kartında
 * yazıyordu. Erişim durumu (ödeme kilidi, askı, demo) tek yerde: sekmelerin
 * üstündeki uyarı kutusu.
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

  // ?yeni=1 yalnız ilk açılışta "sıradaki adımlar"ı göstermek için; adres temizlenir.
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
          <EmptyState title="Klinik silinmiş ya da bağlantı hatalı olabilir" action={<Button variant="secondary" href="/superadmin/institutions">Klinik listesine dön</Button>} />
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
        <PageSkeleton header={false} tabs={5} body="detail" label="Klinik dosyası yükleniyor" />
      </section>
    );
  }

  const summary = institution.paymentSummary;
  const planPrice = getPlanPrice(institution.subscriptionPlan as SubscriptionPlanId, (institution.billingCycle || "AYLIK") as BillingCycleId);
  const branchCount = Math.max(1, institution.usage.activeBranches ?? 1);
  const nextDueDays = daysUntil(summary.nextDueDate);
  const clinicForModals = { id: institution.id, name: institution.name, smsBalance: institution.smsBalance };
  const lowSms = institution.smsBalance < LOW_SMS_THRESHOLD;

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

  const menuItems: ActionMenuItem[] = [
    { key: "import", label: "Toplu veri aktarımı", icon: UploadCloud, href: `/superadmin/institutions/${institution.id}/import` },
    { key: "export", label: "Verileri indir", icon: Download, onSelect: () => void exportData() },
    { key: "audit", label: "Bu kliniğin işlem kayıtları", icon: ScrollText, href: `/superadmin/audit?institutionId=${institution.id}` },
    institution.isActive
      ? { key: "close", label: "Kliniği kapat", icon: Power, danger: true, separatorBefore: true, disabled: toggling, onSelect: () => void toggleActive() }
      : { key: "open", label: "Kliniği yeniden aç", icon: Power, separatorBefore: true, disabled: toggling, onSelect: () => void toggleActive() },
  ];

  // Yeni açılan klinik için sıradaki adımlar. Kart ilk fatura kesilince,
  // demo ya da kapalı klinikte (fatura beklenmez) kendiliğinden kalkar;
  // önceden faturasız demo klinikte hiç kaybolmuyordu. SMS adımı tek başına
  // kartı açık tutmaz: SMS kullanmayan, faturası düzenli klinikte kalıcı bir
  // "kurulum" uyarısı gereksiz tekrar olurdu (SMS bakiyesi zaten Özet'te).
  // Giriş bilgisinin iletilmesi izlenemediği için yalnız açılıştan hemen
  // sonra hatırlatılır.
  const setupSteps = [
    { key: "invoice", done: summary.totalInvoices > 0, label: "Açılış ayının faturasını kesin (sonraki aylar otomatik kesilir)", action: <Button size="sm" variant="secondary" icon={FileText} onClick={() => setInvoiceOpen(true)}>Fatura kes</Button> },
    { key: "sms", done: institution.smsTransactions.length > 0 || institution.smsBalance > 0, label: "SMS paketi satın (hatırlatma SMS'leri için)", action: <Button size="sm" variant="secondary" icon={MessageSquarePlus} onClick={() => setSaleOpen(true)}>Paket sat</Button> },
    ...(justCreated ? [{ key: "login", done: false, label: `Klinik yöneticisine giriş bilgisini iletin: klinik adı "${institution.name}", TC kimlik no ve geçici şifre`, action: <Button size="sm" variant="ghost" onClick={() => setTab("personel")}>Personel</Button> }] : []),
  ];
  const showSetup = justCreated || (institution.isActive && !institution.isDemo && summary.totalInvoices === 0);

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
          <InvoiceReminderNote invoice={row} />
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

  const whatsappMeta = institution.whatsappProvider?.exists ? WHATSAPP_STATUS_META[institution.whatsappProvider.connectionStatus || ""] : null;
  const whatsappValue = !institution.whatsappEnabled ? (
    <span className="text-slate-500">Kapalı</span>
  ) : (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone={whatsappMeta?.tone || "neutral"}>{whatsappMeta?.label || "Bağlanmadı"}</Badge>
      {institution.whatsappProvider?.displayPhoneNumber && <span className="text-slate-600">{institution.whatsappProvider.displayPhoneNumber}</span>}
    </span>
  );

  // Vadesi geçmiş fatura varsa en eski açık vade geçmiştir; "sıradaki vade"
  // demek yanlıştı (canlı test H20).
  const dueOverdue = nextDueDays != null && nextDueDays < 0;
  const dueValue = summary.nextDueDate ? (
    <>
      {shortDate(summary.nextDueDate)}{" "}
      {nextDueDays != null && (
        <span className={`text-xs ${nextDueDays < 0 ? "font-semibold text-red-700" : nextDueDays <= 7 ? "text-amber-700" : "text-slate-500"}`}>
          ({nextDueDays < 0 ? `${-nextDueDays} gün geçti` : nextDueDays === 0 ? "bugün" : `${nextDueDays} gün kaldı`})
        </span>
      )}
    </>
  ) : null;

  const contact = institution.contact ?? (institution.owner ? { fullName: institution.owner.fullName, email: institution.owner.email, isOwner: true } : null);

  return (
    <section className="space-y-4">
      <PageHeader
        icon="institutions"
        back={{ href: "/superadmin/institutions", label: "Klinikler" }}
        title={institution.name}
        description={`Açılış ${shortDate(institution.createdAt) || "—"}`}
        actions={
          <>
            <Button variant="secondary" icon={LogIn} onClick={() => setGhostOpen(true)}>Kliniğe gir</Button>
            <Button icon={Pencil} onClick={() => setEditOpen(true)}>Düzenle</Button>
            <ActionMenu items={menuItems} label="Diğer işlemler" size="md" />
          </>
        }
      />

      {loadError && (
        // İşlemden sonraki yenileme başarısız olduysa eldeki bilgi kalır ama
        // güncel olmayabileceği söylenir (önceden hata sessizce yutuluyordu).
        <Callout tone="warning" compact title="Klinik bilgisi yenilenemedi" action={<Button size="sm" variant="secondary" onClick={reload}>Yeniden dene</Button>}>
          Ekrandaki bilgiler güncel olmayabilir. {loadError.message}
        </Callout>
      )}

      {state.key !== "NORMAL" && (
        // Faturalara geçiş hemen alttaki sekmede (sayaçlı); uyarıda ayrıca düğme yok.
        <Callout tone={state.tone} title={state.label}>
          {state.detail}
          {institution.serviceNote ? <span className="mt-0.5 block text-xs">Kliniğe gösterilen not: {institution.serviceNote}</span> : null}
        </Callout>
      )}

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
            <Section title={justCreated ? "Klinik açıldı — sıradaki adımlar" : "Kurulum adımları"} padding="none">
              <SettingsList aria-label="Kurulum adımları">
                {setupSteps.map((step) => (
                  <SettingsRow
                    key={step.key}
                    icon={step.done ? CheckCircle2 : Circle}
                    title={<span className={step.done ? "text-slate-500 line-through" : ""}>{step.label}</span>}
                    status={step.done ? <Badge tone="success">Tamam</Badge> : undefined}
                    actions={step.done ? undefined : step.action}
                    muted={step.done}
                  />
                ))}
              </SettingsList>
            </Section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Abonelik ve kullanım">
              <DescriptionList
                layout="rows"
                items={[
                  { key: "plan", label: "Plan", value: planLabel(institution.subscriptionPlan, institution.billingCycle) },
                  {
                    key: "price",
                    label: `Plan ücreti (${cycleLabel(institution.billingCycle).toLocaleLowerCase("tr-TR")})`,
                    value: planPrice == null
                      ? <>Özel teklif <span className="text-xs text-slate-500">· elle faturalanır</span></>
                      : (
                        <>
                          {money(planPrice * branchCount)}
                          {branchCount > 1 && <span className="text-xs text-slate-500"> ({money(planPrice)} × {branchCount} şube)</span>}
                          <span className="block text-xs text-slate-500">
                            {institution.isDemo || !institution.isActive
                              ? "Demo ya da kapalı klinik: fatura kesilmez"
                              : institution.billingCycle === "YILLIK" ? "Yılda bir, dönem başında otomatik kesilir" : "Her ayın 1'inde otomatik kesilir (7 gün vade)"}
                          </span>
                        </>
                      ),
                  },
                  {
                    key: "debt",
                    label: "Açık borç",
                    value: summary.openCount === 0
                      ? <span className="text-emerald-700">Borç yok</span>
                      : <>{money(summary.unpaidTotal)} <span className="text-xs text-slate-500">({summary.openCount} fatura)</span></>,
                  },
                  { key: "overdue", label: "Gecikmiş", hidden: summary.overdueCount === 0, value: <span className="font-semibold text-red-700">{money(summary.overdueAmount)} · {summary.overdueCount} fatura</span> },
                  { key: "due", label: dueOverdue ? "En eski gecikmiş vade" : "Sıradaki vade", value: dueValue },
                  { key: "users", label: "Aktif kullanıcı", value: `${institution.usage.activeUsers} / ${institution.maxActiveUsers ?? "sınırsız"}` },
                  { key: "doctors", label: "Aktif doktor", value: `${institution.usage.activeDoctors} / ${institution.maxActiveDoctors ?? "sınırsız"}` },
                  { key: "sms", label: "SMS bakiyesi", value: <span className={lowSms ? "font-semibold text-amber-700" : ""}>{count(institution.smsBalance)} SMS</span> },
                  {
                    key: "whatsapp",
                    label: "WhatsApp",
                    value: (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {whatsappValue}
                        <Link href="/superadmin/sms?tab=whatsapp" className="text-xs font-semibold text-primary hover:underline">Yönet</Link>
                      </span>
                    ),
                  },
                  { key: "demo", label: "Demo bitişi", hidden: !institution.isDemo, value: shortDate(institution.demoExpiresAt) || "Süresiz" },
                ]}
              />
            </Section>

            <Section title="İletişim">
              <DescriptionList
                layout="rows"
                items={[
                  {
                    key: "contact",
                    label: "Klinik yöneticisi",
                    value: contact ? (
                      <>
                        {contact.fullName}
                        {!contact.isOwner && <span className="block text-xs text-slate-500">Sahip atanmamış; ilk aktif klinik yöneticisi</span>}
                      </>
                    ) : null,
                  },
                  { key: "email", label: "E-posta", value: institution.email },
                  { key: "phone", label: "Telefon", value: institution.phone ? formatPhoneNumber(institution.phone) : null },
                  { key: "address", label: "Adres", value: institution.address },
                  { key: "tax", label: "Vergi no", value: institution.taxNo },
                  { key: "web", label: "Web sitesi", hidden: !institution.website, value: institution.website },
                ]}
              />
            </Section>
          </div>
        </div>
      )}

      {tab === "faturalar" && (
        <ListTable<InvoiceRow>
          title="Faturalar"
          subtitle={(
            <>
              Açık faturaların tümü ve kapanan son 20 fatura.{" "}
              {summary.totalInvoices > institution.invoices.length && (
                <Link href={`/superadmin/invoices?institutionId=${institution.id}`} className="font-semibold text-primary hover:underline">Tüm faturalar ({summary.totalInvoices})</Link>
              )}
            </>
          )}
          actions={<Button size="sm" variant="secondary" icon={FileText} onClick={() => setInvoiceOpen(true)}>Fatura kes</Button>}
          columns={invoiceColumns}
          rows={institution.invoices}
          rowKey={(row) => row.id}
          emptyText="Henüz fatura yok"
          emptyDescription="Açılış ayının faturasını “Fatura kes” ile oluşturun; sonraki aylar otomatik kesilir."
          rowClassName={(row) => (row.status === "CANCELLED" ? "opacity-60" : "")}
          mobileCard={(row) => (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{row.description || "Platform faturası"}</p>
                  <p className="text-xs text-slate-500">{row.invoiceNo} · vade {shortDate(row.dueDate) || "—"}</p>
                  <InvoiceReminderNote invoice={row} />
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
      )}

      {tab === "sms" && (
        <ListTable<SmsRow>
          title="SMS satışları"
          subtitle={(
            <>
              Güncel bakiye{" "}
              <span className={`font-bold tabular-nums ${lowSms ? "text-amber-700" : "text-slate-800"}`}>{count(institution.smsBalance)} SMS</span>
              {lowSms ? ` · ${LOW_SMS_THRESHOLD} SMS'in altında` : ""}
            </>
          )}
          actions={(
            <>
              <Button size="sm" variant="ghost" onClick={() => setAdjustOpen(true)}>Bakiyeyi düzelt</Button>
              <Button size="sm" variant="secondary" icon={MessageSquarePlus} onClick={() => setSaleOpen(true)}>Paket sat</Button>
            </>
          )}
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
