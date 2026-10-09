type CountUpProps = {
  value: number;
  /** Geriye dönük uyumluluk için tutulur; artık sayma animasyonu yapılmaz. */
  duration?: number;
  formatter?: (n: number) => string;
  className?: string;
};

/**
 * Sayıyı doğrudan son değeriyle gösterir. Önceden her açılışta 0'dan sayarak
 * geliyordu: kullanıcı bakiye/adet okumak için animasyonun bitmesini
 * beklemek zorunda kalıyor, ekran sürekli hareket ediyormuş gibi görünüyordu.
 * Çağıran yerler değişmesin diye bileşen adı ve özellikleri korunuyor.
 */
export function CountUp({ value, formatter, className }: CountUpProps) {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  const text = formatter ? formatter(safe) : safe.toLocaleString("tr-TR");
  return <span className={`ui-count-up ${className || ""}`}>{text}</span>;
}
