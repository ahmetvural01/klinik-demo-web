module.exports = {
  apps: [
    {
      name: "klinik-modern-web",
      script: "./node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        DATABASE_URL: "postgresql://postgres:2653@localhost:5432/klinik_modern?schema=public&connection_limit=5&pool_timeout=30&connect_timeout=30&socket_timeout=30",
        JWT_SECRET: "degistir-bunu-guclu-bir-sifre-yap",
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
        DATABASE_URL: "postgresql://postgres:2653@localhost:5432/klinik_modern?schema=public&connection_limit=5&pool_timeout=30&connect_timeout=30&socket_timeout=30",
        JWT_SECRET: "degistir-bunu-guclu-bir-sifre-yap",
      },
    },
  ],
};