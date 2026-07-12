export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  requireText?: string;
  requireTextLabel?: string;
};

export function confirmDialog(options: string | ConfirmOptions): Promise<boolean> {
  const opts: ConfirmOptions = typeof options === "string" ? { message: options } : options;

  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
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
