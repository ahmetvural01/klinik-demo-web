"use client";

import { useState } from "react";
import { Ban, CheckCircle2, ExternalLink, PlayCircle, Trash2, XCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Callout } from "@/components/ui/Callout";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { Money, formatDateText } from "@/components/ui/Money";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StepList, type StepItem } from "@/components/ui/StepList";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import {
  PLAN_STATUS,
  apiMessage,
  isPlanOpen,
  isStepDone,
  isStepPending,
  planProgress,
  type PlanStatus,
  type PlanStep,
  type TreatmentPlan,
} from "./plan-shared";

type PatchBody = { status?: PlanStatus; stepUpdates?: { id: string; status: string }[]; stepDeletes?: string[] };

/**
 * Plan ayrıntısı. Yalnız sunucunun kabul ettiği geçişler düğme olarak sunulur:
 * Planlandı → "Tedaviye başla", Devam ediyor → "Planı tamamla" (bekleyen adım
 * varsa pasif ve nedeni yazar), açık planda "Planı iptal et" (solda, onaylı).
 * Bekleyen adımda "Yapıldı" ve "…" (iptal et / plandan kaldır); yapılmış ya da
 * iptal edilmiş adımda düğme yok (sunucu geri almayı kabul etmez). Önceden
 * dört durumun hepsi tıklanabiliyor, reddedilince kod adlı hata çıkıyordu.
 * Planlandı durumundaki planda ilk "Yapıldı" planı kendiliğinden "Devam ediyor"a alır.
 */
export function PlanDetailModal({
  plan,
  onClose,
  onChanged,
  canWrite,
  showPatient = true,
}: {
  plan: TreatmentPlan | null;
  onClose: () => void;
  /** Sunucunun döndürdüğü güncel plan (liste ve pencere yenilenir). */
  onChanged: (plan: TreatmentPlan) => void;
  canWrite: boolean;
  showPatient?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (!plan) return null;

  const progress = planProgress(plan);
  const open = isPlanOpen(plan);
  const editable = canWrite && open;
  const status = PLAN_STATUS[plan.status] || { label: plan.status, tone: "neutral" as const };

  const patch = async (key: string, body: PatchBody, success: string) => {
    if (busy) return;
    setBusy(key);
    setError("");
    try {
      const response = await fetch(`/api/treatment-plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiMessage(data, "İşlem yapılamadı. Lütfen tekrar deneyin."));
      // Yanıt hastanın T.C./telefonunu taşımaz; mevcut hasta bilgisi korunur.
      onChanged({ ...plan, ...(data as Partial<TreatmentPlan>), patient: plan.patient, doctor: (data as TreatmentPlan)?.doctor || plan.doctor });
      showToastSafe({ type: "success", icon: "tedavi", message: success });
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "İşlem yapılamadı.");
    } finally {
      setBusy(null);
    }
  };

  const markDone = (step: PlanStep) => patch(
    `done-${step.id}`,
    {
      stepUpdates: [{ id: step.id, status: "YAPILDI" }],
      // İlk yapılan adım planı başlatır (önceden plan "Planlandı"da kalıyor, tamamlamak için elle "Devam ediyor" seçmek gerekiyordu).
      ...(plan.status === "PLANLANDI" ? { status: "DEVAM_EDIYOR" as const } : {}),
    },
    `${step.treatmentName} yapıldı olarak işaretlendi.`,
  );

  const cancelStep = async (step: PlanStep) => {
    const approved = await confirmDialog({
      title: "Adım iptal edilsin mi?",
      message: `“${step.treatmentName}” yapılmayacak olarak işaretlenir ve plan toplamından düşer. Bu işlem geri alınamaz.`,
      confirmText: "Adımı iptal et",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (approved) await patch(`cancel-${step.id}`, { stepUpdates: [{ id: step.id, status: "IPTAL" }] }, `${step.treatmentName} iptal edildi.`);
  };

  const removeStep = async (step: PlanStep) => {
    const approved = await confirmDialog({
      title: "Plandan kaldırılsın mı?",
      message: `“${step.treatmentName}” bu plandan kaldırılır (kayıt geçmişte saklanır).`,
      confirmText: "Plandan kaldır",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (approved) await patch(`remove-${step.id}`, { stepDeletes: [step.id] }, `${step.treatmentName} plandan kaldırıldı.`);
  };

  const cancelPlan = async () => {
    const approved = await confirmDialog({
      title: "Plan iptal edilsin mi?",
      message: `“${plan.title}” iptal edilir; adımları değiştirilemez hale gelir.`,
      confirmText: "Planı iptal et",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (approved) await patch("plan-cancel", { status: "IPTAL" }, "Tedavi planı iptal edildi.");
  };

  const completeBlocker = progress.pendingCount > 0
    ? `${progress.pendingCount} adım bekliyor; önce “Yapıldı” ya da iptal edin.`
    : progress.doneCount === 0 ? "Yapılmış adım yok; tedavi yapılmayacaksa planı iptal edin." : "";

  let firstPendingSeen = false;
  const steps: StepItem[] = plan.steps.map((step) => {
    const pending = isStepPending(step);
    const isCurrent = pending && open && !firstPendingSeen;
    if (isCurrent) firstPendingSeen = true;
    return {
      key: step.id,
      title: (
        <span>
          {step.treatmentName}
          {step.toothNo && <span className="font-normal text-slate-500"> · Diş {step.toothNo}</span>}
        </span>
      ),
      description: isStepDone(step)
        ? (step.doneAt ? `Yapıldı ${formatDateText(step.doneAt)}` : "Yapıldı")
        : step.status === "IPTAL" ? "İptal edildi — toplama dahil değil" : step.note || undefined,
      meta: <Money value={step.amount} />,
      status: isStepDone(step) ? "done" : step.status === "IPTAL" ? "skipped" : isCurrent ? "current" : "upcoming",
      actions: editable && pending ? (
        <>
          <Button size="sm" variant="secondary" icon={CheckCircle2} loading={busy === `done-${step.id}`} disabled={Boolean(busy)} onClick={() => void markDone(step)}>
            Yapıldı
          </Button>
          <ActionMenu
            label={`${step.treatmentName} için diğer işlemler`}
            items={[
              { key: "cancel", label: "Adımı iptal et", icon: XCircle, onSelect: () => void cancelStep(step), disabled: Boolean(busy) },
              { key: "remove", label: "Plandan kaldır", icon: Trash2, danger: true, onSelect: () => void removeStep(step), disabled: Boolean(busy) },
            ]}
          />
        </>
      ) : undefined,
    };
  });

  const footer = editable ? (
    <>
      <Button variant="danger-ghost" icon={Ban} onClick={() => void cancelPlan()} disabled={Boolean(busy)} loading={busy === "plan-cancel"} className="mr-auto">
        Planı iptal et
      </Button>
      {plan.status === "PLANLANDI" ? (
        <Button icon={PlayCircle} loading={busy === "plan-start"} disabled={Boolean(busy)} onClick={() => void patch("plan-start", { status: "DEVAM_EDIYOR" }, "Tedaviye başlandı.")}>
          Tedaviye başla
        </Button>
      ) : (
        <Button
          icon={CheckCircle2}
          loading={busy === "plan-complete"}
          disabled={Boolean(busy)}
          onClick={() => {
            // Düğme nedensiz pasif kalmaz: tamamlanamıyorsa nedeni pencerenin üstünde yazar.
            if (completeBlocker) {
              setError(completeBlocker);
              return;
            }
            void patch("plan-complete", { status: "TAMAMLANDI" }, "Tedavi planı tamamlandı.");
          }}
        >
          Planı tamamla
        </Button>
      )}
    </>
  ) : undefined;

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose(); }}
      title={plan.title}
      description={[showPatient ? plan.patient.fullName : "", plan.doctor.fullName, formatDateText(plan.createdAt)].filter(Boolean).join(" · ")}
      size="lg"
      module="tedavi"
      trackFormChanges={false}
      footer={footer}
    >
      <div className="space-y-4">
        {error && <Callout tone="critical" compact role="alert">{error}</Callout>}
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={status.tone} size="md">{status.label}</Badge>
          {progress.activeCount > 0 && (
            <ProgressBar
              className="min-w-[12rem] flex-1"
              value={progress.doneCount}
              max={progress.activeCount}
              label="İlerleme"
              valueLabel={`${progress.doneCount}/${progress.activeCount} adım`}
              tone={plan.status === "TAMAMLANDI" ? "success" : "primary"}
            />
          )}
        </div>
        <StepList aria-label="Tedavi adımları" steps={steps} />

        <DescriptionList
          layout="rows"
          items={[
            { key: "total", label: progress.cancelledCount > 0 ? "Toplam (iptal edilenler hariç)" : "Toplam", value: <Money value={progress.total} /> },
            { key: "done", label: "Yapılan", value: <Money value={progress.done} />, hidden: progress.doneCount === 0 },
            { key: "remaining", label: "Kalan", value: <Money value={progress.remaining} />, emphasis: true, hidden: !open },
          ]}
        />
        <p className="text-xs text-slate-500">Plan tutarları hastanın borcuna yansımaz; tedavi yapıldıkça hasta dosyasında kaydedilir.</p>

        {plan.notes && <p className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{plan.notes}</p>}

        {showPatient && (
          <Button variant="ghost" size="sm" icon={ExternalLink} href={`/hasta-detay?id=${encodeURIComponent(plan.patient.id)}&tab=tedavi`}>
            Hasta dosyası
          </Button>
        )}
      </div>
    </Modal>
  );
}
