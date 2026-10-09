"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Home, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
  const from = useSearchParams().get("from") || "";
  // Yalnız uygulama içi adresler okunur (dışarıdan gelen bağlantı metni gösterilmez).
  const safeFrom = from.startsWith("/") && !from.startsWith("//") ? from : "";
  const pageName = safeFrom ? pageNameFor(safeFrom) : null;
  const requirement = safeFrom ? getPanelRouteRequirement(safeFrom.split("?")[0]) : null;
  const permissionTitles = (requirement?.anyOf || []).map((code) => PERMISSION_DETAILS[code]?.title).filter(Boolean);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-500" aria-hidden="true">
        <Lock className="h-6 w-6" />
      </span>
      <h1 className="font-display text-xl font-extrabold tracking-tight text-slate-900">Bu sayfayı açma izniniz yok</h1>
      <div className="max-w-md space-y-2 text-sm leading-6 text-slate-600">
        <p>
          {pageName ? <><b>{pageName}</b> sayfası</> : "Açmaya çalıştığınız sayfa"} sizin rolünüze kapalı.
          {permissionTitles.length > 0 && <> Gereken izin: <b>{permissionTitles.join(" veya ")}</b>.</>}
        </p>
        <p>Bu işe ihtiyacınız varsa klinik yöneticinizden izin isteyin.</p>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" icon={ArrowLeft} onClick={() => router.back()}>Geri dön</Button>
        <Button icon={Home} href="/anasayfa">Anasayfa</Button>
      </div>
    </div>
  );
}

export default function YetkisizPage() {
  return (
    <Suspense fallback={null}>
      <YetkisizContent />
    </Suspense>
  );
}
