/**
 * `icon` — işleme özel bağlam rozeti (bkz. src/components/ui/ModuleIcon.tsx
 * ModuleKey). Verilirse ortak başarı/hata çizim animasyonunun (StatusFeedback)
 * yanında küçük bir modül ikonu gösterilir — "ödeme" bildirimi ile "laboratuvar"
 * bildirimi aynı check işaretini paylaşsa da farklı bağlamla ayrışır. Opsiyoneldir;
 * verilmezse eskisi gibi yalnız StatusFeedback gösterilir.
 */
export function showToastSafe({ title, message, type = 'info', duration = 3000, icon }: { title?: string; message: string; type?: 'success' | 'error' | 'info'; duration?: number; icon?: string }) {
  try {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('klinik-show-toast', { detail: { title, message, type, duration, icon } }));
  } catch (e) {
    // noop
  }
}

export default showToastSafe;
