// Muhasebe › Gelir ve gider dönemlerinin TEK kaynağı. Defter (LedgerTab) bu
// listeyi kullanır; Raporlar'daki "Tahsilatları / Giderleri listele"
// bağlantısı dönemi deftere taşırken yalnız defterin tanıdığı hazır dönemleri
// adla taşır, ötekileri (ör. "Dün") gün aralığına çevirir. Önceden rapor
// sayfası listenin bir kopyasını tutuyordu.
import type { DatePresetKey } from "@/lib/date-presets";

/** Defterin dönemleri (ortak sözlük). "3ay" takvim anlamındadır: iki ay önceki ayın 1'inden bugüne. */
export const LEDGER_PERIODS: readonly DatePresetKey[] = ["bugun", "hafta", "ay", "gecen-ay", "3ay", "yil", "ozel"];

/** Defterin adıyla tanıdığı hazır dönem mi (özel aralık hariç)? */
export function isLedgerPreset(preset: DatePresetKey): boolean {
  return preset !== "ozel" && LEDGER_PERIODS.includes(preset);
}
