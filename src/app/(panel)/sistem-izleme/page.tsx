import { redirect } from "next/navigation";

/**
 * Eski "Sistem Durumu" adresi (yer imleri, eski bağlantılar) İşlem kayıtları'nı
 * açar. Kayıt kontrolü taraması klinik ekranından kaldırıldı.
 */
export default function SistemIzlemeRedirect() {
  redirect("/log");
}
