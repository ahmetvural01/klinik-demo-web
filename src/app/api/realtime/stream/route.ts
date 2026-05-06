import { NextResponse } from "next/server";
import { getRealtimeInstitutionVersion, requireAuth, subscribeRealtimeInstitution } from "@/lib/api";
import { metricDecrement, metricIncrement } from "@/lib/metrics";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) {
    // 204 tells EventSource clients to stop retrying on unauthorized sessions.
    return new NextResponse(null, { status: 204 });
  }

  metricIncrement("api_requests_total");
  const institutionId = auth.user.institutionId || null;
  let closed = false;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let lastKey = "";
      const onAbort = () => {
        stop();
      };

      const stop = () => {
        if (closed) return;
        closed = true;
        metricDecrement("realtime_connections_open");
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        if (unsubscribe) unsubscribe();
        request.signal.removeEventListener("abort", onAbort);
      };

      if (request.signal.aborted) {
        stop();
        return;
      }
      request.signal.addEventListener("abort", onAbort);

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          stop();
        }
      };

      const initialVersion = getRealtimeInstitutionVersion(institutionId);
      lastKey = `${institutionId || "global"}:${initialVersion}`;
      metricIncrement("realtime_connections_open");
      send("change", { key: lastKey, at: new Date().toISOString(), initial: true });

      unsubscribe = subscribeRealtimeInstitution(institutionId, ({ version, at }) => {
        const nextKey = `${institutionId || "global"}:${version}`;
        if (nextKey === lastKey) return;
        lastKey = nextKey;
        metricIncrement("realtime_events_total");
        send("change", { key: nextKey, at });
      });

      keepAliveTimer = setInterval(() => {
        send("ping", { at: new Date().toISOString() });
      }, 15000);
    },
    cancel() {
      closed = true;
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (unsubscribe) unsubscribe();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
