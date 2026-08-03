/**
 * Yükleniyor göstergesi — "3 dots fade" deseni, MIT lisanslı
 * svg-spinners koleksiyonundan alınıp `currentColor` ile tema rengine
 * bağlanacak şekilde uyarlandı (bkz. https://github.com/n3r4zzurr0/svg-spinners,
 * MIT License, Utkarsh Verma). Saf CSS animasyonu — JS runtime/Lottie
 * player gerektirmez, ~500 bayt. `prefers-reduced-motion` sayfa genelindeki
 * `*` kuralı (globals.css) ile otomatik olarak durur (inline SVG olduğu
 * için sayfa CSS'i içine cascade eder).
 */
export function Spinner({ className = "h-4 w-4", label = "Yükleniyor" }: { className?: string; label?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" role="status" aria-label={label}>
      <style>{`
        .ui-spinner-dot { animation: ui-spinner-fade 0.8s linear infinite; animation-delay: -0.8s; }
        .ui-spinner-dot-2 { animation-delay: -0.65s; }
        .ui-spinner-dot-3 { animation-delay: -0.5s; }
        @keyframes ui-spinner-fade { 93.75%, 100% { opacity: 0.2; } }
      `}</style>
      <circle className="ui-spinner-dot" cx="4" cy="12" r="3" />
      <circle className="ui-spinner-dot ui-spinner-dot-2" cx="12" cy="12" r="3" />
      <circle className="ui-spinner-dot ui-spinner-dot-3" cx="20" cy="12" r="3" />
    </svg>
  );
}
