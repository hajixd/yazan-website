import { NextResponse } from "next/server";
import {
  futuresAssets,
  getAssetBySymbol,
  type FutureAsset
} from "../../../../lib/futuresCatalog";
import { logDatabentoApiKeyFailure } from "../../../../lib/server/databentoAuth";
import { buildSimulatedLatestTrade } from "../../../../lib/simulatedFutures";

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
  fallback?: "cache" | "simulation";
  reason?: string;
};

type LatestTradeResponseBody = {
  symbol: string;
  price: number;
  time: number;
  meta: LatestTradeMeta;
  warning?: string;
};

type LatestTradeCacheEntry = {
  payload: LatestTradeResponseBody;
  cachedAt: number;
};

const DATABENTO_HISTORICAL_URL = "https://hist.databento.com/v0/timeseries.get_range";
const DATABENTO_DATASET = "GLBX.MDP3";
const RECENT_TRADE_WINDOW_MS = 10 * 60_000;
const DATABENTO_RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const globalForDatabentoTradeCache = globalThis as typeof globalThis & {
  __romanDatabentoLatestTradeCache?: Map<string, LatestTradeCacheEntry>;
};

const databentoLatestTradeCache =
  globalForDatabentoTradeCache.__romanDatabentoLatestTradeCache ??
  new Map<string, LatestTradeCacheEntry>();

if (!globalForDatabentoTradeCache.__romanDatabentoLatestTradeCache) {
  globalForDatabentoTradeCache.__romanDatabentoLatestTradeCache = databentoLatestTradeCache;
}

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

const buildSimulationTradePayload = (
  asset: FutureAsset,
  reason?: string
): LatestTradeResponseBody => {
  const latestTrade = buildSimulatedLatestTrade(asset, "15m");

  return {
    symbol: asset.symbol,
    price: latestTrade.price,
    time: latestTrade.time,
    meta: {
      provider: "Simulation",
      dataset: "local",
      schema: "simulated-trades",
      databentoSymbol: asset.symbol,
      updatedAt: new Date().toISOString(),
      fallback: "simulation",
      reason
    },
    warning: reason
  };
};

const storeLatestTradeCache = (asset: FutureAsset, payload: LatestTradeResponseBody) => {
  databentoLatestTradeCache.set(asset.symbol, {
    payload,
    cachedAt: Date.now()
  });
};

const buildCachedTradePayload = (
  asset: FutureAsset,
  reason?: string
): LatestTradeResponseBody | null => {
  const entry = databentoLatestTradeCache.get(asset.symbol);

  if (!entry) {
    return null;
  }

  return {
    ...entry.payload,
    meta: {
      ...buildDatabentoMeta(asset.databentoSymbol, new Date(entry.cachedAt).toISOString()),
      provider: "Databento Cache",
      fallback: "cache",
      reason
    },
    warning: reason
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
    return NextResponse.json(buildSimulationTradePayload(asset), { headers });
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

    storeLatestTradeCache(asset, responsePayload);

    return NextResponse.json(responsePayload, { headers });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch the latest Databento trade.";
    const cachedPayload = buildCachedTradePayload(asset, errorMessage);

    if (cachedPayload) {
      console.warn(
        `[databento:last] Serving cached trade for ${asset.symbol} after upstream failure: ${errorMessage}`
      );
      return NextResponse.json(cachedPayload, { headers });
    }

    console.warn(
      `[databento:last] Serving simulated trade for ${asset.symbol} after upstream failure: ${errorMessage}`
    );

    return NextResponse.json(buildSimulationTradePayload(asset, errorMessage), { headers });
  }
}
