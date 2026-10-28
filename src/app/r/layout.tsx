import type { Metadata } from "next";

// Hastaya özel bağlantı: arama motoruna girmesin, adres başka siteye gitmesin.
export const metadata: Metadata = {
  title: "Randevu onayı",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RandevuOnayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
