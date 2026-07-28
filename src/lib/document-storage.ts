import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { decryptBuffer, encryptBuffer } from "@/lib/field-crypto";
import { prisma } from "@/lib/prisma";

export type DocumentStorageProvider = "LOCAL" | "DATABASE" | "S3";

const UPLOAD_ROOT = process.env.DOCUMENT_LOCAL_ROOT
  ? path.resolve(process.env.DOCUMENT_LOCAL_ROOT)
  : path.join(process.cwd(), "data", "uploads");

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const MAX_FILE_SIZE = 15 * 1024 * 1024;

export class DocumentUploadError extends Error {}
export class DocumentIntegrityError extends Error {}

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

function configuredProvider(): DocumentStorageProvider {
  const requested = String(process.env.DOCUMENT_STORAGE_PROVIDER || "LOCAL").toUpperCase();
  if (requested === "S3") return "S3";
  if (requested === "DATABASE") return "DATABASE";
  return "LOCAL";
}

function s3Config() {
  const bucket = process.env.DOCUMENT_S3_BUCKET?.trim();
  const region = process.env.DOCUMENT_S3_REGION?.trim() || "auto";
  const endpoint = process.env.DOCUMENT_S3_ENDPOINT?.trim();
  const accessKeyId = process.env.DOCUMENT_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.DOCUMENT_S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new DocumentUploadError(
      "Kalıcı belge depolama ayarları eksik. S3 bucket ve erişim anahtarlarını tanımlayın."
    );
  }
  return {
    bucket,
    client: new S3Client({
      region,
      ...(endpoint ? { endpoint } : {}),
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: process.env.DOCUMENT_S3_FORCE_PATH_STYLE === "true",
    }),
  };
}

function safeLocalPath(storedName: string) {
  const safeName = path.basename(storedName);
  return path.join(UPLOAD_ROOT, safeName);
}

export async function saveDocumentFile(file: File): Promise<{
  storedName: string;
  storageProvider: DocumentStorageProvider;
  fileSize: number;
  sha256: string;
}> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const encrypted = encryptBuffer(buffer);
  const storedName = `${randomUUID()}${extensionFor(file.type)}`;
  const storageProvider = configuredProvider();

  try {
    if (storageProvider === "S3") {
      const { bucket, client } = s3Config();
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `documents/${storedName}`,
        Body: encrypted,
        ContentType: "application/octet-stream",
        Metadata: { encrypted: "aes-256-gcm" },
      }));
    } else if (storageProvider === "DATABASE") {
      await prisma.documentBlob.create({
        data: {
          storedName,
          encryptedData: encrypted,
        },
      });
    } else {
      await mkdir(UPLOAD_ROOT, { recursive: true });
      await writeFile(safeLocalPath(storedName), encrypted);
    }

    return {
      storedName,
      storageProvider,
      fileSize: buffer.byteLength,
      sha256: createHash("sha256").update(buffer).digest("hex"),
    };
  } catch (error) {
    if (error instanceof DocumentUploadError) throw error;
    console.error("[document-storage save]", error);
    throw new DocumentUploadError("Belge kalıcı depolama alanına kaydedilemedi.");
  }
}

export async function readDocumentFile(
  storedName: string,
  storageProvider: string,
  expectedSha256?: string | null,
) {
  let encrypted: Buffer;
  if (storageProvider === "S3") {
    const { bucket, client } = s3Config();
    const response = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: `documents/${storedName}`,
    }));
    if (!response.Body) throw new Error("Belge içeriği boş.");
    encrypted = Buffer.from(await response.Body.transformToByteArray());
  } else if (storageProvider === "DATABASE") {
    const blob = await prisma.documentBlob.findUnique({
      where: { storedName },
      select: { encryptedData: true },
    });
    if (!blob) throw new Error("Belge içeriği bulunamadı.");
    encrypted = Buffer.from(blob.encryptedData);
  } else {
    encrypted = await readFile(safeLocalPath(storedName));
  }

  const buffer = decryptBuffer(encrypted);
  if (expectedSha256) {
    const actual = createHash("sha256").update(buffer).digest("hex");
    if (actual !== expectedSha256) {
      throw new DocumentIntegrityError("Belgenin bütünlük doğrulaması başarısız.");
    }
  }
  return buffer;
}

export async function deleteDocumentFile(storedName: string, storageProvider = "LOCAL") {
  try {
    if (storageProvider === "S3") {
      const { bucket, client } = s3Config();
      await client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: `documents/${storedName}`,
      }));
      return;
    }
    if (storageProvider === "DATABASE") {
      await prisma.documentBlob.deleteMany({ where: { storedName } });
      return;
    }
    await unlink(safeLocalPath(storedName));
  } catch (error) {
    // Silme işlemi idempotenttir; bulunmayan dosya kayıt akışını bozmaz.
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error("[document-storage delete]", error);
    }
  }
}
