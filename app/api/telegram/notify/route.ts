import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type TelegramAlert = {
  id: string;
  title: string;
  body: string;
  tone: "up" | "down" | "neutral";
  link: string;
  symbol: string | null;
  tradeId: string | null;
  entityType: string | null;
  actionCode: string | null;
  occurredAt: number;
};

const MAX_EVENTS_PER_REQUEST = 8;
const TELEGRAM_DEDUPE_WINDOW_MS = 30 * 60_000;
const sentTelegramEventIds = new Map<string, number>();

const trimValue = (value: unknown, maxLength: number): string => {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
};

const normalizeTone = (value: unknown): TelegramAlert["tone"] => {
  return value === "up" || value === "down" || value === "neutral" ? value : "neutral";
};

const pruneSentTelegramEventIds = (now: number) => {
  for (const [id, sentAt] of sentTelegramEventIds) {
    if (now - sentAt > TELEGRAM_DEDUPE_WINDOW_MS) {
      sentTelegramEventIds.delete(id);
    }
  }
};

const normalizeTelegramAlert = (value: unknown): TelegramAlert | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const id = trimValue(raw.id, 160);
  const title = trimValue(raw.title, 180);
  const body = trimValue(raw.body, 700);

  if (!id || !title) {
    return null;
  }

  const occurredAt = Number(raw.occurredAt);

  return {
    id,
    title,
    body,
    tone: normalizeTone(raw.tone),
    link: trimValue(raw.link, 700) || "/",
    symbol: trimValue(raw.symbol, 80) || null,
    tradeId: trimValue(raw.tradeId, 120) || null,
    entityType: trimValue(raw.entityType, 80) || null,
    actionCode: trimValue(raw.actionCode, 120) || null,
    occurredAt: Number.isFinite(occurredAt) ? occurredAt : Date.now()
  };
};

const formatTelegramAlertMessage = (event: TelegramAlert, origin: string): string => {
  const lines = [
    "Roman Capital alert",
    "",
    event.title,
    event.body,
    `Tone: ${event.tone}`,
    event.symbol ? `Symbol: ${event.symbol}` : "",
    event.actionCode ? `Action: ${event.actionCode.replaceAll("_", " ")}` : "",
    event.tradeId ? `Trade: ${event.tradeId}` : "",
    `Time: ${new Date(event.occurredAt).toISOString()}`
  ].filter(Boolean);

  try {
    lines.push(`Open: ${new URL(event.link, origin).toString()}`);
  } catch {
    lines.push(`Open: ${origin}`);
  }

  return lines.join("\n").slice(0, 4096);
};

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (origin !== request.nextUrl.origin) {
    return NextResponse.json(
      {
        ok: false,
        error: "Telegram alert requests must come from this app."
      },
      { status: 403 }
    );
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!botToken || !chatId) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error: "Telegram notifications are not configured."
    });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "The Telegram notification request body was invalid."
      },
      { status: 400 }
    );
  }

  const rawEvents =
    body && typeof body === "object" && Array.isArray((body as { events?: unknown }).events)
      ? (body as { events: unknown[] }).events
      : [];
  const now = Date.now();
  const threadId = Number(process.env.TELEGRAM_MESSAGE_THREAD_ID);
  const messageThreadId = Number.isInteger(threadId) && threadId > 0 ? threadId : null;
  const events = rawEvents
    .slice(0, MAX_EVENTS_PER_REQUEST)
    .map(normalizeTelegramAlert)
    .filter((event): event is TelegramAlert => event != null);

  pruneSentTelegramEventIds(now);

  const pendingEvents = events.filter((event) => !sentTelegramEventIds.has(event.id));

  if (pendingEvents.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      skipped: events.length
    });
  }

  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const failures: string[] = [];

  for (const event of pendingEvents) {
    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: formatTelegramAlertMessage(event, request.nextUrl.origin),
        disable_web_page_preview: true,
        ...(messageThreadId ? { message_thread_id: messageThreadId } : {})
      })
    });

    if (response.ok) {
      sentTelegramEventIds.set(event.id, now);
    } else {
      failures.push(event.id);
    }
  }

  return NextResponse.json(
    {
      ok: failures.length === 0,
      configured: true,
      sent: pendingEvents.length - failures.length,
      failed: failures
    },
    { status: failures.length === 0 ? 200 : 502 }
  );
}
