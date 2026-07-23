import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { buildExportWorkbook } from "@/lib/patient-export";

// GET /api/superadmin/institutions/[id]/export
// Toplu içe aktarımın tam tersi: kliniğin GERÇEK mevcut hasta, ödeme, tedavi
// ve reçete verisini aynı şablon şemasıyla Excel olarak indirir. Veri
// taşınabilirliği (klinik ayrılırsa verisini alabilmeli) ve KVKK'ya uygun
// erişim hakkı için.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const result = await buildExportWorkbook(params.id);
  if (!result) return NextResponse.json({ message: "Kurum bulunamadı" }, { status: 404 });

  await writeAudit(auth.user.id, "SUPERADMIN_DATA_EXPORT", `${result.institutionName} kliniğinin verisi dışa aktarıldı.`);

  const fileName = `${result.institutionName.replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ]+/g, "_")}_veri_disa_aktarim.xlsx`;
  return new NextResponse(result.buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
