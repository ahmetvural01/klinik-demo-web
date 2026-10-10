"use client";

/**
 * Hastalar listesinin son adresi (arama, süzgeç, sayfa, sıralama). Hasta
 * dosyasındaki "Hastalar" geri bağlantısı bu adrese döner: önceden her zaman
 * `/hasta`'ya gidiyor, banko aradığı ve sayfaladığı listeyi baştan kuruyordu.
 * Yalnız sekmeye özel oturum deposunda tutulur; hasta verisi içermez (yalnız
 * liste adresi). Depo kullanılamazsa `/hasta` döner.
 */
const STORAGE_KEY = "hasta-liste-son-adres";
const LIST_PATH = "/hasta";

export function rememberPatientListAddress(search: string) {
  try {
    const params = new URLSearchParams(search);
    // Tek seferlik "yeni hasta formu aç" parametresi geri dönüşte formu yeniden açmasın.
    params.delete("yeni");
    const query = params.toString();
    window.sessionStorage.setItem(STORAGE_KEY, query ? `${LIST_PATH}?${query}` : LIST_PATH);
  } catch {
    // Gizli pencere / engellenmiş depo: geri bağlantı /hasta'ya döner.
  }
}

export function readPatientListAddress(): string {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY) || "";
    // Yalnız liste sayfasının kendi adresi kabul edilir (başka yola yönlendirme yok).
    return value === LIST_PATH || value.startsWith(`${LIST_PATH}?`) ? value : LIST_PATH;
  } catch {
    return LIST_PATH;
  }
}
