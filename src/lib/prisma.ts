import { PrismaClient } from "@prisma/client";
import { encryptField, decryptField } from "@/lib/field-crypto";

// KVKK m.6 özel nitelikli hasta verisi — bkz. src/lib/field-crypto.ts
const ENCRYPTED_PATIENT_FIELDS = ["surgeries", "medications", "otherDiseases", "notes"] as const;

function encryptPatientWriteData(data: unknown) {
  if (!data || typeof data !== "object") return;
  const record = data as Record<string, unknown>;
  for (const field of ENCRYPTED_PATIENT_FIELDS) {
    if (typeof record[field] === "string") {
      record[field] = encryptField(record[field] as string);
    }
  }
}

function decryptPatientResult<T>(result: T): T {
  if (!result) return result;
  if (Array.isArray(result)) {
    result.forEach((item) => decryptPatientResult(item));
    return result;
  }
  if (typeof result !== "object") return result;
  const record = result as Record<string, unknown>;
  for (const field of ENCRYPTED_PATIENT_FIELDS) {
    if (typeof record[field] === "string") {
      record[field] = decryptField(record[field] as string);
    }
  }
  return result;
}

function withPatientFieldEncryption(client: PrismaClient) {
  return client.$extends({
    name: "patient-field-encryption",
    query: {
      patient: {
        async create({ args, query }) {
          encryptPatientWriteData(args.data);
          return decryptPatientResult(await query(args));
        },
        async update({ args, query }) {
          encryptPatientWriteData(args.data);
          return decryptPatientResult(await query(args));
        },
        async updateMany({ args, query }) {
          encryptPatientWriteData(args.data);
          return query(args);
        },
        async upsert({ args, query }) {
          encryptPatientWriteData(args.create);
          encryptPatientWriteData(args.update);
          return decryptPatientResult(await query(args));
        },
        async findUnique({ args, query }) {
          return decryptPatientResult(await query(args));
        },
        async findUniqueOrThrow({ args, query }) {
          return decryptPatientResult(await query(args));
        },
        async findFirst({ args, query }) {
          return decryptPatientResult(await query(args));
        },
        async findFirstOrThrow({ args, query }) {
          return decryptPatientResult(await query(args));
        },
        async findMany({ args, query }) {
          return decryptPatientResult(await query(args));
        },
      },
    },
  }) as unknown as PrismaClient;
}

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var prismaShutdownHooksRegistered: boolean | undefined;
}

function buildDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;

  try {
    const url = new URL(raw);
    // Bağlantı kopuksa isteklerin saniyelerce asılı kalmasını önle.
    url.searchParams.set("connect_timeout", "10");
    // Güvenlik ağı: beklenmedik bir sorgu (ör. gelecekte eklenecek limitsiz bir
    // findMany) veritabanı bağlantısını sonsuza kadar meşgul edip havuzu
    // tıkamasın diye sunucu tarafında sert bir üst sınır. Sadece uygulama
    // çalışma zamanı client'ına uygulanır — `prisma db push`/`migrate` gibi CLI
    // komutları .env'deki ham DATABASE_URL'i kullanır, bu limitten etkilenmez.
    // Not: Postgres'in `statement_timeout` query-string parametresi Prisma
    // tarafından tanınmıyor (doğrulandı) — libpq'nun `options=-c ...` biçimi kullanılmalı.
    if (!url.searchParams.has("options")) {
      url.searchParams.set("options", "-c statement_timeout=15000");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function createPrismaClient() {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [{ level: "warn", emit: "stdout" }]
        : ["error"],
    datasources: {
      db: {
        url: buildDatabaseUrl(),
      },
    },
  });
  return withPatientFieldEncryption(client);
}

function getPrismaClient(): PrismaClient {
  if (global.prismaGlobal) return global.prismaGlobal;
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    global.prismaGlobal = client;
  }
  return client;
}

export const prisma = getPrismaClient();

// Bağlantı koptuğunda otomatik yeniden bağlan
async function withRetry<T>(fn: () => Promise<T>, retries = 5, delayMs = 1000): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isConnErr =
        msg.includes("Can't reach database") ||
        msg.includes("Connection refused") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("the database system is starting up");

      if (isConnErr && attempt < retries) {
        const wait = delayMs * attempt;
        console.warn(`[Prisma] DB bağlantı hatası (deneme ${attempt}/${retries}). ${wait}ms sonra yeniden deneniyor...`);
        await new Promise((r) => setTimeout(r, wait));
        // Bağlantıyı sıfırla
        try { await prisma.$disconnect(); } catch { /* ignore */ }
        // global cache'i temizle
        if (global.prismaGlobal) {
          global.prismaGlobal = createPrismaClient();
        }
      } else {
        throw err;
      }
    }
  }
  throw new Error("DB bağlantısı kurulamadı");
}

export { withRetry };

// Uygulama kapanırken bağlantıyı düzgün kapat.
// Next.js dev modunda modüller tekrar değerlendirildiği için listener'ları tek kez ekle.
if (!global.prismaShutdownHooksRegistered) {
  global.prismaShutdownHooksRegistered = true;
  process.once("beforeExit", () => { void prisma.$disconnect(); });
  process.once("SIGINT", () => { void prisma.$disconnect(); });
  process.once("SIGTERM", () => { void prisma.$disconnect(); });
}
