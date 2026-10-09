import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { countBulkScope, findBulkAudience, type BulkAudienceQuery } from "@/lib/sms-bulk-audience";
import { canMessageOnWhatsapp } from "@/lib/whatsapp-consent";

// Toplu gönderimden ÖNCE kaç hastaya gerçekten mesaj gidebileceğini söyler:
// telefonu olmayan, meslek filtresi dışında kalan ve SMS/WhatsApp izni olmayan
// hastalar ayrı sayılır. Ekran önceden "16 hastaya gönder" deyip izni olmayan
// 16 hastanın hepsini sessizce "gönderilmedi" yapıyordu. Hiçbir şey göndermez;
// gönderimle aynı alıcı sorgusunu (findBulkAudience) kullanır.
export async function POST(request: NextRequest) {
  const auth = await requireAuth("sms:bulk");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları toplu ileti hazırlayabilir." }, { status: 403 });
  }
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  const audience = body.audience === "ALL" ? "ALL" : body.audience === "SELECTED" ? "SELECTED" : null;
  const rawPatientIds = body.patientIds ?? [];
  const celebrationCode = typeof body.celebrationCode === "string" ? body.celebrationCode.trim() : "";
  const restrictToProfessions = body.restrictToProfessions !== false;
  if (!audience) return NextResponse.json({ message: "Geçersiz alıcı grubu." }, { status: 400 });
  if (!Array.isArray(rawPatientIds) || rawPatientIds.length > 1000
    || rawPatientIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 100)) {
    return NextResponse.json({ message: "Geçersiz hasta seçimi." }, { status: 400 });
  }
  if (celebrationCode.length > 100) return NextResponse.json({ message: "Geçersiz şablon seçimi." }, { status: 400 });
  const patientIds = Array.from(new Set(rawPatientIds as string[]));

  const [institution, celebrationDay] = await Promise.all([
    prisma.institution.findUnique({ where: { id: auth.user.institutionId }, select: { smsBalance: true } }),
    celebrationCode ? prisma.celebrationDay.findFirst({ where: { code: celebrationCode, isActive: true }, select: { targetProfessions: true } }) : null,
  ]);
  if (!institution) return NextResponse.json({ message: "Klinik bulunamadı." }, { status: 404 });

  const query: BulkAudienceQuery = {
    institutionId: auth.user.institutionId,
    branchId: activeBranch.branchId,
    audience,
    patientIds,
    targetProfessions: restrictToProfessions ? celebrationDay?.targetProfessions ?? [] : [],
  };
  const nothingSelected = audience === "SELECTED" && patientIds.length === 0;
  const [patients, scopeCount] = await Promise.all([
    nothingSelected ? Promise.resolve([]) : findBulkAudience(query),
    nothingSelected ? Promise.resolve(0) : countBulkScope({ ...query, targetProfessions: [] }),
  ]);

  const withPhone = patients.filter((patient) => patient.phone);
  const smsConsent = withPhone.filter((patient) => patient.smsPreference?.status === "ENABLED");
  const whatsappConsent = withPhone.filter((patient) => canMessageOnWhatsapp(patient));
  const either = withPhone.filter((patient) => patient.smsPreference?.status === "ENABLED" || canMessageOnWhatsapp(patient));

  return NextResponse.json({
    total: patients.length,
    professionExcluded: Math.max(0, scopeCount - patients.length),
    targetProfessions: query.targetProfessions,
    noPhone: patients.length - withPhone.length,
    smsConsent: smsConsent.length,
    whatsappConsent: whatsappConsent.length,
    eitherConsent: either.length,
    noConsent: withPhone.length - either.length,
    smsBalance: institution.smsBalance,
  });
}
