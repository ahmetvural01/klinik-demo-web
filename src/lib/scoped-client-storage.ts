"use client";

/**
 * Operational browser state must never be shared by two users, institutions
 * or branches in the same browser profile.
 */
export function scopedStorageKey(base: string, scopeKey: string) {
  const normalized = scopeKey.trim();
  if (!normalized) throw new Error("Scoped storage requires an authenticated session scope.");
  return `${base}:${normalized}`;
}

