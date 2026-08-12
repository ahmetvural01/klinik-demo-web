import { distributedRateLimit } from "@/lib/security-store";
export { getClientIpFromHeaders } from "@/lib/edge-rate-limit";

export async function checkRateLimit(key: string, limit: number, windowMs: number) {
  return distributedRateLimit(key, limit, windowMs);
}

