import type { Config } from "tailwindcss";

// Renk, CSS değişkeninden ("R G B" kanal formatında) opaklık destekli okunur
// — src/lib/theme-packages.ts + src/app/layout.tsx aktif temayı bu
// değişkenlere yazar. Böylece tema değişikliği yeniden derleme gerektirmez.
// Tailwind'in resmi (belgelenmiş) opaklık deseni budur; yalnızca `Config` tip
// tanımı bu fonksiyon biçimini kapsamıyor (bkz. aşağıdaki `as Config`).
function withOpacity(varName: string) {
  return ({ opacityValue }: { opacityValue?: string }) =>
    opacityValue !== undefined ? `rgb(var(${varName}) / ${opacityValue})` : `rgb(var(${varName}))`;
}

function ramp(prefix: string) {
  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
  return Object.fromEntries(shades.map((s) => [s, withOpacity(`--color-${prefix}-${s}`)]));
}

const config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: withOpacity("--color-bg"),
        surface: withOpacity("--color-surface"),
        primary: withOpacity("--color-primary"),
        "primary-strong": withOpacity("--color-primary-strong"),
        accent: withOpacity("--color-accent"),
        success: withOpacity("--color-success"),
        warning: withOpacity("--color-warning"),
        danger: withOpacity("--color-danger"),
        // Uygulama genelinde binlerce yerde kullanılan Tailwind `slate`
        // paleti, aktif temanın nötr tonuna göre değişir (bkz. Superadmin >
        // Tema). `white` de temanın `surface` değişkenine bağlanır — 430+
        // yerde kullanılan `bg-white` kart zeminleri artık göz yormayan
        // hafif tonlu bir "beyaz" alır (bkz. theme-packages.ts `surface`).
        // Fark kasıtlı olarak minimal (birkaç RGB birimi): `text-white`
        // renkli butonlarda okunabilirliği bozmaz.
        white: withOpacity("--color-surface"),
        slate: ramp("slate"),
        // `bg-primary` kadar (hatta daha sık) `bg-blue-*`/`bg-indigo-*`/
        // `bg-sky-*` de "marka rengi" olarak kullanılıyor — bunlar da temanın
        // ana rengine bağlanır, aksi halde tema değişikliği neredeyse görünmez
        // kalıyordu. `violet/purple/fuchsia/cyan/teal` ikincil vurgu rengine
        // bağlanır. Durum renkleri (red/rose/amber/orange/emerald/green)
        // kasıtlı olarak dokunulmaz — başarı/uyarı/tehlike anlamı taşırlar.
        blue: ramp("primary"),
        indigo: ramp("primary"),
        sky: ramp("primary"),
        violet: ramp("accent"),
        purple: ramp("accent"),
        fuchsia: ramp("accent"),
        cyan: ramp("accent"),
        teal: ramp("accent"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // Tailwind'in varsayılan sert/jenerik gölgeleri (binlerce yerde
      // `shadow-sm` vb. olarak kullanılıyor) yerine, daha yumuşak, daha
      // "yüzen" ve hafif renk tonlu premium bir gölge ölçeğiyle EZİLİYOR —
      // tek bir değişiklik tüm uygulamada aynı anda kart/panel derinliğini
      // modernize eder (bkz. kullanıcı geri bildirimi: "demode hissettiriyor").
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)",
        "card-md": "0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.08)",
        "card-lg": "0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.08)",
        sm: "0 1px 2px rgb(15 23 42 / 0.05), 0 3px 8px rgb(15 23 42 / 0.05)",
        DEFAULT: "0 1px 3px rgb(15 23 42 / 0.06), 0 6px 16px rgb(15 23 42 / 0.07)",
        md: "0 2px 4px rgb(15 23 42 / 0.06), 0 12px 28px rgb(15 23 42 / 0.09)",
        lg: "0 4px 8px rgb(15 23 42 / 0.07), 0 20px 40px rgb(15 23 42 / 0.11)",
        xl: "0 8px 16px rgb(15 23 42 / 0.08), 0 30px 60px rgb(15 23 42 / 0.14)",
        "2xl": "0 16px 32px rgb(15 23 42 / 0.10), 0 40px 80px rgb(15 23 42 / 0.18)",
      },
      // Aynı mantık köşe yarıçapı için: `rounded-lg`/`rounded-xl`/`rounded-2xl`
      // uygulama genelinde yüzlerce yerde kullanılıyor — ölçeği büyütmek
      // sert/kutu gibi hissettiren köşeleri tek seferde yumuşak/premium hale
      // getirir (buton/input/rozet `rounded-lg`, kartların çoğu `rounded-2xl`
      // kullanıyor).
      borderRadius: {
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
    }
  },
  plugins: []
};

export default config as unknown as Config;
