import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { sendSms } from "@/lib/sms";

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

// POST - Ozel gunler/kampanyalar icin secili hasta grubuna serbest metin SMS
// gonderimi. "sms:bulk" yuksek riskli bir yetki (bkz. src/lib/role-permissions.ts) —
// varsayilan olarak sadece YONETICI'de var, BANKO/DOKTOR/ASISTAN'da yok.
export async function POST(request: NextRequest) {
  const auth = await requireAuth("sms:bulk");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Sadece klinik kullanicilari toplu SMS gonderebilir" }, { status: 403 });
  }

  const body = await request.json() as { patientIds?: string[]; content?: string };
  const { patientIds = [], content = "" } = body;

  if (!patientIds.length) {
    return NextResponse.json({ message: "En az bir hasta secin" }, { status: 400 });
  }
  if (!content.trim()) {
    return NextResponse.json({ message: "Mesaj metni bos olamaz" }, { status: 400 });
  }

  const [settings, institution] = await Promise.all([
    prisma.setting.findUnique({ where: { institutionId: auth.user.institutionId } }),
    prisma.institution.findUnique({ where: { id: auth.user.institutionId } }),
  ]);

  if (!settings?.smsEnabled) {
    return NextResponse.json({ message: "SMS servisi pasif durumda" }, { status: 400 });
  }
  if (!institution) {
    return NextResponse.json({ message: "Klinik bulunamadi" }, { status: 404 });
  }

  // institutionId filtresi kritik: bu filtre olmadan baska bir kurumun hasta
  // ID'si gonderilirse cross-tenant SMS gonderimi riski olurdu.
  const patients = await prisma.patient.findMany({
    where: { id: { in: patientIds }, institutionId: auth.user.institutionId },
    select: { id: true, fullName: true, phone: true },
  });

  if (!patients.length) {
    return NextResponse.json({ message: "Secili hastalar bulunamadi" }, { status: 404 });
  }

  const withPhone = patients.filter((p) => p.phone);
  const skippedNoPhone = patients.length - withPhone.length;

  if (!withPhone.length) {
    return NextResponse.json({ message: "Secili hastalarin hicbirinin telefon numarasi yok" }, { status: 400 });
  }

  const reservation = await prisma.institution.updateMany({
    where: { id: institution.id, smsBalance: { gte: withPhone.length } },
    data: { smsBalance: { decrement: withPhone.length } },
  });

  if (reservation.count === 0) {
    return NextResponse.json({
      message: `Yetersiz SMS kredisi. Gerekli: ${withPhone.length}, Mevcut: ${institution.smsBalance}`,
    }, { status: 400 });
  }

  const institutionName = settings.institutionName || institution.name;
  const institutionPhone = settings.institutionPhone || institution.phone || "";

  let sent = 0;
  const failedRecipients: { patientId: string; phone: string; reason: string }[] = [];

  const batchSize = 8;
  for (let i = 0; i < withPhone.length; i += batchSize) {
    const chunk = withPhone.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map(async (patient) => {
      const message = renderTemplate(content, {
        institutionName,
        institutionPhone,
        patientName: patient.fullName,
      });
      const sendResult = await sendSms(patient.phone, message);
      return { patient, sendResult };
    }));

    for (const { patient, sendResult } of chunkResults) {
      if (sendResult.success) {
        sent += 1;
        await writeAudit(
          auth.user.id,
          "SMS_TOPLU",
          `${patient.fullName} (${patient.phone}) - ProviderMsgId: ${sendResult.providerMessageId || "-"}`
        );
      } else {
        failedRecipients.push({
          patientId: patient.id,
          phone: patient.phone,
          reason: sendResult.error || sendResult.providerRaw,
        });
        await writeAudit(
          auth.user.id,
          "SMS_TOPLU_FAILED",
          `${patient.fullName} (${patient.phone}) - ${sendResult.error || sendResult.providerRaw}`
        );
      }
    }
  }

  const failed = failedRecipients.length;
  if (failed > 0) {
    await prisma.institution.update({
      where: { id: institution.id },
      data: { smsBalance: { increment: failed } },
    });
  }

  const refreshedInstitution = await prisma.institution.findUnique({ where: { id: institution.id } });

  return NextResponse.json({
    sent,
    failed,
    failedRecipients,
    skippedNoPhone,
    remainingBalance: refreshedInstitution?.smsBalance ?? institution.smsBalance,
    message: `${sent} hastaya toplu SMS gönderildi${failed ? `, ${failed} gönderim başarısız` : ""}${skippedNoPhone ? `, ${skippedNoPhone} hastanın telefonu yok` : ""}`,
  });
}
