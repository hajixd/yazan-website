"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type CandlestickData,
  type ColorType,
  type CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type LineStyle,
  type LogicalRange,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp
} from "lightweight-charts";
import { futuresAssets, getAssetBySymbol } from "../lib/futuresCatalog";

type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";
type PanelTab = "active" | "assets" | "models" | "history" | "actions";
type AccountRole = "Admin" | "User";

type Candle = {
  open: number;
  close: number;
  high: number;
  low: number;
  time: number;
};

type TradeResult = "Win" | "Loss";
type TradeSide = "Long" | "Short";

type HistoryItem = {
  id: string;
  symbol: string;
  side: TradeSide;
  result: TradeResult;
  pnlPct: number;
  pnlUsd: number;
  time: string;
  entryAt: string;
  exitAt: string;
  entryTime: UTCTimestamp;
  exitTime: UTCTimestamp;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  outcomePrice: number;
  units: number;
};

type ActionItem = {
  id: string;
  tradeId: string;
  symbol: string;
  label: string;
  details: string;
  time: string;
  timestamp: UTCTimestamp;
};

type NotificationTone = "up" | "down" | "neutral";

type NotificationItem = {
  id: string;
  title: string;
  details: string;
  time: string;
  timestamp: number;
  tone: NotificationTone;
  live?: boolean;
};

type ModelProfile = {
  id: string;
  name: string;
  kind: "Person" | "Model";
  accountNumber?: string;
  riskMin: number;
  riskMax: number;
  rrMin: number;
  rrMax: number;
  longBias: number;
  winRate: number;
};

type TradeBlueprint = {
  id: string;
  modelId: string;
  symbol: string;
  side: TradeSide;
  result: TradeResult;
  entryMs: number;
  exitMs: number;
  riskPct: number;
  rr: number;
  units: number;
};

type MultiTradeOverlaySeries = {
  profitZone: ISeriesApi<"Baseline">;
  lossZone: ISeriesApi<"Baseline">;
  entryLine: ISeriesApi<"Line">;
  targetLine: ISeriesApi<"Line">;
  stopLine: ISeriesApi<"Line">;
  pathLine: ISeriesApi<"Line">;
};

type HomeProps = {
  showcaseMode?: boolean;
};

type MarketFeedMeta = {
  provider: string;
  dataset: string;
  sourceTimeframe: string;
  databentoSymbol: string;
  updatedAt: string;
};

type MarketFeedResponse = {
  candles?: Candle[];
  meta?: MarketFeedMeta;
  error?: string;
};

type AccountSyncDraft = {
  accountLabel: string;
  broker: string;
  platform: string;
  accountNumber: string;
};

type AccountMenuPosition = {
  x: number;
  y: number;
};

type CandleRequestOptions = {
  signal?: AbortSignal;
  beforeMs?: number;
};

const ACCOUNT_GATE_STORAGE_KEY = "yazan-active-account";
const ADMIN_ACCESS_CODE = "12345";
const LIGHTWEIGHT_CHART_SOLID_BACKGROUND: ColorType = "solid" as ColorType;
const LIGHTWEIGHT_CHART_CROSSHAIR_NORMAL: CrosshairMode = 0;
const LIGHTWEIGHT_CHART_LINE_SOLID: LineStyle = 0;
const LIGHTWEIGHT_CHART_LINE_DOTTED: LineStyle = 1;
const LIGHTWEIGHT_CHART_LINE_SPARSE_DOTTED: LineStyle = 4;

const createPseudoAccountNumber = (seedText: string): string => {
  let seed = 0;

  for (let i = 0; i < seedText.length; i += 1) {
    seed = (seed * 33 + seedText.charCodeAt(i)) >>> 0;
  }

  return String(10_000_000 + (seed % 90_000_000));
};

const timeframes: Timeframe[] = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];

const timeframeMinutes: Record<Timeframe, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "1H": 60,
  "4H": 240,
  "1D": 1440,
  "1W": 10080
};

const timeframeVolatility: Record<Timeframe, number> = {
  "1m": 0.0018,
  "5m": 0.0026,
  "15m": 0.0038,
  "1H": 0.006,
  "4H": 0.009,
  "1D": 0.015,
  "1W": 0.025
};

const timeframeVisibleCount: Record<Timeframe, number> = {
  "1m": 150,
  "5m": 130,
  "15m": 115,
  "1H": 100,
  "4H": 88,
  "1D": 74,
  "1W": 62
};

const modelProfiles: ModelProfile[] = [
  {
    id: "yazan",
    name: "Yazan",
    kind: "Person",
    accountNumber: createPseudoAccountNumber("yazan"),
    riskMin: 0.0018,
    riskMax: 0.0048,
    rrMin: 1.35,
    rrMax: 2.6,
    longBias: 0.57,
    winRate: 0.61
  },
  {
    id: "ict",
    name: "ICT",
    kind: "Model",
    riskMin: 0.0015,
    riskMax: 0.004,
    rrMin: 1.6,
    rrMax: 3.1,
    longBias: 0.51,
    winRate: 0.55
  }
];

const sidebarTabs: Array<{ id: PanelTab; label: string }> = [
  { id: "active", label: "Active" },
  { id: "assets", label: "Assets" },
  { id: "models", label: "Models" },
  { id: "history", label: "History" },
  { id: "actions", label: "Action" }
];

const candleHistoryCountByTimeframe: Record<Timeframe, number> = {
  "1m": 1440,
  "5m": 1000,
  "15m": 500,
  "1H": 360,
  "4H": 320,
  "1D": 320,
  "1W": 208
};

const MAX_CHART_CANDLE_COUNT = 5000;
const CHART_BACKFILL_TRIGGER_BUFFER = 35;
const WATCHLIST_REFRESH_INTERVAL_MS = 15_000;
const WATCHLIST_FETCH_BATCH_SIZE = 3;
const MIN_MULTI_ASSET_TRADE_CANDLES = 40;
const DEFAULT_YAZAN_SYNC_DRAFT: AccountSyncDraft = {
  accountLabel: "Roman Capital Primary",
  broker: "TradeLocker",
  platform: "Rithmic",
  accountNumber: "YZ-884201"
};

const watchlistSnapshotCountByTimeframe: Record<Timeframe, number> = {
  "1m": 4,
  "5m": 4,
  "15m": 4,
  "1H": 4,
  "4H": 4,
  "1D": 4,
  "1W": 4
};

const multiAssetHistoryCountByTimeframe: Record<Timeframe, number> = {
  "1m": 360,
  "5m": 320,
  "15m": 260,
  "1H": 220,
  "4H": 200,
  "1D": 180,
  "1W": 120
};

const symbolTimeframeKey = (symbol: string, timeframe: Timeframe) => {
  return `${symbol}__${timeframe}`;
};

const getTimeframeMs = (timeframe: Timeframe): number => {
  return timeframeMinutes[timeframe] * 60_000;
};

const floorToTimeframe = (timestampMs: number, timeframe: Timeframe): number => {
  const step = getTimeframeMs(timeframe);
  return Math.floor(timestampMs / step) * step;
};

const SHOWCASE_REFERENCE_NOW_MS = Date.UTC(2026, 1, 24, 15, 30, 0);

const hashString = (value: string) => {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }

  return Math.abs(hash) + 1;
};

const createSeededRng = (seed: number) => {
  let state = seed % 2147483647;

  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 16807) % 2147483647;

    return (state - 1) / 2147483646;
  };
};

const formatPrice = (value: number): string => {
  if (value < 0.01) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 6,
      maximumFractionDigits: 6
    });
  }

  if (value < 1) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    });
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const formatDateTime = (timestampMs: number): string => {
  return new Date(timestampMs).toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  });
};

const formatUnits = (value: number): string => {
  if (value >= 100) {
    return value.toFixed(0);
  }

  if (value >= 10) {
    return value.toFixed(2);
  }

  return value.toFixed(4);
};

const formatUsd = (value: number): string => {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const formatSignedUsd = (value: number): string => {
  return `${value >= 0 ? "+" : "-"}$${formatUsd(Math.abs(value))}`;
};

const formatElapsed = (
  openedAtSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000)
): string => {
  const total = Math.max(0, nowSeconds - openedAtSeconds);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;
};

const formatClock = (timestampMs: number): string => {
  return new Date(timestampMs).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC"
  });
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const getExitMarkerPosition = (
  side: TradeSide,
  result: TradeResult
): "aboveBar" | "belowBar" => {
  if (side === "Long") {
    return result === "Win" ? "aboveBar" : "belowBar";
  }

  return result === "Win" ? "belowBar" : "aboveBar";
};

const evaluateTpSlPath = (
  candles: Candle[],
  side: TradeSide,
  entryIndex: number,
  targetPrice: number,
  stopPrice: number,
  toIndex = candles.length - 1
): { hit: boolean; hitIndex: number; outcomePrice: number; result: TradeResult | null } => {
  const safeEndIndex = Math.min(Math.max(entryIndex + 1, toIndex), candles.length - 1);
  let hitIndex = -1;
  let outcomePrice = candles[safeEndIndex]?.close ?? candles[entryIndex]?.close ?? 0;
  let result: TradeResult | null = null;

  for (let i = entryIndex + 1; i <= safeEndIndex; i += 1) {
    const candle = candles[i];

    if (!candle) {
      break;
    }

    const hitTarget = side === "Long" ? candle.high >= targetPrice : candle.low <= targetPrice;
    const hitStop = side === "Long" ? candle.low <= stopPrice : candle.high >= stopPrice;

    if (!hitTarget && !hitStop) {
      continue;
    }

    hitIndex = i;

    if (hitTarget && hitStop) {
      const targetFirst =
        Math.abs(candle.open - targetPrice) <= Math.abs(candle.open - stopPrice);
      result = targetFirst ? "Win" : "Loss";
      outcomePrice = targetFirst ? targetPrice : stopPrice;
    } else if (hitTarget) {
      result = "Win";
      outcomePrice = targetPrice;
    } else {
      result = "Loss";
      outcomePrice = stopPrice;
    }

    break;
  }

  return { hit: hitIndex >= 0, hitIndex, outcomePrice, result };
};

const toUtcTimestamp = (ms: number): UTCTimestamp => {
  return Math.floor(ms / 1000) as UTCTimestamp;
};

const parseTimeFromCrosshair = (time: Time): number | null => {
  if (typeof time === "number") {
    return time;
  }

  if (typeof time === "string") {
    const parsed = Date.parse(time);

    return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
  }

  if ("year" in time) {
    return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
  }

  return null;
};

const fetchFuturesCandles = async (
  symbol: string,
  timeframe: Timeframe,
  count: number,
  options: CandleRequestOptions = {}
): Promise<MarketFeedResponse> => {
  const params = new URLSearchParams({
    symbol,
    timeframe,
    count: String(count)
  });

  if (typeof options.beforeMs === "number" && Number.isFinite(options.beforeMs)) {
    params.set("before", String(Math.floor(options.beforeMs)));
  }

  const response = await fetch(`/api/futures/candles?${params.toString()}`, {
    cache: "no-store",
    signal: options.signal
  });
  const payload = (await response.json()) as MarketFeedResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Failed to load market candles.");
  }

  return payload;
};

const mergeCandles = (olderCandles: Candle[], newerCandles: Candle[]): Candle[] => {
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

const generateFakeCandles = (
  basePrice: number,
  symbol: string,
  timeframe: Timeframe,
  count = candleHistoryCountByTimeframe[timeframe],
  referenceNowMs = Date.now()
): Candle[] => {
  const series: Candle[] = [];
  const timeframeMs = getTimeframeMs(timeframe);
  const baseVolatility = timeframeVolatility[timeframe];
  const seed = hashString(`${symbol}-${timeframe}`);
  const rand = createSeededRng(seed);
  const latestAlignedTime = floorToTimeframe(referenceNowMs, timeframe);
  const startTime = latestAlignedTime - (count - 1) * timeframeMs;
  let close = basePrice * (0.9 + rand() * 0.22);
  let regimeBarsLeft = 0;
  let driftBias = 0;
  let volMultiplier = 1;
  let momentumCarry = 0;
  let regimeAnchor = basePrice;

  for (let i = 0; i < count; i += 1) {
    if (regimeBarsLeft <= 0) {
      regimeBarsLeft = 35 + Math.floor(rand() * 150);
      driftBias = (rand() - 0.5) * baseVolatility * (0.9 + rand() * 1.5);
      volMultiplier = 0.65 + rand() * 2.2;
      regimeAnchor = basePrice * (0.94 + rand() * 0.12);
    } else {
      regimeBarsLeft -= 1;
    }

    const open = close;
    const shock =
      rand() < 0.008
        ? (rand() > 0.5 ? 1 : -1) * baseVolatility * (4 + rand() * 7)
        : 0;
    const microNoise = (rand() - 0.5) * baseVolatility * 2.4 * volMultiplier;
    const trendNoise = Math.sin(i / (15 + rand() * 14)) * baseVolatility * 0.32;
    const meanReversion =
      ((regimeAnchor - open) / Math.max(basePrice, 0.000001)) * baseVolatility * 0.55;
    const returnMove = driftBias + microNoise + trendNoise + momentumCarry + shock + meanReversion;

    close = clamp(open * (1 + returnMove), basePrice * 0.72, basePrice * 1.34);
    momentumCarry = returnMove * 0.14;

    const wickVol = baseVolatility * (0.45 + rand() * 2.2) * volMultiplier;
    const high = Math.max(open, close) * (1 + wickVol * (0.35 + rand() * 0.8));
    const low = Math.max(
      0.000001,
      Math.min(open, close) * (1 - wickVol * (0.35 + rand() * 0.8))
    );

    series.push({
      open,
      close,
      high,
      low,
      time: startTime + i * timeframeMs
    });
  }

  return series;
};

const findCandleIndexAtOrBefore = (candles: Candle[], targetMs: number): number => {
  if (candles.length === 0) {
    return -1;
  }

  if (targetMs < candles[0].time) {
    return -1;
  }

  if (targetMs >= candles[candles.length - 1].time) {
    return candles.length - 1;
  }

  let left = 0;
  let right = candles.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const time = candles[mid].time;

    if (time === targetMs) {
      return mid;
    }

    if (time < targetMs) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return Math.max(0, right);
};

const generateTradeBlueprintsFromCandles = (
  model: ModelProfile,
  symbol: string,
  candles: Candle[],
  total = 54
): TradeBlueprint[] => {
  if (candles.length < 40) {
    return [];
  }

  const rand = createSeededRng(
    hashString(
      `blueprints-${model.id}-${symbol}-${candles[0]?.time ?? 0}-${candles[candles.length - 1]?.time ?? 0}`
    )
  );
  const blueprints: TradeBlueprint[] = [];
  const latestExitIndex = Math.max(12, candles.length - 2);
  const tradeCount = Math.min(total, Math.max(18, Math.floor(candles.length / 10)));
  const spacing = Math.max(3, Math.floor((latestExitIndex - 12) / Math.max(1, tradeCount)));

  for (let i = 0; i < tradeCount; i += 1) {
    const side: TradeSide = rand() <= model.longBias ? "Long" : "Short";
    const result: TradeResult = rand() <= model.winRate ? "Win" : "Loss";
    const rr = model.rrMin + rand() * (model.rrMax - model.rrMin);
    const riskPct = model.riskMin + rand() * (model.riskMax - model.riskMin);
    const jitter = Math.floor(rand() * Math.max(2, Math.floor(spacing * 0.45)));
    const exitIndex = Math.max(14, latestExitIndex - i * spacing - jitter);
    const holdBars = Math.max(4, Math.min(36, 4 + Math.floor(rand() * Math.max(5, spacing * 1.4))));
    const entryIndex = Math.max(8, exitIndex - holdBars);
    const anchorPrice = candles[entryIndex]?.close ?? candles[exitIndex]?.close ?? 1;
    const units = Math.max(0.25, 1200 / Math.max(1, anchorPrice)) * (0.65 + rand() * 1.35);

    if (!candles[entryIndex] || !candles[exitIndex] || exitIndex <= entryIndex) {
      continue;
    }

    blueprints.push({
      id: `${model.id}-t${String(i + 1).padStart(2, "0")}`,
      modelId: model.id,
      symbol,
      side,
      result,
      entryMs: candles[entryIndex].time,
      exitMs: candles[exitIndex].time,
      riskPct,
      rr,
      units
    });
  }

  return blueprints.sort((a, b) => b.exitMs - a.exitMs);
};

const buildHistoryRowsFromCandles = (
  candles: Candle[],
  tradeBlueprints: TradeBlueprint[]
): HistoryItem[] => {
  const rows: HistoryItem[] = [];

  if (candles.length < 16 || tradeBlueprints.length === 0) {
    return rows;
  }

  for (const blueprint of tradeBlueprints) {
    const entryIndex = findCandleIndexAtOrBefore(candles, blueprint.entryMs);
    const rawExitIndex = findCandleIndexAtOrBefore(candles, blueprint.exitMs);

    if (entryIndex < 0 || rawExitIndex < 0) {
      continue;
    }

    const exitIndex = Math.min(candles.length - 1, Math.max(entryIndex + 1, rawExitIndex));

    if (exitIndex <= entryIndex) {
      continue;
    }

    const entryPrice = candles[entryIndex].close;
    const rand = createSeededRng(hashString(`mapped-${blueprint.id}`));
    let atr = 0;
    let atrCount = 0;

    for (let i = Math.max(1, entryIndex - 20); i <= entryIndex; i += 1) {
      atr += candles[i].high - candles[i].low;
      atrCount += 1;
    }

    atr /= Math.max(1, atrCount);

    const riskPerUnit = Math.max(
      entryPrice * blueprint.riskPct,
      atr * (0.6 + rand() * 0.6),
      entryPrice * 0.0009
    );
    const stopPrice =
      blueprint.side === "Long"
        ? Math.max(0.000001, entryPrice - riskPerUnit)
        : entryPrice + riskPerUnit;
    const targetPrice =
      blueprint.side === "Long"
        ? entryPrice + riskPerUnit * blueprint.rr
        : Math.max(0.000001, entryPrice - riskPerUnit * blueprint.rr);
    const path = evaluateTpSlPath(
      candles,
      blueprint.side,
      entryIndex,
      targetPrice,
      stopPrice,
      exitIndex
    );

    const resolvedExitIndex = path.hit ? path.hitIndex : exitIndex;
    const rawOutcomePrice = path.hit ? path.outcomePrice : candles[resolvedExitIndex].close;
    const outcomePrice = Math.max(0.000001, rawOutcomePrice);
    const result: TradeResult = path.hit
      ? (path.result ?? "Loss")
      : blueprint.side === "Long"
        ? outcomePrice >= entryPrice
          ? "Win"
          : "Loss"
        : outcomePrice <= entryPrice
          ? "Win"
          : "Loss";
    const pnlPct =
      blueprint.side === "Long"
        ? ((outcomePrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - outcomePrice) / entryPrice) * 100;
    const pnlUsd =
      blueprint.side === "Long"
        ? (outcomePrice - entryPrice) * blueprint.units
        : (entryPrice - outcomePrice) * blueprint.units;

    rows.push({
      id: blueprint.id,
      symbol: blueprint.symbol,
      side: blueprint.side,
      result,
      pnlPct,
      pnlUsd,
      entryTime: toUtcTimestamp(candles[entryIndex].time),
      exitTime: toUtcTimestamp(candles[resolvedExitIndex].time),
      entryPrice,
      targetPrice,
      stopPrice,
      outcomePrice,
      units: blueprint.units,
      entryAt: formatDateTime(candles[entryIndex].time),
      exitAt: formatDateTime(candles[resolvedExitIndex].time),
      time: formatDateTime(candles[resolvedExitIndex].time)
    });
  }

  return rows;
};

const TabIcon = ({ tab }: { tab: PanelTab }) => {
  if (tab === "active") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      </svg>
    );
  }

  if (tab === "assets") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <path d="M4 17l4-5 3 3 5-7 4 9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (tab === "models") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <circle cx="8" cy="9" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="16.2" cy="8.4" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4.5 17.8c.6-2 2-3.1 3.5-3.1h.1c1.6 0 2.9 1.1 3.5 3.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12.8 17.4c.5-1.6 1.6-2.5 2.9-2.5h.1c1.4 0 2.4.9 2.9 2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  if (tab === "history") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <path d="M6 7v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M7.5 16.5a7 7 0 1 0-1.5-4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (tab === "actions") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <path d="M7 6h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 12h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 18h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 4l2.2 4.8L19 10l-3.6 3.3.9 4.7-4.3-2.4-4.3 2.4.9-4.7L5 10l4.8-1.2L12 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
};

export default function TradingTerminal({ showcaseMode = false }: HomeProps = {}) {
  const referenceNowMs = useMemo(() => {
    if (showcaseMode) {
      return SHOWCASE_REFERENCE_NOW_MS;
    }

    return floorToTimeframe(Date.now(), "1m");
  }, [showcaseMode]);
  const [accountGateReady, setAccountGateReady] = useState(showcaseMode);
  const [activeAccountRole, setActiveAccountRole] = useState<AccountRole | null>(
    showcaseMode ? "User" : null
  );
  const [accountEntryMode, setAccountEntryMode] = useState<AccountRole | null>(null);
  const [adminCodeInput, setAdminCodeInput] = useState("");
  const [accountAccessError, setAccountAccessError] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState(futuresAssets[0].symbol);
  const [selectedModelId, setSelectedModelId] = useState(modelProfiles[0].id);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("15m");
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState<PanelTab>("active");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [chartSimulationEnabled, setChartSimulationEnabled] = useState(true);
  const [showAllTradesOnChart, setShowAllTradesOnChart] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [seenNotificationIds, setSeenNotificationIds] = useState<string[]>([]);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [seriesMap, setSeriesMap] = useState<Record<string, Candle[]>>({});
  const [watchlistSeriesMap, setWatchlistSeriesMap] = useState<Record<string, Candle[]>>({});
  const [timeframePreviewMap, setTimeframePreviewMap] = useState<Record<string, Candle[]>>({});
  const [marketFeedMeta, setMarketFeedMeta] = useState<MarketFeedMeta | null>(null);
  const [marketStatus, setMarketStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [marketError, setMarketError] = useState<string | null>(null);
  const [chartReadyVersion, setChartReadyVersion] = useState(0);
  const [yazanAccount, setYazanAccount] = useState<AccountSyncDraft | null>(DEFAULT_YAZAN_SYNC_DRAFT);
  const [showYazanSyncDraft, setShowYazanSyncDraft] = useState(false);
  const [yazanSyncDraft, setYazanSyncDraft] = useState<AccountSyncDraft>(DEFAULT_YAZAN_SYNC_DRAFT);
  const [showYazanAccountMenu, setShowYazanAccountMenu] = useState(false);
  const [yazanAccountMenuPosition, setYazanAccountMenuPosition] = useState<AccountMenuPosition>({
    x: 0,
    y: 0
  });

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const countdownOverlayRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const tradeProfitZoneRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const tradeLossZoneRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const tradeEntryLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const tradeTargetLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const tradeStopLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const tradePathLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const multiTradeSeriesRef = useRef<MultiTradeOverlaySeries[]>([]);
  const selectionRef = useRef<string>("");
  const focusTradeIdRef = useRef<string | null>(null);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const yazanAccountMenuRef = useRef<HTMLDivElement | null>(null);
  const adminCodeInputRef = useRef<HTMLInputElement | null>(null);
  const watchlistSeriesMapRef = useRef<Record<string, Candle[]>>({});
  const currentSelectedKeyRef = useRef<string>("");
  const chartBackfillInFlightRef = useRef<Record<string, boolean>>({});
  const chartBackfillExhaustedRef = useRef<Record<string, boolean>>({});
  const pendingVisibleRangeShiftRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (showcaseMode) {
      return;
    }

    try {
      const storedRole = window.sessionStorage.getItem(ACCOUNT_GATE_STORAGE_KEY);

      if (storedRole === "Admin" || storedRole === "User") {
        setActiveAccountRole(storedRole);
      }
    } finally {
      setAccountGateReady(true);
    }
  }, [showcaseMode]);

  const selectedAsset = useMemo(() => {
    return getAssetBySymbol(selectedSymbol);
  }, [selectedSymbol]);
  const selectedModel = useMemo(() => {
    return modelProfiles.find((model) => model.id === selectedModelId) ?? modelProfiles[0];
  }, [selectedModelId]);

  const selectedKey = symbolTimeframeKey(selectedSymbol, selectedTimeframe);

  useEffect(() => {
    setHoveredTime(null);
  }, [selectedKey]);

  useEffect(() => {
    currentSelectedKeyRef.current = selectedKey;
    chartBackfillInFlightRef.current[selectedKey] = false;
    chartBackfillExhaustedRef.current[selectedKey] = false;
    delete pendingVisibleRangeShiftRef.current[selectedKey];
  }, [selectedKey]);

  useEffect(() => {
    if (showcaseMode) {
      chartBackfillInFlightRef.current[selectedKey] = false;
      chartBackfillExhaustedRef.current[selectedKey] = false;
      setSeriesMap((prev) => ({
        ...prev,
        [selectedKey]: generateFakeCandles(
          selectedAsset.basePrice,
          selectedSymbol,
          selectedTimeframe,
          candleHistoryCountByTimeframe[selectedTimeframe],
          referenceNowMs
        )
      }));
      setMarketFeedMeta({
        provider: "Simulation",
        dataset: "local",
        sourceTimeframe: selectedTimeframe,
        databentoSymbol: selectedSymbol,
        updatedAt: new Date(referenceNowMs).toISOString()
      });
      setMarketStatus("ready");
      setMarketError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    chartBackfillInFlightRef.current[selectedKey] = false;
    chartBackfillExhaustedRef.current[selectedKey] = false;
    delete pendingVisibleRangeShiftRef.current[selectedKey];
    setMarketStatus("loading");
    setMarketError(null);

    fetchFuturesCandles(
      selectedSymbol,
      selectedTimeframe,
      candleHistoryCountByTimeframe[selectedTimeframe],
      { signal: controller.signal }
    )
      .then((payload) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        const nextCandles = Array.isArray(payload.candles) ? payload.candles : [];

        if (nextCandles.length === 0) {
          throw new Error("Databento returned no candles for this contract.");
        }

        setSeriesMap((prev) => ({
          ...prev,
          [selectedKey]: nextCandles
        }));
        chartBackfillExhaustedRef.current[selectedKey] =
          nextCandles.length >= MAX_CHART_CANDLE_COUNT;
        setMarketFeedMeta(payload.meta ?? null);
        setMarketStatus("ready");
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        setMarketStatus("error");
        setMarketError(error instanceof Error ? error.message : "Failed to load market candles.");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    referenceNowMs,
    selectedAsset.basePrice,
    selectedKey,
    selectedSymbol,
    selectedTimeframe,
    showcaseMode
  ]);

  useEffect(() => {
    watchlistSeriesMapRef.current = watchlistSeriesMap;
  }, [watchlistSeriesMap]);

  useEffect(() => {
    if (showcaseMode) {
      const next: Record<string, Candle[]> = {};

      for (const asset of futuresAssets) {
        const key = symbolTimeframeKey(asset.symbol, selectedTimeframe);
        next[key] = generateFakeCandles(
          asset.basePrice,
          asset.symbol,
          selectedTimeframe,
          multiAssetHistoryCountByTimeframe[selectedTimeframe],
          referenceNowMs
        );
      }

      setWatchlistSeriesMap(next);
      return;
    }

    let cancelled = false;
    let refreshInFlight = false;
    const activeControllers = new Set<AbortController>();
    const historyCount = multiAssetHistoryCountByTimeframe[selectedTimeframe];
    const snapshotCount = watchlistSnapshotCountByTimeframe[selectedTimeframe];

    const loadWatchlistCandles = async () => {
      if (refreshInFlight || cancelled) {
        return;
      }

      refreshInFlight = true;
      const nextResults = new Map<string, Candle[]>();

      try {
        for (let start = 0; start < futuresAssets.length; start += WATCHLIST_FETCH_BATCH_SIZE) {
          const batch = futuresAssets.slice(start, start + WATCHLIST_FETCH_BATCH_SIZE);
          const batchControllers = batch.map(() => new AbortController());

          batchControllers.forEach((controller) => activeControllers.add(controller));

          try {
            const results = await Promise.allSettled(
              batch.map(async (asset, index) => {
                const key = symbolTimeframeKey(asset.symbol, selectedTimeframe);
                const existing = watchlistSeriesMapRef.current[key] ?? [];
                const requestCount =
                  existing.length < MIN_MULTI_ASSET_TRADE_CANDLES ? historyCount : snapshotCount;
                const payload = await fetchFuturesCandles(asset.symbol, selectedTimeframe, requestCount, {
                  signal: batchControllers[index].signal
                });

                return {
                  symbol: asset.symbol,
                  candles: Array.isArray(payload.candles) ? payload.candles : []
                };
              })
            );

            if (cancelled) {
              return;
            }

            results.forEach((result) => {
              if (result.status === "fulfilled" && result.value.candles.length > 0) {
                nextResults.set(result.value.symbol, result.value.candles);
              }
            });
          } finally {
            batchControllers.forEach((controller) => activeControllers.delete(controller));
          }
        }

        setWatchlistSeriesMap((prev) => {
          const next = { ...prev };

          nextResults.forEach((candles, symbol) => {
            const key = symbolTimeframeKey(symbol, selectedTimeframe);
            const existing = prev[key] ?? [];
            const merged =
              existing.length === 0 || candles.length >= historyCount
                ? candles
                : mergeCandles(existing, candles).slice(-historyCount);

            next[key] = merged;
          });

          watchlistSeriesMapRef.current = next;

          return next;
        });
      } finally {
        refreshInFlight = false;
      }
    };

    void loadWatchlistCandles();
    const intervalId = window.setInterval(() => {
      void loadWatchlistCandles();
    }, WATCHLIST_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      activeControllers.forEach((controller) => controller.abort());
      activeControllers.clear();
    };
  }, [referenceNowMs, selectedTimeframe, showcaseMode]);

  useEffect(() => {
    if (showcaseMode) {
      setTimeframePreviewMap(() => {
        const next: Record<string, Candle[]> = {};

        for (const timeframe of timeframes) {
          const key = symbolTimeframeKey(selectedSymbol, timeframe);
          next[key] = generateFakeCandles(
            selectedAsset.basePrice,
            selectedSymbol,
            timeframe,
            watchlistSnapshotCountByTimeframe[timeframe],
            referenceNowMs
          );
        }

        return next;
      });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    Promise.allSettled(
      timeframes.map(async (timeframe) => {
        const payload = await fetchFuturesCandles(
          selectedSymbol,
          timeframe,
          watchlistSnapshotCountByTimeframe[timeframe],
          { signal: controller.signal }
        );

        return {
          timeframe,
          candles: Array.isArray(payload.candles) ? payload.candles : []
        };
      })
    ).then((results) => {
      if (cancelled || controller.signal.aborted) {
        return;
      }

      setTimeframePreviewMap((prev) => {
        const next = { ...prev };

        results.forEach((result, index) => {
          const timeframe = timeframes[index];
          const key = symbolTimeframeKey(selectedSymbol, timeframe);

          if (result.status === "fulfilled" && result.value.candles.length > 0) {
            next[key] = result.value.candles;
          }
        });

        return next;
      });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [referenceNowMs, selectedAsset.basePrice, selectedSymbol, showcaseMode]);

  const loadedSelectedCandles = seriesMap[selectedKey];
  const selectedCandles = useMemo(() => loadedSelectedCandles ?? [], [loadedSelectedCandles]);

  const marketCandlesBySymbol = useMemo<Record<string, Candle[]>>(() => {
    const next: Record<string, Candle[]> = {};

    for (const asset of futuresAssets) {
      const key = symbolTimeframeKey(asset.symbol, selectedTimeframe);
      const chartCandles = seriesMap[key] ?? [];
      const backgroundCandles = watchlistSeriesMap[key] ?? [];
      next[asset.symbol] = mergeCandles(chartCandles, backgroundCandles);
    }

    return next;
  }, [selectedTimeframe, seriesMap, watchlistSeriesMap]);

  const candleByUnix = useMemo(() => {
    const map = new Map<number, Candle>();

    for (const candle of selectedCandles) {
      map.set(toUtcTimestamp(candle.time), candle);
    }

    return map;
  }, [selectedCandles]);

  const latestCandle = selectedCandles[selectedCandles.length - 1] ?? null;
  const previousCandle =
    selectedCandles.length > 1 ? selectedCandles[selectedCandles.length - 2] : latestCandle;

  const quoteChange =
    latestCandle && previousCandle && previousCandle.close > 0
      ? ((latestCandle.close - previousCandle.close) / previousCandle.close) * 100
      : null;

  const hoveredCandle = latestCandle
    ? hoveredTime
      ? candleByUnix.get(hoveredTime) ?? latestCandle
      : latestCandle
    : null;

  const hoveredChange =
    hoveredCandle && hoveredCandle.open > 0
      ? ((hoveredCandle.close - hoveredCandle.open) / hoveredCandle.open) * 100
      : null;

  const watchlistRows = useMemo(() => {
    return futuresAssets.map((asset) => {
      const list = marketCandlesBySymbol[asset.symbol] ?? [];
      const last = list[list.length - 1];
      const prev = list[list.length - 2] ?? last;
      const change =
        last && prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null;

      return {
        ...asset,
        lastPrice: last?.close ?? null,
        change
      };
    });
  }, [marketCandlesBySymbol]);

  const historyRows = useMemo(() => {
    if (!chartSimulationEnabled) {
      return [];
    }

    const rows: HistoryItem[] = [];

    for (const asset of futuresAssets) {
      const list = marketCandlesBySymbol[asset.symbol] ?? [];

      if (list.length < 16) {
        continue;
      }

      const tradeBlueprints = generateTradeBlueprintsFromCandles(
        selectedModel,
        asset.symbol,
        list,
        showcaseMode ? 42 : 54
      );

      rows.push(...buildHistoryRowsFromCandles(list, tradeBlueprints));
    }

    const byRecent = rows.sort((a, b) => Number(b.exitTime) - Number(a.exitTime)).slice(0, 90);

    if (!showcaseMode) {
      return byRecent.slice(0, 60);
    }

    return byRecent
      .map((row) => {
        const outcomePrice = row.targetPrice;
        const pnlPct =
          row.side === "Long"
            ? ((outcomePrice - row.entryPrice) / row.entryPrice) * 100
            : ((row.entryPrice - outcomePrice) / row.entryPrice) * 100;
        const pnlUsd =
          row.side === "Long"
            ? (outcomePrice - row.entryPrice) * row.units
            : (row.entryPrice - outcomePrice) * row.units;

        return {
          ...row,
          result: "Win" as const,
          outcomePrice,
          pnlPct,
          pnlUsd
        };
      })
      .sort((a, b) => {
        if (b.pnlPct !== a.pnlPct) {
          return b.pnlPct - a.pnlPct;
        }

        return Number(b.exitTime) - Number(a.exitTime);
      })
      .slice(0, 48);
  }, [chartSimulationEnabled, marketCandlesBySymbol, selectedModel, showcaseMode]);

  const selectedHistoryTrade = useMemo(() => {
    if (!selectedHistoryId) {
      return null;
    }

    return historyRows.find((row) => row.id === selectedHistoryId) ?? null;
  }, [historyRows, selectedHistoryId]);

  const currentSymbolHistoryRows = useMemo(() => {
    return historyRows.filter((row) => row.symbol === selectedSymbol);
  }, [historyRows, selectedSymbol]);

  const activeTrade = useMemo(() => {
    if (!chartSimulationEnabled) {
      return null;
    }

    return currentSymbolHistoryRows[0] ?? null;
  }, [chartSimulationEnabled, currentSymbolHistoryRows]);

  const activeTradeDuration = useMemo(() => {
    if (!activeTrade) {
      return null;
    }

    return formatElapsed(Number(activeTrade.entryTime), Number(activeTrade.exitTime));
  }, [activeTrade]);

  const activeTradeRiskReward = useMemo(() => {
    if (!activeTrade) {
      return null;
    }

    return (
      Math.abs(activeTrade.targetPrice - activeTrade.entryPrice) /
      Math.max(0.000001, Math.abs(activeTrade.entryPrice - activeTrade.stopPrice))
    );
  }, [activeTrade]);

  const activeTradeShownOnChart =
    !!activeTrade &&
    !showAllTradesOnChart &&
    selectedHistoryId === activeTrade.id &&
    activeTrade.symbol === selectedSymbol;

  const candleIndexByUnix = useMemo(() => {
    const map = new Map<number, number>();

    for (let i = 0; i < selectedCandles.length; i += 1) {
      map.set(toUtcTimestamp(selectedCandles[i].time), i);
    }

    return map;
  }, [selectedCandles]);

  const actionRows = useMemo(() => {
    const rows: ActionItem[] = [];
    const stepSeconds = timeframeMinutes[selectedTimeframe] * 60;

    for (const trade of historyRows) {
      rows.push({
        id: `${trade.id}-entry`,
        tradeId: trade.id,
        symbol: trade.symbol,
        label: `${trade.side === "Long" ? "Buy" : "Sell"} Order Placed`,
        details: `${formatUnits(trade.units)} units @ ${formatPrice(trade.entryPrice)}`,
        timestamp: trade.entryTime,
        time: formatDateTime(Number(trade.entryTime) * 1000)
      });
      rows.push({
        id: `${trade.id}-sl`,
        tradeId: trade.id,
        symbol: trade.symbol,
        label: "SL Added",
        details: `Stop-loss @ ${formatPrice(trade.stopPrice)}`,
        timestamp: (trade.entryTime + Math.max(1, Math.floor(stepSeconds * 0.1))) as UTCTimestamp,
        time: formatDateTime(
          (Number(trade.entryTime) + Math.max(1, Math.floor(stepSeconds * 0.1))) * 1000
        )
      });
      rows.push({
        id: `${trade.id}-tp`,
        tradeId: trade.id,
        symbol: trade.symbol,
        label: "TP Added",
        details: `Take-profit @ ${formatPrice(trade.targetPrice)}`,
        timestamp: (trade.entryTime + Math.max(2, Math.floor(stepSeconds * 0.2))) as UTCTimestamp,
        time: formatDateTime(
          (Number(trade.entryTime) + Math.max(2, Math.floor(stepSeconds * 0.2))) * 1000
        )
      });
      rows.push({
        id: `${trade.id}-exit`,
        tradeId: trade.id,
        symbol: trade.symbol,
        label: `${trade.result} Closed`,
        details: `${formatSignedUsd(trade.pnlUsd)} (${trade.pnlPct >= 0 ? "+" : ""}${trade.pnlPct.toFixed(
          2
        )}%) @ ${formatPrice(trade.outcomePrice)}`,
        timestamp: trade.exitTime,
        time: trade.exitAt
      });
    }

    return rows.sort(
      (a, b) => Number(b.timestamp) - Number(a.timestamp) || b.id.localeCompare(a.id)
    );
  }, [historyRows, selectedTimeframe]);

  const notificationItems = useMemo<NotificationItem[]>(() => {
    if (showcaseMode) {
      const now = referenceNowMs;
      const showcaseItems: NotificationItem[] = [
        {
          id: "showcase-live-1",
          title: "Risk Guard active",
          details: "Exposure balanced across copied positions",
          time: formatClock(now),
          timestamp: now,
          tone: "up" as NotificationTone,
          live: true
        },
        {
          id: "showcase-live-2",
          title: `${selectedSymbol} TP hit`,
          details: "+$432.80 (2.14%) captured on copied trade",
          time: formatClock(now - 14_000),
          timestamp: now - 14_000,
          tone: "up" as NotificationTone,
          live: true
        },
        {
          id: "showcase-live-3",
          title: `${selectedSymbol} entry executed`,
          details: "Buy order synced from selected profile",
          time: formatClock(now - 34_000),
          timestamp: now - 34_000,
          tone: "neutral" as NotificationTone,
          live: true
        },
        ...actionRows.slice(0, 8).map<NotificationItem>((action, index) => {
          const tone: NotificationTone =
            action.label === "Win Closed"
              ? "up"
              : action.label === "Loss Closed"
                ? "down"
                : "neutral";

          return {
            id: `showcase-action-${action.id}`,
            title: `${action.symbol} ${action.label}`,
            details: action.details,
            time: action.time,
            timestamp: now - (index + 3) * 55_000,
            tone
          };
        })
      ];

      return showcaseItems.slice(0, 12);
    }

    const items: NotificationItem[] = [];

    for (const action of actionRows.slice(0, 10)) {
      const title = `${action.symbol} ${action.label}`;
      const tone: NotificationTone =
        action.label === "Win Closed"
          ? "up"
          : action.label === "Loss Closed"
            ? "down"
            : "neutral";

      items.push({
        id: `action-${action.id}`,
        title,
        details: action.details,
        time: action.time,
        timestamp: Number(action.timestamp) * 1000,
        tone
      });
    }

    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 12);
  }, [actionRows, referenceNowMs, selectedSymbol, showcaseMode]);

  const seenNotificationSet = useMemo(() => {
    return new Set(seenNotificationIds);
  }, [seenNotificationIds]);

  const unreadNotificationCount = useMemo(() => {
    return notificationItems.reduce((count, item) => {
      return count + (seenNotificationSet.has(item.id) ? 0 : 1);
    }, 0);
  }, [notificationItems, seenNotificationSet]);

  useEffect(() => {
    if (!selectedHistoryId) {
      return;
    }

    if (!historyRows.some((row) => row.id === selectedHistoryId)) {
      setSelectedHistoryId(null);
    }
  }, [historyRows, selectedHistoryId]);

  useEffect(() => {
    setSelectedHistoryId(null);
    setShowAllTradesOnChart(false);
    focusTradeIdRef.current = null;
  }, [selectedModelId]);

  useEffect(() => {
    setSelectedHistoryId(null);
    setShowAllTradesOnChart(false);
    focusTradeIdRef.current = null;
  }, [selectedTimeframe]);

  useEffect(() => {
    if (!notificationsOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!notificationRef.current) {
        return;
      }

      const target = event.target as Node;

      if (!notificationRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (!notificationsOpen || notificationItems.length === 0) {
      return;
    }

    setSeenNotificationIds((prev) => {
      const next = new Set(prev);
      let changed = false;

      for (const item of notificationItems) {
        if (!next.has(item.id)) {
          next.add(item.id);
          changed = true;
        }
      }

      return changed ? Array.from(next) : prev;
    });
  }, [notificationsOpen, notificationItems]);

  useEffect(() => {
    let cancelled = false;
    let cleanupChart: (() => void) | null = null;

    void import("lightweight-charts").then(({ createChart }) => {
      const container = chartContainerRef.current;

      if (cancelled || !container || chartRef.current) {
        return;
      }

      const initialWidth = Math.max(1, Math.floor(container.clientWidth));
      const initialHeight = Math.max(1, Math.floor(container.clientHeight));

      const chart = createChart(container, {
        width: initialWidth,
        height: initialHeight,
        layout: {
          background: { type: LIGHTWEIGHT_CHART_SOLID_BACKGROUND, color: "#090d13" },
          textColor: "#7f889d"
        },
        localization: {
          priceFormatter: (price: number) => formatPrice(price)
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false }
        },
        rightPriceScale: {
          borderVisible: true,
          borderColor: "#182131"
        },
        leftPriceScale: {
          visible: false
        },
        timeScale: {
          borderVisible: true,
          borderColor: "#182131",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 3
        },
        crosshair: {
          mode: LIGHTWEIGHT_CHART_CROSSHAIR_NORMAL,
          vertLine: {
            color: "rgba(198, 208, 228, 0.28)",
            width: 1,
            style: 3,
            labelBackgroundColor: "#141c2a"
          },
          horzLine: {
            color: "rgba(198, 208, 228, 0.28)",
            width: 1,
            style: 3,
            labelBackgroundColor: "#141c2a"
          }
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true
        }
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: "#1bae8a",
        downColor: "#f0455a",
        wickUpColor: "#1bae8a",
        wickDownColor: "#f0455a",
        borderUpColor: "#1bae8a",
        borderDownColor: "#f0455a",
        priceLineVisible: true,
        priceLineStyle: LIGHTWEIGHT_CHART_LINE_SPARSE_DOTTED,
        priceLineColor: "rgba(27, 174, 138, 0.72)",
        priceLineWidth: 1,
        lastValueVisible: false
      });

      const tradeEntryLine = chart.addLineSeries({
        color: "rgba(232, 238, 250, 0.72)",
        lineWidth: 1,
        lineStyle: LIGHTWEIGHT_CHART_LINE_SOLID,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const tradeTargetLine = chart.addLineSeries({
        color: "rgba(53, 201, 113, 0.95)",
        lineWidth: 1,
        lineStyle: LIGHTWEIGHT_CHART_LINE_SOLID,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const tradeStopLine = chart.addLineSeries({
        color: "rgba(255, 76, 104, 0.95)",
        lineWidth: 1,
        lineStyle: LIGHTWEIGHT_CHART_LINE_SOLID,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const tradePathLine = chart.addLineSeries({
        color: "rgba(220, 230, 248, 0.82)",
        lineWidth: 2,
        lineStyle: LIGHTWEIGHT_CHART_LINE_DOTTED,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const tradeProfitZone = chart.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topLineColor: "rgba(0,0,0,0)",
        topFillColor1: "rgba(53, 201, 113, 0.22)",
        topFillColor2: "rgba(53, 201, 113, 0.05)",
        bottomLineColor: "rgba(0,0,0,0)",
        bottomFillColor1: "rgba(0,0,0,0)",
        bottomFillColor2: "rgba(0,0,0,0)",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const tradeLossZone = chart.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topLineColor: "rgba(0,0,0,0)",
        topFillColor1: "rgba(0,0,0,0)",
        topFillColor2: "rgba(0,0,0,0)",
        bottomLineColor: "rgba(0,0,0,0)",
        bottomFillColor1: "rgba(240, 69, 90, 0.24)",
        bottomFillColor2: "rgba(240, 69, 90, 0.07)",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });

      const onCrosshairMove = (param: MouseEventParams<Time>) => {
        if (!param.point || !param.time) {
          setHoveredTime(null);
          return;
        }

        setHoveredTime(parseTimeFromCrosshair(param.time));
      };

      chart.subscribeCrosshairMove(onCrosshairMove);

      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];

        if (!entry) {
          return;
        }

        const width = Math.max(1, Math.floor(entry.contentRect.width));
        const height = Math.max(1, Math.floor(entry.contentRect.height));

        chart.applyOptions({
          width,
          height
        });
      });

      resizeObserver.observe(container);

      const settleResize = () => {
        chart.applyOptions({
          width: Math.max(1, Math.floor(container.clientWidth)),
          height: Math.max(1, Math.floor(container.clientHeight))
        });
      };
      const resizeFrameA = window.requestAnimationFrame(settleResize);
      const resizeFrameB = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(settleResize);
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      tradeProfitZoneRef.current = tradeProfitZone;
      tradeLossZoneRef.current = tradeLossZone;
      tradeEntryLineRef.current = tradeEntryLine;
      tradeTargetLineRef.current = tradeTargetLine;
      tradeStopLineRef.current = tradeStopLine;
      tradePathLineRef.current = tradePathLine;
      setChartReadyVersion((version) => version + 1);

      cleanupChart = () => {
        window.cancelAnimationFrame(resizeFrameA);
        window.cancelAnimationFrame(resizeFrameB);
        resizeObserver.disconnect();
        chart.unsubscribeCrosshairMove(onCrosshairMove);
        chart.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        tradeProfitZoneRef.current = null;
        tradeLossZoneRef.current = null;
        tradeEntryLineRef.current = null;
        tradeTargetLineRef.current = null;
        tradeStopLineRef.current = null;
        tradePathLineRef.current = null;
        multiTradeSeriesRef.current = [];
      };
    });

    return () => {
      cancelled = true;
      cleanupChart?.();
    };
  }, [accountGateReady, activeAccountRole, showcaseMode]);

  useEffect(() => {
    const chart = chartRef.current;
    const currentSeries = loadedSelectedCandles;

    if (!chart || showcaseMode || !currentSeries || currentSeries.length === 0) {
      return;
    }

    const timeScale = chart.timeScale();

    const requestEarlierCandles = (range: LogicalRange | null) => {
      if (!range || range.from > CHART_BACKFILL_TRIGGER_BUFFER) {
        return;
      }

      if (
        chartBackfillInFlightRef.current[selectedKey] ||
        chartBackfillExhaustedRef.current[selectedKey]
      ) {
        return;
      }

      const earliestCandle = currentSeries[0];
      const remainingCapacity = MAX_CHART_CANDLE_COUNT - currentSeries.length;

      if (!earliestCandle || remainingCapacity <= 0) {
        chartBackfillExhaustedRef.current[selectedKey] = true;
        return;
      }

      const requestCount = Math.min(
        candleHistoryCountByTimeframe[selectedTimeframe],
        remainingCapacity
      );

      if (requestCount <= 0) {
        chartBackfillExhaustedRef.current[selectedKey] = true;
        return;
      }

      chartBackfillInFlightRef.current[selectedKey] = true;

      void fetchFuturesCandles(selectedSymbol, selectedTimeframe, requestCount, {
        beforeMs: earliestCandle.time
      })
        .then((payload) => {
          const olderCandles = Array.isArray(payload.candles) ? payload.candles : [];

          if (olderCandles.length === 0) {
            chartBackfillExhaustedRef.current[selectedKey] = true;
            return;
          }

          setSeriesMap((prev) => {
            const activeSeries = prev[selectedKey];

            if (!activeSeries || activeSeries.length === 0) {
              return prev;
            }

            const merged = mergeCandles(olderCandles, activeSeries);
            const addedBars = merged.length - activeSeries.length;

            if (addedBars <= 0) {
              chartBackfillExhaustedRef.current[selectedKey] = true;
              return prev;
            }

            if (currentSelectedKeyRef.current === selectedKey) {
              pendingVisibleRangeShiftRef.current[selectedKey] =
                (pendingVisibleRangeShiftRef.current[selectedKey] ?? 0) + addedBars;
            }

            return {
              ...prev,
              [selectedKey]: merged
            };
          });

          if (olderCandles.length < requestCount) {
            chartBackfillExhaustedRef.current[selectedKey] = true;
          }

          if (payload.meta && currentSelectedKeyRef.current === selectedKey) {
            setMarketFeedMeta(payload.meta);
          }
        })
        .catch(() => {
          chartBackfillExhaustedRef.current[selectedKey] = false;
        })
        .finally(() => {
          chartBackfillInFlightRef.current[selectedKey] = false;
        });
    };

    timeScale.subscribeVisibleLogicalRangeChange(requestEarlierCandles);

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(requestEarlierCandles);
    };
  }, [chartReadyVersion, loadedSelectedCandles, selectedKey, selectedSymbol, selectedTimeframe, showcaseMode]);

  useEffect(() => {
    const overlay = countdownOverlayRef.current;

    if (!overlay || !latestCandle) {
      if (overlay) overlay.style.display = "none";
      return;
    }

    const candleMs = getTimeframeMs(selectedTimeframe);
    let raf = 0;
    let lastText = "";

    const update = () => {
      const candleSeries = candleSeriesRef.current;

      if (!candleSeries) {
        raf = window.requestAnimationFrame(update);
        return;
      }

      const candleEndMs = latestCandle.time + candleMs;
      const remaining = Math.max(0, Math.floor((candleEndMs - Date.now()) / 1000));
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      const pad = (n: number) => String(n).padStart(2, "0");
      const timer = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
      const price = formatPrice(latestCandle.close);
      const text = `${price}\n${timer}`;

      if (text !== lastText) {
        overlay.textContent = text;
        lastText = text;
      }

      const isUp = latestCandle.close >= latestCandle.open;
      overlay.style.background = isUp ? "rgba(27, 174, 138, 0.85)" : "rgba(240, 69, 90, 0.85)";

      const y = candleSeries.priceToCoordinate(latestCandle.close);

      if (y !== null && Number.isFinite(y)) {
        overlay.style.top = `${y - 9}px`;
        overlay.style.display = "block";
      } else {
        overlay.style.display = "none";
      }

      raf = window.requestAnimationFrame(update);
    };

    raf = window.requestAnimationFrame(update);

    return () => window.cancelAnimationFrame(raf);
  }, [latestCandle, selectedTimeframe, selectedCandles]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const selection = `${selectedSymbol}-${selectedTimeframe}`;

    if (!chart || !candleSeries) {
      return;
    }

    if (selectedCandles.length === 0) {
      candleSeries.setData([]);
      delete pendingVisibleRangeShiftRef.current[selectedKey];
      selectionRef.current = "";
      return;
    }

    const candleData: CandlestickData[] = selectedCandles.map((candle) => ({
      time: toUtcTimestamp(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    }));

    candleSeries.setData(candleData);

    const lastBar = selectedCandles[selectedCandles.length - 1];

    if (lastBar) {
      const isUp = lastBar.close >= lastBar.open;
      candleSeries.applyOptions({
        priceLineColor: isUp ? "rgba(27, 174, 138, 0.72)" : "rgba(240, 69, 90, 0.72)"
      });
    }

    if (selectionRef.current !== selection) {
      const to = candleData.length - 1;
      const from = Math.max(0, to - timeframeVisibleCount[selectedTimeframe]);

      chart.applyOptions({
        rightPriceScale: {
          autoScale: true
        }
      });
      chart.timeScale().setVisibleLogicalRange({ from, to });
      selectionRef.current = selection;
    }

    const pendingShift = pendingVisibleRangeShiftRef.current[selectedKey];

    if (pendingShift) {
      const visibleRange = chart.timeScale().getVisibleLogicalRange();

      if (visibleRange) {
        chart.timeScale().setVisibleLogicalRange({
          from: visibleRange.from + pendingShift,
          to: visibleRange.to + pendingShift
        });
      }

      delete pendingVisibleRangeShiftRef.current[selectedKey];
    }
  }, [chartReadyVersion, selectedCandles, selectedKey, selectedSymbol, selectedTimeframe]);

  useEffect(() => {
    const chart = chartRef.current;

    if (!chart) {
      return;
    }

    chart.applyOptions({
      rightPriceScale: {
        autoScale: true
      }
    });
  }, [selectedSymbol, selectedTimeframe]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.key.toLowerCase() !== "r") {
        return;
      }

      event.preventDefault();

      const chart = chartRef.current;

      if (!chart || selectedCandles.length === 0) {
        return;
      }

      const to = selectedCandles.length - 1;
      const from = Math.max(0, to - timeframeVisibleCount[selectedTimeframe]);
      chart.timeScale().setVisibleLogicalRange({ from, to });
      focusTradeIdRef.current = null;
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedCandles, selectedTimeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    const pendingTradeId = focusTradeIdRef.current;

    if (
      !chart ||
      !pendingTradeId ||
      !selectedHistoryTrade ||
      selectedHistoryTrade.id !== pendingTradeId ||
      selectedHistoryTrade.symbol !== selectedSymbol
    ) {
      return;
    }

    const entryIndex = candleIndexByUnix.get(selectedHistoryTrade.entryTime) ?? -1;
    const exitIndexRaw = candleIndexByUnix.get(selectedHistoryTrade.exitTime) ?? -1;
    const exitIndex = exitIndexRaw >= 0 ? exitIndexRaw : entryIndex + 1;

    if (entryIndex < 0) {
      return;
    }

    const leftBound = Math.min(entryIndex, exitIndex);
    const rightBound = Math.max(entryIndex, exitIndex);
    const span = Math.max(32, Math.round(timeframeVisibleCount[selectedTimeframe] * 0.72));
    const from = Math.max(0, leftBound - Math.round(span * 0.4));
    const to = Math.min(selectedCandles.length - 1, rightBound + Math.round(span * 0.6));
    chart.timeScale().setVisibleLogicalRange({ from, to });
    focusTradeIdRef.current = null;
  }, [candleIndexByUnix, selectedCandles, selectedHistoryTrade, selectedSymbol, selectedTimeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = chartContainerRef.current;

    if (!chart || !container) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      chart.applyOptions({
        width: Math.floor(container.clientWidth),
        height: Math.floor(container.clientHeight)
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [panelExpanded, activePanelTab]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const tradeProfitZone = tradeProfitZoneRef.current;
    const tradeLossZone = tradeLossZoneRef.current;
    const tradeEntryLine = tradeEntryLineRef.current;
    const tradeTargetLine = tradeTargetLineRef.current;
    const tradeStopLine = tradeStopLineRef.current;
    const tradePathLine = tradePathLineRef.current;

    if (
      !chart ||
      !candleSeries ||
      !tradeProfitZone ||
      !tradeLossZone ||
      !tradeEntryLine ||
      !tradeTargetLine ||
      !tradeStopLine ||
      !tradePathLine
    ) {
      return;
    }

    const clearMultiTradeOverlays = () => {
      if (multiTradeSeriesRef.current.length === 0) {
        return;
      }

      for (const seriesGroup of multiTradeSeriesRef.current) {
        chart.removeSeries(seriesGroup.profitZone);
        chart.removeSeries(seriesGroup.lossZone);
        chart.removeSeries(seriesGroup.entryLine);
        chart.removeSeries(seriesGroup.targetLine);
        chart.removeSeries(seriesGroup.stopLine);
        chart.removeSeries(seriesGroup.pathLine);
      }

      multiTradeSeriesRef.current = [];
    };

    const clearTradeOverlays = () => {
      clearMultiTradeOverlays();
      candleSeries.setMarkers([]);
      tradeProfitZone.setData([]);
      tradeLossZone.setData([]);
      tradeEntryLine.setData([]);
      tradeTargetLine.setData([]);
      tradeStopLine.setData([]);
      tradePathLine.setData([]);
    };

    const applyTradeZonePaletteTo = (
      profitZoneSeries: ISeriesApi<"Baseline">,
      lossZoneSeries: ISeriesApi<"Baseline">,
      side: TradeSide,
      entryPrice: number,
      intense = true
    ) => {
      const greenStrong = intense ? "rgba(53, 201, 113, 0.22)" : "rgba(53, 201, 113, 0.14)";
      const greenSoft = intense ? "rgba(53, 201, 113, 0.05)" : "rgba(53, 201, 113, 0.03)";
      const redStrong = intense ? "rgba(240, 69, 90, 0.24)" : "rgba(240, 69, 90, 0.14)";
      const redSoft = intense ? "rgba(240, 69, 90, 0.07)" : "rgba(240, 69, 90, 0.03)";

      if (side === "Long") {
        profitZoneSeries.applyOptions({
          baseValue: { type: "price", price: entryPrice },
          topLineColor: "rgba(0,0,0,0)",
          topFillColor1: greenStrong,
          topFillColor2: greenSoft,
          bottomLineColor: "rgba(0,0,0,0)",
          bottomFillColor1: "rgba(0,0,0,0)",
          bottomFillColor2: "rgba(0,0,0,0)"
        });
        lossZoneSeries.applyOptions({
          baseValue: { type: "price", price: entryPrice },
          topLineColor: "rgba(0,0,0,0)",
          topFillColor1: "rgba(0,0,0,0)",
          topFillColor2: "rgba(0,0,0,0)",
          bottomLineColor: "rgba(0,0,0,0)",
          bottomFillColor1: redStrong,
          bottomFillColor2: redSoft
        });
      } else {
        profitZoneSeries.applyOptions({
          baseValue: { type: "price", price: entryPrice },
          topLineColor: "rgba(0,0,0,0)",
          topFillColor1: redStrong,
          topFillColor2: redSoft,
          bottomLineColor: "rgba(0,0,0,0)",
          bottomFillColor1: "rgba(0,0,0,0)",
          bottomFillColor2: "rgba(0,0,0,0)"
        });
        lossZoneSeries.applyOptions({
          baseValue: { type: "price", price: entryPrice },
          topLineColor: "rgba(0,0,0,0)",
          topFillColor1: "rgba(0,0,0,0)",
          topFillColor2: "rgba(0,0,0,0)",
          bottomLineColor: "rgba(0,0,0,0)",
          bottomFillColor1: greenStrong,
          bottomFillColor2: greenSoft
        });
      }
    };

    const applyTradeZonePalette = (side: TradeSide, entryPrice: number) => {
      applyTradeZonePaletteTo(tradeProfitZone, tradeLossZone, side, entryPrice, true);
    };

    const createMultiTradeSeries = (): MultiTradeOverlaySeries => {
      const entryLine = chart.addLineSeries({
        color: "rgba(232, 238, 250, 0.62)",
        lineWidth: 1,
        lineStyle: LIGHTWEIGHT_CHART_LINE_SOLID,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const targetLine = chart.addLineSeries({
        color: "rgba(53, 201, 113, 0.7)",
        lineWidth: 1,
        lineStyle: LIGHTWEIGHT_CHART_LINE_SOLID,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const stopLine = chart.addLineSeries({
        color: "rgba(255, 76, 104, 0.7)",
        lineWidth: 1,
        lineStyle: LIGHTWEIGHT_CHART_LINE_SOLID,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const pathLine = chart.addLineSeries({
        color: "rgba(220, 230, 248, 0.64)",
        lineWidth: 1,
        lineStyle: LIGHTWEIGHT_CHART_LINE_DOTTED,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const profitZone = chart.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topLineColor: "rgba(0,0,0,0)",
        topFillColor1: "rgba(53, 201, 113, 0.14)",
        topFillColor2: "rgba(53, 201, 113, 0.03)",
        bottomLineColor: "rgba(0,0,0,0)",
        bottomFillColor1: "rgba(0,0,0,0)",
        bottomFillColor2: "rgba(0,0,0,0)",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const lossZone = chart.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topLineColor: "rgba(0,0,0,0)",
        topFillColor1: "rgba(0,0,0,0)",
        topFillColor2: "rgba(0,0,0,0)",
        bottomLineColor: "rgba(0,0,0,0)",
        bottomFillColor1: "rgba(240, 69, 90, 0.14)",
        bottomFillColor2: "rgba(240, 69, 90, 0.03)",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });

      return {
        profitZone,
        lossZone,
        entryLine,
        targetLine,
        stopLine,
        pathLine
      };
    };

    const renderSingleTrade = (trade: {
      side: TradeSide;
      status: "closed" | "pending";
      result: TradeResult;
      entryTime: UTCTimestamp;
      exitTime: UTCTimestamp;
      entryPrice: number;
      targetPrice: number;
      stopPrice: number;
      outcomePrice: number;
      pnlUsd: number;
    }) => {
      const startTime = trade.entryTime;
      const endTime =
        trade.exitTime > trade.entryTime
          ? trade.exitTime
          : ((trade.entryTime + timeframeMinutes[selectedTimeframe] * 60) as UTCTimestamp);
      const entryAction = trade.side === "Long" ? "Buy" : "Sell";
      const tradeZoneData = [
        { time: startTime, value: trade.targetPrice },
        { time: endTime, value: trade.targetPrice }
      ];
      const stopZoneData = [
        { time: startTime, value: trade.stopPrice },
        { time: endTime, value: trade.stopPrice }
      ];
      const derivedResult: TradeResult =
        trade.status === "pending" ? (trade.pnlUsd >= 0 ? "Win" : "Loss") : trade.result;
      const exitPrefix = derivedResult === "Win" ? "✓" : "x";
      const exitPosition = getExitMarkerPosition(trade.side, derivedResult);
      clearMultiTradeOverlays();

      candleSeries.setMarkers([
        {
          time: startTime,
          position: trade.side === "Long" ? "belowBar" : "aboveBar",
          shape: trade.side === "Long" ? "arrowUp" : "arrowDown",
          color: trade.side === "Long" ? "#30b76f" : "#f0455a",
          text: entryAction
        },
        {
          time: endTime,
          position: exitPosition,
          shape: "square",
          color: derivedResult === "Win" ? "#35c971" : "#f0455a",
          text: `${exitPrefix} ${formatSignedUsd(trade.pnlUsd)}`
        }
      ]);

      applyTradeZonePalette(trade.side, trade.entryPrice);
      tradeEntryLine.setData([
        { time: startTime, value: trade.entryPrice },
        { time: endTime, value: trade.entryPrice }
      ]);
      tradeTargetLine.setData(tradeZoneData);
      tradeStopLine.setData(stopZoneData);
      tradePathLine.setData([
        { time: startTime, value: trade.entryPrice },
        { time: endTime, value: trade.outcomePrice }
      ]);

      if (trade.side === "Long") {
        tradeProfitZone.setData(tradeZoneData);
        tradeLossZone.setData(stopZoneData);
      } else {
        tradeProfitZone.setData(stopZoneData);
        tradeLossZone.setData(tradeZoneData);
      }
    };

    if (showAllTradesOnChart) {
      clearMultiTradeOverlays();
      tradeProfitZone.setData([]);
      tradeLossZone.setData([]);
      tradeEntryLine.setData([]);
      tradeTargetLine.setData([]);
      tradeStopLine.setData([]);
      tradePathLine.setData([]);

      if (currentSymbolHistoryRows.length === 0) {
        candleSeries.setMarkers([]);
        return;
      }

      const allMarkers: SeriesMarker<Time>[] = [];

      for (const trade of currentSymbolHistoryRows) {
        const tradeResult: TradeResult = trade.result;
        const endTime =
          trade.exitTime > trade.entryTime
            ? trade.exitTime
            : ((trade.entryTime + timeframeMinutes[selectedTimeframe] * 60) as UTCTimestamp);
        const targetData = [
          { time: trade.entryTime, value: trade.targetPrice },
          { time: endTime, value: trade.targetPrice }
        ];
        const stopData = [
          { time: trade.entryTime, value: trade.stopPrice },
          { time: endTime, value: trade.stopPrice }
        ];
        const seriesGroup = createMultiTradeSeries();

        applyTradeZonePaletteTo(
          seriesGroup.profitZone,
          seriesGroup.lossZone,
          trade.side,
          trade.entryPrice,
          false
        );
        seriesGroup.entryLine.setData([
          { time: trade.entryTime, value: trade.entryPrice },
          { time: endTime, value: trade.entryPrice }
        ]);
        seriesGroup.targetLine.setData(targetData);
        seriesGroup.stopLine.setData(stopData);
        seriesGroup.pathLine.setData([
          { time: trade.entryTime, value: trade.entryPrice },
          { time: endTime, value: trade.outcomePrice }
        ]);

        if (trade.side === "Long") {
          seriesGroup.profitZone.setData(targetData);
          seriesGroup.lossZone.setData(stopData);
        } else {
          seriesGroup.profitZone.setData(stopData);
          seriesGroup.lossZone.setData(targetData);
        }

        multiTradeSeriesRef.current.push(seriesGroup);

        allMarkers.push({
          time: trade.entryTime,
          position: trade.side === "Long" ? "belowBar" : "aboveBar",
          shape: trade.side === "Long" ? "arrowUp" : "arrowDown",
          color: trade.side === "Long" ? "#35c971" : "#f0455a",
          text: trade.side === "Long" ? "Buy" : "Sell"
        });
        allMarkers.push({
          time: endTime,
          position: getExitMarkerPosition(trade.side, tradeResult),
          shape: "square",
          color: tradeResult === "Win" ? "#35c971" : "#f0455a",
          text: `${tradeResult === "Win" ? "✓" : "x"} ${formatSignedUsd(trade.pnlUsd)}`
        });
      }

      allMarkers.sort((a, b) => Number(a.time) - Number(b.time));
      candleSeries.setMarkers(allMarkers);
      return;
    }

    if (!selectedHistoryTrade || selectedHistoryTrade.symbol !== selectedSymbol) {
      clearTradeOverlays();
      return;
    }

    renderSingleTrade({
      side: selectedHistoryTrade.side,
      status: "closed",
      result: selectedHistoryTrade.result,
      entryTime: selectedHistoryTrade.entryTime,
      exitTime: selectedHistoryTrade.exitTime,
      entryPrice: selectedHistoryTrade.entryPrice,
      targetPrice: selectedHistoryTrade.targetPrice,
      stopPrice: selectedHistoryTrade.stopPrice,
      outcomePrice: selectedHistoryTrade.outcomePrice,
      pnlUsd: selectedHistoryTrade.pnlUsd
    });
  }, [
    currentSymbolHistoryRows,
    selectedHistoryTrade,
    selectedSymbol,
    selectedTimeframe,
    showAllTradesOnChart
  ]);

  const timeframeChanges = useMemo(() => {
    return timeframes.map((timeframe) => {
      const key = symbolTimeframeKey(selectedSymbol, timeframe);
      const list =
        timeframe === selectedTimeframe
          ? selectedCandles
          : timeframePreviewMap[key] ?? [];
      const last = list[list.length - 1];
      const prev = list[list.length - 2] ?? last;
      const change =
        last && prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null;

      return {
        timeframe,
        change
      };
    });
  }, [selectedCandles, selectedSymbol, selectedTimeframe, timeframePreviewMap]);
  const resetChart = () => {
    const chart = chartRef.current;

    if (!chart || selectedCandles.length === 0) {
      return;
    }

    const to = selectedCandles.length - 1;
    const from = Math.max(0, to - timeframeVisibleCount[selectedTimeframe]);
    chart.timeScale().setVisibleLogicalRange({ from, to });
    focusTradeIdRef.current = null;
  };
  const feedStatusLabel =
    marketStatus === "loading"
      ? "Loading Databento"
      : marketStatus === "error"
        ? "Databento unavailable"
        : `${marketFeedMeta?.provider ?? "Databento"} - ${marketFeedMeta?.sourceTimeframe ?? selectedTimeframe}`;
  const currentAccountLabel = activeAccountRole ?? "Guest";
  const isAdmin = activeAccountRole === "Admin";
  const yazanAccountSummary = yazanAccount
    ? [yazanAccount.accountLabel, yazanAccount.accountNumber].filter(Boolean).join(" #")
    : null;

  const updateYazanSyncDraft = (field: keyof AccountSyncDraft, value: string) => {
    setYazanSyncDraft((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const openYazanSyncDraft = () => {
    if (!isAdmin) {
      return;
    }

    setSelectedModelId("yazan");
    setShowYazanAccountMenu(false);
    setYazanSyncDraft(yazanAccount ?? DEFAULT_YAZAN_SYNC_DRAFT);
    setShowYazanSyncDraft(true);
  };

  const closeYazanSyncDraft = () => {
    setShowYazanSyncDraft(false);
    setShowYazanAccountMenu(false);
    setYazanSyncDraft(yazanAccount ?? DEFAULT_YAZAN_SYNC_DRAFT);
  };

  const saveYazanSyncDraft = () => {
    const normalized: AccountSyncDraft = {
      accountLabel: yazanSyncDraft.accountLabel.trim(),
      broker: yazanSyncDraft.broker.trim(),
      platform: yazanSyncDraft.platform.trim(),
      accountNumber: yazanSyncDraft.accountNumber.trim()
    };
    const hasContent = Object.values(normalized).some((value) => value.length > 0);

    setYazanAccount(hasContent ? normalized : null);
    setShowYazanSyncDraft(false);
    setShowYazanAccountMenu(false);
  };

  const removeYazanAccount = () => {
    setYazanAccount(null);
    setYazanSyncDraft(DEFAULT_YAZAN_SYNC_DRAFT);
    setShowYazanSyncDraft(false);
    setShowYazanAccountMenu(false);
  };

  useEffect(() => {
    if (isAdmin) {
      return;
    }

    setShowYazanAccountMenu(false);
    setShowYazanSyncDraft(false);
  }, [isAdmin]);

  useEffect(() => {
    if (selectedModelId === "yazan") {
      return;
    }

    setShowYazanAccountMenu(false);
    setShowYazanSyncDraft(false);
  }, [selectedModelId]);

  useEffect(() => {
    if (!showYazanAccountMenu) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!yazanAccountMenuRef.current) {
        return;
      }

      const target = event.target as Node;

      if (!yazanAccountMenuRef.current.contains(target)) {
        setShowYazanAccountMenu(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowYazanAccountMenu(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [showYazanAccountMenu]);

  useEffect(() => {
    if (!showYazanSyncDraft) {
      return;
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowYazanSyncDraft(false);
        setShowYazanAccountMenu(false);
        setYazanSyncDraft(yazanAccount ?? DEFAULT_YAZAN_SYNC_DRAFT);
      }
    };

    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("keydown", onEscape);
    };
  }, [showYazanSyncDraft, yazanAccount]);

  const grantAccountAccess = (role: AccountRole) => {
    setActiveAccountRole(role);
    setAccountEntryMode(null);
    setAdminCodeInput("");
    setAccountAccessError("");
    setNotificationsOpen(false);

    if (!showcaseMode) {
      window.sessionStorage.setItem(ACCOUNT_GATE_STORAGE_KEY, role);
    }
  };

  const handleSwitchAccount = () => {
    setActiveAccountRole(null);
    setAccountEntryMode(null);
    setAdminCodeInput("");
    setAccountAccessError("");
    setNotificationsOpen(false);
    setPanelExpanded(false);
    setActivePanelTab("active");
    setSelectedHistoryId(null);
    focusTradeIdRef.current = null;

    if (!showcaseMode) {
      window.sessionStorage.removeItem(ACCOUNT_GATE_STORAGE_KEY);
    }
  };

  const handleAdminUnlock = (code = adminCodeInput) => {
    if (code.length < 5) {
      return;
    }

    if (code === ADMIN_ACCESS_CODE) {
      grantAccountAccess("Admin");
      return;
    }

    setAdminCodeInput("");
    setAccountAccessError("Incorrect code");
    window.requestAnimationFrame(() => {
      adminCodeInputRef.current?.focus();
    });
  };

  useEffect(() => {
    if (accountEntryMode !== "Admin" || activeAccountRole) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      adminCodeInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [accountEntryMode, activeAccountRole]);

  if (!accountGateReady) {
    return (
      <main className="terminal account-screen">
        <section className="account-screen-shell">
          <div className="account-shell-panel account-shell-panel-loading">
            <span className="account-shell-kicker">Roman Capital</span>
            <div className="account-shell-header">
              <h1>Loading access</h1>
              <p>Checking for a saved session.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!showcaseMode && !activeAccountRole) {
    return (
      <main className="terminal account-screen">
        <section className="account-screen-shell">
          <div className="account-shell-panel account-gate-panel">
            {accountEntryMode === "Admin" ? (
              <form
                className="account-pin-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleAdminUnlock();
                }}
                onClick={() => {
                  adminCodeInputRef.current?.focus();
                }}
              >
                <input
                  ref={adminCodeInputRef}
                  className="account-pin-hidden"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={5}
                  autoFocus
                  value={adminCodeInput}
                  onChange={(event) => {
                    const nextValue = event.target.value.replace(/\D/g, "").slice(0, 5);
                    setAdminCodeInput(nextValue);
                    setAccountAccessError("");

                    if (nextValue.length === 5) {
                      handleAdminUnlock(nextValue);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setAccountEntryMode(null);
                      setAdminCodeInput("");
                      setAccountAccessError("");
                    }

                    if (event.key === "Backspace" && adminCodeInput.length === 0) {
                      setAccountEntryMode(null);
                      setAccountAccessError("");
                    }
                  }}
                  aria-label="Admin code"
                />

                <div className="account-pin-grid" aria-hidden>
                  {Array.from({ length: 5 }, (_, index) => {
                    const digit = adminCodeInput[index] ?? "";
                    const isActiveSlot = adminCodeInput.length === index && adminCodeInput.length < 5;

                    return (
                      <button
                        key={`pin-slot-${index + 1}`}
                        type="button"
                        className={`account-pin-box${digit ? " filled" : ""}${isActiveSlot ? " active" : ""}`}
                        onClick={() => {
                          adminCodeInputRef.current?.focus();
                        }}
                        tabIndex={-1}
                        aria-label={`Digit ${index + 1}`}
                      >
                        {digit}
                      </button>
                    );
                  })}
                </div>

                {accountAccessError ? (
                  <div className="account-pin-error">{accountAccessError}</div>
                ) : null}
              </form>
            ) : (
              <div className="account-choice-grid">
                <button
                  type="button"
                  className="account-choice-card"
                  onClick={() => {
                    setAccountEntryMode("Admin");
                    setAdminCodeInput("");
                    setAccountAccessError("");
                  }}
                >
                  Admin
                </button>

                <button
                  type="button"
                  className="account-choice-card"
                  onClick={() => grantAccountAccess("User")}
                >
                  User
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="terminal">
      <div className="surface-strip">
        <span className="site-brand surface-brand">
          <Image
            src="/icon.svg"
            alt=""
            className="site-brand-mark"
            width={18}
            height={18}
            aria-hidden="true"
          />
          <span className="site-tag">Roman Capital</span>
        </span>
        <div className="top-utility surface-actions">
          <div className="account-switcher">
            <span className={`account-badge account-${currentAccountLabel.toLowerCase()}`}>
              {currentAccountLabel}
            </span>
            {!showcaseMode ? (
              <button
                type="button"
                className="account-switch-btn"
                onClick={handleSwitchAccount}
              >
                Switch
              </button>
            ) : null}
          </div>
          <div className="notif-wrap" ref={notificationRef}>
            <button
              type="button"
              className="notif-btn"
              aria-label="notifications"
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <svg className="notif-icon" viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M7 10.5a5 5 0 0 1 10 0v4.3l1.5 2.2H5.5L7 14.8v-4.3z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 19a2 2 0 0 0 4 0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              {unreadNotificationCount > 0 ? (
                <span className="notif-badge">{Math.min(9, unreadNotificationCount)}</span>
              ) : null}
            </button>

            {notificationsOpen ? (
              <div className="notif-popover">
                <div className="notif-head">
                  <strong>Live Activity</strong>
                  <span>{notificationItems.length} events</span>
                </div>
                <ul className="notif-list">
                  {notificationItems.map((item) => (
                    <li key={item.id} className="notif-item">
                      <span className={`notif-dot ${item.tone}`} aria-hidden />
                      <div className="notif-copy">
                        <span className="notif-title">{item.title}</span>
                        <span className="notif-details">{item.details}</span>
                      </div>
                      <span className="notif-time">{item.time}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {isAdmin && showYazanAccountMenu ? (
        <div
          ref={yazanAccountMenuRef}
          className="sync-account-menu"
          style={{
            left: `${yazanAccountMenuPosition.x}px`,
            top: `${yazanAccountMenuPosition.y}px`
          }}
        >
          <button type="button" className="sync-account-menu-btn" onClick={openYazanSyncDraft}>
            Edit Account
          </button>
          <button
            type="button"
            className="sync-account-menu-btn danger"
            onClick={removeYazanAccount}
            disabled={!yazanAccount}
          >
            Remove Account
          </button>
        </div>
      ) : null}

      <header className="topbar">
            <div className="brand-area">
              <div className="asset-meta">
                <h1>{selectedAsset.symbol}</h1>
                <p>{selectedAsset.name}</p>
              </div>
              <div className="live-quote">
                <span className={quoteChange === null ? "neutral" : quoteChange >= 0 ? "up" : "down"}>
                  {latestCandle ? `$${formatPrice(latestCandle.close)}` : "--"}
                </span>
                <div className="tf-changes">
                  {timeframeChanges.map(({ timeframe, change }) => (
                    <span
                      key={timeframe}
                      className={`tf-change ${
                        change === null ? "neutral" : change >= 0 ? "up" : "down"
                      }${timeframe === selectedTimeframe ? " tf-active" : ""}`}
                    >
                      <span className="tf-label">{timeframe}</span>
                      <span className={change === null ? "" : change >= 0 ? "up" : "down"}>
                        {change !== null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "--"}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="top-controls">
              <nav className="timeframe-row" aria-label="timeframes">
                {timeframes.map((timeframe) => (
                  <button
                    key={timeframe}
                    type="button"
                    className={`timeframe ${timeframe === selectedTimeframe ? "active" : ""}`}
                    onClick={() => setSelectedTimeframe(timeframe)}
                  >
                    {timeframe}
                  </button>
                ))}
              </nav>
            </div>
          </header>

      <section className="surface-stage">
        <div className="surface-view">
          <section className={`workspace ${panelExpanded ? "" : "panel-collapsed"}`}>
          <section className="chart-wrap">
          <div className="chart-toolbar">
            {(() => {
              const display = hoveredTime ? hoveredCandle : latestCandle ?? hoveredCandle;

              if (!display) {
                return (
                  <>
                    <span className="neutral">
                      O <strong>--</strong>
                    </span>
                    <span className="neutral">
                      H <strong>--</strong>
                    </span>
                    <span className="neutral">
                      L <strong>--</strong>
                    </span>
                    <span className="neutral">
                      C <strong>--</strong>
                    </span>
                  </>
                );
              }

              const displayIndex = selectedCandles.indexOf(display);
              const previousDisplay = displayIndex > 0 ? selectedCandles[displayIndex - 1] : null;
              const openClass =
                previousDisplay && previousDisplay.close < previousDisplay.open ? "ohlc-down" : "ohlc-up";
              const closeClass = display.close >= display.open ? "ohlc-up" : "ohlc-down";

              return (
                <>
                  <span className={openClass}>
                    O <strong>{formatPrice(display.open)}</strong>
                  </span>
                  <span className="ohlc-up">
                    H <strong>{formatPrice(display.high)}</strong>
                  </span>
                  <span className="ohlc-down">
                    L <strong>{formatPrice(display.low)}</strong>
                  </span>
                  <span className={closeClass}>
                    C <strong>{formatPrice(display.close)}</strong>
                  </span>
                </>
              );
            })()}
          </div>
          <div className="chart-stage">
            <div ref={chartContainerRef} className="tv-chart" aria-label="trading chart" />
            <div ref={countdownOverlayRef} className="candle-countdown-overlay" />
            {selectedCandles.length === 0 ? (
              <div className="chart-empty-state" role="status" aria-live="polite">
                <strong>
                  {marketStatus === "loading" ? "Loading candles" : "Futures candles unavailable"}
                </strong>
                <p>
                  {marketStatus === "loading"
                    ? "Waiting for real Databento bars."
                    : marketError ?? "No real candles were returned for this contract and timeframe."}
                </p>
              </div>
            ) : null}
            <div className="chart-stage-actions">
              <button
                type="button"
                className="chart-reset-btn"
                onClick={resetChart}
                title="Reset chart view (Opt+R)"
                disabled={selectedCandles.length === 0}
              >
                Reset Chart
              </button>
            </div>
          </div>
        </section>

        <aside className={`side-panel ${panelExpanded ? "expanded" : "collapsed"}`}>
          <nav className="panel-rail" aria-label="sidebar tabs">
            {sidebarTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`rail-btn ${activePanelTab === tab.id ? "active" : ""}`}
                onClick={() => {
                  if (panelExpanded && activePanelTab === tab.id) {
                    setPanelExpanded(false);
                    return;
                  }

                  setActivePanelTab(tab.id);
                  setPanelExpanded(true);
                }}
                title={tab.label}
                aria-label={tab.label}
              >
                <TabIcon tab={tab.id} />
                <span className="rail-label">{tab.label}</span>
              </button>
            ))}
          </nav>

          {panelExpanded ? (
            <div className="panel-content">
              {activePanelTab === "active" ? (
                <div className="tab-view active-tab">
                  <div className="watchlist-head with-action">
                    <div>
                      <h2>Active Trade</h2>
                    </div>
                    <div className="panel-head-actions">
                      <button
                        type="button"
                        className={`panel-action-btn panel-mode-btn ${
                          chartSimulationEnabled ? "on" : "off"
                        }`}
                        onClick={() => setChartSimulationEnabled((current) => !current)}
                      >
                        {chartSimulationEnabled ? "Simulation ON" : "Simulation OFF"}
                      </button>
                      <button
                        type="button"
                        className="panel-action-btn"
                        disabled={!activeTrade}
                        onClick={() => {
                          if (!activeTrade) {
                            return;
                          }

                          setShowAllTradesOnChart(false);

                          if (activeTradeShownOnChart) {
                            setSelectedHistoryId(null);
                            focusTradeIdRef.current = null;
                            return;
                          }

                          setSelectedSymbol(activeTrade.symbol);
                          setSelectedHistoryId(activeTrade.id);
                          focusTradeIdRef.current = activeTrade.id;
                        }}
                      >
                        {activeTradeShownOnChart ? "Hide On Chart" : "Show On Chart"}
                      </button>
                    </div>
                  </div>

                  {activeTrade ? (
                    <div className="active-card">
                      <div className="active-card-top">
                        <div>
                          <span
                            className={`active-side ${
                              activeTrade.side === "Long" ? "up" : "down"
                            }`}
                          >
                            {activeTrade.side}
                          </span>
                          <h3>{activeTrade.symbol}</h3>
                        </div>
                        <span className="active-live-tag">Latest</span>
                      </div>

                      <div className="active-pnl">
                        <span>Trade PnL</span>
                        <strong className={activeTrade.pnlUsd >= 0 ? "up" : "down"}>
                          {formatSignedUsd(activeTrade.pnlUsd)}
                        </strong>
                        <small className={activeTrade.pnlPct >= 0 ? "up" : "down"}>
                          {activeTrade.pnlPct >= 0 ? "+" : ""}
                          {activeTrade.pnlPct.toFixed(2)}%
                        </small>
                      </div>

                      <div className="active-metrics-grid">
                        <div className="active-metric">
                          <span>Entry</span>
                          <strong>{formatPrice(activeTrade.entryPrice)}</strong>
                        </div>
                        <div className="active-metric">
                          <span>Exit</span>
                          <strong>{formatPrice(activeTrade.outcomePrice)}</strong>
                        </div>
                        <div className="active-metric">
                          <span>TP</span>
                          <strong className="up">{formatPrice(activeTrade.targetPrice)}</strong>
                        </div>
                        <div className="active-metric">
                          <span>SL</span>
                          <strong className="down">{formatPrice(activeTrade.stopPrice)}</strong>
                        </div>
                        <div className="active-metric">
                          <span>Size</span>
                          <strong>{formatUnits(activeTrade.units)} units</strong>
                        </div>
                        <div className="active-metric">
                          <span>R:R</span>
                          <strong>{activeTradeRiskReward ? `1:${activeTradeRiskReward.toFixed(2)}` : "--"}</strong>
                        </div>
                        <div className="active-metric">
                          <span>Opened</span>
                          <strong>{activeTrade.entryAt}</strong>
                        </div>
                        <div className="active-metric">
                          <span>Closed</span>
                          <strong>{activeTrade.exitAt}</strong>
                        </div>
                        <div className="active-metric">
                          <span>Result</span>
                          <strong className={activeTrade.result === "Win" ? "up" : "down"}>
                            {activeTrade.result}
                          </strong>
                        </div>
                        <div className="active-metric">
                          <span>Duration</span>
                          <strong>{activeTradeDuration ?? "--"}</strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="ai-placeholder">
                      <p>
                        {chartSimulationEnabled
                          ? "No replay trades are available for the current chart yet."
                          : "Trade simulation is turned off."}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}

              {activePanelTab === "assets" ? (
                <div className="tab-view">
                  <div className="watchlist-head">
                    <div>
                      <h2>Assets</h2>
                    </div>
                  </div>

                  <ul className="watchlist-body">
                    <li className="watchlist-labels" aria-hidden>
                      <span>Symbol</span>
                      <span>Last</span>
                      <span>Chg%</span>
                    </li>
                    {watchlistRows.map((row) => (
                      <li key={row.symbol}>
                        <button
                          type="button"
                          className={`watchlist-row ${
                            row.symbol === selectedSymbol ? "selected" : ""
                          }`}
                          onClick={() => {
                            setSelectedSymbol(row.symbol);
                            setSelectedHistoryId(null);
                            setShowAllTradesOnChart(false);
                            focusTradeIdRef.current = null;
                          }}
                        >
                          <span className="symbol-col">
                            <span>{row.symbol}</span>
                            <small>
                              {row.name} - {row.category}
                            </small>
                          </span>

                          <span className="num-col">
                            {row.lastPrice === null ? "--" : formatPrice(row.lastPrice)}
                          </span>
                          <span
                            className={`num-col ${
                              row.change === null ? "" : row.change >= 0 ? "up" : "down"
                            }`}
                          >
                            {row.change === null
                              ? "--"
                              : `${row.change >= 0 ? "+" : ""}${row.change.toFixed(2)}`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {activePanelTab === "models" ? (
                <div className="tab-view">
                  {showYazanSyncDraft ? (
                    <>
                      <div className="watchlist-head with-action">
                        <div>
                          <h2>Edit Account</h2>
                        </div>
                        <button type="button" className="panel-action-btn" onClick={closeYazanSyncDraft}>
                          Back
                        </button>
                      </div>
                      <form
                        className="account-editor-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          saveYazanSyncDraft();
                        }}
                      >
                        <label className="account-editor-row">
                          <span>Account Name</span>
                          <input
                            className="account-input"
                            value={yazanSyncDraft.accountLabel}
                            onChange={(event) => {
                              updateYazanSyncDraft("accountLabel", event.target.value);
                            }}
                            placeholder="Roman Capital Primary"
                          />
                        </label>
                        <label className="account-editor-row">
                          <span>Broker</span>
                          <input
                            className="account-input"
                            value={yazanSyncDraft.broker}
                            onChange={(event) => {
                              updateYazanSyncDraft("broker", event.target.value);
                            }}
                            placeholder="TradeLocker"
                          />
                        </label>
                        <label className="account-editor-row">
                          <span>Platform</span>
                          <input
                            className="account-input"
                            value={yazanSyncDraft.platform}
                            onChange={(event) => {
                              updateYazanSyncDraft("platform", event.target.value);
                            }}
                            placeholder="Rithmic"
                          />
                        </label>
                        <label className="account-editor-row">
                          <span>Account Number</span>
                          <input
                            className="account-input"
                            value={yazanSyncDraft.accountNumber}
                            onChange={(event) => {
                              updateYazanSyncDraft("accountNumber", event.target.value);
                            }}
                            placeholder="YZ-884201"
                          />
                        </label>
                        <div className="account-editor-actions">
                          <button type="submit" className="account-submit-btn account-editor-submit">
                            Save
                          </button>
                        </div>
                      </form>
                    </>
                  ) : (
                    <>
                      <div className="watchlist-head">
                        <div>
                          <h2>Models / People</h2>
                        </div>
                      </div>
                      <ul className="model-list">
                        {modelProfiles.map((model) => {
                          const selected = model.id === selectedModelId;
                          const isYazan = model.id === "yazan";

                          return (
                            <li key={model.id}>
                              <button
                                type="button"
                                className={`model-row ${selected ? "selected" : ""}`}
                                onClick={() => {
                                  setSelectedModelId(model.id);
                                  setShowYazanAccountMenu(false);

                                  if (model.id !== "yazan") {
                                    setShowYazanSyncDraft(false);
                                  }
                                }}
                                onContextMenu={(event) => {
                                  if (!isAdmin || !isYazan) {
                                    return;
                                  }

                                  event.preventDefault();
                                  setSelectedModelId("yazan");
                                  setShowYazanSyncDraft(false);
                                  setYazanAccountMenuPosition({
                                    x: Math.max(12, Math.min(event.clientX + 6, window.innerWidth - 188)),
                                    y: Math.max(18, event.clientY - 108)
                                  });
                                  setShowYazanAccountMenu(true);
                                }}
                                title={
                                  isAdmin && isYazan
                                    ? "Right-click for account options"
                                    : model.name
                                }
                              >
                                <span className="model-main">
                                  <span className="model-name">{model.name}</span>
                                  <span className="model-kind">{model.kind}</span>
                                </span>
                                {isYazan && yazanAccountSummary ? (
                                  <span className="model-account">{yazanAccountSummary}</span>
                                ) : model.accountNumber ? (
                                  <span className="model-account">
                                    Yazan Account #{model.accountNumber}
                                  </span>
                                ) : null}
                                <span className="model-state">{selected ? "Selected" : "Select"}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              ) : null}

              {activePanelTab === "history" ? (
                <div className="tab-view">
                  <div className="watchlist-head with-action">
                    <div>
                      <h2>History</h2>
                    </div>
                    <div className="panel-head-actions">
                      <button
                        type="button"
                        className={`panel-action-btn panel-mode-btn ${
                          chartSimulationEnabled ? "on" : "off"
                        }`}
                        onClick={() => setChartSimulationEnabled((current) => !current)}
                      >
                        {chartSimulationEnabled ? "Simulation ON" : "Simulation OFF"}
                      </button>
                      <button
                        type="button"
                        className="panel-action-btn"
                        onClick={() => {
                          const next = !showAllTradesOnChart;
                          setShowAllTradesOnChart(next);
                          focusTradeIdRef.current = null;

                          if (next) {
                            setSelectedHistoryId(null);
                          }
                        }}
                      >
                        {showAllTradesOnChart ? "Hide All On Chart" : "Show All On Chart"}
                      </button>
                    </div>
                  </div>
                  {historyRows.length > 0 ? (
                    <ul className="history-list">
                      {historyRows.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={`history-row ${
                              selectedHistoryId === item.id ? "selected" : ""
                            }`}
                            onClick={() => {
                              focusTradeIdRef.current = item.id;
                              setSelectedHistoryId(item.id);
                              setSelectedSymbol(item.symbol);
                              setShowAllTradesOnChart(false);
                            }}
                          >
                            <span className="history-info">
                              <span className="history-main">
                                <span
                                  className={`history-action ${
                                    item.pnlUsd < 0 ? "down" : "up"
                                  }`}
                                >
                                  {formatSignedUsd(item.pnlUsd)}
                                </span>
                                <span className="history-symbol">{item.symbol}</span>
                              </span>
                              <span className="history-levels">
                                {item.side === "Long" ? "Buy" : "Sell"} {formatPrice(item.entryPrice)} | TP{" "}
                                {formatPrice(item.targetPrice)} | SL {formatPrice(item.stopPrice)}
                              </span>
                            </span>
                            <span className="history-meta">
                              <span className={item.pnlPct < 0 ? "down" : "up"}>
                                {item.pnlPct >= 0 ? "+" : ""}
                                {item.pnlPct.toFixed(2)}%
                              </span>
                              <span>{item.time}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="ai-placeholder">
                      <p>
                        {chartSimulationEnabled
                          ? "No replay trades are available for the current futures slice."
                          : "History simulation is turned off."}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}

              {activePanelTab === "actions" ? (
                <div className="tab-view">
                  <div className="watchlist-head with-action">
                    <div>
                      <h2>Action</h2>
                    </div>
                    <div className="panel-head-actions">
                      <button
                        type="button"
                        className={`panel-action-btn panel-mode-btn ${
                          chartSimulationEnabled ? "on" : "off"
                        }`}
                        onClick={() => setChartSimulationEnabled((current) => !current)}
                      >
                        {chartSimulationEnabled ? "Simulation ON" : "Simulation OFF"}
                      </button>
                    </div>
                  </div>
                  {actionRows.length > 0 ? (
                    <ul className="history-list">
                      {actionRows.map((action) => (
                        <li key={action.id}>
                          <button
                            type="button"
                            className={`history-row ${selectedHistoryId === action.tradeId ? "selected" : ""}`}
                            onClick={() => {
                              focusTradeIdRef.current = action.tradeId;
                              setSelectedHistoryId(action.tradeId);
                              setSelectedSymbol(action.symbol);
                              setShowAllTradesOnChart(false);
                            }}
                          >
                            <span className="history-info">
                              <span className="history-main">
                                <span className="history-action">{action.label}</span>
                                <span className="history-symbol">{action.symbol}</span>
                              </span>
                              <span className="history-levels">{action.details}</span>
                            </span>
                            <span className="history-meta">
                              <span>{action.time}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="ai-placeholder">
                      <p>
                        {chartSimulationEnabled
                          ? "No order actions are available for the current replay."
                          : "Action simulation is turned off."}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}

            </div>
          ) : null}
        </aside>
          </section>
        </div>
      </section>

      <footer className="statusbar">
        <span>Account: {currentAccountLabel}</span>
        <span>{selectedAsset.symbol}</span>
        <span>{selectedTimeframe}</span>
        <span>Model: {selectedModel.name}</span>
        <span>Feed: {feedStatusLabel}</span>
        <span>{marketError ? "Feed unavailable" : `Contract: ${selectedAsset.contract}`}</span>
        <span>UTC</span>
      </footer>
    </main>
  );
}
