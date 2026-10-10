import { prisma } from "@/lib/prisma";

export type AuditActor = { fullName: string; role: string };

/**
 * Kaydı GERÇEKTEN yapan kişiyi ekler. Gizli girişte kayıt kliniğin
 * kullanıcısı (userId) adına yazılır, işlemi yapan platform yöneticisi
 * actorId'dedir. Önceden ekranlar yalnız `user.fullName` gösteriyordu:
 * "AYŞE FATMA (Platform yöneticisi)" gibi iki kişiyi karıştıran bir satır
 * çıkıyor, hangi platform yöneticisinin işlem yaptığı hiçbir yerde
 * görünmüyordu (canlı test H1). `actor` yalnız userId'den farklıysa dolar.
 */
export async function attachAuditActors<T extends { userId: string; actorId: string | null }>(logs: T[]): Promise<Array<T & { actor: AuditActor | null }>> {
  const ids = [...new Set(logs.filter((log) => log.actorId && log.actorId !== log.userId).map((log) => log.actorId as string))];
  const actors = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, role: true } })
    : [];
  const byId = new Map(actors.map((actor) => [actor.id, { fullName: actor.fullName, role: actor.role }]));
  return logs.map((log) => ({
    ...log,
    actor: log.actorId && log.actorId !== log.userId ? byId.get(log.actorId) ?? null : null,
  }));
}
