"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Select } from "@/components/ui/Input";
import { clientMutation } from "@/lib/client-mutation";
import { showToastSafe } from "@/lib/toast-client";
import { parseRolePreview, ROLE_PREVIEW_COOKIE, ROLE_PREVIEW_STORAGE, ROLE_PREVIEW_VALUES, type RolePreview } from "@/lib/role-preview";

const PREVIEW_LABELS: Record<RolePreview, string> = {
  YONETICI: "Yönetici",
  DOKTOR: "Doktor",
  ASISTAN: "Asistan",
  BANKO: "Banko",
  MUHASEBE: "Muhasebe",
};

/**
 * Sistem sahibinin (süperadmin) rol önizlemesi — TEK kopya. Önceden sol
 * menüde üç ayrı kopyası (telefon, açık menü, dar menü) ve geliştirici
 * simgesiyle duruyordu; bant ise "sol menüden kapatabilirsiniz" diyordu.
 */
function RolePreviewSelect({ previewRole }: { previewRole: RolePreview | null }) {
  const selectId = useId();
  const [value, setValue] = useState<string>(previewRole || "");

  // Sunucunun kullandığı çerez tek doğru kaynaktır; sekmede kalmış eski
  // önizleme yazısı (bazı ekranlar sessionStorage'dan okur) eşitlenir.
  useEffect(() => {
    try {
      if (previewRole) sessionStorage.setItem(ROLE_PREVIEW_STORAGE, previewRole);
      else sessionStorage.removeItem(ROLE_PREVIEW_STORAGE);
    } catch {
      // depolama kapalı olabilir
    }
  }, [previewRole]);

  const change = (next: string) => {
    const role = parseRolePreview(next);
    setValue(role || "");
    const secure = location.protocol === "https:" ? "; Secure" : "";
    try {
      if (role) {
        sessionStorage.setItem(ROLE_PREVIEW_STORAGE, role);
        document.cookie = `${ROLE_PREVIEW_COOKIE}=${encodeURIComponent(role)}; Path=/; SameSite=Lax${secure}`;
      } else {
        sessionStorage.removeItem(ROLE_PREVIEW_STORAGE);
        document.cookie = `${ROLE_PREVIEW_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`;
      }
    } catch {
      // depolama kapalıysa çerez yine yazılmıştır
    }
    window.dispatchEvent(new Event("preview-role-change"));
    // Tam yeniden yükleme: açık sayfa eski yetkilerle istek atmasın; menü ve
    // yetkiler birlikte değişsin.
    window.location.assign("/anasayfa");
  };

  return (
    <span className="flex items-center gap-2">
      <label htmlFor={selectId} className="text-xs font-semibold text-amber-900">Görünüm</label>
      <Select id={selectId} size="sm" value={value} onChange={(event) => change(event.target.value)} className="!w-auto min-w-[8.5rem]">
        <option value="">Tam yetki</option>
        {ROLE_PREVIEW_VALUES.map((role) => (
          <option key={role} value={role}>{PREVIEW_LABELS[role]}</option>
        ))}
      </Select>
    </span>
  );
}

/**
 * Sistem sahibi kliniğe görünmez girdiğinde içeriğin üstündeki bant. Tek
 * satır: kim olduğunuz, hangi klinikte, hangi rolün gözüyle baktığınız ve
 * platforma dönüş. Önceden telefonda ~200 px tutan uzun bir paragraftı.
 */
export function GhostModeBanner({
  institutionName,
  previewLabel = null,
  previewRole = null,
}: {
  institutionName: string;
  /** Geriye dönük: önizlenen rolün adı (previewRole verilirse ondan türetilir). */
  previewLabel?: string | null;
  previewRole?: string | null;
}) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);
  const role = parseRolePreview(previewRole);
  const viewLabel = role ? PREVIEW_LABELS[role] : previewLabel;

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
    <Callout
      tone="warning"
      icon={Eye}
      className="mt-3"
      title={<>Sistem sahibi oturumu{institutionName ? ` · ${institutionName}` : ""}{viewLabel ? ` · ${viewLabel} görünümü` : ""}</>}
      action={(
        <span className="flex flex-wrap items-center gap-2">
          <RolePreviewSelect previewRole={role} />
          <Button size="sm" variant="secondary" onClick={exitGhost} loading={exiting} aria-label="Platform paneline dön">
            <span className="sm:hidden">Platforma dön</span>
            <span className="hidden sm:inline">Platform paneline dön</span>
          </Button>
        </span>
      )}
    >
      <span className="hidden lg:inline">Klinik personeli bu oturumu görmez; işlemleriniz Platform Denetim Günlüğü&apos;ne yazılır.</span>
    </Callout>
  );
}
