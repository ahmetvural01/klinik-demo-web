"use client";

/**
 * Platform yönetimi ekranlarının ortak istek yardımcıları. Önceden her sayfa
 * kendi fetch + hata işleyişini yazıyordu; çoğu sunucunun açıklayıcı hata
 * mesajını ("Son etkin platform yöneticisi pasifleştirilemez" gibi) yutup
 * "Kaydedilemedi" diyordu, oturum düştüğünde de sayfa boş kalıyordu.
 */
export class SaRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SaRequestError";
  }
}

function handleAuth(status: number) {
  if (status === 401 && typeof window !== "undefined") {
    window.location.assign("/superadmin");
  }
}

/** GET isteği: başarısızsa sunucunun mesajıyla hata fırlatır. */
export async function saGet<T>(url: string, fallback: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new SaRequestError("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    handleAuth(response.status);
    throw new SaRequestError((data && typeof data.message === "string" && data.message) || fallback, response.status);
  }
  return data as T;
}

/** POST/PUT/PATCH/DELETE: başarısızsa sunucunun mesajıyla hata fırlatır, başarılıysa yanıt gövdesini döndürür. */
export async function saSend<T = unknown>(url: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body: unknown, fallback: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new SaRequestError("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    handleAuth(response.status);
    throw new SaRequestError((data && typeof data.message === "string" && data.message) || fallback, response.status);
  }
  return data as T;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
