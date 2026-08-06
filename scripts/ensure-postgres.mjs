import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { PrismaClient } from "@prisma/client";

const HOST = process.env.PGHOST || "127.0.0.1";
const PORT = Number(process.env.PGPORT || 5432);
const ROOT = process.cwd();

// Hiçbir adım sonsuza kadar beklemesin — script'in tamamı bu süre içinde
// bitmeli, aksi halde açık bir hata ile (non-zero exit) sonlanır. `npm run
// build` bu script'e bağımlı olduğu için burada takılma = build'in de
// takılması demek (bkz. kullanıcı geri bildirimi: "sonsuz bekleme kabul
// edilemez").
const OVERALL_TIMEOUT_MS = Number(process.env.ENSURE_POSTGRES_TIMEOUT_MS || 60_000);
const SPAWN_TIMEOUT_MS = Number(process.env.ENSURE_POSTGRES_SPAWN_TIMEOUT_MS || 15_000);

const POSTGRES_EXE_CANDIDATES = [
  process.env.POSTGRES_EXE,
  "C:\\Program Files\\PostgreSQL\\18\\bin\\postgres.exe",
  "C:\\Program Files\\PostgreSQL\\17\\bin\\postgres.exe",
  "C:\\Program Files\\PostgreSQL\\16\\bin\\postgres.exe",
].filter(Boolean);

const DATA_DIR_CANDIDATES = [
  process.env.PGDATA,
  "C:\\pgdata\\klinikmodern",
  resolve(ROOT, ".pgdata"),
  "C:\\Program Files\\PostgreSQL\\18\\data",
].filter(Boolean);

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function log(message) {
  console.log(`[ensure-postgres] ${message}`);
}

function canConnect() {
  return new Promise((resolveConnect) => {
    const socket = net.createConnection({ host: HOST, port: PORT });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolveConnect(ok);
    };
    socket.setTimeout(750);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function findPostgresExe() {
  return POSTGRES_EXE_CANDIDATES.find((candidate) => existsSync(candidate));
}

function findDataDir() {
  return DATA_DIR_CANDIDATES.find((candidate) => existsSync(resolve(candidate, "postgresql.conf")));
}

// data dir'deki postmaster.pid dosyası, o dizin için zaten bir postmaster
// sürecinin (belki hâlâ başlatılıyor / recovery yapıyor) var olduğunu
// gösterir. Bu durumda İKİNCİ bir postgres.exe başlatmaya ÇALIŞMAMALIYIZ —
// aynı data dir'e karşı iki postmaster çalıştırmak lock çakışmasına yol
// açar ve ikinci süreç ya hemen çöker ya da belirsiz şekilde asılı kalır
// (bkz. bu oturumda gözlemlenen asılı build — data dir zaten kilitliyken
// tekrar başlatma denemesi). PID canlıysa yalnızca bekleriz, yeniden
// başlatmayız (kullanıcı talebi: "çalışan mevcut veritabanını gereksiz
// yere yeniden başlatma").
function findExistingLivePostmasterPid(dataDir) {
  const pidFile = resolve(dataDir, "postmaster.pid");
  if (!existsSync(pidFile)) return null;
  let pid;
  try {
    const firstLine = readFileSync(pidFile, "utf8").split(/\r?\n/, 1)[0]?.trim();
    pid = Number(firstLine);
  } catch {
    return null;
  }
  if (!pid || Number.isNaN(pid)) return null;

  if (process.platform === "win32") {
    const check = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
      encoding: "utf8",
      timeout: 5000,
    });
    const alive = Boolean(check.stdout && check.stdout.toLowerCase().includes("postgres"));
    return alive ? pid : null;
  }

  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

async function waitForPostgres(maxWaitMs) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await canConnect()) return true;
    await sleep(500);
  }
  return false;
}

async function canQueryDatabase() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

async function waitForDatabaseReady(maxWaitMs) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await canQueryDatabase()) return true;
    await sleep(500);
  }
  return false;
}

async function main() {
  if (await canConnect()) {
    log(`PostgreSQL portu acik (${HOST}:${PORT}), veritabani hazirligi kontrol ediliyor...`);
    if (await waitForDatabaseReady(20_000)) {
      log("Veritabani hazir.");
      return;
    }
    throw new Error("PostgreSQL portu acik ama veritabani 20sn icinde sorguya cevap vermedi.");
  }

  const exe = findPostgresExe();
  const dataDir = findDataDir();

  if (!exe) {
    throw new Error("postgres.exe bulunamadi. POSTGRES_EXE ortam degiskeni ile yolu belirtin.");
  }
  if (!dataDir) {
    throw new Error("Gecerli PostgreSQL data klasoru bulunamadi. PGDATA ortam degiskeni ile yolu belirtin.");
  }

  const existingPid = findExistingLivePostmasterPid(dataDir);
  if (existingPid) {
    // Port henüz açık değil ama başka bir postmaster süreci zaten bu data
    // dir üzerinde çalışıyor (muhtemelen başlangıç/recovery aşamasında) —
    // ikinci bir örnek BAŞLATMA, yalnızca bekle. Aksi halde iki postmaster
    // aynı data dir kilidine çarpışır ve süreç asılı kalır.
    log(`Data dir icin zaten calisan bir postmaster surumu var (PID ${existingPid}), yeniden baslatilmadan bekleniyor...`);
  } else {
    log(`PostgreSQL baslatiliyor: ${dataDir}`);

    if (process.platform === "win32") {
      const script = [
        "$ErrorActionPreference = 'Stop'",
        `$exe = ${JSON.stringify(exe)}`,
        `$data = ${JSON.stringify(dataDir)}`,
        "Start-Process -FilePath $exe -ArgumentList @('-D', $data) -WorkingDirectory (Split-Path -Parent $exe) -WindowStyle Hidden -NoNewWindow:$false",
      ].join("; ");

      const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
        cwd: ROOT,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
        encoding: "utf8",
        timeout: SPAWN_TIMEOUT_MS,
      });

      if (result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM") {
        throw new Error(`PostgreSQL baslatma komutu ${SPAWN_TIMEOUT_MS}ms icinde donmedi (askida kaldi) — iptal edildi.`);
      }
      if (result.status !== 0) {
        throw new Error(`PostgreSQL gizli baslatilamadi: ${result.stderr || `code=${result.status}`}`);
      }
    } else {
      const child = spawn(exe, ["-D", dataDir], {
        cwd: dirname(exe),
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });

      child.unref();
    }
  }

  if (!(await waitForPostgres(15_000))) {
    throw new Error("PostgreSQL 15sn icinde baglanti kabul etmedi. Ayrintili cikis stdout/stderr uzerinden gorunur.");
  }

  if (!(await waitForDatabaseReady(20_000))) {
    throw new Error("PostgreSQL basladi ama veritabani 20sn icinde sorguya hazir hale gelmedi.");
  }

  log(`PostgreSQL ve veritabani hazir (${HOST}:${PORT}).`);
}

async function withOverallTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`ensure-postgres genel zaman asimina ugradi (${ms}ms) — bir adim asili kalmis olabilir.`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

try {
  await withOverallTimeout(main(), OVERALL_TIMEOUT_MS);
} catch (error) {
  console.error(`[ensure-postgres] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

// `node scripts/ensure-postgres.mjs` doğrudan çalıştırıldığında (örn. `npm
// run build` zinciri) Prisma/network handle'ları process'i canlı tutabilir —
// script bittiğinde sürecin gerçekten kapanmasını garanti etmek gerekir.
// Ancak `scripts/dev-stable.mjs` bu dosyayı bir MODÜL olarak import eder
// (yan etki için) — o durumda process.exit() burada tetiklenirse dev-stable
// supervisor'ının kendisini de öldürür ve `next dev` hiç başlamadan `npm run
// dev` sessizce çıkar. Bu yüzden yalnızca bu dosya doğrudan girdi betiği
// olarak çalıştırıldığında çıkılır, import edildiğinde değil.
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  process.exit(process.exitCode ?? 0);
}
