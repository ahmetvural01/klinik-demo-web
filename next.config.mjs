const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // Lint ayrı `npm run lint` kalite kapısında raporlanır. Mevcut bakım
  // borcundaki stil kuralları üretim paketini engellememeli; Next build yine
  // TypeScript denetimini ve gerçek derleme hatalarını durdurmaya devam eder.
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],
  },
  // Baileys (WhatsApp QR bağlantısı) yalnız ESM ve çalışma anında Node ile
  // yüklenmeli; paketlenirse WASM/protobuf dosyaları bozulur.
  serverExternalPackages: ["exceljs", "@whiskeysockets/baileys"],
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  headers: async () => [
    {
      source: "/api/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Cache-Control", value: "no-store" },
      ],
    },
    {
      source: "/((?!api).*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    },
  ],
};

export default nextConfig;
