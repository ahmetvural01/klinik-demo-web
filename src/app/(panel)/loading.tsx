import { PageSkeleton } from "@/components/ui/PageSkeleton";

/**
 * Kendi iskeleti olmayan panel rotalarının ortak yükleniyor görünümü.
 * Ek dolgu yok: `main` zaten kenar boşluğunu veriyor (önceden `px-5 py-6`
 * iskeleti içerikten daha içeride ve aşağıda başlatıyordu). Bu iskeleti
 * kullanan tek rota (/muayene) Hastalar listesine yönlendiği için liste biçimi.
 */
export default function PanelLoading() {
  return <PageSkeleton toolbar body="table" />;
}
