import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { APPOINTMENT_TREATMENT_OPTIONS } from "@/lib/appointment-follow-up";
import { countTreatmentUsage, treatmentLabelKey } from "./treatment-usage";

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

    // Yeni/boş bir kurumun tedavi türü listesi hiç dolmazsa randevu formunda
    // seçilecek hiçbir tedavi olmazdı — ilk açılışta varsayılan liste tohumlanır
    // (bkz. denetim raporu).
    if (types.length === 0) {
      await prisma.treatmentType.createMany({
        data: APPOINTMENT_TREATMENT_OPTIONS.map((opt, index) => ({
          institutionId: auth.user.institutionId!,
          value: opt.value,
          label: opt.label,
          color: opt.color,
          order: index,
        })),
      });
      types = await prisma.treatmentType.findMany({
        where: { institutionId: auth.user.institutionId },
        orderBy: { order: "asc" },
      });
    }

    // Her türün kaç randevuda kullanıldığı: Ayarlar ekranı yalnız hiç
    // kullanılmamış türü silmeye izin verir, kullanılanı pasife alır.
    const usage = await countTreatmentUsage(auth.user.institutionId, types.map((type) => type.value));
    return NextResponse.json(types.map((type) => ({ ...type, appointmentCount: usage.get(type.value) ?? 0 })));
  } catch (error) {
    console.error("[treatment-types GET] fallback:", error);
    return NextResponse.json({ message: "Randevu türleri yüklenemedi." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bilgisi bulunamadı" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek" }, { status: 400 });
  }
  const label = String(body.label || "").trim().replace(/\s+/g, " ");
  const color = String(body.color || "").trim();
  if (!label || label.length > 120) {
    return NextResponse.json({ message: "Randevu türü adı 1-120 karakter olmalı" }, { status: 400 });
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return NextResponse.json({ message: "Geçerli bir renk kodu girin (örn: #2563eb)" }, { status: 400 });
  }

  const existing = await prisma.treatmentType.findMany({
    where: { institutionId: auth.user.institutionId },
    select: { value: true, order: true, label: true },
  });
  // Aynı adla ikinci tür randevu formunda iki kez görünüyor ve raporları
  // bölüyordu (canlıda "Kontrol" ×2, "Dolgu" ×2). Ad kurum içinde tekildir.
  if (existing.some((item) => treatmentLabelKey(item.label) === treatmentLabelKey(label))) {
    return NextResponse.json({ message: `"${label}" adında bir randevu türü zaten var. Var olanı düzenleyin ya da başka bir ad yazın.` }, { status: 409 });
  }
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

  await writeAudit(auth.user.id, "TREATMENT_TYPE_CREATE", `Randevu türü eklendi: ${label}`);
  return NextResponse.json(created, { status: 201 });
}
