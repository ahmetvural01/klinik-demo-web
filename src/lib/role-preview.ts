export const ROLE_PREVIEW_COOKIE = "klinik_preview_role";
export const ROLE_PREVIEW_STORAGE = "dev-preview-role";

export const ROLE_PREVIEW_VALUES = ["YONETICI", "DOKTOR", "ASISTAN", "BANKO", "MUHASEBE"] as const;

export type RolePreview = (typeof ROLE_PREVIEW_VALUES)[number];

export function parseRolePreview(value?: string | null): RolePreview | null {
  return ROLE_PREVIEW_VALUES.includes(value as RolePreview) ? (value as RolePreview) : null;
}
