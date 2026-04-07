import { NextResponse } from "next/server";
import {
  futuresAssets,
  getAssetBySymbol,
  type FutureAsset
} from "../../../../lib/futuresCatalog";
import { logDatabentoApiKeyFailure } from "../../../../lib/server/databentoAuth";
import {
  generateSimulatedFuturesCandles,
  getSimulatedTimeframeMs,
  type SimulatedTimeframe
} from "../../../../lib/simulatedFutures";

type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";

type Candle = {
  open: number;
  close: number;
  high: number;
  low: number;
  time: number;
};

type DatabentoRecord = {
  hd?: {
    ts_event?: string;
  };
  open?: string | number;
  high?: string | number;
  low?: string | number;
  close?: string | number;
};

type MarketFeedMeta = {
  provider: string;
  dataset: string;
  sourceTimeframe: string;
  databentoSymbol: string;
  updatedAt: string;
  fallback?: "cache" | "simulation";
  reason?: string;
};

type CandlesResponseBody = {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  meta: MarketFeedMeta;
  warning?: string;
};

type CandlesCacheEntry = {
  candles: Candle[];
  meta: MarketFeedMeta;
  cachedAt: number;
};

const DATABENTO_HISTORICAL_URL = "https://hist.databento.com/v0/timeseries.get_range";
const DATABENTO_DATASET = "GLBX.MDP3";
const MAX_TARGET_COUNT = 2000;
const CANDLES_CACHE_LIMIT = 5000;
const DATABENTO_RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const TIMEFRAME_SET = new Set<Timeframe>(["1m", "5m", "15m", "1H", "4H", "1D", "1W"]);

const targetSourceMap: Record<
  Timeframe,
  {
    sourceTimeframe: "1m" | "1H" | "1D";
    schema: "ohlcv-1m" | "ohlcv-1h" | "ohlcv-1d";
    aggregateFactor: number;
  }
> = {
  "1m": { sourceTimeframe: "1m", schema: "ohlcv-1m", aggregateFactor: 1 },
  "5m": { sourceTimeframe: "1m", schema: "ohlcv-1m", aggregateFactor: 5 },
  "15m": { sourceTimeframe: "1m", schema: "ohlcv-1m", aggregateFactor: 15 },
  "1H": { sourceTimeframe: "1H", schema: "ohlcv-1h", aggregateFactor: 1 },
  "4H": { sourceTimeframe: "1H", schema: "ohlcv-1h", aggregateFactor: 4 },
  "1D": { sourceTimeframe: "1D", schema: "ohlcv-1d", aggregateFactor: 1 },
  "1W": { sourceTimeframe: "1D", schema: "ohlcv-1d", aggregateFactor: 5 }
};

const timeframeStepMs: Record<"1m" | "1H" | "1D", number> = {
  "1m": 60_000,
  "1H": 60 * 60_000,
  "1D": 24 * 60 * 60_000
};

const globalForDatabentoCandlesCache = globalThis as typeof globalThis & {
  __romanDatabentoCandlesCache?: Map<string, CandlesCacheEntry>;
};

const databentoCandlesCache =
  globalForDatabentoCandlesCache.__romanDatabentoCandlesCache ?? new Map<string, CandlesCacheEntry>();

if (!globalForDatabentoCandlesCache.__romanDatabentoCandlesCache) {
  globalForDatabentoCandlesCache.__romanDatabentoCandlesCache = databentoCandlesCache;
}

const parsePositiveInt = (value: string | null, fallback: number): number => {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseTimestampMs = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const numeric = Number(value);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeNumber = (value: string | number | undefined): number => {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : NaN;
};

const getWeekBucketUtc = (timestampMs: number): number => {
  const date = new Date(timestampMs);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const weekday = (date.getUTCDay() + 6) % 7;
  return midnight - weekday * 24 * 60 * 60_000;
};

const getBucketTime = (timestampMs: number, timeframe: Timeframe): number => {
  if (timeframe === "1W") {
    return getWeekBucketUtc(timestampMs);
  }

  if (timeframe === "4H") {
    const stepMs = 4 * 60 * 60_000;
    return Math.floor(timestampMs / stepMs) * stepMs;
  }

  if (timeframe === "15m") {
    const stepMs = 15 * 60_000;
    return Math.floor(timestampMs / stepMs) * stepMs;
  }

  if (timeframe === "5m") {
    const stepMs = 5 * 60_000;
    return Math.floor(timestampMs / stepMs) * stepMs;
  }

  return timestampMs;
};

const aggregateCandles = (candles: Candle[], timeframe: Timeframe): Candle[] => {
  if (timeframe === "1m" || timeframe === "1H" || timeframe === "1D") {
    return candles;
  }

  const aggregated: Candle[] = [];
  let activeBucket: Candle | null = null;

  for (const candle of candles) {
    const bucketTime = getBucketTime(candle.time, timeframe);

    if (!activeBucket || activeBucket.time !== bucketTime) {
      if (activeBucket) {
        aggregated.push(activeBucket);
      }

      activeBucket = {
        time: bucketTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
      };
      continue;
    }

    activeBucket.high = Math.max(activeBucket.high, candle.high);
    activeBucket.low = Math.min(activeBucket.low, candle.low);
    activeBucket.close = candle.close;
  }

  if (activeBucket) {
    aggregated.push(activeBucket);
  }

  return aggregated;
};

const mergeCandles = (olderCandles: Candle[], newerCandles: Candle[]) => {
  const merged: Candle[] = [];
  let olderIndex = 0;
  let newerIndex = 0;

  while (olderIndex < olderCandles.length || newerIndex < newerCandles.length) {
    const nextOlder = olderCandles[olderIndex];
    const nextNewer = newerCandles[newerIndex];
    let nextCandle: Candle | undefined;

    if (nextOlder && (!nextNewer || nextOlder.time < nextNewer.time)) {
      nextCandle = nextOlder;
      olderIndex += 1;
    } else if (nextNewer) {
      nextCandle = nextNewer;
      newerIndex += 1;

      if (nextOlder && nextOlder.time === nextNewer.time) {
        olderIndex += 1;
      }
    }

    if (!nextCandle) {
      continue;
    }

    if (merged[merged.length - 1]?.time === nextCandle.time) {
      merged[merged.length - 1] = nextCandle;
      continue;
    }

    merged.push(nextCandle);
  }

  return merged;
};

const parseDatabentoCandles = (payload: string): Candle[] => {
  const candles: Candle[] = [];
  const lines = payload.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    try {
      const record = JSON.parse(line) as DatabentoRecord;
      const timestamp = record.hd?.ts_event ? Date.parse(record.hd.ts_event) : NaN;
      const open = normalizeNumber(record.open);
      const high = normalizeNumber(record.high);
      const low = normalizeNumber(record.low);
      const close = normalizeNumber(record.close);

      if (
        !Number.isFinite(timestamp) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        continue;
      }

      candles.push({
        time: timestamp,
        open,
        high,
        low,
        close
      });
    } catch {
      continue;
    }
  }

  return candles.sort((left, right) => left.time - right.time);
};

const parseAvailableEndMs = (payload: string): number | null => {
  const availableEndMatch =
    payload.match(/available up to '([^']+)'/i) ??
    payload.match(/available end of dataset [^(]*\('([^']+)'\)/i);
  const availableEndMs = availableEndMatch ? Date.parse(availableEndMatch[1]) : NaN;

  return Number.isFinite(availableEndMs) ? availableEndMs : null;
};

const buildDatabentoUrl = (
  databentoSymbol: string,
  schema: "ohlcv-1m" | "ohlcv-1h" | "ohlcv-1d",
  startMs: number,
  endMs: number
) => {
  const url = new URL(DATABENTO_HISTORICAL_URL);

  url.searchParams.set("dataset", DATABENTO_DATASET);
  url.searchParams.set("symbols", databentoSymbol);
  url.searchParams.set("stype_in", "continuous");
  url.searchParams.set("schema", schema);
  url.searchParams.set("start", new Date(startMs).toISOString());
  url.searchParams.set("end", new Date(endMs).toISOString());
  url.searchParams.set("encoding", "json");
  url.searchParams.set("pretty_px", "true");
  url.searchParams.set("pretty_ts", "true");

  return url;
};

const buildDatabentoMeta = (
  timeframe: Timeframe,
  databentoSymbol: string,
  updatedAt = new Date().toISOString()
): MarketFeedMeta => {
  return {
    provider: "Databento",
    dataset: DATABENTO_DATASET,
    sourceTimeframe: targetSourceMap[timeframe].sourceTimeframe,
    databentoSymbol,
    updatedAt
  };
};

const buildSimulationCandlesPayload = (
  asset: FutureAsset,
  timeframe: Timeframe,
  targetCount: number,
  beforeMs?: number,
  reason?: string
): CandlesResponseBody => {
  const referenceNowMs =
    typeof beforeMs === "number" && Number.isFinite(beforeMs)
      ? Math.max(getSimulatedTimeframeMs(timeframe as SimulatedTimeframe), beforeMs - 1)
      : Date.now();

  return {
    symbol: asset.symbol,
    timeframe,
    candles: generateSimulatedFuturesCandles(
      asset,
      timeframe as SimulatedTimeframe,
      targetCount,
      referenceNowMs
    ),
    meta: {
      provider: "Simulation",
      dataset: "local",
      sourceTimeframe: timeframe,
      databentoSymbol: asset.symbol,
      updatedAt: new Date().toISOString(),
      fallback: "simulation",
      reason
    },
    warning: reason
  };
};

const candlesCacheKey = (symbol: string, timeframe: Timeframe) => {
  return `${symbol}:${timeframe}`;
};

const selectCandlesFromCache = (
  candles: Candle[],
  targetCount: number,
  beforeMs?: number
) => {
  const filtered =
    typeof beforeMs === "number" && Number.isFinite(beforeMs)
      ? candles.filter((candle) => candle.time < beforeMs)
      : candles;

  return filtered.slice(-targetCount);
};

const storeCandlesCache = (asset: FutureAsset, timeframe: Timeframe, candles: Candle[]) => {
  const key = candlesCacheKey(asset.symbol, timeframe);
  const existing = databentoCandlesCache.get(key);
  const merged = existing ? mergeCandles(existing.candles, candles) : candles;

  databentoCandlesCache.set(key, {
    candles: merged.slice(-CANDLES_CACHE_LIMIT),
    meta: buildDatabentoMeta(timeframe, asset.databentoSymbol),
    cachedAt: Date.now()
  });
};

const buildCachedCandlesPayload = (
  asset: FutureAsset,
  timeframe: Timeframe,
  targetCount: number,
  beforeMs?: number,
  reason?: string
): CandlesResponseBody | null => {
  const entry = databentoCandlesCache.get(candlesCacheKey(asset.symbol, timeframe));

  if (!entry) {
    return null;
  }

  const candles = selectCandlesFromCache(entry.candles, targetCount, beforeMs);

  if (candles.length === 0) {
    return null;
  }

  return {
    symbol: asset.symbol,
    timeframe,
    candles,
    meta: {
      ...buildDatabentoMeta(
        timeframe,
        entry.meta.databentoSymbol,
        new Date(entry.cachedAt).toISOString()
      ),
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

const fetchDatabentoCandles = async (
  databentoSymbol: string,
  timeframe: Timeframe,
  targetCount: number,
  apiKey: string,
  beforeMs?: number
): Promise<Candle[]> => {
  const source = targetSourceMap[timeframe];
  const stepMs = timeframeStepMs[source.sourceTimeframe];
  const rawBars = Math.max(120, Math.ceil(targetCount * source.aggregateFactor * 2.4));
  const authHeaders = {
    Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    Accept: "application/json"
  };
  const requestedEndMs =
    typeof beforeMs === "number" && Number.isFinite(beforeMs)
      ? Math.max(stepMs, beforeMs - 1)
      : Date.now();
  let endMs = requestedEndMs;
  let startMs = endMs - rawBars * stepMs;
  let { response, payload } = await fetchDatabentoText(
    buildDatabentoUrl(databentoSymbol, source.schema, startMs, endMs),
    authHeaders
  );

  if (!response.ok) {
    const availableEndMs = parseAvailableEndMs(payload);

    if (availableEndMs !== null && endMs > availableEndMs) {
      endMs = availableEndMs;
      startMs = endMs - rawBars * stepMs;
      ({ response, payload } = await fetchDatabentoText(
        buildDatabentoUrl(databentoSymbol, source.schema, startMs, endMs),
        authHeaders
      ));
    }
  }

  if (!response.ok) {
    logDatabentoApiKeyFailure("databento:candles", {
      symbol: databentoSymbol,
      status: response.status,
      message: payload
    });

    throw new Error(payload.slice(0, 240) || `Databento request failed with ${response.status}`);
  }

  const rawCandles = parseDatabentoCandles(payload);
  const aggregated = aggregateCandles(rawCandles, timeframe);
  return aggregated.slice(-targetCount);
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = String(searchParams.get("symbol") || futuresAssets[0].symbol).toUpperCase();
  const timeframeRaw = String(searchParams.get("timeframe") || "15m");
  const timeframe = TIMEFRAME_SET.has(timeframeRaw as Timeframe)
    ? (timeframeRaw as Timeframe)
    : "15m";
  const targetCount = Math.min(parsePositiveInt(searchParams.get("count"), 500), MAX_TARGET_COUNT);
  const beforeMs = parseTimestampMs(searchParams.get("before"));
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
      buildSimulationCandlesPayload(asset, timeframe, targetCount, beforeMs ?? undefined),
      { headers }
    );
  }

  try {
    const candles = await fetchDatabentoCandles(
      asset.databentoSymbol,
      timeframe,
      targetCount,
      apiKey,
      beforeMs ?? undefined
    );
    const payload: CandlesResponseBody = {
      symbol: asset.symbol,
      timeframe,
      candles,
      meta: buildDatabentoMeta(timeframe, asset.databentoSymbol)
    };

    storeCandlesCache(asset, timeframe, candles);

    return NextResponse.json(payload, { headers });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch Databento candles.";
    const cachedPayload = buildCachedCandlesPayload(
      asset,
      timeframe,
      targetCount,
      beforeMs ?? undefined,
      errorMessage
    );

    if (cachedPayload) {
      console.warn(
        `[databento:candles] Serving cached candles for ${asset.symbol} (${timeframe}) after upstream failure: ${errorMessage}`
      );
      return NextResponse.json(cachedPayload, { headers });
    }

    console.warn(
      `[databento:candles] Serving simulated candles for ${asset.symbol} (${timeframe}) after upstream failure: ${errorMessage}`
    );

    return NextResponse.json(
      buildSimulationCandlesPayload(
        asset,
        timeframe,
        targetCount,
        beforeMs ?? undefined,
        errorMessage
      ),
      { headers }
    );
  }
}
