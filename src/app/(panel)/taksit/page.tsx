import { redirect } from "next/navigation";

/**
 * /taksit → /muhasebe?tab=taksit
 * Taksit Takibi artık Muhasebe Merkezi içinde yönetilmektedir.
 */
export default function TaksitRedirectPage() {
  redirect("/muhasebe?tab=taksit");
}
