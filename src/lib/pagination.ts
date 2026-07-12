function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export function parsePagination(
  searchParams: URLSearchParams,
  { defaultTake = 25, maxTake = 100 }: { defaultTake?: number; maxTake?: number } = {}
) {
  const page = parsePositiveInt(searchParams.get("page"), 1, 100000);
  const take = parsePositiveInt(searchParams.get("take") ?? searchParams.get("limit"), defaultTake, maxTake);
  const skipParam = Number.parseInt(searchParams.get("skip") ?? "", 10);
  const skip = Number.isFinite(skipParam) && skipParam >= 0 ? skipParam : (page - 1) * take;

  return {
    page: Math.floor(skip / take) + 1,
    take,
    skip,
    pageCount: (total: number) => Math.max(1, Math.ceil(total / take)),
  };
}
