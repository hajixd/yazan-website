import { NextRequest, NextResponse } from "next/server";

import type { TradesyncTradesRequest } from "../../../../lib/brokerSync";
import { fetchTradesyncTrades } from "../../../../lib/server/brokerSyncService";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: TradesyncTradesRequest;

  try {
    body = (await request.json()) as TradesyncTradesRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "The TradeSyncer trades request body was invalid."
      },
      { status: 400 }
    );
  }

  if (!body?.draft) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing TradeSyncer connection details."
      },
      { status: 400 }
    );
  }

  const result = await fetchTradesyncTrades(body.draft, body.limit ?? 80);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 400
  });
}
