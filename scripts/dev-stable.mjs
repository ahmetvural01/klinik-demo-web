import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
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

function stopChildProcess() {
  if (!childProcess || childProcess.killed) return;
  const pid = childProcess.pid;
  if (!pid) return;

  if (process.platform === "win32") {
    const taskkill = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    taskkill.on("error", () => {
      try {
        childProcess.kill("SIGTERM");
      } catch {
        // ignore
      }
    });
    return;
  }

  try {
    childProcess.kill("SIGTERM");
  } catch {
    // ignore
  }
}

async function cleanupNextDist() {
  for (let i = 0; i < 3; i += 1) {
    try {
      await mkdir(NEXT_DIST_DIR, { recursive: true });
      await rm(NEXT_DIST_DIR, { recursive: true, force: true, maxRetries: 0 });
      await mkdir(NEXT_DIST_DIR, { recursive: true });
      print(".next-dev temizlendi.");
      return;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      print(`.next-dev temizleme denemesi basarisiz (${i + 1}/3): ${msg}`);
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
  const delay = Math.min(2500, 800 + restartCount * 300);
  print(`Yeniden baslatma planlandi (${reason}). ${delay}ms bekleniyor...`);

  if (forceCleanup && restartCount <= 2) {
    await cleanupNextDist();
  }

  stopChildProcess();

  restartTimer = setTimeout(() => {
    restartInProgress = false;
    run();
  }, delay);
}

process.on("SIGINT", async () => {
  stopping = true;
  print("SIGINT alindi, supervisor kapaniyor.");
  stopChildProcess();
  if (restartTimer) clearTimeout(restartTimer);
  process.exit(0);
});

process.on("SIGTERM", async () => {
  stopping = true;
  print("SIGTERM alindi, supervisor kapaniyor.");
  stopChildProcess();
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

    const shouldCleanup = code !== 0 && restartCount < 3;
    print(`next dev kapandi (code=${code ?? "null"}, signal=${signal ?? "null"}).`);
    await scheduleRestart("cikis algilandi", shouldCleanup);
  });
}

async function start() {
  // Önceki geliştirme oturumu beklenmedik biçimde kapanmışsa yarım kalmış
  // derleme çıktısını yeniden kullanma. Bu yalnızca dev başlangıcında çalışır;
  // üretim derlemesi `.next-dev`e dokunmaz.
  await cleanupNextDist();
  print(`Stabil mod basladi. Port: ${PORT}`);
  run();
}

void start();
