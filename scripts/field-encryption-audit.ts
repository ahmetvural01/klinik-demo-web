/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import { decryptField, isEncryptedValue } from "../src/lib/field-crypto";

const prisma = new PrismaClient();
const FAILURE_MARKER = "[Şifreli veri çözülemedi]";

type Candidate = {
  source: string;
  recordId: string;
  field: string;
  value: string | null | undefined;
};

function inspect(candidates: Candidate[]) {
  let encrypted = 0;
  const failures: Array<Omit<Candidate, "value">> = [];

  for (const candidate of candidates) {
    if (!isEncryptedValue(candidate.value)) continue;
    encrypted += 1;
    if (decryptField(candidate.value) === FAILURE_MARKER) {
      failures.push({ source: candidate.source, recordId: candidate.recordId, field: candidate.field });
    }
  }

  return { encrypted, failures };
}

async function main() {
  const [patients, smsProviders, whatsappProviders, smtpConfigs, whatsappMessages] = await Promise.all([
    prisma.patient.findMany({
      select: { id: true, surgeries: true, medications: true, otherDiseases: true, notes: true, contagiousDiseaseNote: true },
    }),
    prisma.smsProviderConfig.findMany({ select: { id: true, password: true, apiKey: true } }),
    prisma.whatsappProviderConfig.findMany({
      select: { id: true, password: true, apiKey: true, accessTokenEncrypted: true, registrationPinEncrypted: true },
    }),
    prisma.smtpConfig.findMany({ select: { id: true, password: true } }),
    prisma.whatsappMessage.findMany({ select: { id: true, content: true, errorDetail: true } }),
  ]);

  const candidates: Candidate[] = [];
  const addRecord = (source: string, recordId: string, record: Record<string, unknown>) => {
    for (const [field, value] of Object.entries(record)) {
      if (field === "id") continue;
      candidates.push({ source, recordId, field, value: typeof value === "string" ? value : null });
    }
  };

  patients.forEach((row) => addRecord("Patient", row.id, row));
  smsProviders.forEach((row) => addRecord("SmsProviderConfig", row.id, row));
  whatsappProviders.forEach((row) => addRecord("WhatsappProviderConfig", row.id, row));
  smtpConfigs.forEach((row) => addRecord("SmtpConfig", String(row.id), row));
  whatsappMessages.forEach((row) => addRecord("WhatsappMessage", row.id, row));

  const result = inspect(candidates);
  console.log(`Şifreli alan: ${result.encrypted}; okunamayan alan: ${result.failures.length}`);
  for (const failure of result.failures) {
    console.error(`- ${failure.source} ${failure.recordId} / ${failure.field}`);
  }

  if (result.failures.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
