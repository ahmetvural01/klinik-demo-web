/** A mutation is sent once. Retrying financial requests belongs to their idempotent workflow. */
export async function clientMutation(url: string, init: RequestInit, fallback: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("Bağlantı kurulamadı. Girdiğiniz bilgiler korundu; bağlantınızı kontrol edin.");
  }
  if (response.ok) return;
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === "object") {
    const fields = body as Record<string, unknown>;
    for (const key of ["message", "error"] as const) {
      if (key in body) {
        const message = fields[key];
        if (typeof message === "string" && message.trim()) throw new Error(message);
      }
    }
  }
  throw new Error(fallback);
}

/** Keep successful and failed IDs separate so a partial failure never discards unfinished edits. */
export async function runRecordBatch(ids: readonly string[], mutate: (id: string) => Promise<void>) {
  const succeeded: string[] = [];
  const failed: string[] = [];
  for (const id of ids) {
    try {
      await mutate(id);
      succeeded.push(id);
    } catch {
      failed.push(id);
    }
  }
  return { succeeded, failed };
}
