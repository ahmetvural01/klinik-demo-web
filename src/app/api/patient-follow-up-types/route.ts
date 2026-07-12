import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

const MAX_TYPES = 80;
const MAX_TYPE_LENGTH = 60;

function normalizeTypes(input: unknown) {
  const raw = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of raw) {
    const label = String(value || "").trim().replace(/\s+/g, " ").slice(0, MAX_TYPE_LENGTH);
    const key = label.toLocaleLowerCase("tr-TR");
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
    if (result.length >= MAX_TYPES) break;
  }

  return result;
}

function parseStoredTypes(value?: string | null) {
  try {
    return normalizeTypes(JSON.parse(value || "[]"));
  } catch {
    return [];
  }
}

async function ensureSetting(institutionId: string, institutionName: string) {
  return prisma.setting.upsert({
    where: { institutionId },
    update: {},
    create: {
      institutionId,
      institutionName,
    },
  });
}

export async function GET() {
  try {
    const auth = await requireAuth("hastatracking:read");
    if (auth.error) return auth.error;
    if (!auth.user.institutionId) {
      return NextResponse.json({ message: "Kurum bağlantısı bulunamadı" }, { status: 403 });
    }

    const institution = await prisma.institution.findUnique({
      where: { id: auth.user.institutionId },
      select: { name: true },
    });
    if (!institution) return NextResponse.json({ message: "Klinik bulunamadı" }, { status: 404 });

    const setting = await ensureSetting(auth.user.institutionId, institution.name);
    return NextResponse.json({ types: parseStoredTypes(setting.followUpCustomTypes) });
  } catch (error) {
    console.error("[patient-follow-up-types GET]", error);
    return NextResponse.json({ message: "Takip tipleri yüklenemedi" }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth("hastatracking:write");
    if (auth.error) return auth.error;
    if (!auth.user.institutionId) {
      return NextResponse.json({ message: "Kurum bağlantısı bulunamadı" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const types = normalizeTypes((body as { types?: unknown }).types);

    const institution = await prisma.institution.findUnique({
      where: { id: auth.user.institutionId },
      select: { name: true },
    });
    if (!institution) return NextResponse.json({ message: "Klinik bulunamadı" }, { status: 404 });

    const updated = await prisma.setting.upsert({
      where: { institutionId: auth.user.institutionId },
      update: { followUpCustomTypes: JSON.stringify(types) },
      create: {
        institutionId: auth.user.institutionId,
        institutionName: institution.name,
        followUpCustomTypes: JSON.stringify(types),
      },
    });

    await writeAudit(auth.user.id, "FOLLOW_UP_TYPES_UPDATE", `${types.length} kurum takip tipi kaydedildi`);
    return NextResponse.json({ types: parseStoredTypes(updated.followUpCustomTypes) });
  } catch (error) {
    console.error("[patient-follow-up-types PUT]", error);
    return NextResponse.json({ message: "Takip tipleri kaydedilemedi" }, { status: 503 });
  }
}
