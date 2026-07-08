import { PrismaClient } from "@prisma/client";

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
    url.searchParams.set("connect_timeout", "1");
    return url.toString();
  } catch {
    return raw;
  }
}

function createPrismaClient() {
  return new PrismaClient({
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
