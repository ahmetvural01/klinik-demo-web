"use client";

import { useState } from "react";
import { User } from "lucide-react";

export type AvatarSize = "sm" | "md" | "lg";

// sm 32px (üst bar, tablo satırı) · md 40px (liste) · lg 64px (profil, fotoğraf yükleme önizlemesi)
const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
};

const ICON_CLASS: Record<AvatarSize, string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};

// Kişi rengi addan türetilir: aynı kişi üst barda, personel listesinde ve
// profilde hep aynı renkte görünür. Renkler SABİT RGB'dir (Tailwind'in
// indigo/teal adları kurum temasına bağlı, bkz. tailwind.config.ts) ve durum
// anlamı taşıyan kırmızı/turuncu/sarı/yeşil bilerek yoktur. Her çift WCAG
// 4.5:1 kontrastı sağlar (açık zemin = renk %12 + beyaz).
const PALETTE = [
  { background: "rgb(226 239 238)", color: "rgb(15 118 110)" }, // camgöbeği
  { background: "rgb(225 237 244)", color: "rgb(3 105 161)" }, // gök mavisi
  { background: "rgb(228 234 250)", color: "rgb(29 78 216)" }, // mavi
  { background: "rgb(232 231 249)", color: "rgb(67 56 202)" }, // çivit
  { background: "rgb(237 229 250)", color: "rgb(109 40 217)" }, // mor
  { background: "rgb(244 228 245)", color: "rgb(162 28 175)" }, // eflatun
  { background: "rgb(247 227 236)", color: "rgb(190 24 93)" }, // pembe
  { background: "rgb(233 235 237)", color: "rgb(71 85 105)" }, // arduvaz
] as const;

// Unvanlar baş harf sayılmaz: "Dr. Mert Aydın" → "MA", "Uzm. Dt. Ayşe Kaya" → "AK".
const TITLE_WORD = /^(dr|dt|uzm|op|prof|doç|doc|yrd|öğr|ogr|gör|gor)\.?$/;

function nameWords(name?: string | null) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !TITLE_WORD.test(word.toLocaleLowerCase("tr-TR")));
}

/**
 * Baş harfler: ilk ve son ad (Türkçe büyük harf: "ilker ışık" → "İI").
 * "Ayşe Nur Yılmaz" → "AY", tek kelime → tek harf, ad yoksa "".
 */
export function avatarInitials(name?: string | null): string {
  const letters = nameWords(name)
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
    .filter(Boolean);
  if (letters.length === 0) return "";
  const picked = letters.length === 1 ? letters : [letters[0], letters[letters.length - 1]];
  return picked.join("").toLocaleUpperCase("tr-TR");
}

function paletteFor(name?: string | null) {
  const key = nameWords(name).join(" ").toLocaleLowerCase("tr-TR");
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

type AvatarProps = {
  /** Kişinin adı — baş harfler ve renk buradan çıkar. */
  name: string | null | undefined;
  /** Fotoğraf adresi ya da data URL. Boşsa veya açılamazsa baş harfler görünür. */
  src?: string | null;
  size?: AvatarSize;
  /**
   * true (varsayılan): ad zaten yanında yazıyor, ekran okuyucu avatarı atlar
   * (bilgi iki kez okunmaz). false: avatar tek başına duruyor — ad okunur ve
   * üzerine gelince görünür.
   */
  decorative?: boolean;
  className?: string;
};

/**
 * Kişi görseli — TEK görünüm. Fotoğraf varsa yuvarlak fotoğraf, yoksa
 * addan türeyen renkte baş harfler, ad da yoksa kişi simgesi. Personel
 * listesi, üst bar, profil ve randevu ekranlarındaki ayrı ayrı yazılmış
 * baş harf/fotoğraf kodlarının yerine geçer.
 *
 *   <Avatar name={person.fullName} src={person.profile?.photoUrl} size="sm" />
 */
export function Avatar({ name, src, size = "md", decorative = true, className = "" }: AvatarProps) {
  // Bozuk/erişilemeyen fotoğraf adresinde kırık resim yerine baş harfler görünsün.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageSrc = src?.trim() || "";
  const showImage = imageSrc !== "" && failedSrc !== imageSrc;
  const initials = avatarInitials(name);
  const palette = paletteFor(name);
  const label = name?.trim() || "Kişi";
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": label, title: label };

  return (
    <span
      {...a11y}
      className={`ui-avatar relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-bold leading-none ${SIZE_CLASS[size]} ${className}`}
      style={!showImage && initials ? { backgroundColor: palette.background, color: palette.color } : undefined}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt=""
          className="h-full w-full rounded-full border border-slate-200 object-cover"
          onError={() => setFailedSrc(imageSrc)}
        />
      ) : initials ? (
        initials
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
          <User className={ICON_CLASS[size]} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
