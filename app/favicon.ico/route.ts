import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  return new NextResponse(null, {
    status: 204
  });
}
