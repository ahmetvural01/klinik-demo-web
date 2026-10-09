"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";

/**
 * Kliniğe gizli giriş (destek için klinik ekranını açma). Klinik listesi ve
 * klinik dosyası aynı pencereyi kullanır; önceden iki ayrı kopya vardı.
 * Giriş denetim günlüğüne "gizli giriş" olarak yazılır (bkz. impersonate API).
 */
export function GhostLoginModal({
  institution,
  onClose,
}: {
  institution: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (institution) {
      setPassword("");
      setError(null);
    }
  }, [institution]);

  const enter = async () => {
    if (!institution || !password || loading) return;
    // Yeni sekme kullanıcı tıklamasıyla hemen açılmalı; aksi halde tarayıcı
    // açılır pencere engelleyicisine takılır.
    const clinicWindow = window.open("about:blank", "_blank");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/superadmin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: institution.id, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        clinicWindow?.close();
        setError(data?.message || "Giriş yapılamadı. Şifrenizi kontrol edin.");
        return;
      }
      if (clinicWindow && !clinicWindow.closed) clinicWindow.location.replace("/anasayfa");
      else window.location.assign("/anasayfa");
      onClose();
    } catch {
      clinicWindow?.close();
      setError("Bağlantı kurulamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={Boolean(institution)}
      onClose={onClose}
      title="Kliniğe gizli giriş"
      description={institution ? `${institution.name} kliniğinin ekranı yeni sekmede açılır.` : undefined}
      size="sm"
      trackFormChanges={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button loading={loading} disabled={!password} onClick={() => void enter()}>Giriş yap</Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void enter();
        }}
      >
        <ul className="list-disc space-y-1 rounded-lg border border-amber-200 bg-amber-50 py-2 pl-7 pr-3 text-xs leading-5 text-amber-900">
          <li>Klinik, yöneticisinin hesabıyla ve <strong>tam yetkiyle</strong> açılır; kayıt ekleyip silebilirsiniz.</li>
          <li>Giriş anı ve klinikte yaptığınız işlemler Denetim Günlüğü&apos;ne &quot;gizli giriş&quot; işaretiyle, klinik yöneticisi hesabı adına yazılır.</li>
          <li>Başka bir kliniğe açık gizli oturumunuz varsa o sekme de bu kliniğe geçer; önce o sekmeyi kapatın.</li>
        </ul>
        <FormErrorBanner message={error} />
        <FormField label="Kendi şifreniz" htmlFor="ghost-password" required hint="Platform yöneticisi hesabınızın şifresi">
          <Input
            id="ghost-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            data-autofocus
          />
        </FormField>
      </form>
    </Modal>
  );
}
