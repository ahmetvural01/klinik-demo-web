import { spawn } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import net from "node:net";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const HOST = process.env.PGHOST || "127.0.0.1";
const PORT = Number(process.env.PGPORT || 5432);
const ROOT = process.cwd();

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

async function waitForPostgres() {
  for (let i = 0; i < 30; i += 1) {
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

async function waitForDatabaseReady() {
  for (let i = 0; i < 40; i += 1) {
    if (await canQueryDatabase()) return true;
    await sleep(500);
  }
  return false;
}

async function main() {
  if (await canConnect()) {
    log(`PostgreSQL portu acik (${HOST}:${PORT}), veritabani hazirligi kontrol ediliyor...`);
    if (await waitForDatabaseReady()) {
      log("Veritabani hazir.");
      return;
    }
    throw new Error("PostgreSQL portu acik ama veritabani sorguya cevap vermiyor.");
  }

  const exe = findPostgresExe();
  const dataDir = findDataDir();

  if (!exe) {
    throw new Error("postgres.exe bulunamadi. POSTGRES_EXE ortam degiskeni ile yolu belirtin.");
  }
  if (!dataDir) {
    throw new Error("Gecerli PostgreSQL data klasoru bulunamadi. PGDATA ortam degiskeni ile yolu belirtin.");
  }

  log(`PostgreSQL baslatiliyor: ${dataDir}`);
  const out = openSync(resolve(ROOT, "postgres-direct.out.log"), "a");
  const err = openSync(resolve(ROOT, "postgres-direct.err.log"), "a");

  const child = spawn(exe, ["-D", dataDir], {
    cwd: resolve(exe, ".."),
    detached: true,
    stdio: ["ignore", out, err],
    windowsHide: true,
  });

  child.unref();

  if (!(await waitForPostgres())) {
    throw new Error(`PostgreSQL baslatilamadi. Log: ${resolve(ROOT, "postgres-direct.err.log")}`);
  }

  if (!(await waitForDatabaseReady())) {
    throw new Error("PostgreSQL basladi ama veritabani sorguya hazir hale gelmedi.");
  }

  log(`PostgreSQL ve veritabani hazir (${HOST}:${PORT}).`);
}

try {
  await main();
} catch (error) {
  console.error(`[ensure-postgres] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
