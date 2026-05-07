import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function loadEnvFile() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    if (!key || process.env[key]) continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    "-",
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join("");
}

function getRetentionDays() {
  const raw = process.env.BACKUP_RETENTION_DAYS;
  if (!raw) return 14;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
}

function cleanupOldBackups(dir, retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;

  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".dump")) continue;

    const filePath = join(dir, entry);
    const stat = statSync(filePath);
    if (stat.mtimeMs < cutoff) {
      rmSync(filePath, { force: true });
      removed += 1;
    }
  }

  return removed;
}

function run() {
  loadEnvFile();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[backup] DATABASE_URL bulunamadi. .env veya ortam degiskenini kontrol edin.");
    process.exit(1);
  }

  const backupDir = resolve(process.cwd(), "backups", "db");
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const fileName = `klinik-modern-${nowStamp()}.dump`;
  const backupPath = join(backupDir, fileName);

  const args = [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    `--file=${backupPath}`,
    `--dbname=${databaseUrl}`,
  ];

  console.log(`[backup] pg_dump baslatiliyor -> ${backupPath}`);
  const result = spawnSync("pg_dump", args, { stdio: "inherit" });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.error("[backup] pg_dump bulunamadi. PostgreSQL client tools kurulu olmali.");
    } else {
      console.error(`[backup] pg_dump hatasi: ${result.error.message}`);
    }
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[backup] pg_dump cikis kodu: ${result.status}`);
    process.exit(result.status ?? 1);
  }

  const retentionDays = getRetentionDays();
  const removed = cleanupOldBackups(backupDir, retentionDays);

  console.log(`[backup] Tamamlandi: ${backupPath}`);
  console.log(`[backup] Retention: ${retentionDays} gun, silinen eski dump: ${removed}`);
}

run();
