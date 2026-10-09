import { redirect } from "next/navigation";

// E-posta (SMTP) ayarları artık Sistem Ayarları içinde bir sekme; eski adres
// oraya yönlendirilir (yer imleri çalışmaya devam eder).
export default function SmtpRedirectPage() {
  redirect("/superadmin/sistem?tab=eposta");
}
