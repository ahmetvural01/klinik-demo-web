/**
 * `icon` — işleme özel bağlam rozeti (bkz. src/components/ui/ModuleIcon.tsx
 * ModuleKey). Verilirse ortak başarı/hata çizim animasyonunun (StatusFeedback)
 * yanında küçük bir modül ikonu gösterilir — "ödeme" bildirimi ile "laboratuvar"
 * bildirimi aynı check işaretini paylaşsa da farklı bağlamla ayrışır. Opsiyoneldir;
 * verilmezse eskisi gibi yalnız StatusFeedback gösterilir. `duration` verilmezse
 * ToastProvider seçer: hata 8 sn (okunup anlaşılsın), diğerleri 3 sn.
 */
export function showToastSafe({ title, message, type = 'info', duration, icon, action }: { title?: string; message: string; type?: 'success' | 'error' | 'info'; duration?: number; icon?: string; action?: { label: string; onClick: () => void } }) {
  try {
    if (typeof window === 'undefined') return;
    // `action`: bildirimdeki tek düğme (ör. "Makbuz yazdır", "Geri al").
    window.dispatchEvent(new CustomEvent('klinik-show-toast', { detail: { title, message, type, duration, icon, action } }));
  } catch {
    // noop
  }
}

export default showToastSafe;
