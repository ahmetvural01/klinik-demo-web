"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Home } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { Button } from "@/components/ui/Button";
import { StatusPage } from "@/components/ui/StatusPage";
import { buildNavGroups } from "@/lib/nav";
import { getPanelRouteRequirement } from "@/lib/panel-permissions";
import { PAGE_TITLES } from "@/lib/page-titles";
import { PERMISSION_DETAILS } from "@/lib/role-permissions";

/** "/personel-ekle?id=..." -> "Yeni personel"; bilinmeyen adres için null. */
function pageNameFor(path: string) {
  const pathname = path.split("?")[0] || "";
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const prefix = Object.keys(PAGE_TITLES)
    .filter((key) => pathname.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? PAGE_TITLES[prefix] : null;
}

function YetkisizContent() {
  const router = useRouter();
  const { can, hasFeature } = usePermissions();
  const from = useSearchParams().get("from") || "";
  // Yalnız uygulama içi adresler okunur (dışarıdan gelen bağlantı metni gösterilmez).
  const safeFrom = from.startsWith("/") && !from.startsWith("//") ? from : "";
  const pageName = safeFrom ? pageNameFor(safeFrom) : null;
  const requirement = safeFrom ? getPanelRouteRequirement(safeFrom.split("?")[0]) : null;
  const permissionTitles = (requirement?.anyOf || []).map((code) => PERMISSION_DETAILS[code]?.title).filter(Boolean);

  // Başlangıç noktası menüdeki ilk izinli sayfadır. Önceden düğme her zaman
  // /anasayfa'ya gidiyordu; Ana sayfa izni olmayan rol yine bu ekrana düşüyordu.
  const home = useMemo(() => buildNavGroups({ can, hasFeature }).flatMap((group) => group.items)[0] ?? null, [can, hasFeature]);
  const homeHref = home?.href || "/profil";
  const homeLabel = home?.label || "Profilim";
  // Bağlantı yeni sekmede açıldıysa geçmiş yoktur; "Geri dön" o zaman başlangıç sayfasına gider.
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.replace(homeHref);
  };

  return (
    <StatusPage
      kind="forbidden"
      description={(
        <>
          <p>
            {pageName ? <><b>{pageName}</b> sayfası</> : "Açmaya çalıştığınız sayfa"} sizin rolünüze kapalı.
            {permissionTitles.length > 0 && <> Gereken izin: <b>{permissionTitles.join(" veya ")}</b>.</>}
          </p>
          <p className="mt-2">Bu işe ihtiyacınız varsa klinik yöneticinizden izin isteyin.</p>
        </>
      )}
      actions={(
        <>
          <Button variant="secondary" icon={ArrowLeft} onClick={goBack}>Geri dön</Button>
          <Button icon={Home} href={homeHref}>{homeLabel}</Button>
        </>
      )}
    />
  );
}

export default function YetkisizPage() {
  return (
    <Suspense fallback={null}>
      <YetkisizContent />
    </Suspense>
  );
}
