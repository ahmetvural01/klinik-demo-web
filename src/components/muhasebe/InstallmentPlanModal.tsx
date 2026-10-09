"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import {
  INSTALLMENT_STATUS_LABELS,
  INSTALLMENT_STATUS_TONE,
  PERIODS,
  PLAN_STATUS_LABELS,
  PLAN_STATUS_TONE,
  methodLabel,
  money,
  shortDate,
  todayKey,
} from "@/components/muhasebe/muhasebe-utils";
import { isOpenInstallment, isOpenPlan, planSummary, type Installment, type InstallmentPlan } from "@/components/muhasebe/installment-types";
import { InstallmentPayModal } from "@/components/muhasebe/InstallmentPayModal";
import { AddReminderModal, isSystemReminder } from "@/components/muhasebe/ReminderModals";

type Props = {
  planId: string | null;
  onClose: () => void;
  onChanged: () => void;
  canWriteInstallments: boolean;
  canCancelPlans: boolean;
  canReadPatients: boolean;
  canSeePatientPhone: boolean;
  canWriteReminders: boolean;
};

/**
 * Taksit planının tek ekranı: taksitler ve her taksidin ödeme geçmişi,
 * sıradaki taksidin tahsilatı, plana bağlı hatırlatmalar ve (en sonda,
 * tehlikeli eylem olarak) planı iptal etme.
 */
export function InstallmentPlanModal({ planId, onClose, onChanged, canWriteInstallments, canCancelPlans, canReadPatients, canSeePatientPhone, canWriteReminders }: Props) {
  const [plan, setPlan] = useState<InstallmentPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payTarget, setPayTarget] = useState<Installment | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/taksit-plani/${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.id) throw new Error(body?.error || "Taksit planı yüklenemedi.");
      setPlan(body as InstallmentPlan);
    } catch (loadError) {
      setPlan(null);
      setError(loadError instanceof Error ? loadError.message : "Taksit planı yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!planId) { setPlan(null); setError(""); return; }
    void load(planId);
  }, [planId, load]);

  const summary = plan ? planSummary(plan) : null;
  // Hatırlatma penceresi hastayı her çizimde yeniden almasın (yazılanı sıfırlamasın) diye sabit nesne.
  const reminderPatient = useMemo(() => (plan ? { id: plan.patient.id, fullName: plan.patient.fullName } : null), [plan]);
  const payModalTarget = useMemo(
    () => (plan && payTarget ? { planId: plan.id, patientName: plan.patient.fullName, installment: payTarget } : null),
    [plan, payTarget],
  );
  const items = plan ? [...plan.taksitler].sort((a, b) => a.siraNo - b.siraNo) : [];
  const open = Boolean(plan && isOpenPlan(plan));
  const nextItem = summary?.next || null;
  const reminders = (plan?.reminders || []).filter((reminder) => !isSystemReminder(reminder) && reminder.status === "AKTIF");
  const phone = plan?.patient.phone && plan.patient.phone !== "***" && canSeePatientPhone ? plan.patient.phone : "";

  const afterChange = () => {
    if (planId) void load(planId);
    onChanged();
  };

  const cancelPlan = async () => {
    if (!plan || !summary) return;
    const openItems = items.filter(isOpenInstallment);
    const paid = items.reduce((sum, item) => sum + Number(item.odenen || 0), 0);
    const confirmed = await confirmDialog({
      title: "Taksit planı iptal edilsin mi?",
      message: `${plan.patient.fullName} — ödenmemiş ${openItems.length} taksit (${money(summary.kalan)}) iptal edilir ve plana bağlı hatırlatmalar kapanır. ${paid > 0 ? `Alınmış ${money(paid)} tahsilat geçerli kalır ve hastanın ödemesi olarak sayılmaya devam eder. ` : ""}Hastanın tedavi borcu silinmez; Alacaklar listesinde görünmeye devam eder.`,
      danger: true,
      confirmText: "Planı iptal et",
      cancelText: "Vazgeç",
    });
    if (!confirmed) return;
    setCancelling(true);
    const response = await fetch(`/api/taksit-plani/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "IPTAL" }),
    }).catch(() => null);
    setCancelling(false);
    if (!response?.ok) {
      const body = await response?.json().catch(() => null);
      showToastSafe({ title: "Plan iptal edilemedi", message: body?.error || "Bağlantınızı kontrol edip tekrar deneyin.", type: "error" });
      return;
    }
    showToastSafe({ message: "Taksit planı iptal edildi.", type: "success" });
    afterChange();
  };

  const today = todayKey();
  const columns: ListTableColumn<Installment>[] = [
    { key: "sira", header: "Taksit", cellClassName: "whitespace-nowrap", render: (row) => <span className="font-semibold text-slate-800">{row.siraNo}. taksit</span> },
    {
      key: "vade",
      header: "Vade",
      cellClassName: "whitespace-nowrap",
      render: (row) => <span className={isOpenInstallment(row) && row.vadeDate.slice(0, 10) < today ? "font-semibold text-red-700" : "text-slate-700"}>{shortDate(row.vadeDate)}</span>,
    },
    { key: "tutar", header: "Tutar", align: "right", render: (row) => <span className="tabular-nums text-slate-700">{money(row.tutar)}</span> },
    {
      key: "odeme",
      header: "Ödemeler",
      render: (row) => (row.odemeler && row.odemeler.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-slate-600">
          {row.odemeler.map((payment) => (
            <li key={payment.id}>{shortDate(payment.tarih)} · {methodLabel(payment.yontem)} · <b className="tabular-nums text-slate-800">{money(payment.tutar)}</b></li>
          ))}
        </ul>
      ) : <EmptyValue />),
    },
    { key: "kalan", header: "Kalan", align: "right", render: (row) => (Number(row.kalan) > 0.005 && row.status !== "IPTAL" ? <span className="font-bold tabular-nums text-slate-900">{money(row.kalan)}</span> : <EmptyValue />) },
    { key: "durum", header: "Durum", render: (row) => <Badge tone={INSTALLMENT_STATUS_TONE[row.status] || "neutral"}>{INSTALLMENT_STATUS_LABELS[row.status] || row.status}</Badge> },
    {
      key: "islem",
      header: "",
      align: "right",
      render: (row) => (canWriteInstallments && open && isOpenInstallment(row) && row.id !== nextItem?.id
        ? <IconButton icon={Wallet} title={`${row.siraNo}. taksiti tahsil et`} size="sm" onClick={() => setPayTarget(row)} />
        : null),
    },
  ];

  const title = plan ? `${plan.patient.fullName} — ${plan.baslik || "Taksit planı"}` : "Taksit planı";
  const description = plan
    ? `Dr. ${plan.doctor.fullName} · ${plan.taksitSayisi} taksit, ${(PERIODS[plan.period] || plan.period).toLocaleLowerCase("tr")} · Toplam ${money(plan.toplamBorc)}${Number(plan.pesnat) > 0 ? ` · Peşinat ${money(plan.pesnat)}` : ""}`
    : undefined;

  return (
    <>
      <Modal
        open={Boolean(planId)}
        onClose={onClose}
        title={title}
        description={description}
        size="xl"
        module="finance"
        trackFormChanges={false}
        footer={(
          <>
            {canCancelPlans && open && (
              <Button variant="ghost" className="mr-auto text-red-700 hover:bg-red-50 hover:text-red-800" loading={cancelling} onClick={() => void cancelPlan()}>
                Planı iptal et
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>Kapat</Button>
            {canWriteInstallments && open && nextItem && (
              <Button icon={Wallet} onClick={() => setPayTarget(nextItem)}>
                {nextItem.siraNo}. taksiti tahsil et
              </Button>
            )}
          </>
        )}
      >
        {error ? (
          <LoadErrorState message={error} onRetry={planId ? () => void load(planId) : undefined} />
        ) : loading && !plan ? (
          <p className="py-12 text-center text-sm text-slate-500">Plan yükleniyor…</p>
        ) : plan && summary ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <Badge tone={PLAN_STATUS_TONE[plan.status] || "neutral"}>{PLAN_STATUS_LABELS[plan.status] || plan.status}</Badge>
              <span className="text-slate-600">Kalan <b className="tabular-nums text-slate-900">{money(summary.kalan)}</b></span>
              <span className="text-slate-600">{summary.paidCount}/{summary.activeCount} taksit ödendi</span>
              {nextItem && (
                <span className={summary.overdueCount > 0 ? "font-semibold text-red-700" : "text-slate-600"}>
                  Sıradaki: {shortDate(nextItem.vadeDate)} · {money(nextItem.kalan)}
                  {summary.overdueCount > 0 && ` (${summary.overdueDays} gün gecikti)`}
                </span>
              )}
              {phone && <a href={`tel:${phone}`} className="font-semibold text-primary hover:underline">{phone}</a>}
              {canReadPatients && (
                <Link href={`/hasta-detay?id=${encodeURIComponent(plan.patient.id)}&tab=odeme`} className="ml-auto text-sm font-semibold text-primary hover:underline">
                  Hasta dosyası
                </Link>
              )}
            </div>
            {plan.notes && <p className="text-sm text-slate-600"><span className="font-semibold text-slate-700">Not:</span> {plan.notes}</p>}

            <ListTable
              columns={columns}
              rows={items}
              rowKey={(row) => row.id}
              emptyText="Bu planda taksit yok"
              rowClassName={(row) => (row.id === nextItem?.id && open ? "bg-primary/[0.04]" : "")}
              mobileCard={(row) => (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{row.siraNo}. taksit · {shortDate(row.vadeDate)}</p>
                    <p className="text-xs text-slate-500">Tutar {money(row.tutar)}{Number(row.kalan) > 0.005 && row.status !== "IPTAL" ? ` · kalan ${money(row.kalan)}` : ""}</p>
                    {row.odemeler?.map((payment) => (
                      <p key={payment.id} className="text-xs text-slate-500">Ödendi {shortDate(payment.tarih)} · {methodLabel(payment.yontem)} · {money(payment.tutar)}</p>
                    ))}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone={INSTALLMENT_STATUS_TONE[row.status] || "neutral"}>{INSTALLMENT_STATUS_LABELS[row.status] || row.status}</Badge>
                    {canWriteInstallments && open && isOpenInstallment(row) && row.id !== nextItem?.id && (
                      <IconButton icon={Wallet} title={`${row.siraNo}. taksiti tahsil et`} size="sm" onClick={() => setPayTarget(row)} />
                    )}
                  </div>
                </div>
              )}
            />

            <section className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Bell className="h-4 w-4 text-slate-400" aria-hidden="true" /> Hatırlatmalar</h3>
                {canWriteReminders && open && (
                  <Button size="sm" variant="secondary" onClick={() => setReminderOpen(true)}>Hatırlatma ekle</Button>
                )}
              </div>
              {reminders.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">Bu plan için bekleyen hatırlatma yok.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {reminders.map((reminder) => (
                    <li key={reminder.id} className="flex flex-wrap gap-x-2">
                      <span className={`tabular-nums ${reminder.reminderDate.slice(0, 10) <= today ? "font-semibold text-red-700" : "text-slate-500"}`}>{shortDate(reminder.reminderDate)}</span>
                      <span>{reminder.note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </Modal>

      <InstallmentPayModal
        target={payModalTarget}
        onClose={() => setPayTarget(null)}
        onPaid={afterChange}
      />
      <AddReminderModal
        open={reminderOpen}
        onClose={() => setReminderOpen(false)}
        onSaved={afterChange}
        patient={reminderPatient}
        planId={plan?.id || null}
      />
    </>
  );
}
