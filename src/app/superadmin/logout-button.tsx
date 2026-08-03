"use client";

import { LogOut } from "lucide-react";

export default function LogoutButton() {
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/superadmin";
  };

  return (
    <button
      onClick={handleLogout}
      className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-bold text-slate-500 transition hover:bg-red-50 hover:text-red-600"
    >
      <LogOut className="h-4 w-4" strokeWidth={1.9} />
      <span>Çıkış Yap</span>
    </button>
  );
}
