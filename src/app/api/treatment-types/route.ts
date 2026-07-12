import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { APPOINTMENT_TREATMENT_OPTIONS } from "@/lib/appointment-follow-up";

function slugify(label: string, existing: Set<string>): string {
  const base = label
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "TEDAVI";
  let candidate = base;
  let i = 2;
  while (existing.has(candidate)) {
    candidate = `${base}_${i}`;
    i += 1;
  }
  return candidate;
}

export async function GET() {
  try {
    const auth = await requireAuth("settings:read");
    if (auth.error) return auth.error;
    if (!auth.user.institutionId) return NextResponse.json([]);

    let types = await prisma.treatmentType.findMany({
      where: { institutionId: auth.user.institutionId },
      orderBy: { order: "asc" },
    });

    if (types.length === 0) {
      await prisma.treatmentType.createMany({
        data: APPOINTMENT_TREATMENT_OPTIONS.map((item, idx) => ({
          institutionId: auth.user.institutionId as string,
          value: item.value,
          label: item.label,
          color: item.color,
          order: idx,
        })),
        skipDuplicates: true,
      });
      types = await prisma.treatmentType.findMany({
        where: { institutionId: auth.user.institutionId },
        orderBy: { order: "asc" },
      });
    }

    return NextResponse.json(types);
  } catch (error) {
    console.error("[treatment-types GET] fallback:", error);
    return NextResponse.json({ message: "Tedavi türleri yüklenemedi." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bilgisi bulunamadı" }, { status: 400 });
  }

  const body = await request.json();
  const label = String(body.label || "").trim();
  const color = String(body.color || "").trim();
  if (!label) return NextResponse.json({ message: "Tedavi adı boş olamaz" }, { status: 400 });
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return NextResponse.json({ message: "Geçerli bir renk kodu girin (örn: #2563eb)" }, { status: 400 });
  }

  const existing = await prisma.treatmentType.findMany({
    where: { institutionId: auth.user.institutionId },
    select: { value: true, order: true },
  });
  const value = slugify(label, new Set(existing.map((e) => e.value)));
  const maxOrder = existing.reduce((max, e) => Math.max(max, e.order), -1);

  const created = await prisma.treatmentType.create({
    data: {
      institutionId: auth.user.institutionId,
      value,
      label,
      color,
      order: maxOrder + 1,
    },
  });

  await writeAudit(auth.user.id, "TREATMENT_TYPE_CREATE", `Tedavi türü eklendi: ${label}`);
  return NextResponse.json(created, { status: 201 });
}
