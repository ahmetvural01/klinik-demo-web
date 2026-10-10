import { redirect } from "next/navigation";

// Muayene ve tedavi kaydı her hastanın dosyasındaki Tedavi sekmesindedir. Eski
// yer imleri (/muayene) önceden "modül taşındı" bilgi kartı gösteriyordu;
// kullanıcı oradan ayrıca Hastalar'a gitmek zorundaydı. Artık doğrudan
// Hastalar listesine yönlenir (hasta seçilince dosya açılır).
export default function MuayenePage() {
  redirect("/hasta");
}
