import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  return NextResponse.json({
    ok: true,
    provider: "tradesync",
    status: "ready"
  });
}

export async function POST(request: NextRequest) {
  let payload: unknown = null;

  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  console.log("[Trade Sync webhook] event received", {
    receivedAt: new Date().toISOString(),
    payload
  });

  return NextResponse.json({
    ok: true
  });
}
