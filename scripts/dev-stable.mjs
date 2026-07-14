import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import "./ensure-postgres.mjs";

// `dev:next` bilerek `--turbo` KULLANMIYOR: Turbopack, en büyük sayfamızda
// (hasta-detay, ssr:false ile tembel yüklenen ~5000 satırlık modül) her
// istekte ~3sn'lik sabit bir gecikme yaratıyordu — sayfa zaten derlenmiş
// olsa bile. Aynı senaryo düz webpack `next dev` ile ilk istekten sonra
// <100ms'e düşüyor (üretim derlemesiyle aynı hız). Ölçüldü, tekrarlanabilir.

const PORT = process.env.PORT || "3000";
let stopping = false;
let restartCount = 0;
let childProcess = null;
let restartTimer = null;
let restartInProgress = false;
const NEXT_DIST_DIR = resolve(process.cwd(), ".next-dev");

const SELF_HEAL_PATTERNS = [
  "EBUSY: resource busy or locked",
  "EINVAL: invalid argument, readlink",
  "Cannot find module 'next/dist/compiled/next-server/app-page.runtime.dev.js'",
  "Cannot find module 'react/jsx-runtime'",
];

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const print = (msg) => {
  const ts = new Date().toISOString();
  console.log(`[dev-stable ${ts}] ${msg}`);
};

async function cleanupNextDist() {
  for (let i = 0; i < 5; i += 1) {
    try {
      await rm(NEXT_DIST_DIR, { recursive: true, force: true, maxRetries: 0 });
      print(".next-dev temizlendi.");
      return;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      print(`.next-dev temizleme denemesi basarisiz (${i + 1}/5): ${msg}`);
      await sleep(500 + i * 250);
    }
  }
}

async function scheduleRestart(reason, forceCleanup = false) {
  if (stopping || restartInProgress) return;
  restartInProgress = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  restartCount += 1;
  const delay = Math.min(5000, 1000 + restartCount * 500);
  print(`Yeniden baslatma planlandi (${reason}). ${delay}ms bekleniyor...`);

  if (forceCleanup) {
    await cleanupNextDist();
  }

  if (childProcess && !childProcess.killed) {
    childProcess.kill("SIGTERM");
  }

  restartTimer = setTimeout(() => {
    restartInProgress = false;
    run();
  }, delay);
}

process.on("SIGINT", async () => {
  stopping = true;
  print("SIGINT alindi, supervisor kapaniyor.");
  if (childProcess && !childProcess.killed) childProcess.kill("SIGTERM");
  if (restartTimer) clearTimeout(restartTimer);
  process.exit(0);
});

process.on("SIGTERM", async () => {
  stopping = true;
  print("SIGTERM alindi, supervisor kapaniyor.");
  if (childProcess && !childProcess.killed) childProcess.kill("SIGTERM");
  if (restartTimer) clearTimeout(restartTimer);
  process.exit(0);
});

function run() {
  const child = process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", `npm run dev:next -- -p ${PORT}`], {
        stdio: ["inherit", "pipe", "pipe"],
        env: process.env,
        windowsHide: true,
      })
    : spawn("npm", ["run", "dev:next", "--", "-p", PORT], {
        stdio: ["inherit", "pipe", "pipe"],
        env: process.env,
      });

  childProcess = child;

  const onLog = (chunk, target = "stdout") => {
    const text = chunk.toString();
    if (target === "stdout") process.stdout.write(text);
    else process.stderr.write(text);

    if (SELF_HEAL_PATTERNS.some((pattern) => text.includes(pattern))) {
      void scheduleRestart(`self-heal algiladi: ${text.trim().slice(0, 80)}`, true);
    }
  };

  child.stdout?.on("data", (chunk) => onLog(chunk, "stdout"));
  child.stderr?.on("data", (chunk) => onLog(chunk, "stderr"));

  child.on("exit", async (code, signal) => {
    if (stopping) {
      process.exit(code ?? 0);
      return;
    }

    const shouldCleanup = code !== 0;
    print(`next dev kapandi (code=${code ?? "null"}, signal=${signal ?? "null"}).`);
    await scheduleRestart("cikis algilandi", shouldCleanup);
  });
}

print(`Stabil mod basladi. Port: ${PORT}`);
run();
