import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const firma = await (prisma as any).firma.findUnique({
      where: { id: params.id },
      include: {
        islemler: {
          where: { status: "AKTIF" },
          orderBy: { tarih: "asc" }
        }
      }
    });
    if (!firma) return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });
    return NextResponse.json(firma);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const body = await req.json();
    const firma = await (prisma as any).firma.update({
      where: { id: params.id },
      data: body
    });
    return NextResponse.json(firma);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}
