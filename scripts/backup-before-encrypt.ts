/* eslint-disable no-console */
export {};

/**
 * pg_dump makinede kurulu değilse kullanılacak hafif yedek: encrypt-existing-sensitive-data.ts
 * çalıştırılmadan önce Patient/Document tablolarını JSON olarak ve data/uploads klasörünü
 * kopyalayarak yedekler. Tam bir DB yedeği değildir — sadece şifreleme script'inin
 * dokunacağı veriler için bir geri dönüş noktasıdır.
 */

import { cp, mkdir, writeFile } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function stamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function main() {
  const dir = path.join(process.cwd(), "backups", "pre-encrypt", stamp());
  await mkdir(dir, { recursive: true });

  const patients = await prisma.$queryRawUnsafe(`SELECT * FROM "Patient"`);
  await writeFile(path.join(dir, "patients.json"), JSON.stringify(patients, null, 2), "utf8");

  const documents = await prisma.$queryRawUnsafe(`SELECT * FROM "Document"`);
  await writeFile(path.join(dir, "documents.json"), JSON.stringify(documents, null, 2), "utf8");

  const uploadRoot = path.join(process.cwd(), "data", "uploads");
  try {
    await cp(uploadRoot, path.join(dir, "uploads"), { recursive: true });
  } catch {
    // yükleme klasörü henüz yoksa sorun değil
  }

  console.log(`Yedek alındı: ${dir}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
