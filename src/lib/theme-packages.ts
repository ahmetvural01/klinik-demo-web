// Sistem geneli 10 görsel tema paketi (Superadmin > Tema ekranından
// yönetilir). Her paket bir renk kimliği (primary/accent tam skalası + nötr
// ton skalası) ve bir yazı tipi yığını taşır. success/warning/danger
// kasıtlı olarak paketler arasında sabit tutulur — bunlar durum anlamı
// taşır (başarı/uyarı/tehlike), dekoratif değildir.
//
// primaryRamp/accentRamp önemlidir: uygulamada `bg-primary`/`text-primary`
// kadar (belki daha fazla) `bg-blue-*`, `bg-indigo-*`, `bg-violet-*`,
// `bg-cyan-*` gibi Tailwind'in hazır renk paleti de "marka rengi" olarak
// kullanılıyor. tailwind.config.ts bu aileleri de bu skalalara bağlıyor —
// aksi halde tema değişikliği göze neredeyse hiç çarpmıyordu (nötr ton
// kayması tek başına yetersiz kalıyordu).
//
// Değerler CSS değişkenlerine "R G B" (boşlukla ayrılmış kanal) formatında
// yazılır ki Tailwind'in `rgb(var(--x) / <alpha-value>)` opaklık deseniyle
// çalışabilsin (bkz. tailwind.config.ts).

type Ramp = Record<"50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "950", string>;

export type ThemeVars = {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  primaryStrong: string;
  accent: string;
  slate: Ramp;
  primaryRamp: Ramp;
  accentRamp: Ramp;
};

export type ThemePackage = {
  id: string;
  name: string;
  description: string;
  fontSans: string;
  vars: ThemeVars;
};

// Tüm paketlerde ortak: durum renkleri (anlam taşır, dekoratif değil).
const STATUS = {
  success: "22 163 74",
  warning: "217 119 6",
  danger: "220 38 38",
};

export const THEME_PACKAGES: ThemePackage[] = [
  {
    id: "klasik",
    name: "Klasik Mavi",
    description: "Bugünkü varsayılan görünüm — güvenilir mavi, nötr gri.",
    fontSans: "'Segoe UI', ui-sans-serif, system-ui, -apple-system, sans-serif",
    vars: {
      bg: "246 248 251", surface: "255 255 255", border: "227 230 237", text: "25 30 41", muted: "105 114 134",
      primary: "37 99 235", primaryStrong: "29 78 216", accent: "15 118 110",
      slate: { "50": "248 249 252", "100": "242 244 248", "200": "227 230 237", "300": "205 209 219", "400": "155 161 176", "500": "105 114 134", "600": "79 87 105", "700": "61 69 87", "800": "41 47 61", "900": "25 30 41", "950": "15 18 26" },
      primaryRamp: { "50": "241 245 254", "100": "227 235 252", "200": "196 212 248", "300": "146 176 242", "400": "85 132 236", "500": "29 94 237", "600": "17 78 212", "700": "17 67 176", "800": "18 58 145", "900": "19 48 114", "950": "16 35 76" },
      accentRamp: { "50": "241 254 253", "100": "227 252 250", "200": "196 248 244", "300": "146 242 234", "400": "85 236 224", "500": "29 237 220", "600": "17 212 197", "700": "17 176 164", "800": "18 145 135", "900": "19 114 107", "950": "16 76 71" },
    },
  },
  {
    id: "zumrut",
    name: "Zümrüt Klinik",
    description: "Ferah zümrüt yeşili, sakin ve klinik hissiyat.",
    fontSans: "Calibri, 'Segoe UI', ui-sans-serif, system-ui, sans-serif",
    vars: {
      bg: "246 251 249", surface: "255 255 255", border: "228 236 233", text: "26 40 36", muted: "107 133 124",
      primary: "5 150 105", primaryStrong: "4 120 87", accent: "13 148 136",
      slate: { "50": "248 252 251", "100": "242 248 246", "200": "228 236 233", "300": "205 218 214", "400": "156 175 169", "500": "107 133 124", "600": "80 103 96", "700": "63 85 78", "800": "42 60 54", "900": "26 40 36", "950": "15 26 22" },
      primaryRamp: { "50": "241 254 250", "100": "227 252 244", "200": "196 248 232", "300": "146 242 212", "400": "85 236 189", "500": "29 237 172", "600": "17 212 152", "700": "17 176 127", "800": "18 145 106", "900": "19 114 84", "950": "16 76 57" },
      accentRamp: { "50": "241 254 253", "100": "227 252 250", "200": "196 248 243", "300": "146 242 233", "400": "85 236 223", "500": "29 237 218", "600": "17 212 195", "700": "17 176 162", "800": "18 145 134", "900": "19 114 106", "950": "16 76 70" },
    },
  },
  {
    id: "lacivert",
    name: "Lacivert Prestij",
    description: "Derin lacivert, kurumsal ve iddialı.",
    fontSans: "'Trebuchet MS', 'Segoe UI', ui-sans-serif, system-ui, sans-serif",
    vars: {
      bg: "246 248 251", surface: "255 255 255", border: "227 231 237", text: "24 31 42", muted: "104 116 136",
      primary: "30 64 175", primaryStrong: "23 51 141", accent: "3 105 161",
      slate: { "50": "248 249 252", "100": "241 244 248", "200": "227 231 237", "300": "204 210 219", "400": "154 163 178", "500": "104 116 136", "600": "78 88 106", "700": "60 70 88", "800": "40 48 62", "900": "24 31 42", "950": "14 19 27" },
      primaryRamp: { "50": "241 244 254", "100": "227 233 252", "200": "196 208 248", "300": "146 168 242", "400": "85 121 236", "500": "29 77 237", "600": "17 63 212", "700": "17 55 176", "800": "18 48 145", "900": "19 41 114", "950": "16 30 76" },
      accentRamp: { "50": "241 249 254", "100": "227 243 252", "200": "196 229 248", "300": "146 208 242", "400": "85 183 236", "500": "29 163 237", "600": "17 143 212", "700": "17 120 176", "800": "18 100 145", "900": "19 80 114", "950": "16 55 76" },
    },
  },
  {
    id: "mercan",
    name: "Mercan Sıcak",
    description: "Sıcak mercan-turuncu, samimi ve enerjik.",
    fontSans: "Tahoma, 'Segoe UI', ui-sans-serif, system-ui, sans-serif",
    vars: {
      bg: "253 249 247", surface: "255 255 255", border: "236 231 228", text: "40 31 26", muted: "132 117 108",
      primary: "227 93 58", primaryStrong: "194 65 12", accent: "194 65 12",
      slate: { "50": "252 249 248", "100": "247 244 242", "200": "236 231 228", "300": "218 210 206", "400": "175 163 157", "500": "132 117 108", "600": "103 89 81", "700": "85 71 63", "800": "60 49 42", "900": "40 31 26", "950": "25 19 16" },
      primaryRamp: { "50": "254 244 241", "100": "252 233 227", "200": "248 207 196", "300": "242 166 146", "400": "236 116 85", "500": "237 72 29", "600": "212 58 17", "700": "176 50 17", "800": "145 44 18", "900": "114 38 19", "950": "76 28 16" },
      accentRamp: { "50": "254 245 241", "100": "252 235 227", "200": "248 211 196", "300": "242 174 146", "400": "236 129 85", "500": "237 89 29", "600": "212 74 17", "700": "176 64 17", "800": "145 55 18", "900": "114 46 19", "950": "76 33 16" },
    },
  },
  {
    id: "mor",
    name: "Mor Modern",
    description: "Canlı mor-eflatun, yaratıcı ve modern.",
    fontSans: "Verdana, 'Segoe UI', ui-sans-serif, system-ui, sans-serif",
    vars: {
      bg: "250 249 252", surface: "255 255 255", border: "231 228 236", text: "31 26 40", muted: "116 107 133",
      primary: "124 58 237", primaryStrong: "109 40 217", accent: "162 28 175",
      slate: { "50": "249 248 252", "100": "244 242 248", "200": "231 228 236", "300": "210 205 218", "400": "163 156 175", "500": "116 107 133", "600": "89 80 103", "700": "71 63 85", "800": "49 42 60", "900": "31 26 40", "950": "19 15 26" },
      primaryRamp: { "50": "246 241 254", "100": "236 227 252", "200": "215 196 248", "300": "181 146 242", "400": "141 85 236", "500": "105 29 237", "600": "89 17 212", "700": "76 17 176", "800": "65 18 145", "900": "54 19 114", "950": "38 16 76" },
      accentRamp: { "50": "253 241 254", "100": "250 227 252", "200": "243 196 248", "300": "233 146 242", "400": "223 85 236", "500": "218 29 237", "600": "195 17 212", "700": "162 17 176", "800": "134 18 145", "900": "106 19 114", "950": "70 16 76" },
    },
  },
  {
    id: "antrasit",
    name: "Antrasit Kurumsal",
    description: "Nötr antrasit gri + elektrik indigo vurgu, sade ve ciddi.",
    fontSans: "'Segoe UI', Corbel, ui-sans-serif, system-ui, sans-serif",
    vars: {
      bg: "247 248 249", surface: "255 255 255", border: "230 232 234", text: "30 32 36", muted: "115 118 125",
      primary: "79 70 229", primaryStrong: "67 56 202", accent: "14 165 233",
      slate: { "50": "249 250 251", "100": "244 244 246", "200": "230 232 234", "300": "209 211 214", "400": "162 165 169", "500": "115 118 125", "600": "87 90 96", "700": "70 72 78", "800": "47 50 55", "900": "30 32 36", "950": "18 20 22" },
      primaryRamp: { "50": "242 241 254", "100": "229 227 252", "200": "199 196 248", "300": "151 146 242", "400": "94 85 236", "500": "40 29 237", "600": "28 17 212", "700": "26 17 176", "800": "25 18 145", "900": "24 19 114", "950": "19 16 76" },
      accentRamp: { "50": "241 250 254", "100": "227 244 252", "200": "196 232 248", "300": "146 212 242", "400": "85 189 236", "500": "29 172 237", "600": "17 152 212", "700": "17 127 176", "800": "18 106 145", "900": "19 84 114", "950": "16 57 76" },
    },
  },
  {
    id: "bordo",
    name: "Bordo Zarafet",
    description: "Zarif bordo, sıcak nötrler — butik klinik hissi.",
    fontSans: "'Franklin Gothic Medium', 'Arial Narrow', Arial, sans-serif",
    vars: {
      bg: "252 248 249", surface: "255 255 255", border: "235 229 230", text: "39 28 29", muted: "130 110 113",
      primary: "159 18 57", primaryStrong: "136 19 55", accent: "190 18 60",
      slate: { "50": "251 248 249", "100": "247 243 243", "200": "235 229 230", "300": "217 207 208", "400": "173 158 161", "500": "130 110 113", "600": "101 83 86", "700": "83 65 68", "800": "58 44 46", "900": "39 28 29", "950": "24 16 18" },
      primaryRamp: { "50": "254 241 244", "100": "252 227 234", "200": "248 196 210", "300": "242 146 172", "400": "236 85 127", "500": "237 29 86", "600": "212 17 71", "700": "176 17 61", "800": "145 18 53", "900": "114 19 45", "950": "76 16 33" },
      accentRamp: { "50": "254 241 244", "100": "252 227 233", "200": "248 196 209", "300": "242 146 169", "400": "236 85 122", "500": "237 29 79", "600": "212 17 65", "700": "176 17 56", "800": "145 18 49", "900": "114 19 42", "950": "76 16 31" },
    },
  },
  {
    id: "okyanus",
    name: "Okyanus",
    description: "Ferah okyanus mavisi-camgöbeği, dinlendirici.",
    fontSans: "'Century Gothic', 'Segoe UI', ui-sans-serif, system-ui, sans-serif",
    vars: {
      bg: "247 251 252", surface: "255 255 255", border: "228 235 236", text: "26 38 41", muted: "106 128 134",
      primary: "8 145 178", primaryStrong: "14 116 144", accent: "14 116 144",
      slate: { "50": "248 251 252", "100": "242 247 248", "200": "228 235 236", "300": "205 216 218", "400": "156 172 176", "500": "106 128 134", "600": "80 99 104", "700": "62 81 86", "800": "41 57 61", "900": "26 38 41", "950": "15 24 26" },
      primaryRamp: { "50": "241 251 254", "100": "227 247 252", "200": "196 238 248", "300": "146 223 242", "400": "85 207 236", "500": "29 196 237", "600": "17 174 212", "700": "17 146 176", "800": "18 121 145", "900": "19 96 114", "950": "16 64 76" },
      accentRamp: { "50": "241 251 254", "100": "227 247 252", "200": "196 237 248", "300": "146 221 242", "400": "85 204 236", "500": "29 192 237", "600": "17 170 212", "700": "17 142 176", "800": "18 118 145", "900": "19 93 114", "950": "16 63 76" },
    },
  },
  {
    id: "hardal",
    name: "Hardal & Toprak",
    description: "Toprak tonları, hardal vurgu — sıcak ve özgün.",
    fontSans: "Corbel, 'Segoe UI', ui-sans-serif, system-ui, sans-serif",
    vars: {
      bg: "251 250 248", surface: "255 255 255", border: "235 233 230", text: "38 34 29", muted: "128 122 112",
      primary: "180 83 9", primaryStrong: "146 64 14", accent: "146 64 14",
      slate: { "50": "251 250 249", "100": "246 245 243", "200": "235 233 230", "300": "215 213 208", "400": "172 167 160", "500": "128 122 112", "600": "99 94 85", "700": "81 76 67", "800": "57 52 45", "900": "38 34 29", "950": "24 21 17" },
      primaryRamp: { "50": "254 246 241", "100": "252 238 227", "200": "248 218 196", "300": "242 187 146", "400": "236 150 85", "500": "237 119 29", "600": "212 102 17", "700": "176 86 17", "800": "145 73 18", "900": "114 60 19", "950": "76 42 16" },
      accentRamp: { "50": "254 246 241", "100": "252 237 227", "200": "248 216 196", "300": "242 182 146", "400": "236 142 85", "500": "237 107 29", "600": "212 91 17", "700": "176 78 17", "800": "145 66 18", "900": "114 55 19", "950": "76 39 16" },
    },
  },
  {
    id: "gece",
    name: "Gece Lacivert",
    description: "En zengin ve doygun palet — koyu lacivert-indigo vurgu.",
    fontSans: "'Segoe UI', ui-sans-serif, system-ui, -apple-system, sans-serif",
    vars: {
      bg: "246 247 251", surface: "255 255 255", border: "227 229 237", text: "24 28 42", muted: "103 110 136",
      primary: "67 56 202", primaryStrong: "55 48 163", accent: "99 102 241",
      slate: { "50": "248 248 252", "100": "241 243 248", "200": "227 229 237", "300": "204 207 220", "400": "153 158 178", "500": "103 110 136", "600": "77 83 107", "700": "59 65 88", "800": "39 44 63", "900": "24 28 42", "950": "14 16 27" },
      primaryRamp: { "50": "242 241 254", "100": "229 227 252", "200": "200 196 248", "300": "153 146 242", "400": "97 85 236", "500": "44 29 237", "600": "32 17 212", "700": "29 17 176", "800": "28 18 145", "900": "26 19 114", "950": "21 16 76" },
      accentRamp: { "50": "241 241 254", "100": "227 228 252", "200": "196 197 248", "300": "146 148 242", "400": "85 88 236", "500": "29 33 237", "600": "17 21 212", "700": "17 21 176", "800": "18 21 145", "900": "19 21 114", "950": "16 17 76" },
    },
  },
];

export const DEFAULT_THEME_ID = "klasik";

export function getThemePackage(id: string | null | undefined): ThemePackage {
  return THEME_PACKAGES.find((t) => t.id === id) || THEME_PACKAGES[0];
}

function rampVars(prefix: string, ramp: Ramp): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [shade, value] of Object.entries(ramp)) {
    out[`--color-${prefix}-${shade}`] = value;
  }
  return out;
}

export function themeCssVars(pkg: ThemePackage) {
  const v = pkg.vars;
  return {
    "--app-bg": v.bg,
    "--app-surface": v.surface,
    "--app-border": v.border,
    "--app-text": v.text,
    "--app-muted": v.muted,
    "--app-primary": v.primary,
    "--color-bg": v.bg,
    "--color-surface": v.surface,
    "--color-primary": v.primary,
    "--color-primary-strong": v.primaryStrong,
    "--color-accent": v.accent,
    "--color-success": STATUS.success,
    "--color-warning": STATUS.warning,
    "--color-danger": STATUS.danger,
    ...rampVars("slate", v.slate),
    ...rampVars("primary", v.primaryRamp),
    ...rampVars("accent", v.accentRamp),
    "--font-sans": pkg.fontSans,
  } as Record<string, string>;
}
