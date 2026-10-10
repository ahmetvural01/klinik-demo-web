import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { BRAND_NAME } from "@/lib/brand";

const AUTH_IMAGE = "/marketing/auth-dental-clinic.webp";

type AuthLayoutProps = {
  /** "clinic": personel girişi (geniş ekranda solda klinik fotoğrafı). "platform": süperadmin girişi (fotoğrafsız, koyu ince şerit). */
  variant?: "clinic" | "platform";
  /** Kartın altındaki küçük bağlantılar (tanıtım, diğer giriş ekranı). */
  links?: ReactNode;
  children: ReactNode;
};

/**
 * Giriş ekranlarının ORTAK kabuğu: marka bir kez, tek kart, kart dışında
 * küçük bağlantılar. Önceden klinik girişi tam ekran fotoğraf + iki marka
 * işareti, süperadmin girişi ayrı koyu tema (ortak düğme !important ile
 * eziliyordu) kullanıyordu. Telefonda fotoğraf yüklenmez, form ilk ekranda.
 */
export function AuthLayout({ variant = "clinic", links, children }: AuthLayoutProps) {
  const platform = variant === "platform";
  return (
    <main className={`min-h-dvh bg-[rgb(var(--app-bg))] ${platform ? "border-t-[6px] border-slate-900" : "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(460px,40%)]"}`}>
      {!platform && (
        <div className="relative hidden lg:block" aria-hidden="true">
          <Image src={AUTH_IMAGE} alt="" fill sizes="60vw" className="object-cover object-[42%_center]" />
        </div>
      )}
      <div className={`flex flex-col px-4 py-6 sm:px-8 ${platform ? "min-h-[calc(100dvh-6px)]" : "min-h-dvh"}`}>
        <Link href="/" aria-label={`${BRAND_NAME} tanıtım sayfası`} className="self-start rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35">
          <BrandLockup />
        </Link>
        <div className="flex flex-1 flex-col items-center justify-start py-6 sm:justify-center sm:py-8">
          <div className="w-full max-w-[420px] rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            {children}
          </div>
          {links && <div className="mt-4 flex w-full max-w-[420px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 text-sm">{links}</div>}
        </div>
      </div>
    </main>
  );
}

/** Kart altındaki sade bağlantı (tanıtım sayfası, diğer giriş ekranı). */
export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 font-semibold text-slate-600 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35">
      {children}
    </Link>
  );
}
