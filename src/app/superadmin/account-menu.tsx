"use client";

import { useState } from "react";
import { UserMenu } from "@/components/layout/header-menus";
import { showToastSafe } from "@/lib/toast-client";
import { errorMessage, saSend } from "@/components/superadmin/sa-fetch";

/**
 * Üst çubuktaki hesap menüsü — klinik paneliyle aynı bileşen ve yer:
 * "Profilim" (kendi şifresi ve iki adımlı doğrulama) ve "Oturumu kapat".
 * Önceden platform yöneticisinin kendi şifresine/2FA'sına giden hiçbir yol
 * yoktu (Platform Yöneticileri listesi 2FA'sı kapalı olanı uyarıyla
 * gösterdiği halde) ve çıkış menünün altında ayrı bir düğmeydi.
 */
export default function AccountMenu({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saSend("/api/auth/logout", "POST", undefined, "Oturum kapatılamadı.");
      window.location.href = "/superadmin";
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Oturum kapatılamadı.") });
      setBusy(false);
    }
  };

  return <UserMenu name={name} roleLabel="Platform yöneticisi" showSupport={false} onLogout={() => void logout()} loggingOut={busy} />;
}
