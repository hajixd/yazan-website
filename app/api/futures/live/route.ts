import { getAssetBySymbol, futuresAssets } from "../../../../lib/futuresCatalog";
import type { DatabentoLiveEvent } from "../../../../lib/databentoLive";
import { databentoLiveRelay } from "../../../../lib/server/databentoLiveRelay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const SSE_HEARTBEAT_INTERVAL_MS = 15_000;
const BACKEND_STREAM_PROXY_TIMEOUT_MS = 2_500;

const encodeSseEvent = (payload: DatabentoLiveEvent) => {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
};

const encodeSseHeartbeat = () => {
  return encoder.encode(`: ping\n\n`);
};

const proxyHostedLiveStream = async (request: Request, symbol: string) => {
  const configuredBackendBase = (process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.BACKEND_URL ?? "").replace(
    /\/+$/,
    ""
  );

  if (!configuredBackendBase && !process.env.VERCEL) {
    return null;
  }

  const backendStreamUrl = configuredBackendBase
    ? new URL(`${configuredBackendBase}/futures/live`)
    : new URL("/api/backend/futures/live", request.url);

  backendStreamUrl.searchParams.set("symbol", symbol);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BACKEND_STREAM_PROXY_TIMEOUT_MS);

  try {
    const upstream = await fetch(backendStreamUrl, {
      headers: {
        Accept: "text/event-stream"
      },
      cache: "no-store",
      signal: controller.signal
    });

    if (!upstream.ok || !upstream.body) {
      if (upstream.status === 404 || upstream.status === 405) {
        return null;
      }

        return Response.json(
          {
            error: "Databento live stream backend is unavailable."
          },
        {
          status: upstream.status,
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const reader = upstream.body.getReader();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;

        const closeStream = async () => {
          if (closed) {
            return;
          }

          closed = true;

          try {
            await reader.cancel();
          } catch {
            // Ignore reader cancellation races during abort/cancel.
          }

          try {
            controller.close();
          } catch {
            // Ignore controller close races during abort/cancel.
          }
        };

        const abortListener = () => {
          void closeStream();
        };

        request.signal.addEventListener("abort", abortListener, { once: true });

        const pump = async () => {
          try {
            while (!closed) {
              const { done, value } = await reader.read();

              if (done) {
                break;
              }

              if (value) {
                controller.enqueue(value);
              }
            }
          } catch {
            // Let the client reconnect or fall back if the upstream stream breaks.
          } finally {
            request.signal.removeEventListener("abort", abortListener);

            try {
              reader.releaseLock();
            } catch {
              // Ignore lock release races during shutdown.
            }

            try {
              controller.close();
            } catch {
              // Ignore controller close races during shutdown.
            }
          }
        };

        void pump();
      },
      cancel() {
        void reader.cancel();
      }
    });

    return new Response(stream, {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no"
      }
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = String(searchParams.get("symbol") || futuresAssets[0].symbol).toUpperCase();

  if (!futuresAssets.some((entry) => entry.symbol === symbol)) {
    return Response.json({ error: "Unsupported futures symbol." }, { status: 400 });
  }

  const hostedStream = await proxyHostedLiveStream(request, symbol);

  if (hostedStream) {
    return hostedStream;
  }

  if (process.env.VERCEL) {
    return Response.json(
      {
        error: "Databento live stream backend is unavailable."
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  const asset = getAssetBySymbol(symbol);
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const heartbeatId = setInterval(() => {
        if (closed) {
          return;
        }

        controller.enqueue(encodeSseHeartbeat());
      }, SSE_HEARTBEAT_INTERVAL_MS);

      const unsubscribe = databentoLiveRelay.subscribe(asset, (event) => {
        if (closed) {
          return;
        }

        controller.enqueue(encodeSseEvent(event));
      });

      const closeStream = () => {
        if (closed) {
          return;
        }

        closed = true;
        clearInterval(heartbeatId);
        unsubscribe();

        try {
          controller.close();
        } catch {
          // Ignore controller close races during abort/cancel.
        }
      };

      request.signal.addEventListener("abort", closeStream, { once: true });
      cleanup = closeStream;
    },
    cancel() {
      cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8"
    }
  });
}
