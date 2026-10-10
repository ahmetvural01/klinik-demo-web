import type { ReactNode } from "react";
import { Check, Minus } from "lucide-react";

/**
 * done: tamamlandı (✓) · current: şu anki adım (● dolu) · upcoming: sırada (○) ·
 * error: sorun var — gecikti/başarısız (!) · skipped: yapılmadı/iptal (–, üstü çizili).
 */
export type StepStatus = "done" | "current" | "upcoming" | "error" | "skipped";

export type StepItem = {
  key: string;
  /** Kısa adım adı ("Ölçü gönderildi", "Kanal tedavisi · 36"). */
  title: ReactNode;
  /** Bir satırlık ayrıntı: tarih, not ("Gönderildi 3 Eki · Dönüş 8 Eki"). */
  description?: ReactNode;
  /** Verilmezse `current` ile hesaplanır: öncekiler done, kendisi current, sonrakiler upcoming. */
  status?: StepStatus;
  /** Sağda kısa değer (tutar, tarih). */
  meta?: ReactNode;
  /** Sağda adıma ait eylem(ler) — genelde yalnız şu anki adımda tek küçük düğme. */
  actions?: ReactNode;
};

type StepListProps = {
  steps: StepItem[];
  /** Şu anki adımın key'i; durumu verilmemiş adımlar buna göre hesaplanır. */
  current?: string;
  /** true (varsayılan): sıra numarası. false: yalnız nokta (sıranın önemsiz olduğu akışlar). */
  numbered?: boolean;
  /** "vertical" (varsayılan): ayrıntılı liste. "horizontal": sihirbaz başlığı — yalnız işaret + kısa ad. */
  orientation?: "vertical" | "horizontal";
  "aria-label"?: string;
  className?: string;
};

const STATUS_TEXT: Record<StepStatus, string> = {
  done: "tamamlandı",
  current: "şu anki adım",
  upcoming: "sırada",
  error: "sorun var",
  skipped: "yapılmadı",
};

const MARKER_CLASS: Record<StepStatus, string> = {
  done: "bg-primary/10 text-primary",
  current: "bg-primary text-white shadow-[0_0_0_3px_rgb(var(--app-primary)/0.15)]",
  upcoming: "bg-[rgb(var(--app-surface))] text-slate-500 ring-1 ring-inset ring-slate-300",
  error: "bg-red-600 text-white shadow-[0_0_0_3px_rgb(220_38_38/0.15)]",
  skipped: "bg-slate-100 text-slate-400",
};

const TITLE_CLASS: Record<StepStatus, string> = {
  done: "text-slate-800",
  current: "text-slate-900",
  upcoming: "text-slate-600",
  error: "text-red-700",
  skipped: "text-slate-400 line-through",
};

function resolveStatuses(steps: StepItem[], current?: string): StepStatus[] {
  const currentIndex = current === undefined ? -1 : steps.findIndex((step) => step.key === current);
  return steps.map((step, index) => {
    if (step.status) return step.status;
    if (currentIndex === -1) return "upcoming";
    return index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
  });
}

function Marker({ status, index, numbered }: { status: StepStatus; index: number; numbered: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${MARKER_CLASS[status]}`}
    >
      {status === "done" ? (
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      ) : status === "skipped" ? (
        <Minus className="h-3.5 w-3.5" strokeWidth={3} />
      ) : status === "error" ? (
        "!"
      ) : numbered ? (
        index + 1
      ) : status === "current" ? (
        <span className="h-2 w-2 rounded-full bg-white" />
      ) : null}
    </span>
  );
}

/**
 * Numaralı adım/akış listesi — TEK görünüm. Lab işinin adımları, tedavi
 * planı adımları, kurulum sihirbazı gibi sıralı işler için. Önceden her
 * ekran kendi renkli numara dairesini ve durum rozetini yazıyordu; aynı
 * "bitti" bilgisi bir yerde yeşil daire, bir yerde rozet, bir yerde metindi.
 * Durum hem işaretle (✓ ● ○ ! –) hem ekran okuyucu metniyle verilir;
 * yalnız renge dayanmaz.
 *
 *   <StepList current="prova" steps={[
 *     { key: "olcu", title: "Ölçü", description: "Gönderildi 3 Eki · Geldi 6 Eki" },
 *     { key: "prova", title: "Prova", description: "Dönüş 12 Eki", actions: <Button size="sm" variant="secondary">Geldi</Button> },
 *     { key: "bitim", title: "Bitim" },
 *   ]} />
 */
export function StepList({
  steps,
  current,
  numbered = true,
  orientation = "vertical",
  "aria-label": ariaLabel,
  className = "",
}: StepListProps) {
  const statuses = resolveStatuses(steps, current);

  if (orientation === "horizontal") {
    return (
      <ol aria-label={ariaLabel} className={`ui-step-list flex w-full items-start ${className}`}>
        {steps.map((step, index) => {
          const status = statuses[index];
          return (
            <li
              key={step.key}
              aria-current={status === "current" ? "step" : undefined}
              className="relative flex min-w-0 flex-1 flex-col items-center px-1 text-center"
            >
              {index > 0 && (
                // Önceki adımın ortasından bu adımın ortasına çizgi (işaretlerin arkasında).
                <span
                  aria-hidden="true"
                  className={`absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2 ${statuses[index - 1] === "done" ? "bg-primary/40" : "bg-slate-200"}`}
                />
              )}
              <Marker status={status} index={index} numbered={numbered} />
              <span className={`mt-1.5 line-clamp-2 text-xs font-semibold leading-4 ${TITLE_CLASS[status]}`}>
                {step.title}
                <span className="sr-only"> ({STATUS_TEXT[status]})</span>
              </span>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol aria-label={ariaLabel} className={`ui-step-list ${className}`}>
      {steps.map((step, index) => {
        const status = statuses[index];
        const isLast = index === steps.length - 1;
        const hasMeta = Boolean(step.meta);
        const hasActions = Boolean(step.actions);
        // Izgara: kısa değer (tutar/saat) her genişlikte sağda kalır; eylemler
        // dar ekranda metnin altına iner, geniş ekranda değerin yanına geçer.
        const columns = hasMeta
          ? `grid-cols-[minmax(0,1fr)_auto] ${hasActions ? "sm:grid-cols-[minmax(0,1fr)_auto_auto]" : ""}`
          : `grid-cols-1 ${hasActions ? "sm:grid-cols-[minmax(0,1fr)_auto]" : ""}`;
        return (
          <li
            key={step.key}
            aria-current={status === "current" ? "step" : undefined}
            className={`relative flex gap-3 ${isLast ? "" : "pb-5"}`}
          >
            {!isLast && (
              // Bu adımın işaretinden bir sonrakine çizgi; tamamlanan adımdan sonra marka renginde.
              <span
                aria-hidden="true"
                className={`absolute bottom-0.5 left-3 top-[1.625rem] w-0.5 -translate-x-1/2 rounded-full ${status === "done" ? "bg-primary/35" : "bg-slate-200"}`}
              />
            )}
            <Marker status={status} index={index} numbered={numbered} />
            <div className={`grid min-w-0 flex-1 items-start gap-x-3 gap-y-2 ${columns}`}>
              <div className="min-w-0 pt-0.5">
                <p className={`text-sm font-semibold leading-5 ${TITLE_CLASS[status]}`}>
                  {step.title}
                  <span className="sr-only"> ({STATUS_TEXT[status]})</span>
                </p>
                {step.description && <div className="mt-0.5 text-xs leading-5 text-slate-500">{step.description}</div>}
              </div>
              {hasMeta && <span className="pt-0.5 text-right text-xs font-semibold leading-5 tabular-nums text-slate-600">{step.meta}</span>}
              {hasActions && (
                <div className={`flex flex-wrap items-center gap-1.5 ${hasMeta ? "col-span-2 sm:col-span-1" : ""}`}>{step.actions}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
