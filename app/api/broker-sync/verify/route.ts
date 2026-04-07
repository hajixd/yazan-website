import { NextRequest, NextResponse } from "next/server";

import type { BrokerSyncVerifyRequest } from "../../../../lib/brokerSync";
import { verifyBrokerSyncConnection } from "../../../../lib/server/brokerSyncService";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: BrokerSyncVerifyRequest;

  try {
    body = (await request.json()) as BrokerSyncVerifyRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "The broker sync request body was invalid."
      },
      { status: 400 }
    );
  }

  if (!body?.draft) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing broker sync draft."
      },
      { status: 400 }
    );
  }

  const result = await verifyBrokerSyncConnection(body.draft, body.origin ?? null);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 400
  });
}
