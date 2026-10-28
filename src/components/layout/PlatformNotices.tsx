"use client";

import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { Callout } from "@/components/ui/Callout";
import { IconButton } from "@/components/ui/Button";
import { cachedGet } from "@/lib/client-cache";
import { scopedStorageKey } from "@/lib/scoped-client-storage";

type PlatformNotice = { id: string; text: string; endsAt?: string | null };

const NOTICES_URL = "/api/announcements";
/** Bakım bildirimi sık değişmez: 5 dakikada bir (ve sekmeye dönünce) tazelenir. */
const REFRESH_MS = 5 * 60_000;

function readDismissed(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Sistem sahibinin (Süperadmin > Duyurular) verdiği duyuru, ör. "28.08.2026
 * Çarşamba 13:00–15:00 arası sistem bakımı". Yalnız yayındaki duyuru varken her
 * sayfanın üstünde TEK satır görünür; yoksa hiçbir şey çizilmez. Kullanıcı
 * "Kapat" ile kendi ekranından kaldırır (bu tarayıcıda hatırlanır). Klinik içi
 * duyuru ve ekip mesajı yoktur.
 */
export function PlatformNotices({ scopeKey }: { scopeKey: string }) {
  const [notices, setNotices] = useState<PlatformNotice[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const storageKey = scopedStorageKey("platform-notices-dismissed", scopeKey);

  useEffect(() => {
    setDismissed(readDismissed(storageKey));
  }, [storageKey]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      cachedGet<PlatformNotice[]>(NOTICES_URL, REFRESH_MS)
        .then((data) => {
          if (!cancelled) setNotices(Array.isArray(data) ? data : []);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  const visible = notices.filter((notice) => !dismissed.includes(notice.id));
  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Depolama kapalıysa yalnız bu sayfa açıkken gizli kalır.
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {visible.map((notice) => (
        <Callout
          key={notice.id}
          tone="info"
          icon={Megaphone}
          compact
          inline
          role="status"
          action={<IconButton icon={X} title="Duyuruyu kapat" tone="ghost" size="sm" onClick={() => dismiss(notice.id)} />}
        >
          <span className="whitespace-pre-line break-words">{notice.text}</span>
        </Callout>
      ))}
    </div>
  );
}
