import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataSet,
  SignalDataTypeMap,
  SignalKeyStore,
} from "@whiskeysockets/baileys";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptField, encryptField } from "@/lib/field-crypto";
import type { BaileysModule } from "./baileys-loader";
import { WhatsappWebError } from "./errors";
import { logError } from "./logger";

/**
 * Veritabanı tabanlı, ŞİFRELİ Baileys oturum deposu (useMultiFileAuthState
 * yerine). Kimlik bilgileri (creds) WhatsappWebSession.credsEncrypted, Signal
 * anahtarları WhatsappWebAuthKey satırlarında AES-256-GCM ile (field-crypto)
 * saklanır. Her sorgu institutionId ile sınırlıdır; bir kliniğin anahtarları
 * başka bir klinik oturumundan okunamaz.
 *
 * Desteklenen anahtar türleri Baileys 7'nin SignalDataTypeMap'indeki tüm
 * türlerdir (pre-key, session, sender-key, sender-key-memory,
 * app-state-sync-key, app-state-sync-version, lid-mapping, device-list,
 * tctoken, identity-key); tür adı `category` sütununa olduğu gibi yazılır.
 */

const ID_CHUNK_SIZE = 500;
const WRITE_CHUNK_SIZE = 500;

export function assertCredentialStorageReady() {
  if (process.env.NODE_ENV === "production" && !process.env.FIELD_ENCRYPTION_KEY?.trim()) {
    throw new WhatsappWebError(
      "WhatsApp bağlantısı kurulamadı: sunucuda şifreleme anahtarı (FIELD_ENCRYPTION_KEY) tanımlı değil. "
        + "Bağlantı anahtarları şifresiz saklanamayacağı için işlem durduruldu; sistem yöneticisine başvurun.",
      { status: 503, code: "ENCRYPTION_KEY_MISSING" },
    );
  }
}

function serialize(baileys: BaileysModule, value: unknown): string {
  return encryptField(JSON.stringify(value, baileys.BufferJSON.replacer));
}

function deserialize<T>(baileys: BaileysModule, stored: string | null | undefined): T | null {
  if (!stored) return null;
  const plain = decryptField(stored);
  try {
    // Çözülemeyen kayıtta decryptField açıklama metni döner; JSON olmadığı
    // için burada null'a düşer ve oturum "eşleşmemiş" sayılır.
    return JSON.parse(plain, baileys.BufferJSON.reviver) as T;
  } catch {
    return null;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

/** Eşleştirme (QR okutma / kod girme) tamamlanmış mı? */
export function isPairedCreds(creds: Pick<AuthenticationCreds, "me" | "account"> | null | undefined): boolean {
  return Boolean(creds?.me?.id && creds.account);
}

/**
 * Baileys modülü yüklemeden, kayıtlı creds'in eşleşmiş bir cihaza ait olup
 * olmadığını söyler (açılışta ve bağlantı/kesme kararlarında kullanılır).
 */
export async function hasStoredPairedCreds(institutionId: string): Promise<boolean> {
  const row = await prisma.whatsappWebSession.findUnique({
    where: { institutionId },
    select: { credsEncrypted: true },
  });
  if (!row?.credsEncrypted) return false;
  try {
    const parsed = JSON.parse(decryptField(row.credsEncrypted)) as { me?: { id?: unknown }; account?: unknown } | null;
    return Boolean(parsed && typeof parsed.me?.id === "string" && parsed.me.id && parsed.account);
  } catch {
    return false;
  }
}

export type LoadedAuthState = {
  institutionId: string;
  state: AuthenticationState;
  /** creds.update olayında çağrılır; yazımlar sıraya alınır. */
  saveCreds: () => Promise<void>;
  /** Bekleyen tüm creds/anahtar yazımlarının bitmesini bekler. */
  flush: () => Promise<void>;
  /** Bu nesne üzerinden yapılacak sonraki yazımları yok sayar (çıkış/temizlik sonrası). */
  dispose: () => void;
};

type SerialRunner = (label: string, work: () => Promise<void>) => Promise<void>;

function createKeyStore(baileys: BaileysModule, institutionId: string, serial: SerialRunner): SignalKeyStore {
  return {
    async get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]) {
      const result: { [id: string]: SignalDataTypeMap[T] } = {};
      const uniqueIds = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
      for (const idChunk of chunk(uniqueIds, ID_CHUNK_SIZE)) {
        const rows = await prisma.whatsappWebAuthKey.findMany({
          where: { institutionId, category: type, keyId: { in: idChunk } },
          select: { keyId: true, valueEncrypted: true },
        });
        for (const row of rows) {
          const value = deserialize<unknown>(baileys, row.valueEncrypted);
          if (value === null || value === undefined) continue;
          // Uygulama durumu anahtarları protobuf nesnesi olarak beklenir (Baileys örneğindeki gibi).
          const normalized: unknown = type === "app-state-sync-key" && typeof value === "object"
            ? baileys.proto.Message.AppStateSyncKeyData.fromObject(value as Record<string, unknown>)
            : value;
          result[row.keyId] = normalized as SignalDataTypeMap[T];
        }
      }
      return result;
    },

    async set(data: SignalDataSet) {
      const touchedByCategory = new Map<string, Set<string>>();
      const writes: { institutionId: string; category: string; keyId: string; valueEncrypted: string }[] = [];
      for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
        const entries = data[category];
        if (!entries) continue;
        const touched = touchedByCategory.get(category) ?? new Set<string>();
        for (const [keyId, value] of Object.entries(entries)) {
          // null/undefined = sil. Diğerleri önce silinip yeniden yazılır
          // (tek işlemde upsert; satır sayısından bağımsız 2 sorgu).
          touched.add(keyId);
          if (value !== null && value !== undefined) {
            writes.push({ institutionId, category, keyId, valueEncrypted: serialize(baileys, value) });
          }
        }
        touchedByCategory.set(category, touched);
      }
      if (touchedByCategory.size === 0) return;

      await serial("Oturum anahtarı kaydedilemedi", async () => {
        const operations: Prisma.PrismaPromise<Prisma.BatchPayload>[] = [];
        for (const [category, keyIds] of touchedByCategory) {
          for (const idChunk of chunk([...keyIds], ID_CHUNK_SIZE)) {
            operations.push(prisma.whatsappWebAuthKey.deleteMany({ where: { institutionId, category, keyId: { in: idChunk } } }));
          }
        }
        for (const writeChunk of chunk(writes, WRITE_CHUNK_SIZE)) {
          operations.push(prisma.whatsappWebAuthKey.createMany({ data: writeChunk }));
        }
        await prisma.$transaction(operations);
      });
    },

    async clear() {
      await serial("Oturum anahtarları temizlenemedi", async () => {
        await prisma.whatsappWebAuthKey.deleteMany({ where: { institutionId } });
      });
    },
  };
}

/**
 * Kurumun kayıtlı oturumunu yükler; yoksa yeni (eşleşmemiş) kimlik üretir.
 * Üretimde şifreleme anahtarı yoksa bağlantıyı reddeder.
 */
export async function loadAuthState(baileys: BaileysModule, institutionId: string): Promise<LoadedAuthState> {
  assertCredentialStorageReady();
  const row = await prisma.whatsappWebSession.findUnique({
    where: { institutionId },
    select: { credsEncrypted: true },
  });
  const creds = deserialize<AuthenticationCreds>(baileys, row?.credsEncrypted) ?? baileys.initAuthCreds();

  let disposed = false;
  // Creds ve anahtar yazımları tek sıra halinde yürür: aynı anahtarın iki
  // eşzamanlı sil+yaz işlemi benzersizlik çakışmasına düşmez, "son yazan
  // kazanır" sırası korunur ve çıkıştan sonra gecikmiş bir yazım silinmiş
  // oturumu geri getirmez (dispose).
  let chain: Promise<void> = Promise.resolve();
  const serial: SerialRunner = (label, work) => {
    const run = chain.then(async () => {
      if (disposed) return;
      await work();
    });
    chain = run.catch((error: unknown) => {
      logError(institutionId, label, error);
    });
    return run;
  };

  const keys = createKeyStore(baileys, institutionId, serial);

  const saveCreds = () => serial("Oturum bilgisi kaydedilemedi", async () => {
    const credsEncrypted = serialize(baileys, creds);
    await prisma.whatsappWebSession.upsert({
      where: { institutionId },
      create: { institutionId, credsEncrypted },
      update: { credsEncrypted },
    });
  });

  return {
    institutionId,
    state: { creds, keys },
    saveCreds,
    flush: async () => {
      await chain;
    },
    dispose: () => {
      disposed = true;
    },
  };
}

/** Çıkışta/bağlantı kesildiğinde: tüm anahtarlar ve creds silinir (günlük sayaç kalır). */
export async function clearAuthState(institutionId: string): Promise<void> {
  await prisma.$transaction([
    prisma.whatsappWebAuthKey.deleteMany({ where: { institutionId } }),
    prisma.whatsappWebSession.updateMany({ where: { institutionId }, data: { credsEncrypted: null } }),
  ]);
}
