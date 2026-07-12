import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const COMPREHENSIVE_TITLE = "Kapsamlı Klinik Onam ve KVKK Paketi";
const COMPREHENSIVE_CATEGORY = "KAPSAMLI_ONAM";
const DEFAULT_BODY = `## 1. Genel Onam
Hasta, klinik hizmetleri kapsamında muayene, teşhis, görüntüleme, tedavi planlama, tedavi uygulaması, reçete, kontrol ve hasta takip süreçleri hakkında bilgilendirildiğini kabul eder.

## 2. KVKK ve Açık Rıza
Hasta, sağlık hizmetinin yürütülmesi için kimlik, iletişim, sağlık, görüntüleme, tedavi, ödeme ve randevu kayıtlarının işlenebileceği konusunda bilgilendirilmiştir.

## 3. Tedavi Riskleri
Hasta, dental işlemlerde ağrı, hassasiyet, enfeksiyon, kanama, alerji, tedavi başarısızlığı, ek işlem ihtiyacı ve komplikasyon oluşabileceğini kabul eder.

## 4. Son Onay
Hasta, tek elektronik imzasının bu paketin tüm sayfaları ve bölümleri için geçerli olduğunu kabul eder.`;

async function getOrCreateGlobalTemplate() {
  const existing = await (prisma as any).consentTemplate.findFirst({
    where: { institutionId: null, title: COMPREHENSIVE_TITLE, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;

  const latestInstitutionTemplate = await (prisma as any).consentTemplate.findFirst({
    where: { title: COMPREHENSIVE_TITLE, isActive: true, institutionId: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { body: true },
  });

  return (prisma as any).consentTemplate.create({
    data: {
      institutionId: null,
      title: COMPREHENSIVE_TITLE,
      category: COMPREHENSIVE_CATEGORY,
      body: latestInstitutionTemplate?.body || DEFAULT_BODY,
      isActive: true,
    },
  });
}

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  try {
    const template = await getOrCreateGlobalTemplate();
    const oldTemplates = await (prisma as any).consentTemplate.findMany({
      where: {
        isActive: false,
        title: COMPREHENSIVE_TITLE,
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
      select: {
        id: true,
        title: true,
        category: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        institution: { select: { name: true } },
        _count: { select: { consents: true } },
      },
    });

    return NextResponse.json({ template, oldTemplates });
  } catch (error) {
    console.error("[superadmin consent-template GET]", error);
    return NextResponse.json({ message: "Onam paketi yüklenemedi." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  try {
    const body = await request.json() as { title?: string; content?: string; body?: string };
    const nextBody = String(body.body || body.content || "").trim();
    const nextTitle = COMPREHENSIVE_TITLE;

    if (nextBody.length < 200) {
      return NextResponse.json({ message: "Onam metni çok kısa. Kurumsal paket için daha kapsamlı içerik girin." }, { status: 400 });
    }

    const current = await getOrCreateGlobalTemplate();
    await (prisma as any).consentTemplate.update({
      where: { id: current.id },
      data: { isActive: false },
    });

    const template = await (prisma as any).consentTemplate.create({
      data: {
        institutionId: null,
        title: nextTitle,
        category: COMPREHENSIVE_CATEGORY,
        body: nextBody,
        isActive: true,
      },
    });

    await (prisma as any).consentTemplate.updateMany({
      where: {
        institutionId: { not: null },
        title: COMPREHENSIVE_TITLE,
        isActive: true,
      },
      data: {
        title: nextTitle,
        category: COMPREHENSIVE_CATEGORY,
        body: nextBody,
      },
    });

    await writeAudit(auth.user.id, "SUPERADMIN_CONSENT_TEMPLATE_UPDATE", `"${template.title}" global onam paketi güncellendi`);
    return NextResponse.json(template);
  } catch (error) {
    console.error("[superadmin consent-template PUT]", error);
    return NextResponse.json({ message: "Onam paketi kaydedilemedi." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ message: "Silinecek şablon seçilmedi." }, { status: 400 });

    const template = await (prisma as any).consentTemplate.findUnique({
      where: { id },
      select: { id: true, title: true, isActive: true },
    });
    if (!template) return NextResponse.json({ message: "Şablon bulunamadı." }, { status: 404 });
    if (template.isActive) return NextResponse.json({ message: "Aktif onam paketi silinemez. Önce yeni paket kaydedin." }, { status: 400 });

    await (prisma as any).consentTemplate.delete({ where: { id } });
    await writeAudit(auth.user.id, "SUPERADMIN_CONSENT_TEMPLATE_DELETE", `Pasif onam şablonu silindi: ${template.title}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[superadmin consent-template DELETE]", error);
    return NextResponse.json({ message: "Onam şablonu silinemedi." }, { status: 503 });
  }
}
