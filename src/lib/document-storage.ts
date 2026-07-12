import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import { createReadStream, existsSync } from "fs";
import path from "path";
import { encryptBuffer } from "@/lib/field-crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "data", "uploads");

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

export class DocumentUploadError extends Error {}

export function isAllowedDocumentFile(mimeType: string, size: number) {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return "Yalnızca JPG, PNG, WEBP veya PDF dosyaları yüklenebilir.";
  }
  if (size > MAX_FILE_SIZE) {
    return "Dosya boyutu en fazla 15MB olabilir.";
  }
  return null;
}

function extensionFor(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg": return ".jpg";
    case "image/png": return ".png";
    case "image/webp": return ".webp";
    case "application/pdf": return ".pdf";
    default: return "";
  }
}

export async function saveDocumentFile(file: File): Promise<{ storedName: string; fileSize: number }> {
  try {
    await mkdir(UPLOAD_ROOT, { recursive: true });

    const storedName = `${randomUUID()}${extensionFor(file.type)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(UPLOAD_ROOT, storedName), encryptBuffer(buffer));

    return { storedName, fileSize: buffer.byteLength };
  } catch (error) {
    console.error("[document-storage save]", error);
    throw new DocumentUploadError("Dosya yükleme klasörüne kaydedilemedi.");
  }
}

export function documentFilePath(storedName: string) {
  // storedName her zaman randomUUID ile üretilir; yol ayırıcı içeremez, ama yine de
  // path traversal'a karşı temel adı doğruluyoruz.
  const safeName = path.basename(storedName);
  return path.join(UPLOAD_ROOT, safeName);
}

export function documentFileExists(storedName: string) {
  return existsSync(documentFilePath(storedName));
}

export function readDocumentFileStream(storedName: string) {
  return createReadStream(documentFilePath(storedName));
}

export async function deleteDocumentFile(storedName: string) {
  try {
    await unlink(documentFilePath(storedName));
  } catch {
    // Dosya zaten yoksa sessizce geç.
  }
}
