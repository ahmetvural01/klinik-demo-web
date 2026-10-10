import { CepKlinikMark } from "@/components/brand/CepKlinikMark";
import { BRAND_NAME, BRAND_PRODUCT_LABEL } from "@/lib/brand";

type BrandLockupProps = {
  /** Ürün adının altında tek satır alt yazı ("Klinik yönetim sistemi"). */
  showLabel?: boolean;
  /** Koyu zemin üstünde (tanıtım alt bilgisi gibi) beyaz yazı. */
  inverse?: boolean;
  className?: string;
};

/**
 * Ürünün TEK marka gösterimi (tanıtım üst/alt bilgi, giriş ekranları).
 * Önceden altı ayrı biçim vardı: köşede yıldız, turuncu nokta, sabit teal
 * kutu, iki farklı alt yazı. Renk temanın birincil renginden gelir.
 */
export function BrandLockup({ showLabel = true, inverse = false, className = "" }: BrandLockupProps) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
        <CepKlinikMark className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className={`block font-display text-[15px] font-extrabold leading-none ${inverse ? "text-white" : "text-slate-900"}`}>{BRAND_NAME}</span>
        {showLabel && <span className={`mt-1 block text-[11px] font-semibold leading-none ${inverse ? "text-white/70" : "text-slate-500"}`}>{BRAND_PRODUCT_LABEL}</span>}
      </span>
    </span>
  );
}
