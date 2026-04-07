import { getAssetBySymbol, futuresAssets } from "../../../../lib/futuresCatalog";
import type { DatabentoLiveEvent } from "../../../../lib/databentoLive";
import { databentoLiveRelay } from "../../../../lib/server/databentoLiveRelay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const SSE_HEARTBEAT_INTERVAL_MS = 15_000;

const encodeSseEvent = (payload: DatabentoLiveEvent) => {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
};

const encodeSseHeartbeat = () => {
  return encoder.encode(`: ping\n\n`);
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = String(searchParams.get("symbol") || futuresAssets[0].symbol).toUpperCase();

  if (!futuresAssets.some((entry) => entry.symbol === symbol)) {
    return Response.json({ error: "Unsupported futures symbol." }, { status: 400 });
  }

  if (process.env.VERCEL) {
    return Response.json(
      {
        error: "Databento live bridge is unavailable in the Vercel runtime. Use trade polling fallback."
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
