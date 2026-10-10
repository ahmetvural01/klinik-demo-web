"use client";

import { cachedGet } from "@/lib/client-cache";

/** Hasta belgelerinin antedindeki klinik künyesi (bkz. /api/documents/letterhead). */
export type ClinicLetterhead = {
  name: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  taxNo: string;
  registryNo: string;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * Künye yalnız bir belge yazdırılırken/indirilirken okunur (hasta dosyasının
 * açılışında istek yok); 5 dakika bellekte tutulur. Okunamazsa boş künye
 * döner, belge "Klinik" başlığıyla yine çıkar.
 */
export async function loadClinicLetterhead(): Promise<ClinicLetterhead> {
  const body = await cachedGet<Record<string, unknown> | null>("/api/documents/letterhead", 5 * 60_000).catch(() => null);
  return {
    name: text(body?.institutionName),
    phone: text(body?.institutionPhone),
    email: text(body?.institutionEmail),
    address: text(body?.institutionAddress),
    website: text(body?.institutionWebsite),
    taxNo: text(body?.institutionTaxNo),
    registryNo: text(body?.institutionRegistryNo),
  };
}
