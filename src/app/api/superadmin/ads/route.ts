import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type AdPayload = {
  id?: string;
  title?: string;
  content?: string;
  imageUrl?: string;
  ctaText?: string;
  ctaUrl?: string;
  sponsorName?: string;
  priority?: number;
  isActive?: boolean;
  startAt?: string | null;
  endAt?: string | null;
  maxImpressions?: number | null;
  dailyCap?: number | null;
};

const ensureHttpUrl = (value: string | null) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const parseOptionalDate = (value: string | null | undefined) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const parseOptionalPositiveInt = (value: number | null | undefined) => {
  if (value === null || value === undefined || value === 0) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
};

const normalizeBody = (body: AdPayload) => {
  const title = body.title?.trim();
  const content = body.content?.trim();

  const hasImageUrl = body.imageUrl !== undefined;
  const rawImageUrl = hasImageUrl ? body.imageUrl?.trim() || null : null;
  const safeImageUrl = hasImageUrl ? ensureHttpUrl(rawImageUrl) : null;
  if (rawImageUrl && !safeImageUrl) return { error: "Gorsel URL http/https formatinda olmalidir" };

  const hasCtaUrl = body.ctaUrl !== undefined;
  const rawCtaUrl = hasCtaUrl ? body.ctaUrl?.trim() || null : null;
  const safeCtaUrl = hasCtaUrl ? ensureHttpUrl(rawCtaUrl) : null;
  if (rawCtaUrl && !safeCtaUrl) return { error: "CTA URL http/https formatinda olmalidir" };

  const hasStartAt = body.startAt !== undefined;
  const hasEndAt = body.endAt !== undefined;
  const startAt = parseOptionalDate(body.startAt);
  const endAt = parseOptionalDate(body.endAt);
  if (body.startAt && !startAt) return { error: "Baslangic tarihi gecersiz" };
  if (body.endAt && !endAt) return { error: "Bitis tarihi gecersiz" };
  if (startAt && endAt && endAt <= startAt) return { error: "Bitis tarihi baslangictan sonra olmalidir" };

  const priority = Number.isFinite(Number(body.priority)) ? Math.max(1, Math.min(10000, Number(body.priority))) : 100;
  const maxImpressions = parseOptionalPositiveInt(body.maxImpressions);
  const dailyCap = parseOptionalPositiveInt(body.dailyCap);

  if (maxImpressions && dailyCap && dailyCap > maxImpressions) {
    return { error: "Gunluk limit toplam gosterim limitinden buyuk olamaz" };
  }

  return {
    data: {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(hasImageUrl && { imageUrl: safeImageUrl }),
      ...(body.ctaText !== undefined && { ctaText: body.ctaText?.trim() || null }),
      ...(hasCtaUrl && { ctaUrl: safeCtaUrl }),
      ...(body.sponsorName !== undefined && { sponsorName: body.sponsorName?.trim() || null }),
      ...(body.priority !== undefined && { priority }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(hasStartAt && { startAt }),
      ...(hasEndAt && { endAt }),
      ...(body.maxImpressions !== undefined && { maxImpressions }),
      ...(body.dailyCap !== undefined && { dailyCap }),
    },
  };
};

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const ads = await prisma.advertisement.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { assignments: true } },
    },
  });

  return NextResponse.json(ads);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json() as AdPayload;

  if (!body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json({ message: "Baslik ve icerik zorunlu" }, { status: 400 });
  }

  const normalized = normalizeBody(body);
  if ("error" in normalized) {
    return NextResponse.json({ message: normalized.error }, { status: 400 });
  }

  const ad = await prisma.advertisement.create({ data: normalized.data as any });
  await writeAudit(auth.user.id, "SUPERADMIN_AD_CREATE", `Reklam oluşturuldu: ${ad.title}`);
  return NextResponse.json(ad);
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json() as AdPayload;

  if (!body.id) return NextResponse.json({ message: "id zorunlu" }, { status: 400 });
  if (body.title !== undefined && !body.title.trim()) return NextResponse.json({ message: "Baslik bos olamaz" }, { status: 400 });
  if (body.content !== undefined && !body.content.trim()) return NextResponse.json({ message: "Icerik bos olamaz" }, { status: 400 });

  const normalized = normalizeBody(body);
  if ("error" in normalized) {
    return NextResponse.json({ message: normalized.error }, { status: 400 });
  }

  const updated = await prisma.advertisement.update({
    where: { id: body.id },
    data: normalized.data,
  });

  await writeAudit(auth.user.id, "SUPERADMIN_AD_UPDATE", `Reklam güncellendi: ${updated.title} (${updated.id})`);
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json() as { id?: string };
  if (!body.id) return NextResponse.json({ message: "id zorunlu" }, { status: 400 });

  const existing = await prisma.advertisement.findUnique({ where: { id: body.id }, select: { title: true } });
  await prisma.institutionAdAssignment.deleteMany({ where: { advertisementId: body.id } });
  await prisma.advertisement.delete({ where: { id: body.id } });

  await writeAudit(auth.user.id, "SUPERADMIN_AD_DELETE", `Reklam silindi: ${existing?.title || body.id}`);
  return NextResponse.json({ ok: true });
}
