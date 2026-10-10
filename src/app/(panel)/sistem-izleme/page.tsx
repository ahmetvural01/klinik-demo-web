import { redirect } from "next/navigation";

/**
 * Sistem Durumu artık İşlem kayıtları › "Kayıt kontrolü" sekmesinde. Eski
 * adres (yer imleri, eski bağlantılar) sunucuda anında yönlenir. Sunucu
 * ölçümleri (platform geneli) klinik ekranından kaldırıldı.
 */
export default function SistemIzlemeRedirect() {
  redirect("/log?tab=kontrol");
}
