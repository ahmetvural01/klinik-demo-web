// Bu adres yalnız yönlendirir: iskelet yerine kısa "Yönlendiriliyor…" (hedef sayfa kendi iskeletini çizer).
import { StatusPage } from "@/components/ui/StatusPage";

export default function Loading() {
  return <StatusPage kind="redirect" />;
}
