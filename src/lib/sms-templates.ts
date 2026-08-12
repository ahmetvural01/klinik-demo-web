import { prisma } from "@/lib/prisma";
import type { SmsTemplate } from "@prisma/client";

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

export type CommunicationTemplateResult = {
  smsMessage: string;
  whatsappMessage: string;
  whatsappTemplate?: { name: string; language: string; bodyParameters: string[] };
};

function render(content: string, variables: Record<string, string>) {
  return content.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => variables[key] ?? "");
}

function orderedBodyParameters(content: string, variables: Record<string, string>) {
  const parameters: string[] = [];
  for (const match of content.matchAll(/{{\s*(\w+)\s*}}/g)) {
    parameters.push(variables[match[1]] ?? "");
  }
  return parameters;
}

export function renderCommunicationTemplate(
  template: SmsTemplate | null,
  variables: Record<string, string>,
  fallback: string,
): CommunicationTemplateResult {
  const smsSource = template?.content?.trim() || fallback;
  const whatsappSource = template?.whatsappContent?.trim() || smsSource;
  return {
    smsMessage: render(smsSource, variables),
    whatsappMessage: render(whatsappSource, variables),
    ...(template?.whatsappTemplateName
      ? {
          whatsappTemplate: {
            name: template.whatsappTemplateName,
            language: template.whatsappTemplateLanguage || "tr",
            bodyParameters: orderedBodyParameters(whatsappSource, variables),
          },
        }
      : {}),
  };
}
