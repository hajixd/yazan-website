import { NextResponse } from "next/server";
import { futuresAssets, getAssetBySymbol } from "../../../../lib/futuresCatalog";

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

const DATABENTO_HISTORICAL_URL = "https://hist.databento.com/v0/timeseries.get_range";
const DATABENTO_DATASET = "GLBX.MDP3";
const MAX_TARGET_COUNT = 2000;
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
    typeof beforeMs === "number" && Number.isFinite(beforeMs) ? Math.max(stepMs, beforeMs - 1) : Date.now();
  let endMs = requestedEndMs;
  let startMs = endMs - rawBars * stepMs;
  let response = await fetch(buildDatabentoUrl(databentoSymbol, source.schema, startMs, endMs), {
    headers: authHeaders,
    cache: "no-store"
  });
  let payload = await response.text();

  if (!response.ok) {
    const availableEndMatch = payload.match(/available up to '([^']+)'/i);
    const availableEndMs = availableEndMatch ? Date.parse(availableEndMatch[1]) : NaN;

    if (Number.isFinite(availableEndMs) && endMs > availableEndMs) {
      endMs = availableEndMs;
      startMs = endMs - rawBars * stepMs;
      response = await fetch(buildDatabentoUrl(databentoSymbol, source.schema, startMs, endMs), {
        headers: authHeaders,
        cache: "no-store"
      });
      payload = await response.text();
    }
  }

  if (!response.ok) {
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

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Missing DATABENTO_API_KEY. Add it in Vercel or your local .env.local file."
      },
      { status: 500 }
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

    return NextResponse.json(
      {
        symbol: asset.symbol,
        timeframe,
        candles,
        meta: {
          provider: "Databento",
          dataset: DATABENTO_DATASET,
          sourceTimeframe: targetSourceMap[timeframe].sourceTimeframe,
          databentoSymbol: asset.databentoSymbol,
          updatedAt: new Date().toISOString()
        }
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch Databento candles."
      },
      { status: 502 }
    );
  }
}
