import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Hakedişim: başlık + özet (ödenecek, bu ay) + aylık liste.
export default function Loading() {
  return <PageSkeleton headerAction={false} stats={2} body="table" rows={6} label="Hakediş yükleniyor" />;
}
