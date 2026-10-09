import { Prisma } from "@prisma/client";

/** Paket alanlarını doğrular: ad zorunlu, adet ≥ 1 tam sayı, fiyat > 0. */
export function parsePackageInput(body: unknown, partial: boolean): { data: { name?: string; smsCount?: number; price?: number; description?: string | null }; error?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { data: {}, error: "Geçersiz istek" };
  const input = body as Record<string, unknown>;
  const data: { name?: string; smsCount?: number; price?: number; description?: string | null } = {};
  if (input.name !== undefined || !partial) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 80) return { data, error: "Paket adı 1-80 karakter olmalı" };
    data.name = name;
  }
  if (input.smsCount !== undefined || !partial) {
    const smsCount = Number(input.smsCount);
    if (!Number.isInteger(smsCount) || smsCount < 1 || smsCount > 10_000_000) return { data, error: "SMS adedi 1 veya daha büyük bir tam sayı olmalı" };
    data.smsCount = smsCount;
  }
  if (input.price !== undefined || !partial) {
    const price = Number(input.price);
    if (!Number.isFinite(price) || price <= 0 || price > 99_999_999) return { data, error: "Fiyat sıfırdan büyük olmalı" };
    data.price = Math.round(price * 100) / 100;
  }
  if (input.description !== undefined) {
    data.description = typeof input.description === "string" ? input.description.trim().slice(0, 300) || null : null;
  }
  return { data };
}

export function packageConflictMessage(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "Bu SMS adedinde bir paket zaten var. Mevcut paketi düzenleyin ya da farklı bir adet girin.";
  }
  return null;
}

