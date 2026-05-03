import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [{ level: "warn", emit: "stdout" }]
        : ["error"],
  });
}

export const prisma = global.prismaGlobal ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;
}

// Uygulama kapanırken bağlantıyı düzgün kapat
if (process.env.NODE_ENV === "production") {
  process.on("beforeExit", () => { void prisma.$disconnect(); });
}
