import { NextRequest, NextResponse } from "next/server";

import type { TradovateTradesRequest } from "../../../../lib/brokerSync";
import { fetchTradovateTrades } from "../../../../lib/server/brokerSyncService";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: TradovateTradesRequest;

  try {
    body = (await request.json()) as TradovateTradesRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "The Tradovate trades request body was invalid."
      },
      { status: 400 }
    );
  }

  if (!body?.draft) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing Tradovate connection details."
      },
      { status: 400 }
    );
  }

  const result = await fetchTradovateTrades(body.draft, body.limit ?? 80);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 400
  });
}
