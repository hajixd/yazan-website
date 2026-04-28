import { NextResponse } from "next/server";
import {
  futuresAssets,
  getAssetBySymbol
} from "../../../../lib/futuresCatalog";
import {
  buildStoredCandlesMeta,
  readStoredCandles,
  upsertStoredCandles,
  type StoredCandle
} from "../../../../lib/server/assetCandleStore";
import { logDatabentoApiKeyFailure } from "../../../../lib/server/databentoAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";

type Candle = {
  open: number;
  close: number;
  high: number;
  low: number;
  time: number;
  volume?: number;
};

type DatabentoRecord = {
  hd?: {
    ts_event?: string;
  };
  open?: string | number;
  high?: string | number;
  low?: string | number;
  close?: string | number;
  volume?: string | number;
};

type MarketFeedMeta = {
  provider: string;
  dataset: string;
  sourceTimeframe: string;
  databentoSymbol: string;
  updatedAt: string;
};

type CandlesResponseBody = {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  meta: MarketFeedMeta;
};

type DatabentoDatasetRangeResponse = {
  start?: string;
  end?: string;
  schema?: Record<
    string,
    | {
        start?: string;
        end?: string;
      }
    | undefined
  >;
};

type DatasetRangeWindow = {
  startMs: number;
  endMs: number;
};

type DatasetRangeCacheEntry = {
  overall: DatasetRangeWindow | null;
  schema: Record<string, DatasetRangeWindow>;
  cachedAt: number;
};

const DATABENTO_HISTORICAL_URL = "https://hist.databento.com/v0/timeseries.get_range";
const DATABENTO_DATASET_RANGE_URL = "https://hist.databento.com/v0/metadata.get_dataset_range";
const DATABENTO_DATASET = "GLBX.MDP3";
const MAX_TARGET_COUNT = 2_000;
const DATASET_RANGE_CACHE_TTL_MS = 5 * 60_000;
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

const RAW_FETCH_PADDING_BARS: Record<"1m" | "1H" | "1D", number> = {
  "1m": 180,
  "1H": 24,
  "1D": 8
};

const MAX_RAW_FETCH_BARS: Record<"1m" | "1H" | "1D", number> = {
  "1m": 12_000,
  "1H": 4_000,
  "1D": 2_500
};

const globalForDatabentoCandlesCache = globalThis as typeof globalThis & {
  __romanDatabentoDatasetRangeCache?: Map<string, DatasetRangeCacheEntry>;
};

const databentoDatasetRangeCache =
  globalForDatabentoCandlesCache.__romanDatabentoDatasetRangeCache ??
  new Map<string, DatasetRangeCacheEntry>();

if (!globalForDatabentoCandlesCache.__romanDatabentoDatasetRangeCache) {
  globalForDatabentoCandlesCache.__romanDatabentoDatasetRangeCache = databentoDatasetRangeCache;
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

const normalizeVolume = (value: string | number | undefined): number | undefined => {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : undefined;
};

const parseIsoTimestamp = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
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
        close: candle.close,
        ...(typeof candle.volume === "number" ? { volume: candle.volume } : {})
      };
      continue;
    }

    activeBucket.high = Math.max(activeBucket.high, candle.high);
    activeBucket.low = Math.min(activeBucket.low, candle.low);
    activeBucket.close = candle.close;
    activeBucket.volume = (activeBucket.volume ?? 0) + (candle.volume ?? 0);
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
      const volume = normalizeVolume(record.volume);

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
        close,
        ...(typeof volume === "number" ? { volume } : {})
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

const parseRangeWindow = (value: { start?: string; end?: string } | undefined): DatasetRangeWindow | null => {
  const startMs = parseIsoTimestamp(value?.start);
  const endMs = parseIsoTimestamp(value?.end);

  if (startMs === null || endMs === null || endMs <= startMs) {
    return null;
  }

  return {
    startMs,
    endMs
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

const fetchDatabentoDatasetRange = async (
  authHeaders: { Authorization: string; Accept: string }
): Promise<DatasetRangeCacheEntry> => {
  const cached = databentoDatasetRangeCache.get(DATABENTO_DATASET);

  if (cached && Date.now() - cached.cachedAt < DATASET_RANGE_CACHE_TTL_MS) {
    return cached;
  }

  const url = new URL(DATABENTO_DATASET_RANGE_URL);
  url.searchParams.set("dataset", DATABENTO_DATASET);

  const response = await fetch(url, {
    headers: authHeaders,
    cache: "no-store"
  });

  const payload = (await response.json()) as DatabentoDatasetRangeResponse;

  if (!response.ok) {
    throw new Error("Databento dataset range lookup failed.");
  }

  const nextEntry: DatasetRangeCacheEntry = {
    overall: parseRangeWindow(payload),
    schema: Object.fromEntries(
      Object.entries(payload.schema ?? {})
        .map(([schema, value]) => [schema, parseRangeWindow(value)])
        .filter((entry): entry is [string, DatasetRangeWindow] => entry[1] !== null)
    ),
    cachedAt: Date.now()
  };

  databentoDatasetRangeCache.set(DATABENTO_DATASET, nextEntry);

  return nextEntry;
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
  const rawPaddingBars = RAW_FETCH_PADDING_BARS[source.sourceTimeframe];
  const maxRawFetchBars = MAX_RAW_FETCH_BARS[source.sourceTimeframe];
  const authHeaders = {
    Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    Accept: "application/json"
  };
  const requestedEndMs =
    typeof beforeMs === "number" && Number.isFinite(beforeMs)
      ? Math.max(stepMs, beforeMs - 1)
      : Date.now();
  const datasetRange = await fetchDatabentoDatasetRange(authHeaders).catch(() => null);
  const schemaRange = datasetRange?.schema[source.schema] ?? datasetRange?.overall ?? null;

  let endMs = schemaRange ? Math.min(requestedEndMs, schemaRange.endMs) : requestedEndMs;

  if (schemaRange && endMs <= schemaRange.startMs) {
    return [];
  }

  let cursorEndMs = endMs;
  let rawCandles: Candle[] = [];
  let aggregated: Candle[] = [];

  while (cursorEndMs > stepMs && aggregated.length < targetCount) {
    const remainingCandles = targetCount - aggregated.length;
    const chunkRawBars = Math.min(
      maxRawFetchBars,
      Math.max(240, remainingCandles * source.aggregateFactor + rawPaddingBars)
    );
    const chunkStartMs = Math.max(
      schemaRange?.startMs ?? stepMs,
      cursorEndMs - chunkRawBars * stepMs
    );

    if (chunkStartMs >= cursorEndMs) {
      break;
    }

    let { response, payload } = await fetchDatabentoText(
      buildDatabentoUrl(databentoSymbol, source.schema, chunkStartMs, cursorEndMs),
      authHeaders
    );

    if (!response.ok) {
      const availableEndMs = parseAvailableEndMs(payload);

      if (availableEndMs !== null && cursorEndMs > availableEndMs) {
        cursorEndMs = availableEndMs;
        continue;
      }

      logDatabentoApiKeyFailure("databento:candles", {
        symbol: databentoSymbol,
        status: response.status,
        message: payload
      });

      throw new Error(payload.slice(0, 240) || `Databento request failed with ${response.status}`);
    }

    const nextChunk = parseDatabentoCandles(payload);

    if (nextChunk.length > 0) {
      rawCandles = mergeCandles(nextChunk, rawCandles);
      aggregated = aggregateCandles(rawCandles, timeframe).slice(-targetCount);
    }

    if (chunkStartMs <= (schemaRange?.startMs ?? stepMs)) {
      break;
    }

    cursorEndMs = chunkStartMs;
  }

  return aggregated;
};

const readFirebaseCandles = async (
  symbol: string,
  timeframe: Timeframe,
  targetCount: number,
  beforeMs: number | null
): Promise<StoredCandle[] | null> => {
  try {
    return await readStoredCandles(symbol, timeframe, targetCount, beforeMs ?? undefined);
  } catch (error) {
    console.warn(
      `[firebase-candles:${symbol}:${timeframe}] read failed`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
};

const cacheFirebaseCandles = (
  asset: ReturnType<typeof getAssetBySymbol>,
  timeframe: Timeframe,
  candles: Candle[],
  meta: MarketFeedMeta
) => {
  if (candles.length === 0) {
    return;
  }

  void upsertStoredCandles(asset, timeframe, candles, {
    provider: meta.provider,
    dataset: meta.dataset,
    sourceTimeframe: meta.sourceTimeframe,
    databentoSymbol: meta.databentoSymbol,
    schema: targetSourceMap[timeframe].schema,
    updatedAt: meta.updatedAt
  }).catch((error) => {
    console.warn(
      `[firebase-candles:${asset.symbol}:${timeframe}] write failed`,
      error instanceof Error ? error.message : error
    );
  });
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

  const cachedCandles = await readFirebaseCandles(symbol, timeframe, targetCount, beforeMs);
  const apiKey = process.env.DATABENTO_API_KEY || process.env.DATABENTO_KEY;
  const headers = {
    "Cache-Control": "no-store"
  };

  if (cachedCandles && cachedCandles.length > 0) {
    if (cachedCandles.length < targetCount && apiKey) {
      void fetchDatabentoCandles(
        asset.databentoSymbol,
        timeframe,
        targetCount,
        apiKey,
        beforeMs ?? undefined
      )
        .then((candles) => {
          cacheFirebaseCandles(asset, timeframe, candles, buildDatabentoMeta(timeframe, asset.databentoSymbol));
        })
        .catch((error) => {
          console.warn(
            `[databento-candles:${asset.symbol}:${timeframe}] background refresh failed`,
            error instanceof Error ? error.message : error
          );
        });
    }

    return NextResponse.json(
      {
        symbol: asset.symbol,
        timeframe,
        candles: cachedCandles,
        meta: buildStoredCandlesMeta(asset, timeframe)
      } satisfies CandlesResponseBody,
      { headers }
    );
  }

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing DATABENTO_API_KEY. Add it to your environment before loading market candles, or configure Firebase with cached candles."
      },
      {
        status: 503,
        headers
      }
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
    const meta = buildDatabentoMeta(timeframe, asset.databentoSymbol);
    const payload: CandlesResponseBody = {
      symbol: asset.symbol,
      timeframe,
      candles,
      meta
    };

    cacheFirebaseCandles(asset, timeframe, candles, meta);

    return NextResponse.json(payload, { headers });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch Databento candles.";

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
