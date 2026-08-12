const requestedWebConcurrency = Math.max(1, Number.parseInt(process.env.WEB_CONCURRENCY || "1", 10) || 1);
const hasSharedRealtimeBus = Boolean(process.env.REDIS_URL?.trim());
const webInstances = hasSharedRealtimeBus ? requestedWebConcurrency : 1;

module.exports = {
  apps: [
    {
      name: "klinikcep-web",
      script: "./node_modules/next/dist/bin/next",
      args: "start -p 3000",
      // Birden fazla web işçisi yalnız ortak Redis olay veri yolu varken güvenlidir.
      // Redis yoksa SSE olaylarının işçiler arasında kaybolmaması için tek fork kullanılır.
      instances: webInstances,
      exec_mode: webInstances > 1 ? "cluster" : "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
    {
      name: "klinikcep-sms-worker",
      script: "./node_modules/tsx/dist/cli.mjs",
      args: "scripts/sms-worker.ts",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
