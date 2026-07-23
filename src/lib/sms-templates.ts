import { prisma } from "@/lib/prisma";

// SMS gönderen her yer (randevu bilgilendirme/hatırlatma, anket, ödeme
// hatırlatma, doğum günü, ...) hangi şablonun kullanılacağını bu tek yerden
// sorar: önce kliniğin kendi özelleştirdiği/eklediği şablon (institutionId
// dolu), yoksa süperadmin'in sistem varsayılanı (institutionId null).
export async function resolveSmsTemplate(institutionId: string, code: string) {
  const clinicTemplate = await prisma.smsTemplate.findFirst({
    where: { institutionId, code, isActive: true },
  });
  if (clinicTemplate) return clinicTemplate;

  return prisma.smsTemplate.findFirst({
    where: { institutionId: null, code, isActive: true },
  });
}
