"use client";

import { useLayoutEffect } from "react";

const FAST_API_CACHE_PREFIX = "panel-fast-api:v1:";

function clearFastApiCache() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (key.startsWith(FAST_API_CACHE_PREFIX) || key.startsWith("lab:orders:")) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Cache temizliği kritik akışı engellememeli.
  }
}

function installFastFetch() {
  if (typeof window === "undefined") return;
  const globalWindow = window as Window & {
    __ksFastFetchInstalled?: boolean;
    __ksOriginalFetch?: typeof fetch;
  };

  if (globalWindow.__ksFastFetchInstalled) return;
  globalWindow.__ksFastFetchInstalled = true;
  globalWindow.__ksOriginalFetch = globalWindow.fetch.bind(globalWindow);

  globalWindow.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const method = (request.method || "GET").toUpperCase();
    const response = await globalWindow.__ksOriginalFetch!(request, init);

    if (method !== "GET") {
      if (response.ok && new URL(request.url, window.location.origin).origin === window.location.origin) {
        clearFastApiCache();
      }
    }

    return response;
  };
}

export function PanelRouteWarmup() {
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    installFastFetch();
  }, []);

  return null;
}
