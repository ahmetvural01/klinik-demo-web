import type { Metadata } from "next";
import { ClinicLoginForm } from "@/components/auth/clinic-login-form";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Klinik girişi | ${BRAND_NAME}` };

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Oturum bitince middleware buraya `?next=<yol>&neden=oturum` ile yönlendirir;
// form girişten sonra (güvenli yolsa) kaldığı sayfaya döner.
export default async function KlinikGirisPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  return <ClinicLoginForm next={firstParam(params.next) ?? null} reason={firstParam(params.neden) ?? null} />;
}
