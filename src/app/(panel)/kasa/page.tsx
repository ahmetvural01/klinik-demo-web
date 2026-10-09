import { redirect } from "next/navigation";

/**
 * /kasa → bugünün gelir ve gider listesi.
 * "Kasa" bugünkü para hareketidir: liste üstündeki özet tahsilatı, gideri ve
 * kasadaki nakit değişimini gösterir. Yeni tahsilat için üst bardaki
 * "Yeni > Tahsilat" (/muhasebe?islem=gelir) kullanılır.
 */
export default function KasaRedirectPage() {
  redirect("/muhasebe?tab=defter&donem=bugun");
}
