export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  /**
   * Verilirse onay penceresinde metin kutusu çıkar; kullanıcı bu metni
   * (büyük/küçük harf ve baştaki/sondaki boşluk gözetilmeden) yazmadan
   * onay düğmesi pasif kalır. Geri alınamaz toplu işlemler içindir.
   */
  requireText?: string;
  /** Metin kutusunun etiketi. Varsayılan: `Onaylamak için "<requireText>" yazın`. */
  requireTextLabel?: string;
};

// Açık ConfirmProvider sayısı. Sağlayıcı yokken (panel dışı sayfa) olay
// dinleyen olmadığı için söz hiç çözülmüyor, çağıran sonsuza dek bekliyordu.
// Sayaç pencere nesnesinde: modül sıcak yeniden yüklense de değer kaybolmaz.
type ConfirmHost = typeof globalThis & { __klinikConfirmProviders?: number };

/** ConfirmProvider açılınca çağırır; dönen işlev kapanınca çağrılır. */
export function registerConfirmProvider(): () => void {
  if (typeof window === "undefined") return () => {};
  const host = window as ConfirmHost;
  host.__klinikConfirmProviders = (host.__klinikConfirmProviders || 0) + 1;
  return () => {
    host.__klinikConfirmProviders = Math.max(0, (host.__klinikConfirmProviders || 1) - 1);
  };
}

/** Sayfada onay penceresini çizecek bir ConfirmProvider var mı? */
export function hasConfirmProvider(): boolean {
  if (typeof window === "undefined") return false;
  return ((window as ConfirmHost).__klinikConfirmProviders || 0) > 0;
}

export function confirmDialog(options: string | ConfirmOptions): Promise<boolean> {
  const opts: ConfirmOptions = typeof options === "string" ? { message: options } : options;

  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }

    // Sağlayıcı yoksa tarayıcının kendi onay kutusu: yanıt hiç gelmeyip işlem
    // (ve onu bekleyen pencere kapatma) takılı kalmasın. Metin isteyen onay
    // burada doğrulanamaz; güvenli taraf "hayır"dır.
    if (!hasConfirmProvider()) {
      if (opts.requireText) {
        resolve(false);
        return;
      }
      resolve(window.confirm(opts.title ? `${opts.title}\n\n${opts.message}` : opts.message));
      return;
    }

    const id = String(Date.now()) + Math.random().toString(36).slice(2, 8);

    const onResult = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; confirmed: boolean }>).detail;
      if (!detail || detail.id !== id) return;
      window.removeEventListener("klinik-confirm-result", onResult as EventListener);
      resolve(detail.confirmed);
    };

    window.addEventListener("klinik-confirm-result", onResult as EventListener);
    window.dispatchEvent(new CustomEvent("klinik-show-confirm", { detail: { id, ...opts } }));
  });
}

export default confirmDialog;
