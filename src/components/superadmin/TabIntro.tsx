import type { ReactNode } from "react";

/**
 * Sekme içeriğinin üstündeki tek satır: ne işe yaradığını söyleyen kısa
 * cümle ve sağda o sekmenin eylemi. Telefonda alt alta sarılır (önceden uzun
 * açıklamalar yüzünden "Yeni Gün" gibi düğmeler sağdan kesiliyordu).
 */
export function TabIntro({ text, actions }: { text: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="min-w-0 flex-1 basis-64 text-sm text-slate-500">{text}</p>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
