"use client";

/**
 * Hasta dosyası açılırken hasta isteği, sayfa parçası (JS) inerken başlasın:
 * önceden istek ancak parça inip içerik çizildikten sonra gidiyordu (şelale).
 * Sayfa kabuğu (page.tsx) isteği başlatır, içerik ilk yüklemede aynı yanıtı
 * kullanır. İlk açılış KVKK erişim kaydına yazılır (sessiz değil); bu yüzden
 * istek tek kez atılır ve tek kez tüketilir — iki kez "görüntüleme" yazılmaz.
 */

export type PatientFileResponse = { ok: boolean; status: number; body: unknown };

type Entry = { at: number; promise: Promise<PatientFileResponse>; consumed: boolean };

// Aynı hasta için kısa süre içinde ikinci ön yükleme yapılmaz.
const REUSE_MS = 30_000;
const entries = new Map<string, Entry>();

export function fetchPatientFile(id: string, init?: { signal?: AbortSignal; silent?: boolean }): Promise<PatientFileResponse> {
  return fetch(`/api/patients/${encodeURIComponent(id)}`, {
    cache: "no-store",
    signal: init?.signal,
    // Sessiz yenilemeler KVKK erişim kaydına yazılmaz.
    headers: init?.silent ? { "x-silent-refresh": "1" } : undefined,
  }).then(async (response) => ({
    ok: response.ok,
    status: response.status,
    body: await response.json().catch(() => null),
  }));
}

/** Sayfa kabuğundan çağrılır: hasta isteğini hemen başlatır (aynı hasta için bir kez). */
export function prefetchPatientFile(id: string) {
  if (!id) return;
  const existing = entries.get(id);
  if (existing && Date.now() - existing.at < REUSE_MS) return;
  const promise = fetchPatientFile(id).catch(() => ({ ok: false, status: 0, body: null }));
  entries.set(id, { at: Date.now(), promise, consumed: false });
}

/** İçeriğin ilk yüklemesi: ön yüklenmiş yanıt varsa onu alır (bir kez). */
export function takePrefetchedPatientFile(id: string): Promise<PatientFileResponse> | null {
  const entry = entries.get(id);
  if (!entry || entry.consumed || Date.now() - entry.at > REUSE_MS) return null;
  entry.consumed = true;
  return entry.promise;
}

/**
 * İçerik kendi isteğini attıysa kayıt düşülür: ardından gelen ön yükleme
 * çağrısı (ör. aynı hastada sekme değişimi) ikinci bir "görüntüleme" yazmasın.
 */
export function notePatientFileFetched(id: string) {
  entries.set(id, { at: Date.now(), promise: Promise.resolve({ ok: false, status: 0, body: null }), consumed: true });
}

/**
 * Bu hastanın dosyası az önce (30 sn) açılıp erişim kaydına yazıldı mı?
 * İçerik yeniden kurulduğunda (geliştirme kipinde etkinin iki kez çalışması,
 * hızlı geri/ileri) ikinci istek sessiz gider; ikinci "görüntüleme" yazılmaz.
 */
export function wasPatientFileFetchedRecently(id: string) {
  const entry = entries.get(id);
  return Boolean(entry && entry.consumed && Date.now() - entry.at < REUSE_MS);
}

/** İlk açılış başarısız olduysa kayıt silinir: sonraki deneme yeniden erişim kaydı yazar. */
export function forgetPatientFileFetch(id: string) {
  entries.delete(id);
}
