import { redirect } from "next/navigation";

/**
 * /kasa → /muhasebe?islem=gelir
 * Tahsilat/Kasa artık Muhasebe Merkezi'ndeki tek işlem formundan yönetilmektedir.
 */
export default function KasaRedirectPage() {
  redirect("/muhasebe?islem=gelir");
}
