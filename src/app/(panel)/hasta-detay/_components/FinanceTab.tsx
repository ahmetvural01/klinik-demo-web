"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarRange, Pencil, Printer, Wallet, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { formatDateText } from "@/components/ui/Money";
import { clientMutation } from "@/lib/client-mutation";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { usePatientFile } from "./PatientFileContext";
import { InstallmentModal } from "./InstallmentModal";
import { PrintSelectModal } from "./PrintSelectModal";
import { printInstallmentPlan, printPaymentStatement } from "./print";
import {
  getItemAmount,
  getItemDueDate,
  getItemPaid,
  getItemRemaining,
  getPlanRemaining,
  getPlanTotal,
  isOpenInstallment,
  money,
  paymentMethodLabel,
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

function SummaryLine({ label, value, strong = false, tone = "" }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? "border-t border-slate-200 pt-2.5" : ""}`}>
      <dt className={strong ? "text-sm font-bold text-slate-900" : "text-sm text-slate-600"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-lg font-extrabold" : "text-sm font-semibold text-slate-800"} ${tone}`}>{value}</dd>
    </div>
  );
}

export function FinanceTab() {
  const { data, reload, can, balance, openPayment, clinicName, hidePatientPhone } = usePatientFile();
  const [installmentOpen, setInstallmentOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
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

  const paymentActions = (payment: Pay) => (
    <div className="flex justify-end gap-1.5">
      {canCollect && <IconButton icon={Pencil} title="Tahsilatı düzelt" size="sm" disabled={busyId === payment.id} onClick={() => openPayment(payment)} />}
      {canRefund && <IconButton icon={XCircle} title="Tahsilatı iptal et" tone="danger" size="sm" disabled={busyId === payment.id} onClick={() => void cancelPayment(payment)} />}
    </div>
  );
  const hasPaymentActions = canCollect || canRefund;

  const paymentColumns: ListTableColumn<Pay>[] = [
    { key: "date", header: "Tarih", render: (payment) => <span className="whitespace-nowrap">{formatDateText(payment.createdAt)}</span> },
    { key: "amount", header: "Tutar", align: "right", render: (payment) => <span className="font-semibold tabular-nums text-emerald-700">{money(payment.amount)}</span> },
    { key: "method", header: "Yöntem", render: (payment) => paymentMethodLabel(payment.method) },
    { key: "doctor", header: "Hekim", render: (payment) => payment.doctor?.fullName || <EmptyValue /> },
    { key: "description", header: "Açıklama", render: (payment) => payment.description || <EmptyValue /> },
    ...(hasPaymentActions ? [{ key: "actions", header: "", align: "right" as const, render: paymentActions }] : []),
  ];

  const installmentColumns: ListTableColumn<TaksitItem & { index: number }>[] = [
    { key: "no", header: "#", render: (item) => <span className="text-slate-500">{item.index + 1}</span> },
    { key: "due", header: "Vade", render: (item) => <span className="whitespace-nowrap">{formatDateText(getItemDueDate(item))}</span> },
    { key: "amount", header: "Tutar", align: "right", render: (item) => <span className="tabular-nums">{money(getItemAmount(item))}</span> },
    { key: "paid", header: "Ödenen", align: "right", render: (item) => (getItemPaid(item) > 0 ? <span className="tabular-nums">{money(getItemPaid(item))}</span> : <EmptyValue />) },
    { key: "status", header: "Durum", render: (item) => { const view = installmentStatus(item); return <Badge tone={view.tone}>{view.label}</Badge>; } },
  ];

  const debtTone = debt > 0.004 ? "text-red-700" : debt < -0.004 ? "text-emerald-700" : "text-slate-900";
  const debtLabel = debt < -0.004 ? "Hastanın avansı" : "Kalan borç";

  return (
    <div className="space-y-4">
      <section className="ui-surface p-4 sm:p-5" aria-label="Hesap özeti">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <dl className="max-w-md">
            <SummaryLine label="Yapılan tedaviler" value={money(balance.totalCharged)} />
            {balance.discountRate > 0 && <SummaryLine label={`İndirim (%${balance.discountRate})`} value={`−${money(balance.discountAmount)}`} />}
            <SummaryLine label="Alınan tahsilat" value={money(balance.totalPaid)} />
            <SummaryLine label={debtLabel} value={money(Math.abs(debt))} strong tone={debtTone} />
          </dl>
          <div className="flex flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
            {canCollect && <Button icon={Wallet} onClick={() => openPayment()}>Tahsilat al</Button>}
            {canPlan && debt > plannedRemaining + 0.004 && (
              <Button variant="secondary" icon={CalendarRange} onClick={() => setInstallmentOpen(true)}>Taksit planı yap</Button>
            )}
          </div>
        </div>
        {balance.totalCharged === 0 && data.examinations.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">Muayene listesindeki kayıtlar “Yapıldı” işaretlenince borca eklenir.</p>
        )}
      </section>

      <ListTable
        header={(
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Tahsilatlar</h2>
              <p className="text-xs text-slate-500">{payments.length > 0 ? `${payments.length} tahsilat · toplam ${money(balance.totalPaid)}` : "Henüz tahsilat yok."}</p>
            </div>
            {payments.length > 0 && <Button size="sm" variant="secondary" icon={Printer} onClick={() => setPrintOpen(true)}>Tahsilat dökümü</Button>}
          </div>
        )}
        columns={paymentColumns}
        rows={payments}
        rowKey={(payment) => payment.id}
        emptyIcon={Wallet}
        emptyText="Bu hastadan henüz tahsilat alınmadı"
        emptyAction={canCollect && debt > 0 ? <Button size="sm" variant="secondary" onClick={() => openPayment()}>Tahsilat al</Button> : undefined}
        mobileCard={(payment) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold tabular-nums text-emerald-700">{money(payment.amount)} <span className="font-normal text-slate-600">· {paymentMethodLabel(payment.method)}</span></p>
              <p className="text-xs text-slate-500">{[formatDateText(payment.createdAt), payment.doctor?.fullName, payment.description].filter(Boolean).join(" · ")}</p>
            </div>
            {hasPaymentActions && paymentActions(payment)}
          </div>
        )}
      />

      <section className="space-y-3" aria-label="Taksit planları">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-800">Taksit planları</h2>
          {can("finance:read") && <Link href="/muhasebe?tab=taksit" className="text-xs font-semibold text-primary hover:underline">Bütün hastaların taksitleri</Link>}
        </div>
        {plans.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
            Taksit planı yok.{canPlan && debt > 0.004 ? " Borcu taksitlendirmek için “Taksit planı yap”a basın." : ""}
          </p>
        ) : plans.map((plan) => {
          const items = (plan.taksitler || []).map((item, index) => ({ ...item, index }));
          const openItems = items.filter(isOpenInstallment);
          const overdue = openItems.filter((item) => item.status === "GECIKTI");
          const nextDue = openItems.map(getItemDueDate).filter(Boolean).sort()[0];
          const inactive = plan.status === "IPTAL" || plan.status === "TAMAMLANDI";
          const expanded = expandedPlans[plan.id] ?? !inactive;
          return (
            <article key={plan.id} className={`ui-surface overflow-hidden ${plan.status === "IPTAL" ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
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
                <div className="flex items-center gap-1.5">
                  <IconButton icon={Printer} title="Planı yazdır" size="sm" onClick={() => printInstallmentPlan({ data, clinicName, hidePhone: hidePatientPhone }, plan)} />
                  {canCancelPlan && plan.status !== "IPTAL" && plan.status !== "TAMAMLANDI" && (
                    <IconButton icon={XCircle} title="Planı iptal et" tone="danger" size="sm" disabled={busyId === plan.id} onClick={() => void cancelPlan(plan)} />
                  )}
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 border-t border-slate-100 px-4 py-2.5 text-sm">
                <div><dt className="text-xs text-slate-500">Toplam</dt><dd className="font-semibold tabular-nums text-slate-800">{money(getPlanTotal(plan))}</dd></div>
                <div><dt className="text-xs text-slate-500">Kalan</dt><dd className={`font-semibold tabular-nums ${getPlanRemaining(plan) > 0.004 && plan.status !== "IPTAL" ? "text-red-700" : "text-emerald-700"}`}>{money(plan.status === "IPTAL" ? 0 : getPlanRemaining(plan))}</dd></div>
                <div><dt className="text-xs text-slate-500">Sonraki vade</dt><dd className="font-semibold text-slate-800">{nextDue && plan.status !== "IPTAL" ? formatDateText(nextDue) : <EmptyValue />}</dd></div>
              </dl>
              {items.length > 0 && (
                <div className="border-t border-slate-100">
                  <Button variant="ghost" size="sm" className="m-1.5" onClick={() => setExpandedPlans((current) => ({ ...current, [plan.id]: !expanded }))} aria-expanded={expanded}>
                    {expanded ? "Taksitleri gizle" : `Taksitleri göster (${items.length})`}
                  </Button>
                  {expanded && (
                    <div className="px-3 pb-3">
                      <ListTable
                        columns={installmentColumns}
                        rows={items}
                        rowKey={(item) => item.id}
                        rowClassName={(item) => (item.status === "GECIKTI" && isOpenInstallment(item) ? "bg-red-50/60" : "")}
                        mobileCard={(item) => {
                          const view = installmentStatus(item);
                          return (
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold tabular-nums">{item.index + 1}. taksit · {money(getItemAmount(item))}</p>
                                <p className="text-xs text-slate-500">Vade {formatDateText(getItemDueDate(item))}{getItemPaid(item) > 0 ? ` · ödenen ${money(getItemPaid(item))}` : ""}{isOpenInstallment(item) && getItemPaid(item) > 0 ? ` · kalan ${money(getItemRemaining(item))}` : ""}</p>
                              </div>
                              <Badge tone={view.tone}>{view.label}</Badge>
                            </div>
                          );
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {plans.some((plan) => plan.status !== "IPTAL" && plan.status !== "TAMAMLANDI") && (
          <p className="text-xs text-slate-500">Tahsilat alındığında açık taksitler vade sırasıyla otomatik ödenmiş sayılır.</p>
        )}
      </section>

      <InstallmentModal open={installmentOpen} onClose={() => setInstallmentOpen(false)} />

      <PrintSelectModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Tahsilat dökümü"
        description="Belgeye yazılacak tahsilatları seçin."
        itemLabel="tahsilat"
        rows={payments.map((payment) => ({ id: payment.id, date: formatDateText(payment.createdAt), label: paymentMethodLabel(payment.method), meta: payment.description || undefined, amount: money(payment.amount) }))}
        onPrint={(ids) => printPaymentStatement(
          { data, clinicName, hidePhone: hidePatientPhone },
          payments.filter((payment) => ids.includes(payment.id)).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
        )}
      />
    </div>
  );
}
