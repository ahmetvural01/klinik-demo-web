import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { DEFAULT_THEME_ID } from "@/lib/theme-packages";

export const PLATFORM_THEME_CACHE_TAG = "platform-theme";

// PlatformTheme tek satırlık bir singleton (id sabit 1). Kök layout her
// istek için bunu okur; unstable_cache + tag sayesinde Superadmin'in tema
// değiştirmesi yeni bir build gerektirmeden anında yayılır (revalidateTag).
export const getActiveThemeId = unstable_cache(
  async (): Promise<string> => {
    try {
      const row = await prisma.platformTheme.findUnique({ where: { id: 1 }, select: { activeTheme: true } });
      return row?.activeTheme || DEFAULT_THEME_ID;
    } catch {
      return DEFAULT_THEME_ID;
    }
  },
  ["platform-active-theme"],
  { tags: [PLATFORM_THEME_CACHE_TAG] }
);
