import { redirect } from "next/navigation";

/**
 * /kasa → /muhasebe?tab=gelir
 * Tahsilat/Kasa artık Muhasebe Merkezi > Gelir/Tahsilat sekmesinde yönetilmektedir.
 */
export default function KasaRedirectPage() {
  redirect("/muhasebe?tab=gelir");
}
