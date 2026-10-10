"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, FolderOpen, Phone, Plus, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Section } from "@/components/ui/Section";
import { StatStrip, type StatItem } from "@/components/ui/StatStrip";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { formatPhoneNumber } from "@/lib/format";
import {
  INSTALLMENT_STATUS_LABELS,
  INSTALLMENT_STATUS_TONE,
  PERIODS,
  doctorLabel,
  methodLabel,
  money,
  shortDate,
  todayKey,
} from "@/components/muhasebe/muhasebe-utils";
import { dueDayKey, isOpenInstallment, isOpenPlan, planState, planSummary, type Installment, type InstallmentPlan } from "@/components/muhasebe/installment-types";
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
      if (!response.ok || !body?.id) throw new Error(body?.error || body?.message || "Taksit planı yüklenemedi.");
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

  // Başka bir plan açılırken öncekinin bilgileri bir an bile görünmesin.
  const shown = plan && plan.id === planId ? plan : null;
  const summary = shown ? planSummary(shown) : null;
  // Hatırlatma penceresi hastayı her çizimde yeniden almasın (yazılanı sıfırlamasın) diye sabit nesne.
  const reminderPatient = useMemo(() => (shown ? { id: shown.patient.id, fullName: shown.patient.fullName } : null), [shown]);
  const payModalTarget = useMemo(
    () => (shown && payTarget ? { planId: shown.id, patientName: shown.patient.fullName, installment: payTarget, planCreatedAt: shown.createdAt } : null),
    [shown, payTarget],
  );
  const items = shown ? [...shown.taksitler].sort((a, b) => a.siraNo - b.siraNo) : [];
  const open = Boolean(shown && isOpenPlan(shown));
  const nextItem = summary?.next || null;
  const reminders = (shown?.reminders || []).filter((reminder) => !isSystemReminder(reminder) && reminder.status === "AKTIF");
  const phone = shown?.patient.phone && shown.patient.phone !== "***" && canSeePatientPhone ? shown.patient.phone : "";
  const canPay = canWriteInstallments && open;

  const afterChange = () => {
    if (planId) void load(planId);
    onChanged();
  };

  const cancelPlan = async () => {
    if (!shown || !summary) return;
    const openItems = items.filter(isOpenInstallment);
    const paid = items.reduce((sum, item) => sum + Number(item.odenen || 0), 0);
    const confirmed = await confirmDialog({
      title: "Taksit planı iptal edilsin mi?",
      message: `${shown.patient.fullName} — ödenmemiş ${openItems.length} taksit (${money(summary.kalan)}) iptal edilir ve plana bağlı hatırlatmalar kapanır. ${paid > 0 ? `Alınmış ${money(paid)} tahsilat geçerli kalır ve hastanın ödemesi olarak sayılmaya devam eder. ` : ""}Hastanın tedavi borcu silinmez; Alacaklar listesinde görünmeye devam eder.`,
      danger: true,
      confirmText: "Planı iptal et",
      cancelText: "Vazgeç",
    });
    if (!confirmed) return;
    setCancelling(true);
    // Düğme "Taksit Planı — İptal Etme" (installments:delete) izniyle görünür; istek de aynı izni
    // isteyen uca gider (hasta dosyasıyla aynı yol). Önceden PATCH ile installments:write isteniyordu.
    const response = await fetch(`/api/taksit-plani/${encodeURIComponent(shown.id)}`, { method: "DELETE" }).catch(() => null);
    setCancelling(false);
    if (!response?.ok) {
      const body = await response?.json().catch(() => null);
      showToastSafe({ title: "Plan iptal edilemedi", message: body?.error || body?.message || "Bağlantınızı kontrol edip tekrar deneyin.", type: "error" });
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
      render: (row) => <span className={`tabular-nums ${isOpenInstallment(row) && dueDayKey(row.vadeDate) < today ? "font-semibold text-red-700" : "text-slate-700"}`}>{shortDate(row.vadeDate)}</span>,
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
    // Her açık taksitte aynı eylem (önceden sıradaki taksitte yoktu, yalnız alttaki düğmedeydi).
    ...(canPay ? [{
      key: "islem",
      header: "",
      align: "right" as const,
      render: (row: Installment) => (isOpenInstallment(row)
        ? <IconButton icon={Wallet} title={`${row.siraNo}. taksiti tahsil et`} size="sm" tone="primary" onClick={() => setPayTarget(row)} />
        : null),
    }] : []),
  ];

  const state = shown && summary ? planState(shown, summary) : null;
  const stats: StatItem[] = shown && summary ? [
    { key: "kalan", label: "Kalan", value: money(summary.kalan), hint: `${summary.paidCount}/${summary.activeCount} taksit ödendi` },
    ...(open && nextItem ? [{
      key: "sira",
      label: "Sıradaki taksit",
      value: shortDate(nextItem.vadeDate),
      hint: `${nextItem.siraNo}. taksit · ${money(nextItem.kalan)}`,
    }] : []),
    { key: "durum", label: "Durum", value: state?.label || "", tone: state?.tone === "critical" ? "critical" as const : state?.tone === "success" ? "success" as const : "neutral" as const },
  ] : [];

  const title = shown ? `${shown.patient.fullName} — ${shown.baslik || "Taksit planı"}` : "Taksit planı";
  const description = shown
    ? `${doctorLabel(shown.doctor.fullName)} · ${shown.taksitSayisi} taksit, ${(PERIODS[shown.period] || shown.period).toLocaleLowerCase("tr")} · Toplam ${money(shown.toplamBorc)}${Number(shown.pesnat) > 0 ? ` · Peşinat ${money(shown.pesnat)}` : ""}`
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
              <Button variant="danger-ghost" icon={Ban} className="mr-auto" loading={cancelling} onClick={() => void cancelPlan()}>
                Planı iptal et
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>Kapat</Button>
            {canPay && nextItem && (
              <Button icon={Wallet} onClick={() => setPayTarget(nextItem)}>
                {nextItem.siraNo}. taksiti tahsil et
              </Button>
            )}
          </>
        )}
      >
        {error ? (
          <LoadErrorState message={error} onRetry={planId ? () => void load(planId) : undefined} />
        ) : loading && !shown ? (
          <ListRowSkeleton variant="row" rows={5} />
        ) : shown && summary ? (
          <div className="space-y-4">
            <StatStrip items={stats} columns={3} aria-label="Plan özeti" />
            {(phone || canReadPatients) && (
              <div className="flex flex-wrap gap-2">
                {phone && <Button size="sm" variant="secondary" icon={Phone} href={`tel:${phone}`}>{formatPhoneNumber(phone)}</Button>}
                {canReadPatients && (
                  <Button size="sm" variant="secondary" icon={FolderOpen} href={`/hasta-detay?id=${encodeURIComponent(shown.patient.id)}&tab=odeme`}>Hasta dosyası</Button>
                )}
              </div>
            )}
            {shown.notes && <p className="text-sm text-slate-600"><span className="font-semibold text-slate-700">Not:</span> {shown.notes}</p>}

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
                    {canPay && isOpenInstallment(row) && (
                      <IconButton icon={Wallet} title={`${row.siraNo}. taksiti tahsil et`} size="sm" tone="primary" onClick={() => setPayTarget(row)} />
                    )}
                  </div>
                </div>
              )}
            />

            <Section
              title="Hatırlatmalar"
              headingAs="h3"
              actions={canWriteReminders && open ? <Button size="sm" variant="secondary" icon={Plus} onClick={() => setReminderOpen(true)}>Hatırlatma ekle</Button> : undefined}
            >
              {reminders.length === 0 ? (
                <p className="text-sm text-slate-500">Bu plan için bekleyen hatırlatma yok.</p>
              ) : (
                <ul className="space-y-1 text-sm text-slate-700">
                  {reminders.map((reminder) => (
                    <li key={reminder.id} className="flex flex-wrap gap-x-2">
                      <span className={`tabular-nums ${dueDayKey(reminder.reminderDate) <= today ? "font-semibold text-red-700" : "text-slate-500"}`}>{shortDate(reminder.reminderDate)}</span>
                      <span>{reminder.note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
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
        planId={shown?.id || null}
      />
    </>
  );
}
