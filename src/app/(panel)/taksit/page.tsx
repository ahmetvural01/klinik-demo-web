import { redirect } from "next/navigation";

/**
 * /taksit → Muhasebe > Taksitler.
 * Sekme taksit okuma izniyle görünür (finans izni gerekmez).
 */
export default function TaksitRedirectPage() {
  redirect("/muhasebe?tab=taksit");
}
