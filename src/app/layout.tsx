import type { Metadata } from "next";
import "./globals.css";
import { getActiveThemeId } from "@/lib/active-theme";
import { getThemePackage, themeCssVars } from "@/lib/theme-packages";

export const metadata: Metadata = {
  title: "Klinik Yönetim Paneli",
  description: "Diş klinikleri için yönetim sistemi"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const activeThemeId = await getActiveThemeId();
  const pkg = getThemePackage(activeThemeId);
  const vars = themeCssVars(pkg);
  const cssVarBlock = Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");

  return (
    <html lang="tr" data-theme={pkg.id}>
      <head>
        {/* Sistem geneli tema (Superadmin > Tema) burada satır içi enjekte edilir —
            Tailwind renkleri bu değişkenleri okur (bkz. tailwind.config.ts). */}
        <style dangerouslySetInnerHTML={{ __html: `:root{${cssVarBlock}}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
