#!/usr/bin/env node
/**
 * Basit, bağımlılıksız secret tarayıcı.
 * Kaynak ağacını (node_modules/.git/.next/tmp/build/coverage hariç) tarar,
 * bilinen sır kalıplarını arar. Gerçek değerleri asla yazdırmaz — yalnız
 * dosya/satır ve maskelenmiş eşleşme gösterir. Bulgu varsa exit code 1.
 *
 * Kullanım: node scripts/security-scan-secrets.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", ".next-dev", "tmp", "build", "dist",
  "coverage", "test-results", "playwright-report", ".pgdata", "backups",
  "data", ".codebase-memory", ".claude",
]);

const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts",
  ".json", ".md", ".mdx", ".txt", ".yml", ".yaml", ".env",
  ".sql", ".sh", ".ps1", ".bat", ".cjs", ".html", ".css",
]);

// Bilinen placeholder / örnek değerler — false-positive sayılır.
const PLACEHOLDER_VALUES = new Set([
  "", "changeme", "change-me", "change_me", "xxxxxxxx", "your-secret-here",
  "your_secret_here", "example", "placeholder", "secret", "password",
  "test", "mock", "0000000000", "00000000000", "00000000001",
]);

// name: [regex...] — her regex ilk capture group'u "bulunan değer" sayar.
const RULES = [
  { name: "Hardcoded password assignment", pattern: /\bpassword\s*[:=]\s*["']([^"'\s]{4,})["']/gi },
  { name: "Hardcoded identityNo/TC assignment", pattern: /\bidentityNo\s*[:=]\s*["'](\d{10,11})["']/g },
  { name: "bcrypt.hash on a string literal", pattern: /bcrypt\.hash\(\s*["']([^"']{4,})["']/g },
  { name: "JWT_SECRET fallback default", pattern: /JWT_SECRET\s*(?:\|\||\?\?)\s*["']([^"']+)["']/g },
  { name: "FIELD_ENCRYPTION_KEY fallback default", pattern: /FIELD_ENCRYPTION_KEY\s*(?:\|\||\?\?)\s*["']([^"']+)["']/g },
  { name: "Generic API key literal", pattern: /\b(?:api[_-]?key|apikey)\s*[:=]\s*["']([A-Za-z0-9_\-\.]{16,})["']/gi },
  { name: "Bearer token literal", pattern: /Bearer\s+([A-Za-z0-9_\-\.]{16,})/g },
  { name: "AWS-style access key", pattern: /\b(AKIA[0-9A-Z]{16})\b/g },
  { name: "Private key block", pattern: /(-----BEGIN [A-Z ]*PRIVATE KEY-----)/g },
  { name: "Postgres connection string with inline credentials", pattern: /(postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@[^\s"']+)/gi },
];

function shouldSkipDir(name) {
  return IGNORED_DIRS.has(name) || name.startsWith(".");
}

// Bunlar gitignored, yalnız-yerel gerçek secret dosyalarıdır (bkz. .gitignore) —
// buradaki gerçek değerler BEKLENEN davranıştır, "bulgu" değildir. Şablon
// (*.example) dosyaları bunun dışında kalır ve normal şekilde taranır.
const LOCAL_SECRET_FILES = new Set([
  ".env", ".env.local", ".env.production", ".env.development.local",
  ".env.test.local", ".env.production.local",
]);

function isLocalSecretFile(fileName) {
  return LOCAL_SECRET_FILES.has(fileName);
}

function mask(value) {
  if (value.length <= 4) return "*".repeat(value.length);
  return `${value.slice(0, 2)}${"*".repeat(Math.max(3, value.length - 4))}${value.slice(-2)}`;
}

function isPlaceholder(value) {
  const v = value.trim().toLowerCase();
  if (PLACEHOLDER_VALUES.has(v)) return true;
  if (/^(user|password|host|database|your[_-]|example\.|test@|demo@)/.test(v)) return true;
  if (/^\$\{.*\}$/.test(v)) return true; // template placeholder
  // Türkçe UI/etiket çevirisi (ör. PASSWORD: "Şifre") — gerçek sır değil.
  if (/[şŞıİğĞüÜöÖçÇ]/.test(value)) return true;
  return false;
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      yield* walk(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (TEXT_EXT.has(ext) || entry.name.startsWith(".env")) {
        yield path.join(dir, entry.name);
      }
    }
  }
}

function scanFile(filePath) {
  let content;
  try {
    const st = statSync(filePath);
    if (st.size > 2 * 1024 * 1024) return []; // 2MB üstü dosyaları atla
    content = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  const lines = content.split("\n");
  const findings = [];

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(content))) {
      const value = match[1] || match[0];
      if (isPlaceholder(value)) continue;

      const before = content.slice(0, match.index);
      const lineNo = before.split("\n").length;
      const lineText = lines[lineNo - 1] || "";
      // Bu dosyanın kendisi (secret-scan script) örnek regex'leri barındırır — atla.
      if (filePath.endsWith("security-scan-secrets.mjs")) continue;
      // Yorum satırındaki dokümantasyon örneklerini (ör. "USER:PASSWORD@HOST") atla.
      if (/USER:PASSWORD@|<[^>]+>|\bplaceholder\b/i.test(lineText)) continue;

      findings.push({
        file: path.relative(ROOT, filePath).split(path.sep).join("/"),
        line: lineNo,
        rule: rule.name,
        masked: mask(String(value)),
      });
    }
  }
  return findings;
}

function main() {
  const allFindings = [];
  for (const file of walk(ROOT)) {
    if (isLocalSecretFile(path.basename(file)) && path.dirname(file) === ROOT) continue;
    allFindings.push(...scanFile(file));
  }

  if (allFindings.length === 0) {
    console.log("✓ security:secrets — bilinen sır kalıplarına uyan bulgu yok.");
    process.exit(0);
  }

  console.log(`✗ security:secrets — ${allFindings.length} olası bulgu:\n`);
  for (const f of allFindings) {
    console.log(`  ${f.file}:${f.line}  [${f.rule}]  değer≈${f.masked}`);
  }
  console.log("\nGerçek değerleri hiçbir zaman commit etmeyin; env değişkenine taşıyın.");
  process.exit(1);
}

main();
