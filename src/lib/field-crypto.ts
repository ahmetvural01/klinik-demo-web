import crypto from "crypto";

/**
 * KVKK m.6 kapsamındaki özel nitelikli hasta verileri (ameliyat/ilaç/hastalık geçmişi, notlar)
 * için alan bazlı AES-256-GCM şifreleme. FIELD_ENCRYPTION_KEY tanımlı değilse şifreleme
 * devre dışı kalır (uygulama çökmez) — üretimde mutlaka ayarlanmalı, bkz. .env.production.example.
 */

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let warnedMissingKey = false;

function getKey(): Buffer | null {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn(
        "[field-crypto] FIELD_ENCRYPTION_KEY tanımlı değil — hassas hasta alanları şifrelenmeden kaydediliyor. " +
          "Üretimde mutlaka ayarlayın: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
      );
    }
    return null;
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY 32 byte (base64 ile kodlanmış) uzunluğunda olmalı.");
  }
  return key;
}

export function isEncryptedValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptField<T extends string | null | undefined>(value: T): T {
  if (value === null || value === undefined || value === "") return value;
  if (isEncryptedValue(value)) return value;

  const key = getKey();
  if (!key) return value;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return (PREFIX + Buffer.concat([iv, authTag, encrypted]).toString("base64")) as T;
}

const BUFFER_PREFIX = Buffer.from("ENC1", "utf8"); // dosya şifreliyse ilk 4 byte

export function encryptBuffer(data: Buffer): Buffer {
  const key = getKey();
  if (!key) return data;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([BUFFER_PREFIX, iv, authTag, encrypted]);
}

export function decryptBuffer(data: Buffer): Buffer {
  if (data.subarray(0, 4).toString("utf8") !== "ENC1") return data; // eski/düz dosya

  const key = getKey();
  if (!key) throw new Error("Dosya şifreli ama FIELD_ENCRYPTION_KEY tanımlı değil.");

  const iv = data.subarray(4, 4 + IV_LENGTH);
  const authTag = data.subarray(4 + IV_LENGTH, 4 + IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(4 + IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function decryptField<T extends string | null | undefined>(value: T): T {
  if (value === null || value === undefined || value === "") return value;
  if (!isEncryptedValue(value)) return value; // eski/düz metin kayıt — olduğu gibi göster

  const key = getKey();
  if (!key) return "[Şifreli veri — FIELD_ENCRYPTION_KEY tanımlı değil]" as T;

  try {
    const payload = Buffer.from((value as string).slice(PREFIX.length), "base64");
    const iv = payload.subarray(0, IV_LENGTH);
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8") as T;
  } catch (err) {
    console.error("[field-crypto] Alan çözülemedi:", err instanceof Error ? err.message : err);
    return "[Şifreli veri çözülemedi]" as T;
  }
}
