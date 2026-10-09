"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { clientMutation } from "@/lib/client-mutation";
import { showToastSafe } from "@/lib/toast-client";

export function GhostModeBanner({ institutionName, previewLabel = null }: { institutionName: string; previewLabel?: string | null }) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  async function exitGhost() {
    if (exiting) return;
    setExiting(true);
    try {
      await clientMutation("/api/auth/superadmin/exit-ghost", { method: "POST" }, "Klinik oturumundan çıkılamadı.");
      router.replace("/superadmin");
      router.refresh();
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Klinik oturumundan çıkılamadı." });
      setExiting(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      <div className="flex items-center gap-2.5">
        <Eye className="h-4 w-4 shrink-0" />
        <p>
          <span className="font-bold">Sistem sahibi oturumu:</span> {institutionName} kliniğindesiniz, {previewLabel ? <>şu an <strong>{previewLabel}</strong> görünümündesiniz (yalnız bu rolün yetkileri; sol menüden kapatabilirsiniz).</> : "tüm yetkiler açık."} Klinik personeli bu oturumu ve işlemlerinizi göremez; yaptıklarınız yalnız Platform Denetim Günlüğü&apos;nde izlenir.
        </p>
      </div>
      <button
        type="button"
        onClick={exitGhost}
        disabled={exiting}
        className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
      >
        {exiting ? "Çıkılıyor…" : "Platform paneline dön"}
      </button>
    </div>
  );
}
