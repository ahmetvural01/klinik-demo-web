"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";

export function GhostModeBanner({ institutionName }: { institutionName: string }) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  async function exitGhost() {
    if (exiting) return;
    setExiting(true);
    try {
      await fetch("/api/auth/superadmin/exit-ghost", { method: "POST" });
    } finally {
      router.replace("/superadmin");
    }
  }

  return (
    <div className="flex items-center justify-between gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      <div className="flex items-center gap-2.5">
        <Eye className="h-4 w-4 shrink-0" />
        <p>
          <span className="font-bold">Gizli klinik girişi (ghost mod).</span> {institutionName} kliniğine süperadmin olarak görüntüleyici erişimindesiniz.
        </p>
      </div>
      <button
        type="button"
        onClick={exitGhost}
        disabled={exiting}
        className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
      >
        {exiting ? "Çıkılıyor..." : "Ghost modundan çık"}
      </button>
    </div>
  );
}
