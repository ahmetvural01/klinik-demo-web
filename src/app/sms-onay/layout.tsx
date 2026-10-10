import type { Metadata } from "next";

// Tek kullanımlık hasta bağlantısı: arama motoruna girmesin, başka siteye
// adresi (içindeki belirteç) gönderilmesin; sekmede ne olduğu yazsın.
export const metadata: Metadata = {
  title: "SMS izni",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SmsOnayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
