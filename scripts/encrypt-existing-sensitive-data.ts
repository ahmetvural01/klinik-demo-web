/* eslint-disable no-console */
export {};

/**
 * FIELD_ENCRYPTION_KEY tanımlandıktan sonra, o tarihten ÖNCE düz metin olarak kaydedilmiş
 * hasta alanlarını (surgeries/medications/otherDiseases/notes) ve yüklenmiş belgeleri
 * (data/uploads) geriye dönük şifreler. Zaten şifreli kayıtları atlar — birden fazla kez
 * çalıştırmak güvenlidir.
 *
 * Kullanım: npm run encrypt:legacy-data
 */

import { readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { encryptField, isEncryptedValue, encryptBuffer } from "../src/lib/field-crypto";

const prisma = new PrismaClient();

const PATIENT_FIELDS = ["surgeries", "medications", "otherDiseases", "notes"] as const;
type PatientRow = Record<(typeof PATIENT_FIELDS)[number] | "id", string | null>;

async function encryptPatientFields() {
  const patients = await prisma.$queryRawUnsafe<PatientRow[]>(
    `SELECT id, surgeries, medications, "otherDiseases", notes FROM "Patient"`
  );

  let updated = 0;
  for (const patient of patients) {
    const changes: Record<string, string> = {};
    for (const field of PATIENT_FIELDS) {
      const value = patient[field];
      if (value && !isEncryptedValue(value)) {
        changes[field] = encryptField(value) as string;
      }
    }
    if (Object.keys(changes).length === 0) continue;

    const columns = Object.keys(changes);
    const setClause = columns.map((col, i) => `"${col}" = $${i + 1}`).join(", ");
    await prisma.$executeRawUnsafe(
      `UPDATE "Patient" SET ${setClause} WHERE id = $${columns.length + 1}`,
      ...columns.map((col) => changes[col]),
      patient.id
    );
    updated++;
  }

  return { total: patients.length, updated };
}

async function encryptUploadedDocuments() {
  const uploadRoot = path.join(process.cwd(), "data", "uploads");
  let files: string[] = [];
  try {
    files = await readdir(uploadRoot);
  } catch {
    return { total: 0, updated: 0 };
  }

  let updated = 0;
  for (const name of files) {
    const filePath = path.join(uploadRoot, name);
    const buffer = await readFile(filePath);
    if (buffer.subarray(0, 4).toString("utf8") === "ENC1") continue; // zaten şifreli
    await writeFile(filePath, encryptBuffer(buffer));
    updated++;
  }

  return { total: files.length, updated };
}

async function main() {
  if (!process.env.FIELD_ENCRYPTION_KEY) {
    console.error("FIELD_ENCRYPTION_KEY tanımlı değil — önce .env dosyasına ekleyin, sonra tekrar çalıştırın.");
    process.exit(1);
  }

  console.log("Hasta alanları şifreleniyor...");
  const patientResult = await encryptPatientFields();
  console.log(`  ${patientResult.updated}/${patientResult.total} hasta kaydında en az bir alan şifrelendi.`);

  console.log("Yüklenmiş belgeler şifreleniyor...");
  const docResult = await encryptUploadedDocuments();
  console.log(`  ${docResult.updated}/${docResult.total} dosya şifrelendi.`);

  await prisma.$disconnect();
  console.log("Tamamlandı.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
