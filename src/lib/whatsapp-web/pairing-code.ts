/**
 * Telefon numarasıyla bağlama: Baileys'in `requestPairingCode` fonksiyonu kodu
 * üretip istek WhatsApp'a gönderilir gönderilmez döner; sunucunun isteği
 * KABUL ETTİĞİNİ beklemez. WhatsApp isteği reddederse (ör. `error 400
 * bad-request`) kullanıcıya hiç kayıtlanmamış, "ölü" bir kod gösterilirdi
 * (bkz. https://github.com/WhiskeySockets/Baileys/issues/2737).
 *
 * Bu yardımcı isteği gönderirken sunucunun yanıtını (iq result / iq error)
 * dinler: ret gelirse hata fırlatır, onay ya da zaman aşımında kodu döndürür.
 * Yan etkisizdir (Baileys/Prisma yüklemez); testlerde sahte soketle denenir.
 */

type FrameNode = { tag?: string; attrs?: Record<string, string>; content?: unknown };

export type PairingCodeSocket = {
  ws: {
    on(event: string, listener: (frame: FrameNode) => void): unknown;
    off(event: string, listener: (frame: FrameNode) => void): unknown;
  };
  requestPairingCode(phone: string): Promise<string>;
};

export class PairingCodeRejectedError extends Error {
  constructor(public readonly detail: string) {
    super(`WhatsApp eşleştirme kodu isteğini reddetti (${detail})`);
    this.name = "PairingCodeRejectedError";
  }
}

function children(frame: FrameNode): FrameNode[] {
  return Array.isArray(frame.content) ? (frame.content as FrameNode[]) : [];
}

export async function requestPairingCodeChecked(
  sock: PairingCodeSocket,
  phone: string,
  options: { waitMs?: number } = {},
): Promise<string> {
  const waitMs = options.waitMs ?? 8_000;
  let settle: (outcome: { rejected: string | null }) => void = () => undefined;
  const outcome = new Promise<{ rejected: string | null }>((resolve) => { settle = resolve; });

  // Yanıt isteğin gönderilmesinden hemen sonra gelebilir: dinleyici ÖNCE bağlanır.
  const onFrame = (frame: FrameNode) => {
    if (frame?.tag !== "iq") return;
    if (frame.attrs?.type === "result" && children(frame).some((child) => child?.tag === "link_code_companion_reg")) {
      settle({ rejected: null });
    } else if (frame.attrs?.type === "error") {
      const error = children(frame).find((child) => child?.tag === "error");
      settle({ rejected: `${error?.attrs?.code ?? "?"} ${error?.attrs?.text ?? ""}`.trim() });
    }
  };
  sock.ws.on("frame", onFrame);

  let timer: NodeJS.Timeout | null = null;
  try {
    const code = await sock.requestPairingCode(phone);
    const result = await Promise.race([
      outcome,
      new Promise<{ rejected: string | null }>((resolve) => {
        timer = setTimeout(() => resolve({ rejected: null }), waitMs);
      }),
    ]);
    if (result.rejected) throw new PairingCodeRejectedError(result.rejected);
    return code;
  } finally {
    if (timer) clearTimeout(timer);
    sock.ws.off("frame", onFrame);
  }
}
