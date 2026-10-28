"use client";

import { loadPrintClinic, type PrintClinic } from "@/lib/print-letterhead";

/** Hasta belgelerinin antedindeki klinik künyesi ve logo (bkz. /api/documents/letterhead). */
export type ClinicLetterhead = PrintClinic;

/**
 * Künye yalnız bir belge yazdırılırken/indirilirken okunur (hasta dosyasının
 * açılışında istek yok); 5 dakika bellekte tutulur. Okunamazsa boş künye
 * döner, belge "Klinik" başlığıyla yine çıkar.
 */
export const loadClinicLetterhead = loadPrintClinic;
