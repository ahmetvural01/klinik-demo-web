"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Pencil, Printer, Wallet, XCircle } from "lucide-react";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { DescriptionList, type DescriptionItem } from "@/components/ui/DescriptionList";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Section } from "@/components/ui/Section";
import { formatDateText } from "@/components/ui/Money";
import { clientMutation } from "@/lib/client-mutation";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { usePatientFile } from "./PatientFileContext";
import { InstallmentModal } from "./InstallmentModal";
import { printAccountStatement, printInstallmentPlan } from "./print";
import { printPaymentReceipt } from "@/components/finance/payment-receipt";
import {
  getItemAmount,
  getItemDueDate,
  getItemPaid,
  getItemRemaining,
  getPlanRemaining,
  getPlanTotal,
  isChargeableExam,
  isOpenInstallment,
  isPendingExam,
  money,
  paymentMethodLabel,
  sharedName,
  TAKSIT_ITEM_STATUS_LABELS,
  TAKSIT_ITEM_STATUS_TONE,
  TAKSIT_PLAN_STATUS_LABELS,
  TAKSIT_PLAN_STATUS_TONE,
  toNumber,
  type Pay,
  type TaksitItem,
  type TaksitPlan,
} from "./patient-file-shared";

/** Taksidin ekrandaki durumu: bekleyen ama kısmen ödenmiş taksit "Kısmen ödendi" yazar. */
function installmentStatus(item: TaksitItem) {
  if ((item.status === "BEKLIYOR" || item.status === "GECIKTI") && getItemPaid(item) > 0.004) {
    return item.status === "GECIKTI" ? { label: "Gecikti · kısmen ödendi", tone: TAKSIT_ITEM_STATUS_TONE.GECIKTI } : { label: TAKSIT_ITEM_STATUS_LABELS.KISMI, tone: TAKSIT_ITEM_STATUS_TONE.KISMI };
  }
  return { label: TAKSIT_ITEM_STATUS_LABELS[item.status] || item.status, tone: TAKSIT_ITEM_STATUS_TONE[item.status] || "neutral" };
}

/**
 * Hesap: borç özeti, tahsilatlar ve taksit planları. Bankonun günlük işi
 * (tahsilat, taksit, döküm) ve muhasebe bakışı (bakiye, plan kalanı) burada.
 */
export function FinanceTab() {
  const { data, reload, can, balance, balanceKnown, openPayment, getLetterhead, hidePatientPhone } = usePatientFile();
  const [installmentOpen, setInstallmentOpen] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [expandedPlans, setExpandedPlans] = useState<Record<string, boolean>>({});

  const canCollect = can("payments:write");
  const canRefund = can("payments:refund");
  const canPlan = can("installments:write");
  const canCancelPlan = can("installments:delete");
  const debt = balance.totalDebt;

  const payments = useMemo(() => [...data.payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [data.payments]);
  const plans = useMemo(() => [...data.taksitPlanlari].sort((a, b) => {
    const activeDiff = Number(b.status !== "IPTAL" && b.status !== "TAMAMLANDI") - Number(a.status !== "IPTAL" && a.status !== "TAMAMLANDI");
    return activeDiff || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }), [data.taksitPlanlari]);
  // Açık planın bekleyen tutarı zaten borcun bir parçası; yeni plan yalnız
  // plana bağlanmamış borç için mantıklı.
  const plannedRemaining = plans
    .filter((plan) => plan.status !== "IPTAL")
    .reduce((sum, plan) => sum + getPlanRemaining(plan), 0);

  const printContext = async () => ({ data, clinic: await getLetterhead(), hidePhone: hidePatientPhone });

  const cancelPayment = async (payment: Pay) => {
    if (busyId) return;
    if (!(await confirmDialog({ message: `${money(payment.amount)} tahsilat iptal edilsin mi? Tutar hastanın borcuna geri eklenir; kayıt işlem geçmişinde saklanır.`, danger: true, confirmText: "Tahsilatı iptal et" }))) return;
    setBusyId(payment.id);
    try {
      await clientMutation(`/api/payments/${payment.id}`, { method: "DELETE" }, "Tahsilat iptal edilemedi.");
      showToastSafe({ type: "success", message: "Tahsilat iptal edildi." });
      void reload(true);
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Tahsilat iptal edilemedi." });
    } finally {
      setBusyId("");
    }
  };

  const cancelPlan = async (plan: TaksitPlan) => {
    if (busyId) return;
    if (!(await confirmDialog({ message: "Taksit planı iptal edilsin mi? Ödenmemiş taksitler ve hatırlatmaları kapanır. Alınmış tahsilatlar ve hastanın borcu değişmez.", danger: true, confirmText: "Planı iptal et" }))) return;
    setBusyId(plan.id);
    try {
      await clientMutation(`/api/taksit-plani/${plan.id}`, { method: "DELETE" }, "Taksit planı iptal edilemedi.");
      showToastSafe({ type: "success", message: "Taksit planı iptal edildi." });
      void reload(true);
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Taksit planı iptal edilemedi." });
    } finally {
      setBusyId("");
    }
  };

  // Satır eylemleri çerçevesiz "…" menüsünde (önceden kutulu ✎ ⊗).
  const paymentActions = (payment: Pay) => (
    <div className="flex justify-end">
      <ActionMenu
        label={`${money(payment.amount)} tahsilat için işlemler`}
        items={[
          { key: "receipt", label: "Makbuz yazdır", icon: Printer, onSelect: () => void printPaymentReceipt(payment.id) },
          ...(canCollect ? [{ key: "edit", label: "Tahsilatı düzelt", icon: Pencil, disabled: busyId === payment.id, onSelect: () => openPayment(payment) }] : []),
          ...(canRefund ? [{ key: "cancel", label: "Tahsilatı iptal et", icon: XCircle, danger: true, disabled: busyId === payment.id, onSelect: () => void cancelPayment(payment) }] : []),
        ]}
      />
    </div>
  );
  // Makbuz tahsilatı gören herkes içindir: "…" menüsü her satırda var.
  // Her satırda aynı hekim → başlık altında bir kez; hiç açıklama yoksa sütun yok.
  const paymentDoctor = sharedName(payments, (payment) => payment.doctor?.fullName);
  const hasDescriptions = payments.some((payment) => Boolean(payment.description?.trim()));

  const paymentColumns: ListTableColumn<Pay>[] = [
    { key: "date", header: "Tarih", render: (payment) => <span className="whitespace-nowrap">{formatDateText(payment.createdAt)}</span> },
    { key: "amount", header: "Tutar", align: "right", render: (payment) => <span className="font-semibold tabular-nums text-emerald-700">{money(payment.amount)}</span> },
    { key: "method", header: "Yöntem", render: (payment) => paymentMethodLabel(payment.method) },
    // Hekim sütunu yalnız tahsilatlarda farklı hekimler varsa (hiç hekim yoksa boş sütun durmaz).
    ...(paymentDoctor || !payments.some((payment) => payment.doctor?.fullName) ? [] : [{ key: "doctor", header: "Hekim", render: (payment: Pay) => payment.doctor?.fullName || null }]),
    ...(hasDescriptions ? [{ key: "description", header: "Açıklama", render: (payment: Pay) => payment.description || null }] : []),
    { key: "actions", header: "", align: "right" as const, render: paymentActions },
  ];

  // Taksitler planın içinde düz satırlar (önceden plan kartının içinde ikinci
  // bir tablo kartı vardı). Her satır: sıra · vade, ödenen/kalan; sağda tutar ve durum.
  const installmentRow = (item: TaksitItem & { index: number }) => {
    const view = installmentStatus(item);
    const paid = getItemPaid(item);
    const late = item.status === "GECIKTI" && isOpenInstallment(item);
    return (
      <li key={item.id} className={`flex items-center justify-between gap-3 px-2 py-2 ${late ? "bg-red-50/60" : ""}`}>
        <div className="min-w-0">
          <p className="text-sm text-slate-800"><span className="text-slate-500">{item.index + 1}.</span> Vade <span className="whitespace-nowrap tabular-nums">{formatDateText(getItemDueDate(item))}</span></p>
          {paid > 0 && (
            <p className="text-xs text-slate-500">ödenen {money(paid)}{isOpenInstallment(item) ? ` · kalan ${money(getItemRemaining(item))}` : ""}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-slate-800">{money(getItemAmount(item))}</span>
          <Badge tone={view.tone}>{view.label}</Badge>
        </div>
      </li>
    );
  };

  const debtTone = debt > 0.004 ? "text-red-700" : debt < -0.004 ? "text-emerald-700" : "text-slate-900";
  const debtLabel = debt < -0.004 ? "Ön ödeme" : "Kalan borç";
  // Özet tek sırada (yapılan − indirim − alınan = kalan): önceden alt alta
  // dört satır sayfanın yarısını boş bırakıyordu.
  const summaryItems: DescriptionItem[] = [
    { key: "charged", label: "Yapılan tedaviler", value: <span className="font-semibold tabular-nums">{money(balance.totalCharged)}</span> },
    { key: "discount", label: `İndirim (%${balance.discountRate})`, value: <span className="font-semibold tabular-nums">−{money(balance.discountAmount)}</span>, hidden: !(balance.discountRate > 0) },
    { key: "paid", label: "Alınan tahsilat", value: <span className="font-semibold tabular-nums">{money(balance.totalPaid)}</span> },
    { key: "debt", label: debtLabel, value: <span className={`text-base font-extrabold tabular-nums ${debtTone}`}>{money(Math.abs(debt))}</span> },
  ];
  const summaryColumns = summaryItems.filter((item) => !item.hidden).length;
  // Planlanan (henüz yapılmamış) tedaviler borca dahil değildir; varsa bir kez söylenir.
  const pendingTreatments = data.examinations.some(isPendingExam);

  return (
    <div className="space-y-4">
      <Section
        title="Hesap özeti"
        actions={(
          <>
            {canCollect && <Button size="sm" variant="secondary" icon={Wallet} onClick={() => openPayment()}>Tahsilat al</Button>}
            {/* Hasta "borcum neden bu kadar?" dediğinde tek kâğıt: tedaviler + ödemeler + kalan. */}
            {balanceKnown && (
              <Button
                size="sm"
                variant="secondary"
                icon={Printer}
                onClick={() => void printContext().then((context) => printAccountStatement(context, {
                  treatments: data.examinations.filter(isChargeableExam),
                  payments,
                  balance,
                }))}
              >
                Hesap ekstresi
              </Button>
            )}
            {canPlan && balanceKnown && debt > plannedRemaining + 0.004 && (
              <Button size="sm" variant="secondary" icon={CalendarRange} onClick={() => setInstallmentOpen(true)}>Yeni taksit planı</Button>
            )}
          </>
        )}
      >
        {balanceKnown ? (
          <DescriptionList items={summaryItems} className={`!grid-cols-2 !gap-x-4 ${summaryColumns > 3 ? "sm:!grid-cols-4" : "sm:!grid-cols-3"}`} />
        ) : (
          <Callout tone="warning" compact>Bakiye şu an hesaplanamadı; tahsilatlar ve taksitler aşağıda. Birazdan sayfayı yenileyin.</Callout>
        )}
        {pendingTreatments && (
          <p className="mt-3 text-xs text-slate-500">Planlanan tedaviler borca dahil değildir; “Yapıldı” işaretlenince eklenir.</p>
        )}
      </Section>

      <ListTable
        title="Tahsilatlar"
        subtitle={paymentDoctor ? `Hekim: ${paymentDoctor}` : undefined}

        columns={paymentColumns}
        rows={payments}
        rowKey={(payment) => payment.id}
        emptyIcon={Wallet}
        emptyText="Bu hastadan henüz tahsilat alınmadı"
        mobileCard={(payment) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold tabular-nums text-emerald-700">{money(payment.amount)} <span className="font-normal text-slate-600">· {paymentMethodLabel(payment.method)}</span></p>
              <p className="line-clamp-2 text-xs text-slate-500">{[formatDateText(payment.createdAt), paymentDoctor ? "" : payment.doctor?.fullName, payment.description].filter(Boolean).join(" · ")}</p>
            </div>
            {paymentActions(payment)}
          </div>
        )}
      />

      {plans.length > 0 && (
        <Section title="Taksit planları" padding="none">
          <div className="divide-y divide-slate-100">
            {plans.map((plan) => {
              const items = (plan.taksitler || []).map((item, index) => ({ ...item, index }));
              const openItems = items.filter(isOpenInstallment);
              const overdue = openItems.filter((item) => item.status === "GECIKTI");
              const nextDue = openItems.map(getItemDueDate).filter(Boolean).sort()[0];
              const inactive = plan.status === "IPTAL" || plan.status === "TAMAMLANDI";
              const expanded = expandedPlans[plan.id] ?? (!inactive && overdue.length > 0);
              const planItems: DescriptionItem[] = [
                { key: "total", label: "Toplam", value: <span className="font-semibold tabular-nums">{money(getPlanTotal(plan))}</span> },
                { key: "remaining", label: "Kalan", value: <span className={`font-semibold tabular-nums ${getPlanRemaining(plan) > 0.004 && plan.status !== "IPTAL" ? "text-red-700" : "text-emerald-700"}`}>{money(plan.status === "IPTAL" ? 0 : getPlanRemaining(plan))}</span> },
                { key: "next", label: "Sonraki vade", value: nextDue && plan.status !== "IPTAL" ? formatDateText(nextDue) : null, hidden: !(nextDue && plan.status !== "IPTAL") },
              ];
              return (
                <article key={plan.id} className={`px-4 py-3 ${plan.status === "IPTAL" ? "opacity-70" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-800">
                        {plan.baslik || `${items.length} taksitli ödeme planı`}
                        <Badge tone={TAKSIT_PLAN_STATUS_TONE[plan.status] || "neutral"}>{TAKSIT_PLAN_STATUS_LABELS[plan.status] || plan.status}</Badge>
                        {overdue.length > 0 && <Badge tone="critical">{overdue.length} taksit gecikti</Badge>}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[formatDateText(plan.createdAt), plan.doctor?.fullName, toNumber(plan.pesnat) > 0 ? `peşinat ${money(plan.pesnat)}` : ""].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <ActionMenu
                      label={`${plan.baslik || "Ödeme planı"} için işlemler`}
                      items={[
                        { key: "print", label: "Ödeme planını yazdır", icon: Printer, onSelect: () => { void printContext().then((context) => printInstallmentPlan(context, plan)); } },
                        ...(canCancelPlan && !inactive ? [{ key: "cancel", label: "Planı iptal et", icon: XCircle, danger: true, disabled: busyId === plan.id, onSelect: () => void cancelPlan(plan) }] : []),
                      ]}
                    />
                  </div>
                  {/* Üç kısa değer telefonda da yan yana (alt alta uzun kart olmasın). */}
                  <DescriptionList className="mt-2 !grid-cols-3 !gap-x-3" columns={3} items={planItems} />
                  {plan.notes && <p className="mt-2 text-xs text-slate-600"><span className="font-semibold text-slate-500">Not:</span> {plan.notes}</p>}
                  {!inactive && plan.doctor?.fullName && (
                    // Sunucu tahsilatı yalnız plan hekiminin planına işler; önceki
                    // genel not ("tahsilat alınınca taksitler kapanır") yanıltıcıydı.
                    <p className="mt-1 text-xs text-slate-500">Taksitler, {plan.doctor.fullName} adına alınan tahsilatla vade sırasıyla kapanır.</p>
                  )}
                  {items.length > 0 && (
                    <div className="mt-2">
                      <Button variant="ghost" size="sm" onClick={() => setExpandedPlans((current) => ({ ...current, [plan.id]: !expanded }))} aria-expanded={expanded}>
                        {expanded ? "Taksitleri gizle" : `Taksitleri göster (${items.length})`}
                      </Button>
                      {expanded && (
                        <ul className="mt-1 divide-y divide-slate-100 border-y border-slate-100" aria-label={`${plan.baslik || "Ödeme planı"} taksitleri`}>
                          {items.map(installmentRow)}
                        </ul>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </Section>
      )}

      {installmentOpen && <InstallmentModal open onClose={() => setInstallmentOpen(false)} />}

    </div>
  );
}
