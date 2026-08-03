/**
 * ensure-postgres.mjs için davranış regresyon testi — gerçek veriye veya
 * gerçek PGDATA dizinine DOKUNMAZ. Her senaryo kendi geçici sahte data
 * dizinini kullanır veya kullanılmayan bir port hedefler; script'i env
 * değişkenleriyle izole şekilde çalıştırıp yalnızca exit code + çıktısını
 * doğrular.
 *
 * Kullanım: npx tsx scripts/ensure-postgres-test.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";

const results = [];
let failed = false;

function run(name, envOverrides, expect) {
  const start = Date.now();
  const res = spawnSync("node", ["scripts/ensure-postgres.mjs"], {
    env: { ...process.env, ...envOverrides },
    encoding: "utf8",
    timeout: 30_000,
  });
  const elapsedMs = Date.now() - start;
  const output = `${res.stdout || ""}${res.stderr || ""}`;
  const exitOk = expect.exitCode === undefined || res.status === expect.exitCode;
  const outputOk = !expect.outputIncludes || output.includes(expect.outputIncludes);
  const timeOk = !expect.maxMs || elapsedMs <= expect.maxMs;
  const ok = exitOk && outputOk && timeOk;
  if (!ok) failed = true;
  results.push({ name, ok, elapsedMs, status: res.status, exitOk, outputOk, timeOk, output: ok ? undefined : output.slice(0, 800) });
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

const tempDirs = [];
function makeFakeDataDir({ withPostmasterPid, pid } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pg-fake-data-"));
  tempDirs.push(dir);
  writeFileSync(join(dir, "postgresql.conf"), "# fake\n");
  if (withPostmasterPid) {
    writeFileSync(join(dir, "postmaster.pid"), `${pid}\n${dir}\n0\n5432\n\nlocalhost\n\nready\n`);
  }
  return dir;
}

async function main() {
  // 1) PostgreSQL zaten çalışıyor (gerçek, mevcut instance) — hızlı, temiz exit 0.
  run(
    "1. Zaten çalışan gerçek PostgreSQL — hızlı başarı",
    {},
    { exitCode: 0, outputIncludes: "Veritabani hazir", maxMs: 5000 },
  );

  // 2) Port kapalı + geçersiz PGDATA verildi. Not: script'in POSTGRES_EXE_
  //    CANDIDATES / DATA_DIR_CANDIDATES listeleri kasıtlı olarak makinedeki
  //    gerçek kurulu yollara da (ör. "C:\pgdata\klinikmodern") bakar — bu
  //    yüzden geçersiz bir PGDATA verilse bile gerçek cluster bulunup ona
  //    "zaten çalışıyor, ikinci kez başlatma" kararı verilebilir. Asıl test
  //    edilen değişmez: ASILA KALMAMALI, süre sınırı içinde net bir sonuçla
  //    (non-zero exit) bitmeli.
  const closedPort = await findFreePort();
  run(
    "2. Port kapali + gecersiz PGDATA — asili kalmadan net sonuc",
    {
      PGPORT: String(closedPort),
      PGDATA: "C:\\nonexistent\\pgdata",
      ENSURE_POSTGRES_TIMEOUT_MS: "5000",
    },
    { exitCode: 1, maxMs: 6000 },
  );

  // 3) Genel timeout gerçekten çalışıyor mu — kısa bir timeout ile, var olmayan
  //    ama "gecerli gorunen" bir data dir vererek exe bulunamama hatasına
  //    hemen düşmesini bekleriz (asıl amaç: script'in ASLA verilen süreyi
  //    aşmadığını doğrulamak).
  const closedPort2 = await findFreePort();
  const fakeDirNoPid = makeFakeDataDir();
  run(
    "3. Genel timeout siniri asilmiyor",
    {
      PGPORT: String(closedPort2),
      POSTGRES_EXE: "C:\\nonexistent\\postgres.exe",
      PGDATA: fakeDirNoPid,
      ENSURE_POSTGRES_TIMEOUT_MS: "5000",
    },
    { exitCode: 1, maxMs: 6000 },
  );

  // 4) PID var ama sürec ölü (sahte data dir + gerçekte var olmayan bir PID,
  //    ör. 999999) — script bunu "canli degil" olarak tanimalı ve yine de
  //    (gerçek exe olmadığı için) net bir hata ile hızlı çıkmalı, ASILI
  //    KALMAMALI.
  const closedPort3 = await findFreePort();
  const fakeDirDeadPid = makeFakeDataDir({ withPostmasterPid: true, pid: 999999 });
  run(
    "4. PID var ama surec olu — asili kalmadan hizli hata",
    {
      PGPORT: String(closedPort3),
      POSTGRES_EXE: "C:\\nonexistent\\postgres.exe",
      PGDATA: fakeDirDeadPid,
      ENSURE_POSTGRES_TIMEOUT_MS: "5000",
    },
    { exitCode: 1, maxMs: 6000 },
  );

  // 5) PID dosyada var ve süreç GERÇEKTEN canlı ama postgres DEĞİL (bu test
  //    sürecinin kendi node PID'i) — findExistingLivePostmasterPid süreç
  //    adını da kontrol ettiği için bunu GEÇERSİZ saymalı (yanlış pozitif
  //    kilit tanımayı engeller). Script normal başlatma yoluna girer; gerçek
  //    kurulu bir postgres.exe bulunursa sahte (eksik) data dir'e karşı
  //    başlatmayı DENER ama postgres bunu reddeder/çöker — script yine de
  //    süre sınırı içinde net bir sonuçla bitmeli, ASILI KALMAMALI.
  const closedPort4 = await findFreePort();
  const fakeDirLivePid = makeFakeDataDir({ withPostmasterPid: true, pid: process.pid });
  run(
    "5. Canli ama postgres OLMAYAN PID — yanlis pozitif kilit taninmiyor, yine de asili kalmiyor",
    {
      PGPORT: String(closedPort4),
      PGDATA: fakeDirLivePid,
      ENSURE_POSTGRES_TIMEOUT_MS: "10000",
    },
    { exitCode: 1, maxMs: 11000 },
  );

  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log("\n=== ensure-postgres.mjs REGRESYON SONUÇLARI ===");
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.name} (${r.elapsedMs}ms, exit=${r.status})`);
    if (!r.ok) console.log(`   çıktı: ${r.output}`);
  }

  if (failed) {
    console.log("\nBAŞARISIZ — yukarıdaki senaryolara bakın.");
    process.exit(1);
  }
  console.log("\nTüm senaryolar geçti.");
}

// Gerçek çalışan PostgreSQL portunu senaryo 2-5'te KULLANMAMAK için ayrı
// portlar seçiyoruz (findFreePort) — bu yüzden gerçek instance'a hiç
// dokunulmuyor, gerçek veri riske girmiyor.
await main();
