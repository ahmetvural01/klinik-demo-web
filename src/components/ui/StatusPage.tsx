import { useId, type ComponentType, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Lock, SearchX, Signpost, XCircle } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

export type StatusPageTone = "neutral" | "info" | "success" | "warning" | "critical";

/**
 * Hazır durumlar: ikon, ton, başlık ve açıklama varsayılanlarını verir —
 * aynı durum her ekranda aynı sözcüklerle anlatılsın.
 * forbidden (403) · not-found (404) · error (hata sınırı) · moved (taşınan
 * eski adres) · redirect (yönlendiriliyor; ikon yerine dönen gösterge).
 */
export type StatusPageKind = "forbidden" | "not-found" | "error" | "moved" | "redirect";

type IconComponent = ComponentType<{ className?: string }>;

const PRESET: Record<StatusPageKind, { icon: IconComponent; tone: StatusPageTone; title: string; description?: string }> = {
  forbidden: {
    icon: Lock,
    tone: "neutral",
    title: "Bu sayfayı açma izniniz yok",
    description: "Bu işe ihtiyacınız varsa klinik yöneticinizden izin isteyin.",
  },
  "not-found": {
    icon: SearchX,
    tone: "neutral",
    title: "Sayfa bulunamadı",
    description: "Adres yanlış yazılmış ya da sayfa kaldırılmış olabilir.",
  },
  // Başarısız/engelleyen durum: critical (§6.2) — ListTable ve LoadErrorState ile aynı kırmızı.
  error: {
    icon: XCircle,
    tone: "critical",
    title: "Bu sayfa açılamadı",
    description: "Beklenmeyen bir hata oluştu; yeniden deneyin, sorun sürerse klinik yöneticinize haber verin.",
  },
  moved: {
    icon: Signpost,
    tone: "info",
    title: "Bu sayfa taşındı",
    description: "Aradığınız işlem artık başka bir bölümde.",
  },
  redirect: {
    icon: Spinner,
    tone: "info",
    title: "Yönlendiriliyor…",
  },
};

// Hazır tür verilmeden kullanıldığında ikon tona göre seçilir (Callout ile aynı).
const TONE_ICON: Record<StatusPageTone, IconComponent> = {
  neutral: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: XCircle,
};

// Ton renkleri Badge/Callout ile aynı dil; "info" marka rengini kullanır.
const ICON_TONE: Record<StatusPageTone, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-500",
  info: "border-primary/15 bg-primary/10 text-primary",
  success: "border-emerald-200 bg-emerald-50 text-emerald-600",
  warning: "border-amber-200 bg-amber-50 text-amber-600",
  critical: "border-red-200 bg-red-50 text-red-600",
};

type StatusPageBaseProps = {
  /** Varsayılan: hazır durumun tonu, yoksa "neutral". */
  tone?: StatusPageTone;
  /** lucide ikon; varsayılan hazır durumun ya da tonun ikonu. `null` ikonsuz gösterir. */
  icon?: IconComponent | null;
  /** Bir iki cümle: ne oldu ve kullanıcı ne yapabilir. `null` hazır açıklamayı gizler. */
  description?: ReactNode;
  /** Destek için küçük teknik kod ("404", hata özeti/digest). Süs olarak büyük rakam basılmaz. */
  code?: ReactNode;
  /** Düğmeler: en fazla bir birincil (ör. "Ana sayfaya dön"), gerekirse bir ikincil ("Geri dön"). */
  actions?: ReactNode;
  /** Açıklamanın altında ek içerik (ör. gereken izin listesi, katlanır teknik ayrıntı). */
  children?: ReactNode;
  /**
   * Panel kabuğunun DIŞINDA (kök not-found, global hata) tüm ekranı kaplar ve
   * zemini kendisi boyar. Varsayılan: panel içinde min-h-[60vh] ortalı.
   */
  fullScreen?: boolean;
  /** Sayfanın tek başlığıysa "h1" (varsayılan); sayfa başlığının altında kullanılıyorsa "h2". */
  headingAs?: "h1" | "h2";
  className?: string;
};

export type StatusPageProps = StatusPageBaseProps & (
  | { kind: StatusPageKind; title?: ReactNode }
  | { kind?: undefined; title: ReactNode }
);

/**
 * Tam sayfa durum ekranı: yetkisiz (403), bulunamadı (404), hata, taşındı,
 * yönlendiriliyor. Önceden her biri ayrı biçimdeydi (gri dev "404" yazısı,
 * kartlı hata kutusu, elle bağlantı düğmesi, her kelimesi büyük başlık).
 * Ortalı, kartsız; ikon, başlık, kısa açıklama, düğmeler ve isteğe bağlı kod.
 * Hook olarak yalnız useId kullanır; sunucu bileşeninde (not-found.tsx) de çalışır.
 *
 *   <StatusPage kind="not-found" code="404" actions={<Button href="/anasayfa">Ana sayfaya dön</Button>} />
 *   <StatusPage kind="error" code={error.digest} actions={<Button icon={RefreshCw} onClick={reset}>Yeniden dene</Button>} />
 */
export function StatusPage(props: StatusPageProps) {
  const {
    kind,
    tone,
    icon,
    title,
    description,
    code,
    actions,
    children,
    fullScreen = false,
    headingAs = "h1",
    className = "",
  } = props;
  const titleId = useId();
  const preset = kind ? PRESET[kind] : undefined;
  const finalTone = tone ?? preset?.tone ?? "neutral";
  const Icon = icon === null ? null : icon ?? preset?.icon ?? TONE_ICON[finalTone];
  const finalTitle = title ?? preset?.title;
  const finalDescription = description === undefined ? preset?.description : description;
  const Heading = headingAs;
  // Hata ekranı içerik yerine anlık belirir → okunur; yönlendirme bir durum bildirimidir.
  const role = kind === "redirect" ? "status" : finalTone === "critical" || finalTone === "warning" ? "alert" : undefined;

  return (
    <section
      role={role}
      aria-labelledby={titleId}
      className={`ui-status-page flex flex-col items-center justify-center px-4 py-10 text-center ${fullScreen ? "min-h-dvh bg-[rgb(var(--app-bg))]" : "min-h-[60vh]"} ${className}`}
    >
      {Icon && (
        <span aria-hidden="true" className={`mb-4 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border ${ICON_TONE[finalTone]}`}>
          <Icon className="h-6 w-6" />
        </span>
      )}
      <Heading id={titleId} className="max-w-md font-display text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">
        {finalTitle}
      </Heading>
      {finalDescription && <div className="mt-2 max-w-md text-sm leading-6 text-slate-600">{finalDescription}</div>}
      {children && <div className="mt-4 w-full max-w-md">{children}</div>}
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
      {code && (
        <p className="mt-6 text-xs text-slate-500">
          Hata kodu: <span className="select-all font-mono font-semibold tabular-nums text-slate-700">{code}</span>
        </p>
      )}
    </section>
  );
}
