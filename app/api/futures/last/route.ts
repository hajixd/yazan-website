import { NextResponse } from "next/server";
import {
  futuresAssets,
  getAssetBySymbol
} from "../../../../lib/futuresCatalog";
import { logDatabentoApiKeyFailure } from "../../../../lib/server/databentoAuth";

type DatabentoTradeRecord = {
  hd?: {
    ts_event?: string;
  };
  price?: string | number;
};

type LatestTradeMeta = {
  provider: string;
  dataset: string;
  schema: string;
  databentoSymbol: string;
  updatedAt: string;
};

type LatestTradeResponseBody = {
  symbol: string;
  price: number;
  time: number;
  meta: LatestTradeMeta;
};

const DATABENTO_HISTORICAL_URL = "https://hist.databento.com/v0/timeseries.get_range";
const DATABENTO_DATASET = "GLBX.MDP3";
const RECENT_TRADE_WINDOW_MS = 10 * 60_000;
const DATABENTO_RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const normalizeNumber = (value: string | number | undefined): number => {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : NaN;
};

const parseAvailableEndMs = (payload: string): number | null => {
  const availableEndMatch =
    payload.match(/available up to '([^']+)'/i) ??
    payload.match(/available end of dataset [^(]*\('([^']+)'\)/i);
  const availableEndMs = availableEndMatch ? Date.parse(availableEndMatch[1]) : NaN;

  return Number.isFinite(availableEndMs) ? availableEndMs : null;
};

const buildDatabentoUrl = (databentoSymbol: string, startMs: number, endMs: number) => {
  const url = new URL(DATABENTO_HISTORICAL_URL);

  url.searchParams.set("dataset", DATABENTO_DATASET);
  url.searchParams.set("symbols", databentoSymbol);
  url.searchParams.set("stype_in", "continuous");
  url.searchParams.set("schema", "trades");
  url.searchParams.set("start", new Date(startMs).toISOString());
  url.searchParams.set("end", new Date(endMs).toISOString());
  url.searchParams.set("encoding", "json");
  url.searchParams.set("pretty_px", "true");
  url.searchParams.set("pretty_ts", "true");

  return url;
};

const parseLatestTrade = (payload: string) => {
  const lines = payload.split("\n");
  let latestTrade: { price: number; time: number } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    try {
      const record = JSON.parse(line) as DatabentoTradeRecord;
      const time = record.hd?.ts_event ? Date.parse(record.hd.ts_event) : NaN;
      const price = normalizeNumber(record.price);

      if (!Number.isFinite(time) || !Number.isFinite(price)) {
        continue;
      }

      if (!latestTrade || time >= latestTrade.time) {
        latestTrade = { price, time };
      }
    } catch {
      continue;
    }
  }

  return latestTrade;
};

const buildDatabentoMeta = (
  databentoSymbol: string,
  updatedAt = new Date().toISOString()
): LatestTradeMeta => {
  return {
    provider: "Databento",
    dataset: DATABENTO_DATASET,
    schema: "trades",
    databentoSymbol,
    updatedAt
  };
};

const fetchDatabentoText = async (
  url: URL,
  authHeaders: { Authorization: string; Accept: string },
  attempts = 2
) => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: authHeaders,
        cache: "no-store"
      });
      const payload = await response.text();

      if (
        response.ok ||
        !DATABENTO_RETRYABLE_STATUSES.has(response.status) ||
        attempt >= attempts - 1
      ) {
        return { response, payload };
      }
    } catch (error) {
      lastError = error;

      if (attempt >= attempts - 1) {
        throw error;
      }
    }
  }

  throw (lastError instanceof Error ? lastError : new Error("Databento request failed."));
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = String(searchParams.get("symbol") || futuresAssets[0].symbol).toUpperCase();
  const asset = getAssetBySymbol(symbol);

  if (!futuresAssets.some((entry) => entry.symbol === symbol)) {
    return NextResponse.json({ error: "Unsupported futures symbol." }, { status: 400 });
  }

  const apiKey = process.env.DATABENTO_API_KEY || process.env.DATABENTO_KEY;
  const headers = {
    "Cache-Control": "no-store"
  };

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Missing DATABENTO_API_KEY. Add it to your environment before loading live trades."
      },
      {
        status: 503,
        headers
      }
    );
  }

  const endMs = Date.now();
  const startMs = endMs - RECENT_TRADE_WINDOW_MS;

  try {
    const authHeaders = {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      Accept: "application/json"
    };
    let activeStartMs = startMs;
    let activeEndMs = endMs;
    let { response, payload } = await fetchDatabentoText(
      buildDatabentoUrl(asset.databentoSymbol, activeStartMs, activeEndMs),
      authHeaders
    );

    if (!response.ok) {
      const availableEndMs = parseAvailableEndMs(payload);

      if (availableEndMs !== null && activeStartMs > availableEndMs) {
        activeEndMs = availableEndMs;
        activeStartMs = Math.max(0, activeEndMs - RECENT_TRADE_WINDOW_MS);
        ({ response, payload } = await fetchDatabentoText(
          buildDatabentoUrl(asset.databentoSymbol, activeStartMs, activeEndMs),
          authHeaders
        ));
      }
    }

    if (!response.ok) {
      logDatabentoApiKeyFailure("databento:last", {
        symbol: asset.databentoSymbol,
        status: response.status,
        message: payload
      });

      throw new Error(payload.slice(0, 240) || `Databento trade request failed with ${response.status}`);
    }

    const latestTrade = parseLatestTrade(payload);

    if (!latestTrade) {
      throw new Error("Databento returned no recent trades for this symbol.");
    }

    const responsePayload: LatestTradeResponseBody = {
      symbol: asset.symbol,
      price: latestTrade.price,
      time: latestTrade.time,
      meta: buildDatabentoMeta(asset.databentoSymbol)
    };

    return NextResponse.json(responsePayload, { headers });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch the latest Databento trade.";

    return NextResponse.json(
      {
        error: errorMessage
      },
      {
        status: 503,
        headers
      }
    );
  }
}
