export function showToastSafe({ title, message, type = 'info', duration = 3000 }: { title?: string; message: string; type?: 'success' | 'error' | 'info'; duration?: number }) {
  try {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('klinik-show-toast', { detail: { title, message, type, duration } }));
  } catch (e) {
    // noop
  }
}

export default showToastSafe;
