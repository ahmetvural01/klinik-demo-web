module.exports = {
  apps: [
    {
      name: "klinik-modern-web",
      script: "./node_modules/next/dist/bin/next",
      args: "start -p 3000",
      // Tek process yerine 2 worker: ağır bir istek tek başına tüm kullanıcıları/
      // klinikleri aynı anda yavaşlatmasın diye process seviyesinde izolasyon.
      // ÖNEMLİ: Cluster modda gerçek zamanlı bildirimlerin (SSE) tüm worker'lar
      // arasında tutarlı çalışması için REDIS_URL zorunludur (bkz. src/lib/realtime-bus.ts
      // ve scripts/preflight-prod.ts) — Redis olmadan cluster moda geçmeyin.
      instances: 2,
      exec_mode: "cluster",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        // connection_limit worker başınadır: 2 worker × 25 = SMS worker'ın 5'iyle
        // birlikte toplam 55 bağlantı — varsayılan Postgres max_connections (100)
        // sınırının güvenle altında (yük testinde 25 toplam bağlantının yoğun
        // eşzamanlı istek altında saniyelerce kuyruklanmaya yol açtığı görüldü).
        DATABASE_URL: process.env.DATABASE_URL || "",
        JWT_SECRET: process.env.JWT_SECRET || "",
        FIELD_ENCRYPTION_KEY: process.env.FIELD_ENCRYPTION_KEY || "",
        REDIS_URL: process.env.REDIS_URL || "",
      },
    },
    {
      name: "klinik-modern-sms-worker",
      script: "cmd.exe",
      args: "/c npm run worker:sms",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        DATABASE_URL: process.env.DATABASE_URL || "",
        JWT_SECRET: process.env.JWT_SECRET || "",
        FIELD_ENCRYPTION_KEY: process.env.FIELD_ENCRYPTION_KEY || "",
        REDIS_URL: process.env.REDIS_URL || "",
      },
    },
  ],
};
