"use client";

import { useEffect, useState } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { Callout } from "@/components/ui/Callout";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";

/**
 * Kliniğe gizli giriş (destek için klinik ekranını açma). Klinik listesi ve
 * klinik dosyası aynı pencereyi kullanır; önceden iki ayrı kopya vardı.
 * Giriş denetim günlüğüne "gizli giriş" olarak yazılır (bkz. impersonate API).
 * İstek bilinçli olarak saSend ile değil düz fetch ile atılır: yanlış şifre
 * 401 dönebilir ve saSend 401'de giriş ekranına yönlendirirdi.
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
    <FormModal
      open={Boolean(institution)}
      onClose={onClose}
      title="Kliniğe gir"
      description={institution ? `${institution.name} kliniği yeni sekmede tam yetkiyle açılır.` : undefined}
      size="sm"
      trackFormChanges={false}
      onSubmit={() => enter()}
      submitting={loading}
      submitDisabled={!password}
      submitLabel="Giriş yap"
      error={error}
      formClassName="space-y-3"
    >
      <Callout tone="warning" compact icon={null}>
        <ul className="list-disc space-y-1 pl-4">
          <li>Klinik, yöneticisinin hesabıyla ve <strong>tam yetkiyle</strong> açılır; kayıt ekleyip silebilirsiniz.</li>
          <li>Giriş anı ve klinikte yaptığınız işlemler Denetim Günlüğü&apos;ne sizin adınızla, &quot;gizli giriş&quot; işaretiyle yazılır.</li>
          <li>Başka bir kliniğe açık gizli oturumunuz varsa o sekme de bu kliniğe geçer; önce o sekmeyi kapatın.</li>
        </ul>
      </Callout>
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
    </FormModal>
  );
}
