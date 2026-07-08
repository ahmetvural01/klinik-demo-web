import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

type Params = { params: { id: string } };

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "number") return `${v} TL`;
  return String(v);
}

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth("prices:read");
    if (auth.error) return auth.error;

    const item = await prisma.priceItem.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
    });

    if (!item) {
      return NextResponse.json({ message: "Fiyat kaydı bulunamadı" }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ message: "Fiyat kaydı bulunamadı" }, { status: 404 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth("prices:write");
    if (auth.error) return auth.error;

    const body = await request.json();
    const existing = await prisma.priceItem.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
    });
    if (!existing) {
      return NextResponse.json({ message: "Fiyat kaydı bulunamadı" }, { status: 404 });
    }

    const item = await prisma.priceItem.update({
      where: { id: params.id },
      data: {
        code: body.code,
        treatment: body.treatment,
        amount: body.amount,
        isFavorite: Boolean(body.isFavorite)
      }
    });

  const beforeParts: string[] = [];
  const afterParts: string[] = [];
  const pushDiff = (label: string, before: unknown, after: unknown) => {
    const b = fmt(before);
    const a = fmt(after);
    if (b !== a) {
      beforeParts.push(`${label}: ${b}`);
      afterParts.push(`${label}: ${a}`);
    }
  };

  pushDiff("Kod", existing.code, item.code);
  pushDiff("Tedavi", existing.treatment, item.treatment);
  pushDiff("Tutar", Number(existing.amount), Number(item.amount));
  pushDiff("Favori", existing.isFavorite, item.isFavorite);

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından fiyat kaydı güncellendi.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

    await writeAudit(auth.user.id, "PRICE_UPDATE", detail);
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ message: "Fiyat güncellenemedi" }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth("prices:write");
    if (auth.error) return auth.error;

    const body = await request.json();
    const existing = await prisma.priceItem.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
    });
    if (!existing) {
      return NextResponse.json({ message: "Fiyat kaydı bulunamadı" }, { status: 404 });
    }

    const item = await prisma.priceItem.update({
      where: { id: params.id },
      data: { ...(body.amount !== undefined && { amount: Number(body.amount) }) }
    });

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından fiyat tutarı güncellendi.`,
    `Değişiklik öncesi: Tutar: ${fmt(Number(existing.amount))}`,
    `Değişiklik sonrası: Tutar: ${fmt(Number(item.amount))}`,
  ].join("\n");

    await writeAudit(auth.user.id, "PRICE_UPDATE", detail);
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ message: "Fiyat güncellenemedi" }, { status: 503 });
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth("prices:write");
    if (auth.error) return auth.error;

    const existing = await prisma.priceItem.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
    });
    if (!existing) {
      return NextResponse.json({ message: "Fiyat kaydı bulunamadı" }, { status: 404 });
    }

    const item = await prisma.priceItem.delete({ where: { id: existing.id } });
    await writeAudit(auth.user.id, "PRICE_DELETE", `${item.treatment} silindi`);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Fiyat kaydı silinemedi" }, { status: 503 });
  }
}
