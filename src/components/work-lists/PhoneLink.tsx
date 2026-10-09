import { Phone } from "lucide-react";
import { formatPhoneNumber } from "@/lib/format";
import { EmptyValue } from "@/components/ui/ListTable";

/** Ülke koduna göre ekranda okunacak telefon metni ve tel: bağlantısı. */
export function phoneParts(phone?: string | null, countryCode?: string | null): { display: string; href: string } | null {
  const raw = (phone || "").trim();
  if (!raw || raw === "***") return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const code = (countryCode || "+90").trim() || "+90";
  if (code === "+90") {
    const local = digits.startsWith("90") && digits.length === 12 ? digits.slice(2) : digits.replace(/^0/, "");
    return { display: formatPhoneNumber(local), href: `tel:+90${local}` };
  }
  return { display: `${code} ${digits}`, href: `tel:${code}${digits}` };
}

/** WhatsApp bağlantısı için uluslararası numara (ör. 905551112233). */
export function whatsappNumber(phone?: string | null, countryCode?: string | null): string | null {
  const parts = phoneParts(phone, countryCode);
  if (!parts) return null;
  return parts.href.replace(/^tel:\+?/, "").replace(/\D/g, "");
}

/**
 * Telefon numarası: tek biçimde ("(0555) 100-0101") ve dokununca arayan
 * bağlantı. Yetkisi olmayan rolde API "***" döndürür; o zaman "Gizli" yazar.
 */
export function PhoneLink({ phone, countryCode, className = "", withIcon = false }: { phone?: string | null; countryCode?: string | null; className?: string; withIcon?: boolean }) {
  if ((phone || "").trim() === "***") return <span className="text-xs italic text-slate-400">Gizli</span>;
  const parts = phoneParts(phone, countryCode);
  if (!parts) return <EmptyValue />;
  return (
    <a
      href={parts.href}
      className={`inline-flex items-center gap-1 whitespace-nowrap tabular-nums text-slate-700 hover:text-primary hover:underline ${className}`}
      aria-label={`${parts.display} numarasını ara`}
    >
      {withIcon && <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />}
      {parts.display}
    </a>
  );
}
