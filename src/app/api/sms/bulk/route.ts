import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { dispatchPatientMessage } from "@/lib/notification-dispatch";

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
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları toplu SMS gönderebilir." }, { status: 403 });
  }

  const body = await request.json() as { audience?: "ALL" | "SELECTED"; patientIds?: string[]; content?: string };
  const { audience = "SELECTED", patientIds = [], content = "" } = body;

  if (audience === "SELECTED" && !patientIds.length) {
    return NextResponse.json({ message: "En az bir hasta secin" }, { status: 400 });
  }
  if (!content.trim()) {
    return NextResponse.json({ message: "Mesaj metni bos olamaz" }, { status: 400 });
  }

  const [settings, institution] = await Promise.all([
    prisma.setting.findUnique({ where: { institutionId: auth.user.institutionId } }),
    prisma.institution.findUnique({ where: { id: auth.user.institutionId } }),
  ]);

  if (!institution) {
    return NextResponse.json({ message: "Klinik bulunamadı." }, { status: 404 });
  }

  // institutionId filtresi kritik: bu filtre olmadan baska bir kurumun hasta
  // ID'si gonderilirse cross-tenant SMS gonderimi riski olurdu. "ALL" modunda
  // da ayni filtre kullanilir, sadece patientIds yerine kurumun tum hastalari.
  const patients = audience === "ALL"
    ? await prisma.patient.findMany({
        where: { institutionId: auth.user.institutionId, archivedAt: null },
        select: { id: true, fullName: true, phone: true },
      })
    : await prisma.patient.findMany({
        where: { id: { in: patientIds }, institutionId: auth.user.institutionId, archivedAt: null },
        select: { id: true, fullName: true, phone: true },
      });

  if (!patients.length) {
    return NextResponse.json({ message: "Seçilen ölçütlere uygun hasta bulunamadı." }, { status: 404 });
  }

  const withPhone = patients.filter((p) => p.phone);
  const skippedNoPhone = patients.length - withPhone.length;

  if (!withPhone.length) {
    return NextResponse.json({ message: "Secili hastalarin hicbirinin telefon numarasi yok" }, { status: 400 });
  }

  const institutionName = settings?.institutionName || institution.name;
  const institutionPhone = settings?.institutionPhone || institution.phone || "";

  let sent = 0;
  const failedRecipients: { patientId: string; phone: string; reason: string }[] = [];
  const packageId = `TOPLU-${Date.now().toString(36).toUpperCase()}`;

  const batchSize = 8;
  for (let i = 0; i < withPhone.length; i += batchSize) {
    const chunk = withPhone.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map(async (patient) => {
      const message = renderTemplate(content, {
        institutionName,
        institutionPhone,
        patientName: patient.fullName,
      });
      const result = await dispatchPatientMessage({
        institutionId: institution.id,
        patientId: patient.id,
        eventType: "BULK_SMS",
        purpose: "SERVICE",
        templateCode: "TOPLU",
        message,
        // Her toplu gönderim personelin o anki bilinçli eylemidir — aynı hasta
        // başka bir toplu gönderimde tekrar seçilebilir, bu yüzden anahtar
        // paket kimliğine bağlı (kalıcı olarak tekilleştirilmez).
        idempotencyKey: `bulk-sms:${packageId}:${patient.id}`,
        actorId: auth.user.id,
      });
      return { patient, result };
    }));

    for (const { patient, result } of chunkResults) {
      if (result.success) {
        sent += 1;
        await writeAudit(
          auth.user.id,
          `${result.channel}_TOPLU`,
          `[Paket:${packageId}] ${patient.fullName} (${patient.phone}) - ProviderMsgId: ${result.providerMessageId || "-"}`
        );
      } else {
        failedRecipients.push({
          patientId: patient.id,
          phone: patient.phone,
          reason: result.reason || result.error || "Bilinmeyen hata",
        });
        await writeAudit(
          auth.user.id,
          "SMS_TOPLU_FAILED",
          `[Paket:${packageId}] ${patient.fullName} (${patient.phone}) - ${result.reason || result.error || "Bilinmeyen hata"}`
        );
      }
    }
  }

  const failed = failedRecipients.length;
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
