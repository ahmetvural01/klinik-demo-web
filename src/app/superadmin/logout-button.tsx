"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { clientMutation } from "@/lib/client-mutation";
import { showToastSafe } from "@/lib/toast-client";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const handleLogout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await clientMutation("/api/auth/logout", { method: "POST" }, "Oturum kapatılamadı.");
      window.location.href = "/superadmin";
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Oturum kapatılamadı." });
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={handleLogout}
      className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-bold text-slate-500 transition hover:bg-red-50 hover:text-red-600"
    >
      <LogOut className="h-4 w-4" strokeWidth={1.9} />
      <span>Çıkış Yap</span>
    </button>
  );
}
