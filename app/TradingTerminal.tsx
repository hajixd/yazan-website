"use client";

import Image from "next/image";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type CandlestickData,
  type Coordinate,
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
import type {
  DatabentoLatestTradeResponse,
  DatabentoLiveEvent,
  DatabentoOrderBookSnapshot
} from "../lib/databentoLive";
import { type FutureAsset, futuresAssets, getAssetBySymbol } from "../lib/futuresCatalog";
import {
  listRomanSeenNotificationIds,
  markRomanNotificationEventsDelivered,
  markRomanNotificationEventsSeen,
  requestRomanNotificationPermission,
  showRomanNotification,
  syncRomanNotificationDevice,
  upsertRomanNotificationEvents
} from "../lib/romanNotificationCenter";
import {
  type AccountSyncDraft,
  type BrokerSyncVerifyResponse,
  type SavedAccountSync,
  type SyncProvider,
  type WebhookAuthMode,
  TRADESYNC_AUTH_URL,
  TRADESYNC_CREATE_ACCOUNT_URL,
  TRADESYNC_INTRO_BROKER_URL,
  TRADESYNC_WEBHOOKS_URL,
  TRADOVATE_API_ACCESS_URL,
  TRADOVATE_AUTH_OPTIONS_URL,
  TRADOVATE_MARKET_DATA_URL,
  TRADOVATE_PERMISSIONS_URL,
  YAZAN_SYNC_STORAGE_KEY,
  buildDefaultTradesyncWebhookUrl,
  createDefaultSyncDraft,
  getSyncProviderLabel,
  normalizeSavedAccountSync,
  sanitizeAccountSyncDraft
} from "../lib/brokerSync";

type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";
type PanelTab =
  | "active"
  | "assets"
  | "models"
  | "history"
  | "actions"
  | "marketMaker"
  | "orderFlow";
type AccountRole = "Admin" | "User";
type MobileWorkspaceTab = "trade" | "history";

type Candle = {
  open: number;
  close: number;
  high: number;
  low: number;
  time: number;
};

type TradeResult = "Win" | "Loss";
type TradeSide = "Long" | "Short";
type TradeLifecycleStatus = "open" | "closed";

type HistoryItem = {
  id: string;
  symbol: string;
  side: TradeSide;
  result: TradeResult;
  status: TradeLifecycleStatus;
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

type OrderFlowTone = "up" | "down" | "neutral";
type OrderFlowSide = "A" | "B" | "N";

type OrderFlowRow = {
  id: string;
  symbol: string;
  timeMs: number;
  price: number;
  size: number;
  tone: OrderFlowTone;
  side: OrderFlowSide;
  sequence: number;
};

type NotificationTone = "up" | "down" | "neutral";

type NotificationItem = {
  id: string;
  title: string;
  details: string;
  time: string;
  timestamp: number;
  tone: NotificationTone;
  symbol?: string | null;
  tradeId?: string | null;
  entityType?: string | null;
  actionCode?: string | null;
  link?: string;
  live?: boolean;
};

type WatchlistFetchMeta = {
  lastAttemptAt: number;
  lastSuccessAt: number;
  failureCount: number;
  lastError: string | null;
};

type SparklineGeometry = {
  width: number;
  height: number;
  path: string;
  points: Array<{ x: number; y: number }>;
  values: number[];
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
  schema?: string;
  resolvedSymbol?: string | null;
};

type MarketFeedResponse = {
  candles?: Candle[];
  meta?: MarketFeedMeta;
  error?: string;
};

type LiveTradeResponse = DatabentoLatestTradeResponse;

type AccountMenuPosition = {
  x: number;
  y: number;
};

type AssetDropPlacement = "before" | "after";

type DrawingTool =
  | "cursor"
  | "trendline"
  | "arrow"
  | "ray"
  | "horizontal"
  | "vertical"
  | "rectangle"
  | "ellipse"
  | "measure"
  | "longPosition"
  | "shortPosition"
  | "fibonacci";

type DrawingPoint = {
  time: number;
  price: number;
};

type ChartDrawing = {
  id: string;
  tool: Exclude<DrawingTool, "cursor">;
  points: DrawingPoint[];
  color: string;
  createdAt: number;
};

type DrawingDraft = {
  tool: Extract<
    DrawingTool,
    | "trendline"
    | "arrow"
    | "ray"
    | "rectangle"
    | "ellipse"
    | "measure"
    | "longPosition"
    | "shortPosition"
    | "fibonacci"
  >;
  start: DrawingPoint;
  current: DrawingPoint;
};

type ChartViewportSize = {
  width: number;
  height: number;
};

type DrawingDragBounds = {
  minTime: number;
  maxTime: number;
  minPrice: number;
  maxPrice: number;
};

type OrderBookSnapshot = DatabentoOrderBookSnapshot;

type CandleRequestOptions = {
  signal?: AbortSignal;
  beforeMs?: number;
};

const ACCOUNT_GATE_STORAGE_KEY = "yazan-active-account";
const ASSET_ORDER_STORAGE_KEY = "roman-asset-order";
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

const isLiveDepthSchemaMessage = (message: string, schema?: string) => {
  return (
    schema === "mbp-10" ||
    schema === "mbo" ||
    schema === "mbp-1" ||
    schema === "bbo-1s" ||
    /\b(?:mbp-10|mbo|mbp-1|bbo-1s)\b/i.test(message)
  );
};

const formatLiveDepthStatusMessage = (message: string, schema?: string) => {
  if (/(not authorized|not entitled|permission|license|subscription)/i.test(message)) {
    return schema === "mbp-1" || schema === "bbo-1s"
      ? "Live top-of-book quote requires a Databento depth entitlement."
      : "Live order book requires a Databento depth entitlement.";
  }

  return message || "Live order book is currently unavailable.";
};

const getLiveBookSchemaRank = (schema?: string | null) => {
  switch (schema) {
    case "mbo":
      return 4;
    case "mbp-10":
      return 3;
    case "mbp-1":
      return 2;
    case "bbo-1s":
      return 1;
    default:
      return 0;
  }
};

const isTopOfBookSchema = (schema?: string | null) => {
  return schema === "mbp-1" || schema === "bbo-1s";
};

const isOrderBookDepthSchema = (schema?: string | null) => {
  return schema === "mbo" || schema === "mbp-10" || schema === "mbp-1";
};

const getOrderFlowTone = (
  side: string | null | undefined,
  price: number,
  previousPrice: number | null
): OrderFlowTone => {
  if (side === "B") {
    return "up";
  }

  if (side === "A") {
    return "down";
  }

  if (previousPrice !== null) {
    if (price > previousPrice) {
      return "up";
    }

    if (price < previousPrice) {
      return "down";
    }
  }

  return "neutral";
};

const isLikelyLocalHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase();

  return (
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "[::1]" ||
    normalized.endsWith(".local") ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized) ||
    /^10(?:\.\d{1,3}){3}$/.test(normalized) ||
    /^192\.168(?:\.\d{1,3}){2}$/.test(normalized) ||
    /^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(normalized)
  );
};

const timeframes: Timeframe[] = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];
const defaultAssetOrder = futuresAssets.map((asset) => asset.symbol);

const normalizeAssetOrder = (order: string[]): string[] => {
  const validSymbols = new Set(defaultAssetOrder);
  const next: string[] = [];

  for (const symbol of order) {
    if (!validSymbols.has(symbol) || next.includes(symbol)) {
      continue;
    }

    next.push(symbol);
  }

  if (next.length > 0) {
    return next;
  }

  return defaultAssetOrder[0] ? [defaultAssetOrder[0]] : [];
};

const matchesAssetSearch = (asset: FutureAsset, query: string) => {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [asset.symbol, asset.name, asset.category, asset.venue, asset.contract].some((field) =>
    field.toLowerCase().includes(normalizedQuery)
  );
};

const rankAssetSearchMatch = (asset: FutureAsset, query: string) => {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return 0;
  }

  const symbol = asset.symbol.toLowerCase();
  const name = asset.name.toLowerCase();

  if (symbol === normalizedQuery) {
    return 3;
  }

  if (symbol.startsWith(normalizedQuery)) {
    return 2;
  }

  if (name.startsWith(normalizedQuery)) {
    return 1;
  }

  return 0;
};

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

const modelProfiles: ModelProfile[] = [];

const INTERNAL_SIMULATION_MODEL: ModelProfile = {
  id: "roman-simulation-engine",
  name: "Roman Simulation",
  kind: "Model",
  riskMin: 0.35,
  riskMax: 1.15,
  rrMin: 1.3,
  rrMax: 2.8,
  longBias: 0.54,
  winRate: 0.58
};

const buildSimulationProfileFromConnection = (connection: SavedAccountSync): ModelProfile => {
  const identity =
    connection.providerConnectionId ||
    connection.providerAccountId ||
    connection.providerAccountNumber ||
    connection.accountNumber ||
    connection.providerUserName ||
    connection.username ||
    connection.connectionLabel ||
    "connected-account";
  const seed = hashString(`connection-sim-${identity}`);
  const rand = createSeededRng(seed);
  const preferredName =
    connection.providerAccountName ||
    connection.accountLabel ||
    connection.connectionLabel ||
    getSyncProviderLabel(connection.provider);

  return {
    id: `connection-sim-${identity}`,
    name: preferredName,
    kind: "Model",
    accountNumber:
      connection.providerAccountNumber || connection.accountNumber || connection.providerAccountId || undefined,
    riskMin: 0.28 + rand() * 0.26,
    riskMax: 0.84 + rand() * 0.52,
    rrMin: 1.2 + rand() * 0.45,
    rrMax: 2.05 + rand() * 0.9,
    longBias: 0.38 + rand() * 0.28,
    winRate: 0.46 + rand() * 0.18
  };
};

const sidebarTabs: Array<{ id: PanelTab; label: string; compactLabel?: boolean }> = [
  { id: "active", label: "Active" },
  { id: "assets", label: "Assets" },
  { id: "models", label: "Models" },
  { id: "history", label: "History" },
  { id: "actions", label: "Action" },
  { id: "marketMaker", label: "Market Maker", compactLabel: true },
  { id: "orderFlow", label: "Order Flow", compactLabel: true }
];

const candleHistoryCountByTimeframe: Record<Timeframe, number> = {
  "1m": 10_080,
  "5m": 8_640,
  "15m": 5_760,
  "1H": 4_320,
  "4H": 3_000,
  "1D": 3_000,
  "1W": 1_040
};

const MAX_CHART_CANDLE_COUNT = 20_000;
const CHART_BACKFILL_TRIGGER_BUFFER = 35;
const WATCHLIST_REFRESH_INTERVAL_MS = 30_000;
const LIVE_STREAM_FLUSH_INTERVAL_MS = 80;
const LIVE_STREAM_BOOTSTRAP_TIMEOUT_MS = 4_000;
const HOSTED_LIVE_STREAM_BOOTSTRAP_TIMEOUT_MS = 12_000;
const LIVE_STREAM_RECONNECT_GRACE_MS = 8_000;
const SIMULATION_TICK_INTERVAL_MS = 1_000;
const WATCHLIST_FETCH_BATCH_SIZE = 2;
const WATCHLIST_FETCH_RETRY_ATTEMPTS = 1;
const NOTIFICATION_LIVE_WINDOW_MS = 10 * 60_000;
const MIN_MULTI_ASSET_TRADE_CANDLES = 40;
const DEFAULT_YAZAN_SYNC_DRAFT: AccountSyncDraft = createDefaultSyncDraft("tradovate");
const YAZAN_ACCOUNT_MENU_WIDTH = 188;
const YAZAN_ACCOUNT_MENU_HEIGHT = 118;
const CHART_DRAWINGS_STORAGE_KEY = "roman-chart-drawings-v1";
const CHART_DRAWING_COLOR = "#9ec9ff";
const CHART_DRAWING_COLOR_PALETTE = [
  "#9ec9ff",
  "#69f0b3",
  "#ffd66b",
  "#ff8aa3",
  "#d8a3ff",
  "#f6fbff",
  "#ff934f",
  "#59d8ff"
] as const;

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

const formatClockMillis = (timestampMs: number): string => {
  const date = new Date(timestampMs);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

const getTickPrecision = (tickSize: number): number => {
  if (!Number.isFinite(tickSize) || tickSize <= 0) {
    return 2;
  }

  const normalized = tickSize.toString();

  if (normalized.includes("e-")) {
    const [, exponent = "0"] = normalized.split("e-");
    return Number(exponent);
  }

  const decimals = normalized.split(".")[1];

  return decimals ? decimals.length : 0;
};

const roundToTick = (value: number, tickSize: number): number => {
  if (!Number.isFinite(tickSize) || tickSize <= 0) {
    return value;
  }

  return Math.round(value / tickSize) * tickSize;
};

const formatPriceByTick = (value: number, tickSize: number): string => {
  const precision = getTickPrecision(tickSize);

  return value.toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  });
};

const formatDepthSize = (value: number): string => {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 0
  });
};

const formatSignedPriceDelta = (value: number, tickSize: number): string => {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatPriceByTick(Math.abs(value), tickSize)}`;
};

const formatSignedPercent = (value: number): string => {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
};

const getDrawingLineMetrics = (start: DrawingPoint, end: DrawingPoint, timeframe: Timeframe) => {
  const priceDelta = end.price - start.price;
  const percentDelta = start.price > 0 ? (priceDelta / start.price) * 100 : 0;
  const timeDeltaMs = end.time - start.time;
  const bars = Math.max(1, Math.round(Math.abs(timeDeltaMs) / Math.max(60_000, getTimeframeMs(timeframe))));

  return {
    priceDelta,
    percentDelta,
    bars
  };
};

const getDrawingRangeLabel = (
  start: DrawingPoint,
  end: DrawingPoint,
  tickSize: number,
  timeframe: Timeframe
) => {
  const priceDelta = end.price - start.price;
  const percentDelta = start.price > 0 ? (priceDelta / start.price) * 100 : 0;
  const barCount = Math.max(1, Math.round(Math.abs(end.time - start.time) / getTimeframeMs(timeframe)));

  return `${formatSignedPriceDelta(priceDelta, tickSize)}  ${formatSignedPercent(percentDelta)}  ${barCount} bars`;
};

const createDrawingId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `drawing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeDrawingPoint = (
  point: DrawingPoint,
  timeframe: Timeframe,
  tickSize: number
): DrawingPoint => {
  const timeframeMs = getTimeframeMs(timeframe);

  return {
    time: Math.round(point.time / timeframeMs) * timeframeMs,
    price: roundToTick(point.price, tickSize)
  };
};

const shiftDrawingPoint = (
  point: DrawingPoint,
  deltaTimeMs: number,
  deltaPrice: number,
  timeframe: Timeframe,
  tickSize: number
): DrawingPoint => {
  return normalizeDrawingPoint(
    {
      time: point.time + deltaTimeMs,
      price: point.price + deltaPrice
    },
    timeframe,
    tickSize
  );
};

const shiftChartDrawing = (
  drawing: ChartDrawing,
  deltaTimeMs: number,
  deltaPrice: number,
  timeframe: Timeframe,
  tickSize: number
): ChartDrawing => {
  return {
    ...drawing,
    points: drawing.points.map((point) =>
      shiftDrawingPoint(point, deltaTimeMs, deltaPrice, timeframe, tickSize)
    )
  };
};

const buildDrawingDragBoundsFromCandles = (
  candles: Candle[],
  tickSize: number
): DrawingDragBounds | null => {
  if (candles.length === 0) {
    return null;
  }

  const minTime = candles[0]?.time ?? 0;
  const maxTime = candles[candles.length - 1]?.time ?? minTime;
  const candleLow = Math.min(...candles.map((candle) => candle.low));
  const candleHigh = Math.max(...candles.map((candle) => candle.high));
  const pricePadding = Math.max(tickSize * 8, (candleHigh - candleLow) * 0.18, tickSize);

  return {
    minTime,
    maxTime,
    minPrice: Math.max(tickSize, candleLow - pricePadding),
    maxPrice: candleHigh + pricePadding
  };
};

const shiftChartDrawingWithinBounds = (
  drawing: ChartDrawing,
  deltaTimeMs: number,
  deltaPrice: number,
  bounds: DrawingDragBounds | null,
  timeframe: Timeframe,
  tickSize: number
): ChartDrawing => {
  if (drawing.points.length === 0 || !bounds) {
    return drawing;
  }

  const { minTime, maxTime, minPrice, maxPrice } = bounds;
  const minPointTime = Math.min(...drawing.points.map((point) => point.time));
  const maxPointTime = Math.max(...drawing.points.map((point) => point.time));
  const timeShift = clamp(deltaTimeMs, minTime - minPointTime, maxTime - maxPointTime);
  const minPointPrice = Math.min(...drawing.points.map((point) => point.price));
  const maxPointPrice = Math.max(...drawing.points.map((point) => point.price));
  const priceShift = clamp(deltaPrice, minPrice - minPointPrice, maxPrice - maxPointPrice);

  return shiftChartDrawing(drawing, timeShift, priceShift, timeframe, tickSize);
};

const chartDrawingTools: Array<{
  tool: DrawingTool;
  label: string;
  shortcut: string;
  detail: string;
}> = [
  {
    tool: "cursor",
    label: "Cursor",
    shortcut: "Esc",
    detail: "Select drawings and pan the chart."
  },
  {
    tool: "trendline",
    label: "Trend Line",
    shortcut: "T",
    detail: "Click once to anchor and once to finish."
  },
  {
    tool: "arrow",
    label: "Arrow",
    shortcut: "G",
    detail: "Draw a directional move with an arrow head and delta tag."
  },
  {
    tool: "ray",
    label: "Ray",
    shortcut: "A",
    detail: "Click twice to project a price path to the edge."
  },
  {
    tool: "horizontal",
    label: "Horizontal Line",
    shortcut: "H",
    detail: "Click a price level to mark it."
  },
  {
    tool: "vertical",
    label: "Vertical Line",
    shortcut: "V",
    detail: "Click a candle time to mark the moment."
  },
  {
    tool: "rectangle",
    label: "Range Box",
    shortcut: "R",
    detail: "Click two corners to frame a zone."
  },
  {
    tool: "ellipse",
    label: "Ellipse",
    shortcut: "O",
    detail: "Circle a reaction area with a soft highlighted ellipse."
  },
  {
    tool: "measure",
    label: "Measure",
    shortcut: "M",
    detail: "Measure price, percent, and bar distance between two points."
  },
  {
    tool: "longPosition",
    label: "Long Position",
    shortcut: "L",
    detail: "Click entry first, then drag to size the long setup."
  },
  {
    tool: "shortPosition",
    label: "Short Position",
    shortcut: "S",
    detail: "Click entry first, then drag to size the short setup."
  },
  {
    tool: "fibonacci",
    label: "Fibonacci",
    shortcut: "F",
    detail: "Click swing start and end to lay out retracement levels."
  }
];

const chartDrawingToolGroups: Array<{
  id: string;
  label: string;
  tools: DrawingTool[];
}> = [
  {
    id: "select",
    label: "Select",
    tools: ["cursor"]
  },
  {
    id: "structure",
    label: "Structure",
    tools: ["trendline", "arrow", "ray", "horizontal", "vertical", "rectangle", "ellipse"]
  },
  {
    id: "position",
    label: "Position",
    tools: ["longPosition", "shortPosition", "fibonacci", "measure"]
  }
];

const renderDrawingToolIcon = (tool: DrawingTool) => {
  switch (tool) {
    case "cursor":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M4.5 3.5v13l3.2-4.2 3.1 2 1.4-2.3-3.2-2 4.6-1.4z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "trendline":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="5" cy="14.5" r="1.6" fill="currentColor" />
          <circle cx="14.5" cy="5.5" r="1.6" fill="currentColor" />
          <path d="M5.9 13.6 13.6 5.9" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case "arrow":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M4.8 14.4 14.8 5.6m0 0H11m3.8 0v3.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "ray":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="5" cy="14.5" r="1.6" fill="currentColor" />
          <path
            d="M5.9 13.6 15 4.5m0 0v4.2m0-4.2H10.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "horizontal":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3.5 10h13" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="6" cy="10" r="1.4" fill="currentColor" />
          <circle cx="14" cy="10" r="1.4" fill="currentColor" />
        </svg>
      );
    case "vertical":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 3.5v13" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="6" r="1.4" fill="currentColor" />
          <circle cx="10" cy="14" r="1.4" fill="currentColor" />
        </svg>
      );
    case "rectangle":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect
            x="4.2"
            y="5.2"
            width="11.6"
            height="9.6"
            rx="1.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      );
    case "ellipse":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <ellipse
            cx="10"
            cy="10"
            rx="6"
            ry="4.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      );
    case "measure":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4.4 15.2 15.6 4.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5.8 4.8v3.4M9.4 4.8v3.4M13 4.8v3.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "longPosition":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 15.2V4.8m0 0-3 3m3-3 3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4.5 13.7h11" fill="none" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2.4 2.4" />
        </svg>
      );
    case "shortPosition":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 4.8v10.4m0 0-3-3m3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4.5 6.3h11" fill="none" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2.4 2.4" />
        </svg>
      );
    case "fibonacci":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 5.3h10M5 9.2h7.4M5 13.2h5.1M5 16h3.3" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
};

const renderToolbarActionIcon = (action: "delete" | "clear") => {
  if (action === "delete") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M6 6.5h8m-6.6 0 .3 8h3.6l.3-8m-4.7 0 .7-1.8h3l.7 1.8M7.4 6.5l.2 8m4.8-8-.2 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M5 6.5h10m-8.4 0 .4 8h6l.4-8m-7.1 0 .8-1.8h4.2l.8 1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4.5 10.5h11" fill="none" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2.2 2.2" />
    </svg>
  );
};

const formatMobileDate = (timestampMs: number): string => {
  return new Date(timestampMs).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

const formatMobileTime = (timestampMs: number): string => {
  return new Date(timestampMs).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
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

const CHART_TIME_ZONE = "America/New_York";
const chartEasternTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CHART_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true
});
const chartEasternDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CHART_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true
});
const chartEasternMonthDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CHART_TIME_ZONE,
  month: "short",
  day: "numeric"
});
const chartEasternMonthFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CHART_TIME_ZONE,
  month: "short"
});
const chartEasternPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CHART_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hour12: false
});

const getChartEasternParts = (timestampMs: number) => {
  const parts = chartEasternPartsFormatter.formatToParts(new Date(timestampMs));
  const readPart = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value ?? "0";
    return Number(value);
  };

  return {
    year: readPart("year"),
    month: readPart("month"),
    day: readPart("day"),
    hour: readPart("hour"),
    minute: readPart("minute"),
    second: readPart("second")
  };
};

const formatChartCrosshairTime = (time: Time): string => {
  const timestampSeconds = parseTimeFromCrosshair(time);

  if (timestampSeconds === null) {
    return "";
  }

  return `${chartEasternDateTimeFormatter.format(new Date(timestampSeconds * 1000))} ET`;
};

const formatChartTickLabel = (time: Time): string | null => {
  const timestampSeconds = parseTimeFromCrosshair(time);

  if (timestampSeconds === null) {
    return null;
  }

  const timestampMs = timestampSeconds * 1000;
  const parts = getChartEasternParts(timestampMs);
  const date = new Date(timestampMs);

  if ((parts.hour === 0 || parts.hour === 24) && parts.minute === 0 && parts.second === 0) {
    if (parts.month === 1 && parts.day === 1) {
      return String(parts.year);
    }

    if (parts.day === 1) {
      return chartEasternMonthFormatter.format(date);
    }

    return chartEasternMonthDayFormatter.format(date);
  }

  return chartEasternTimeFormatter.format(date);
};

const formatChartBadgeTime = (timestampMs: number): string => {
  return chartEasternTimeFormatter.format(new Date(timestampMs));
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

const createSimulationMarketMeta = (
  symbol: string,
  timeframe: Timeframe,
  timestampMs = Date.now()
): MarketFeedMeta => ({
  provider: "Simulation",
  dataset: "local",
  sourceTimeframe: timeframe,
  databentoSymbol: symbol,
  updatedAt: new Date(timestampMs).toISOString()
});

const applyLiveTradeToCandles = (
  activeSeries: Candle[],
  tradePrice: number,
  tradeTime: number,
  timeframe: Timeframe
): Candle[] | null => {
  if (activeSeries.length === 0) {
    return null;
  }

  const tradeBucketTime = floorToTimeframe(tradeTime, timeframe);
  const latestSeriesCandle = activeSeries[activeSeries.length - 1];

  if (!latestSeriesCandle || latestSeriesCandle.time > tradeBucketTime) {
    return null;
  }

  const nextLiveCandle =
    latestSeriesCandle.time === tradeBucketTime
      ? {
          ...latestSeriesCandle,
          high: Math.max(latestSeriesCandle.high, tradePrice),
          low: Math.min(latestSeriesCandle.low, tradePrice),
          close: tradePrice
        }
      : {
          time: tradeBucketTime,
          open: latestSeriesCandle.close,
          high: Math.max(latestSeriesCandle.close, tradePrice),
          low: Math.min(latestSeriesCandle.close, tradePrice),
          close: tradePrice
        };

  if (
    latestSeriesCandle.time === nextLiveCandle.time &&
    latestSeriesCandle.open === nextLiveCandle.open &&
    latestSeriesCandle.high === nextLiveCandle.high &&
    latestSeriesCandle.low === nextLiveCandle.low &&
    latestSeriesCandle.close === nextLiveCandle.close
  ) {
    return null;
  }

  return mergeCandles(activeSeries, [nextLiveCandle]).slice(-MAX_CHART_CANDLE_COUNT);
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

const buildTradeBlueprintId = (
  modelId: string,
  symbol: string,
  tradeIndex: number,
  entryMs: number,
  exitMs: number
) => {
  return `${modelId}-${symbol}-t${String(tradeIndex + 1).padStart(2, "0")}-${entryMs}-${exitMs}`;
};

const shouldRequestWatchlistHistory = (
  candles: Candle[],
  timeframe: Timeframe,
  referenceNowMs: number
) => {
  if (candles.length < MIN_MULTI_ASSET_TRADE_CANDLES) {
    return true;
  }

  const latestTime = candles[candles.length - 1]?.time ?? 0;

  if (latestTime <= 0) {
    return true;
  }

  return referenceNowMs - latestTime > getTimeframeMs(timeframe) * 3;
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
      id: buildTradeBlueprintId(model.id, symbol, i, candles[entryIndex].time, candles[exitIndex].time),
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

const buildSparklineGeometry = (
  values: number[],
  width = 312,
  height = 166
): SparklineGeometry | null => {
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length < 2) {
    return null;
  }

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const range = Math.max(0.000001, max - min);
  const stepX = width / Math.max(1, finiteValues.length - 1);
  const points = finiteValues.map((value, index) => {
    const x = index * stepX;
    const normalized = (value - min) / range;
    const y = height - normalized * (height - 8) - 4;

    return {
      x,
      y
    };
  });

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  return {
    width,
    height,
    path,
    points,
    values: finiteValues
  };
};

const getMobileHistoryRailTone = (trade: HistoryItem): "tp" | "sl" => {
  return trade.result === "Win" ? "tp" : "sl";
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
    const rand = createSeededRng(hashString(`mapped-${blueprint.id}-${blueprint.symbol}`));
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
      status: "closed",
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

const buildActiveTradeFromCandles = (
  candles: Candle[],
  tradeBlueprints: TradeBlueprint[],
  projectedNowMs: number
): HistoryItem | null => {
  if (candles.length < 24 || tradeBlueprints.length === 0) {
    return null;
  }

  const blueprint = tradeBlueprints[0];

  if (!blueprint) {
    return null;
  }

  const entryIndex = findCandleIndexAtOrBefore(candles, blueprint.entryMs);
  const projectedIndex = findCandleIndexAtOrBefore(candles, projectedNowMs);
  const currentIndex = Math.min(
    candles.length - 1,
    Math.max(entryIndex + 1, projectedIndex >= 0 ? projectedIndex : candles.length - 1)
  );

  if (entryIndex < 0 || currentIndex <= entryIndex) {
    return null;
  }

  const rand = createSeededRng(hashString(`active-${blueprint.id}-${candles[currentIndex]?.time ?? 0}`));
  const entryPrice = candles[entryIndex]?.close ?? 0;
  const currentPrice = Math.max(0.000001, candles[currentIndex]?.close ?? entryPrice);

  if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(currentPrice)) {
    return null;
  }

  let atr = 0;
  let atrCount = 0;

  for (let i = Math.max(1, entryIndex - 20); i <= currentIndex; i += 1) {
    atr += candles[i].high - candles[i].low;
    atrCount += 1;
  }

  atr /= Math.max(1, atrCount);

  const riskPerUnit = Math.max(
    entryPrice * blueprint.riskPct,
    atr * (0.58 + rand() * 0.54),
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
  const pnlPct =
    blueprint.side === "Long"
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;
  const pnlUsd =
    blueprint.side === "Long"
      ? (currentPrice - entryPrice) * blueprint.units
      : (entryPrice - currentPrice) * blueprint.units;
  const result: TradeResult = pnlUsd >= 0 ? "Win" : "Loss";

  return {
    id: `active-${blueprint.id}`,
    symbol: blueprint.symbol,
    side: blueprint.side,
    result,
    status: "open",
    pnlPct,
    pnlUsd,
    entryTime: toUtcTimestamp(candles[entryIndex].time),
    exitTime: toUtcTimestamp(candles[currentIndex].time),
    entryPrice,
    targetPrice,
    stopPrice,
    outcomePrice: currentPrice,
    units: blueprint.units,
    entryAt: formatDateTime(candles[entryIndex].time),
    exitAt: "Open",
    time: formatDateTime(candles[entryIndex].time)
  };
};

const MobileWorkspaceTabIcon = ({ tab }: { tab: MobileWorkspaceTab }) => {
  if (tab === "trade") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          d="M5 16.5 9.4 11l3.2 3.2L19 6.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M7 6.5h10M7 12h10M7 17.5h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
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

  if (tab === "marketMaker") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <path d="M5.5 6.5h13" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 17.5h13" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 6.5v11" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 10h3.2M13.8 10H17M7 14h2.2M14.8 14H17" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (tab === "orderFlow") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <path d="M4.8 6.5h14.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M4.8 12h14.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M4.8 17.5h14.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 5v14M15.4 5v14" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.72" />
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
  const [assetOrder, setAssetOrder] = useState<string[]>(defaultAssetOrder);
  const [draggedAssetSymbol, setDraggedAssetSymbol] = useState<string | null>(null);
  const [assetDropTarget, setAssetDropTarget] = useState<{
    symbol: string;
    placement: AssetDropPlacement;
  } | null>(null);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    modelProfiles[0]?.id ?? INTERNAL_SIMULATION_MODEL.id
  );
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("15m");
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState<PanelTab>("active");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedActiveTradeId, setSelectedActiveTradeId] = useState<string | null>(null);
  const [chartSimulationEnabled, setChartSimulationEnabled] = useState(true);
  const [showAllTradesOnChart, setShowAllTradesOnChart] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [seenNotificationIds, setSeenNotificationIds] = useState<string[]>([]);
  const [isMobileWorkspace, setIsMobileWorkspace] = useState(false);
  const [isStandaloneMobileWorkspace, setIsStandaloneMobileWorkspace] = useState(false);
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState<MobileWorkspaceTab>("trade");
  const [mobileNowMs, setMobileNowMs] = useState(Date.now());
  const [mobileTradeChartScrubIndex, setMobileTradeChartScrubIndex] = useState<number | null>(null);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [seriesMap, setSeriesMap] = useState<Record<string, Candle[]>>({});
  const [watchlistSeriesMap, setWatchlistSeriesMap] = useState<Record<string, Candle[]>>({});
  const [timeframePreviewMap, setTimeframePreviewMap] = useState<Record<string, Candle[]>>({});
  const [marketFeedMeta, setMarketFeedMeta] = useState<MarketFeedMeta | null>(null);
  const [marketStatus, setMarketStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [marketError, setMarketError] = useState<string | null>(null);
  const [liveQuoteSnapshot, setLiveQuoteSnapshot] = useState<OrderBookSnapshot | null>(null);
  const [liveQuoteSchema, setLiveQuoteSchema] = useState<string | null>(null);
  const [liveOrderBookSnapshot, setLiveOrderBookSnapshot] = useState<OrderBookSnapshot | null>(null);
  const [orderFlowRows, setOrderFlowRows] = useState<OrderFlowRow[]>([]);
  const [quoteOrderBookExpanded, setQuoteOrderBookExpanded] = useState(false);
  const [liveDepthMessage, setLiveDepthMessage] = useState<string | null>(null);
  const [liveDepthSchema, setLiveDepthSchema] = useState<string | null>(null);
  const [chartReadyVersion, setChartReadyVersion] = useState(0);
  const [chartViewportVersion, setChartViewportVersion] = useState(0);
  const [chartViewportSize, setChartViewportSize] = useState<ChartViewportSize>({
    width: 0,
    height: 0
  });
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingTool>("cursor");
  const [activeDrawingColor, setActiveDrawingColor] = useState(CHART_DRAWING_COLOR);
  const [chartDrawingsByKey, setChartDrawingsByKey] = useState<Record<string, ChartDrawing[]>>({});
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [drawingDraft, setDrawingDraft] = useState<DrawingDraft | null>(null);
  const [yazanAccount, setYazanAccount] = useState<SavedAccountSync | null>(null);
  const [showYazanSyncDraft, setShowYazanSyncDraft] = useState(false);
  const [yazanSyncDraft, setYazanSyncDraft] = useState<AccountSyncDraft>(DEFAULT_YAZAN_SYNC_DRAFT);
  const [yazanSyncDraftMode, setYazanSyncDraftMode] = useState<"add" | "edit">("edit");
  const [yazanSyncSaving, setYazanSyncSaving] = useState(false);
  const [yazanSyncError, setYazanSyncError] = useState<string | null>(null);
  const [yazanSyncSuccess, setYazanSyncSuccess] = useState<string | null>(null);
  const [yazanSyncFieldErrors, setYazanSyncFieldErrors] = useState<
    Partial<Record<keyof AccountSyncDraft | "form", string>>
  >({});
  const [showYazanAccountMenu, setShowYazanAccountMenu] = useState(false);
  const [yazanAccountMenuPosition, setYazanAccountMenuPosition] = useState<AccountMenuPosition>({
    x: 0,
    y: 0
  });

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartDrawingOverlayRef = useRef<SVGSVGElement | null>(null);
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
  const seriesMapRef = useRef<Record<string, Candle[]>>({});
  const watchlistSeriesMapRef = useRef<Record<string, Candle[]>>({});
  const watchlistFetchMetaRef = useRef<Record<string, WatchlistFetchMeta>>({});
  const deliveredNotificationIdsRef = useRef<Set<string>>(new Set());
  const notificationSessionStartedAtRef = useRef(Date.now());
  const drawingDragStateRef = useRef<{
    drawingId: string;
    pointerStart: DrawingPoint;
    originalDrawing: ChartDrawing;
  } | null>(null);
  const mobileTradeChartRef = useRef<HTMLDivElement | null>(null);
  const mobileTradeChartPointerIdRef = useRef<number | null>(null);
  const currentSelectedKeyRef = useRef<string>("");
  const chartBackfillInFlightRef = useRef<Record<string, boolean>>({});
  const chartBackfillExhaustedRef = useRef<Record<string, boolean>>({});
  const pendingVisibleRangeShiftRef = useRef<Record<string, number>>({});
  const marketClockAnchorRef = useRef<{ capturedAtMs: number; marketTimeMs: number } | null>(null);
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

  useEffect(() => {
    if (showcaseMode || typeof window === "undefined") {
      return;
    }

    try {
      const storedConnection = window.localStorage.getItem(YAZAN_SYNC_STORAGE_KEY);

      if (!storedConnection) {
        return;
      }

      const parsedConnection = normalizeSavedAccountSync(JSON.parse(storedConnection));

      if (!parsedConnection) {
        return;
      }

      setYazanAccount(parsedConnection);
      setYazanSyncDraft(parsedConnection);
    } catch (error) {
      console.error("[Broker sync] Failed to restore the saved Yazan connection.", error);
    }
  }, [showcaseMode]);

  useEffect(() => {
    if (showcaseMode || typeof window === "undefined") {
      return;
    }

    try {
      if (!yazanAccount) {
        window.localStorage.removeItem(YAZAN_SYNC_STORAGE_KEY);
        return;
      }

      window.localStorage.setItem(YAZAN_SYNC_STORAGE_KEY, JSON.stringify(yazanAccount));
    } catch (error) {
      console.error("[Broker sync] Failed to persist the Yazan connection.", error);
    }
  }, [showcaseMode, yazanAccount]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const syncViewportMode = () => {
      setIsMobileWorkspace(mediaQuery.matches);
      setIsStandaloneMobileWorkspace(
        standaloneQuery.matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
      );
    };

    syncViewportMode();
    mediaQuery.addEventListener("change", syncViewportMode);
    standaloneQuery.addEventListener("change", syncViewportMode);

    return () => {
      mediaQuery.removeEventListener("change", syncViewportMode);
      standaloneQuery.removeEventListener("change", syncViewportMode);
    };
  }, []);

  useEffect(() => {
    if (!isMobileWorkspace || showcaseMode || activeAccountRole) {
      return;
    }

    setActiveAccountRole("User");
  }, [activeAccountRole, isMobileWorkspace, showcaseMode]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMobileNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    void listRomanSeenNotificationIds().then((ids) => {
      setSeenNotificationIds(ids);
    });
  }, []);

  useEffect(() => {
    void syncRomanNotificationDevice(
      typeof Notification !== "undefined" && Notification.permission === "granted"
    );
  }, []);

  useEffect(() => {
    try {
      const storedOrder = window.localStorage.getItem(ASSET_ORDER_STORAGE_KEY);

      if (!storedOrder) {
        return;
      }

      const parsed = JSON.parse(storedOrder);

      if (!Array.isArray(parsed)) {
        return;
      }

      setAssetOrder(normalizeAssetOrder(parsed.filter((value): value is string => typeof value === "string")));
    } catch {
      setAssetOrder(defaultAssetOrder);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ASSET_ORDER_STORAGE_KEY, JSON.stringify(normalizeAssetOrder(assetOrder)));
  }, [assetOrder]);

  useEffect(() => {
    if (selectedModelId && modelProfiles.some((model) => model.id === selectedModelId)) {
      return;
    }

    const nextModelId = modelProfiles[0]?.id ?? INTERNAL_SIMULATION_MODEL.id;

    if (selectedModelId !== nextModelId) {
      setSelectedModelId(nextModelId);
    }
  }, [selectedModelId]);

  const selectedAsset = useMemo(() => {
    return getAssetBySymbol(selectedSymbol);
  }, [selectedSymbol]);
  const selectedModel = useMemo(() => {
    return (
      modelProfiles.find((model) => model.id === selectedModelId) ??
      (selectedModelId === INTERNAL_SIMULATION_MODEL.id ? INTERNAL_SIMULATION_MODEL : null)
    );
  }, [selectedModelId]);
  const hasWorkspaceProfiles = modelProfiles.length > 0;
  const hasYazanProfile = modelProfiles.some((model) => model.id === "yazan");
  const selectedTradeOwnerModel = useMemo(() => {
    if (showcaseMode) {
      return selectedModel ?? INTERNAL_SIMULATION_MODEL;
    }

    if (hasWorkspaceProfiles) {
      return selectedModel;
    }

    if (yazanAccount) {
      return buildSimulationProfileFromConnection(yazanAccount);
    }

    return null;
  }, [hasWorkspaceProfiles, selectedModel, showcaseMode, yazanAccount]);

  const syncMarketClock = useCallback((marketTimeMs: number) => {
    if (!Number.isFinite(marketTimeMs) || marketTimeMs <= 0) {
      return;
    }

    marketClockAnchorRef.current = {
      capturedAtMs: Date.now(),
      marketTimeMs
    };
  }, []);

  const clearMarketClock = useCallback(() => {
    marketClockAnchorRef.current = null;
  }, []);

  const getProjectedMarketNowMs = useCallback(() => {
    if (showcaseMode) {
      return referenceNowMs;
    }

    const anchor = marketClockAnchorRef.current;

    if (!anchor) {
      return Date.now();
    }

    return Date.now() - (anchor.capturedAtMs - anchor.marketTimeMs);
  }, [referenceNowMs, showcaseMode]);

  useEffect(() => {
    clearMarketClock();
  }, [clearMarketClock, selectedSymbol, selectedTimeframe]);
  const orderedAssets = useMemo(() => {
    const assetMap = new Map(futuresAssets.map((asset) => [asset.symbol, asset]));
    const ordered: typeof futuresAssets = [];

    for (const symbol of normalizeAssetOrder(assetOrder)) {
      const asset = assetMap.get(symbol);

      if (asset) {
        ordered.push(asset);
      }
    }

    return ordered;
  }, [assetOrder]);
  const hiddenAssets = useMemo(() => {
    const enabledSymbols = new Set(orderedAssets.map((asset) => asset.symbol));
    return futuresAssets.filter((asset) => !enabledSymbols.has(asset.symbol));
  }, [orderedAssets]);
  const filteredHiddenAssets = useMemo(() => {
    const query = assetSearchQuery.trim();

    return hiddenAssets
      .filter((asset) => matchesAssetSearch(asset, query))
      .sort((left, right) => {
        const leftRank = rankAssetSearchMatch(left, query);
        const rightRank = rankAssetSearchMatch(right, query);

        if (leftRank !== rightRank) {
          return rightRank - leftRank;
        }

        return left.symbol.localeCompare(right.symbol);
      })
      .slice(0, query ? 8 : 6);
  }, [assetSearchQuery, hiddenAssets]);

  const selectedKey = symbolTimeframeKey(selectedSymbol, selectedTimeframe);
  const currentChartDrawings = useMemo(() => {
    return chartDrawingsByKey[selectedKey] ?? [];
  }, [chartDrawingsByKey, selectedKey]);
  const activeDrawingDraft = drawingDraft;

  useEffect(() => {
    if (orderedAssets.some((asset) => asset.symbol === selectedSymbol)) {
      return;
    }

    const fallbackSymbol = orderedAssets[0]?.symbol ?? defaultAssetOrder[0];

    if (!fallbackSymbol || fallbackSymbol === selectedSymbol) {
      return;
    }

    setSelectedSymbol(fallbackSymbol);
    setSelectedHistoryId(null);
    setShowAllTradesOnChart(false);
    focusTradeIdRef.current = null;
  }, [orderedAssets, selectedSymbol]);

  useEffect(() => {
    if (showcaseMode || typeof window === "undefined") {
      return;
    }

    try {
      const storedDrawings = window.localStorage.getItem(CHART_DRAWINGS_STORAGE_KEY);

      if (!storedDrawings) {
        return;
      }

      const parsed = JSON.parse(storedDrawings) as Record<string, ChartDrawing[]>;

      if (!parsed || typeof parsed !== "object") {
        return;
      }

      setChartDrawingsByKey(parsed);
    } catch (error) {
      console.error("[Chart drawings] Failed to restore saved drawings.", error);
    }
  }, [showcaseMode]);

  useEffect(() => {
    if (showcaseMode || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(CHART_DRAWINGS_STORAGE_KEY, JSON.stringify(chartDrawingsByKey));
    } catch (error) {
      console.error("[Chart drawings] Failed to persist drawings.", error);
    }
  }, [chartDrawingsByKey, showcaseMode]);

  useEffect(() => {
    setHoveredTime(null);
    setSelectedDrawingId(null);
    setDrawingDraft(null);
  }, [selectedKey]);

  useEffect(() => {
    if (selectedDrawingId && !currentChartDrawings.some((drawing) => drawing.id === selectedDrawingId)) {
      setSelectedDrawingId(null);
    }
  }, [currentChartDrawings, selectedDrawingId]);

  useEffect(() => {
    setMobileTradeChartScrubIndex(null);
  }, [mobileWorkspaceTab, selectedSymbol, selectedHistoryId]);

  useEffect(() => {
    currentSelectedKeyRef.current = selectedKey;
    chartBackfillInFlightRef.current[selectedKey] = false;
    chartBackfillExhaustedRef.current[selectedKey] = false;
    delete pendingVisibleRangeShiftRef.current[selectedKey];
  }, [selectedKey]);

  useEffect(() => {
    if (showcaseMode) {
      clearMarketClock();
      const simulationNowMs = referenceNowMs;
      chartBackfillInFlightRef.current[selectedKey] = false;
      chartBackfillExhaustedRef.current[selectedKey] = false;
      setSeriesMap((prev) => ({
        ...prev,
        [selectedKey]: generateFakeCandles(
          selectedAsset.basePrice,
          selectedSymbol,
          selectedTimeframe,
          candleHistoryCountByTimeframe[selectedTimeframe],
          simulationNowMs
        )
      }));
      setMarketFeedMeta(createSimulationMarketMeta(selectedSymbol, selectedTimeframe, simulationNowMs));
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
        const latestLoadedCandle = nextCandles[nextCandles.length - 1];

        if (latestLoadedCandle) {
          syncMarketClock(latestLoadedCandle.time + getTimeframeMs(selectedTimeframe) - 1);
        } else {
          clearMarketClock();
        }

        setMarketFeedMeta(payload.meta ?? null);
        setMarketStatus("ready");
        setMarketError(null);
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        const errorMessage =
          error instanceof Error ? error.message : "Failed to load market candles.";

        clearMarketClock();
        setMarketStatus("error");
        setMarketError(errorMessage);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    clearMarketClock,
    referenceNowMs,
    selectedAsset.basePrice,
    selectedKey,
    selectedSymbol,
    selectedTimeframe,
    syncMarketClock,
    showcaseMode
  ]);

  useEffect(() => {
    seriesMapRef.current = seriesMap;
  }, [seriesMap]);

  useEffect(() => {
    watchlistSeriesMapRef.current = watchlistSeriesMap;
  }, [watchlistSeriesMap]);

  useEffect(() => {
    if (showcaseMode) {
      const simulationNowMs = referenceNowMs;
      const next: Record<string, Candle[]> = {};

      for (const asset of orderedAssets) {
        const key = symbolTimeframeKey(asset.symbol, selectedTimeframe);
        next[key] = generateFakeCandles(
          asset.basePrice,
          asset.symbol,
          selectedTimeframe,
          multiAssetHistoryCountByTimeframe[selectedTimeframe],
          simulationNowMs
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
      const sortedAssets = [...orderedAssets].sort((left, right) => {
        const leftKey = symbolTimeframeKey(left.symbol, selectedTimeframe);
        const rightKey = symbolTimeframeKey(right.symbol, selectedTimeframe);
        const leftExisting = watchlistSeriesMapRef.current[leftKey] ?? [];
        const rightExisting = watchlistSeriesMapRef.current[rightKey] ?? [];
        const leftNeedsHistory = shouldRequestWatchlistHistory(
          leftExisting,
          selectedTimeframe,
          referenceNowMs
        );
        const rightNeedsHistory = shouldRequestWatchlistHistory(
          rightExisting,
          selectedTimeframe,
          referenceNowMs
        );

        if (leftNeedsHistory !== rightNeedsHistory) {
          return leftNeedsHistory ? -1 : 1;
        }

        const leftLatestTime = leftExisting[leftExisting.length - 1]?.time ?? 0;
        const rightLatestTime = rightExisting[rightExisting.length - 1]?.time ?? 0;

        if (leftLatestTime !== rightLatestTime) {
          return leftLatestTime - rightLatestTime;
        }

        const leftMeta = watchlistFetchMetaRef.current[leftKey];
        const rightMeta = watchlistFetchMetaRef.current[rightKey];

        return (leftMeta?.lastSuccessAt ?? 0) - (rightMeta?.lastSuccessAt ?? 0);
      });

      const fetchWatchlistCandlesForAsset = async (
        symbol: string,
        requestCount: number,
        signal: AbortSignal
      ) => {
        let lastError: unknown = null;

        for (let attempt = 0; attempt < WATCHLIST_FETCH_RETRY_ATTEMPTS; attempt += 1) {
          if (cancelled || signal.aborted) {
            throw lastError ?? new Error("Watchlist candle request was aborted.");
          }

          try {
            const payload = await fetchFuturesCandles(symbol, selectedTimeframe, requestCount, {
              signal
            });
            const candles = Array.isArray(payload.candles) ? payload.candles : [];

            if (candles.length === 0) {
              throw new Error(`No candles returned for ${symbol}.`);
            }

            return candles;
          } catch (error) {
            if (cancelled || signal.aborted) {
              throw error;
            }

            lastError = error;

            if (attempt >= WATCHLIST_FETCH_RETRY_ATTEMPTS - 1) {
              break;
            }

            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, 350 * (attempt + 1));
            });
          }
        }

        throw (lastError instanceof Error ? lastError : new Error("Failed to load watchlist candles."));
      };

      try {
        for (let start = 0; start < sortedAssets.length; start += WATCHLIST_FETCH_BATCH_SIZE) {
          const batch = sortedAssets.slice(start, start + WATCHLIST_FETCH_BATCH_SIZE);
          const batchControllers = batch.map(() => new AbortController());

          batchControllers.forEach((controller) => activeControllers.add(controller));

          try {
            const results = await Promise.allSettled(
              batch.map(async (asset, index) => {
                const key = symbolTimeframeKey(asset.symbol, selectedTimeframe);
                const existing = watchlistSeriesMapRef.current[key] ?? [];
                const requestCount = shouldRequestWatchlistHistory(
                  existing,
                  selectedTimeframe,
                  referenceNowMs
                )
                  ? historyCount
                  : snapshotCount;
                const currentMeta = watchlistFetchMetaRef.current[key];

                watchlistFetchMetaRef.current[key] = {
                  lastAttemptAt: Date.now(),
                  lastSuccessAt: currentMeta?.lastSuccessAt ?? 0,
                  failureCount: currentMeta?.failureCount ?? 0,
                  lastError: null
                };
                const candles = await fetchWatchlistCandlesForAsset(
                  asset.symbol,
                  requestCount,
                  batchControllers[index].signal
                );

                return {
                  symbol: asset.symbol,
                  candles
                };
              })
            );

            if (cancelled) {
              return;
            }

            results.forEach((result, index) => {
              if (result.status === "fulfilled" && result.value.candles.length > 0) {
                const fulfilledKey = symbolTimeframeKey(result.value.symbol, selectedTimeframe);

                nextResults.set(result.value.symbol, result.value.candles);
                watchlistFetchMetaRef.current[fulfilledKey] = {
                  lastAttemptAt:
                    watchlistFetchMetaRef.current[fulfilledKey]?.lastAttemptAt ?? Date.now(),
                  lastSuccessAt: Date.now(),
                  failureCount: 0,
                  lastError: null
                };
                return;
              }

              const failedAsset = batch[index];

              if (!failedAsset) {
                return;
              }

              const failedKey = symbolTimeframeKey(failedAsset.symbol, selectedTimeframe);
              const failedMeta = watchlistFetchMetaRef.current[failedKey];
              const errorMessage =
                result.status === "rejected"
                  ? result.reason instanceof Error
                    ? result.reason.message
                    : "Failed to load watchlist candles."
                  : "Failed to load watchlist candles.";

              watchlistFetchMetaRef.current[failedKey] = {
                lastAttemptAt: failedMeta?.lastAttemptAt ?? Date.now(),
                lastSuccessAt: failedMeta?.lastSuccessAt ?? 0,
                failureCount: (failedMeta?.failureCount ?? 0) + 1,
                lastError: errorMessage
              };
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
  }, [orderedAssets, referenceNowMs, selectedTimeframe, showcaseMode]);

  useEffect(() => {
    if (showcaseMode) {
      const simulationNowMs = referenceNowMs;
      setTimeframePreviewMap(() => {
        const next: Record<string, Candle[]> = {};

        for (const timeframe of timeframes) {
          const key = symbolTimeframeKey(selectedSymbol, timeframe);
          next[key] = generateFakeCandles(
            selectedAsset.basePrice,
            selectedSymbol,
            timeframe,
            watchlistSnapshotCountByTimeframe[timeframe],
            simulationNowMs
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
  const renderedSelectedCandles = selectedCandles;
  const canDrawOnChart = renderedSelectedCandles.length > 0;
  const selectedDrawing = useMemo(() => {
    return currentChartDrawings.find((drawing) => drawing.id === selectedDrawingId) ?? null;
  }, [currentChartDrawings, selectedDrawingId]);
  const activeDrawingColorValue = selectedDrawing?.color ?? activeDrawingColor;

  const updateChartDrawings = useCallback(
    (updater: (current: ChartDrawing[]) => ChartDrawing[]) => {
      setChartDrawingsByKey((prev) => {
        const current = prev[selectedKey] ?? [];
        const nextForKey = updater(current);

        if (nextForKey.length === 0) {
          const { [selectedKey]: _removed, ...rest } = prev;
          return rest;
        }

        return {
          ...prev,
          [selectedKey]: nextForKey
        };
      });
    },
    [selectedKey]
  );

  const applyDrawingColor = useCallback(
    (nextColor: string) => {
      setActiveDrawingColor(nextColor);

      if (!selectedDrawingId) {
        return;
      }

      updateChartDrawings((current) =>
        current.map((drawing) =>
          drawing.id === selectedDrawingId ? { ...drawing, color: nextColor } : drawing
        )
      );
    },
    [selectedDrawingId, updateChartDrawings]
  );

  const deleteSelectedDrawing = useCallback(() => {
    if (!selectedDrawingId) {
      return;
    }

    updateChartDrawings((current) => current.filter((drawing) => drawing.id !== selectedDrawingId));
    setSelectedDrawingId(null);
  }, [selectedDrawingId, updateChartDrawings]);

  const clearCurrentDrawings = useCallback(() => {
    if (currentChartDrawings.length === 0) {
      return;
    }

    updateChartDrawings(() => []);
    setSelectedDrawingId(null);
  }, [currentChartDrawings.length, updateChartDrawings]);

  const getDrawingPointFromClientPosition = useCallback(
    (clientX: number, clientY: number): DrawingPoint | null => {
      const chart = chartRef.current;
      const candleSeries = candleSeriesRef.current;
      const container = chartContainerRef.current;

      if (!chart || !candleSeries || !container || renderedSelectedCandles.length === 0) {
        return null;
      }

      const rect = container.getBoundingClientRect();
      const relativeX = clamp(clientX - rect.left, 0, rect.width);
      const relativeY = clamp(clientY - rect.top, 0, rect.height);
      const rawTime = chart.timeScale().coordinateToTime(relativeX);
      const parsedTime = rawTime ? parseTimeFromCrosshair(rawTime) : null;
      const rawPrice = candleSeries.coordinateToPrice(relativeY);

      if (rawPrice === null || !Number.isFinite(rawPrice)) {
        return null;
      }

      let snappedTimeMs =
        parsedTime !== null
          ? parsedTime * 1000
          : relativeX <= 0
            ? (renderedSelectedCandles[0]?.time ?? 0)
            : relativeX >= rect.width
              ? (renderedSelectedCandles[renderedSelectedCandles.length - 1]?.time ?? 0)
              : 0;

      if (!Number.isFinite(snappedTimeMs) || snappedTimeMs <= 0) {
        return null;
      }

      if (renderedSelectedCandles.length > 0) {
        let nearestTime = renderedSelectedCandles[0].time;
        let nearestDistance = Math.abs(nearestTime - snappedTimeMs);

        for (let index = 1; index < renderedSelectedCandles.length; index += 1) {
          const candidateTime = renderedSelectedCandles[index].time;
          const distance = Math.abs(candidateTime - snappedTimeMs);

          if (distance < nearestDistance) {
            nearestTime = candidateTime;
            nearestDistance = distance;
          }
        }

        snappedTimeMs = nearestTime;
      }

      return normalizeDrawingPoint(
        {
          time: snappedTimeMs,
          price: rawPrice
        },
        selectedTimeframe,
        selectedAsset.tickSize
      );
    },
    [renderedSelectedCandles, selectedAsset.tickSize, selectedTimeframe]
  );

  const getScreenPointForDrawing = useCallback(
    (point: DrawingPoint) => {
      const chart = chartRef.current;
      const candleSeries = candleSeriesRef.current;
      const viewportWidth = Math.max(1, chartViewportSize.width);
      const viewportHeight = Math.max(1, chartViewportSize.height);

      if (!chart || !candleSeries) {
        return null;
      }

      const visibleRange = chart.timeScale().getVisibleLogicalRange();
      const visibleCandles =
        visibleRange && renderedSelectedCandles.length > 0
          ? renderedSelectedCandles.slice(
              clamp(Math.floor(visibleRange.from), 0, renderedSelectedCandles.length - 1),
              clamp(Math.ceil(visibleRange.to) + 1, 1, renderedSelectedCandles.length)
            )
          : renderedSelectedCandles;

      let x = chart.timeScale().timeToCoordinate(toUtcTimestamp(point.time));
      let y = candleSeries.priceToCoordinate(point.price);

      if ((x === null || !Number.isFinite(x)) && visibleCandles.length > 0) {
        const firstTime = visibleCandles[0]?.time ?? point.time;
        const lastTime = visibleCandles[visibleCandles.length - 1]?.time ?? point.time;
        x =
          point.time <= firstTime
            ? (0 as Coordinate)
            : point.time >= lastTime
              ? (viewportWidth as Coordinate)
              : null;
      }

      if ((y === null || !Number.isFinite(y)) && visibleCandles.length > 0) {
        const minPrice = Math.min(...visibleCandles.map((candle) => candle.low));
        const maxPrice = Math.max(...visibleCandles.map((candle) => candle.high));
        y =
          point.price >= maxPrice
            ? (0 as Coordinate)
            : point.price <= minPrice
              ? (viewportHeight as Coordinate)
              : null;
      }

      if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }

      return {
        x: clamp(x, 0, viewportWidth),
        y: clamp(y, 0, viewportHeight)
      };
    },
    [chartViewportSize.height, chartViewportSize.width, renderedSelectedCandles]
  );

  const getVisibleDrawingDragBounds = useCallback((): DrawingDragBounds | null => {
    const container = chartContainerRef.current;

    if (!container) {
      return buildDrawingDragBoundsFromCandles(renderedSelectedCandles, selectedAsset.tickSize);
    }

    const rect = container.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const centerX = rect.left + rect.width / 2;
    const leftPoint = getDrawingPointFromClientPosition(rect.left, centerY);
    const rightPoint = getDrawingPointFromClientPosition(rect.right, centerY);
    const topPoint = getDrawingPointFromClientPosition(centerX, rect.top);
    const bottomPoint = getDrawingPointFromClientPosition(centerX, rect.bottom);

    if (leftPoint && rightPoint && topPoint && bottomPoint) {
      return {
        minTime: Math.min(leftPoint.time, rightPoint.time),
        maxTime: Math.max(leftPoint.time, rightPoint.time),
        minPrice: Math.min(topPoint.price, bottomPoint.price),
        maxPrice: Math.max(topPoint.price, bottomPoint.price)
      };
    }

    return buildDrawingDragBoundsFromCandles(renderedSelectedCandles, selectedAsset.tickSize);
  }, [getDrawingPointFromClientPosition, renderedSelectedCandles, selectedAsset.tickSize]);

  const startDrawingDrag = useCallback(
    (drawing: ChartDrawing, event: ReactPointerEvent<SVGGElement>) => {
      if (activeDrawingTool !== "cursor") {
        return;
      }

      const point = getDrawingPointFromClientPosition(event.clientX, event.clientY);

      if (!point) {
        return;
      }

      drawingDragStateRef.current = {
        drawingId: drawing.id,
        pointerStart: point,
        originalDrawing: drawing
      };
      setSelectedDrawingId(drawing.id);
    },
    [activeDrawingTool, getDrawingPointFromClientPosition]
  );

  const handleChartDrawingPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!canDrawOnChart) {
        return;
      }

      const point = getDrawingPointFromClientPosition(event.clientX, event.clientY);

      if (!point) {
        return;
      }

      if (activeDrawingTool === "cursor") {
        setSelectedDrawingId(null);
        return;
      }

      if (activeDrawingTool === "horizontal") {
        const drawing: ChartDrawing = {
          id: createDrawingId(),
          tool: "horizontal",
          points: [point],
          color: activeDrawingColor,
          createdAt: Date.now()
        };

        updateChartDrawings((current) => [...current, drawing]);
        setSelectedDrawingId(drawing.id);
        return;
      }

      if (activeDrawingTool === "vertical") {
        const drawing: ChartDrawing = {
          id: createDrawingId(),
          tool: "vertical",
          points: [point],
          color: activeDrawingColor,
          createdAt: Date.now()
        };

        updateChartDrawings((current) => [...current, drawing]);
        setSelectedDrawingId(drawing.id);
        return;
      }

      if (!activeDrawingDraft || activeDrawingDraft.tool !== activeDrawingTool) {
        setDrawingDraft({
          tool: activeDrawingTool,
          start: point,
          current: point
        });
        setSelectedDrawingId(null);
        return;
      }

      const drawing: ChartDrawing = {
        id: createDrawingId(),
        tool: activeDrawingDraft.tool,
        points: [activeDrawingDraft.start, point],
        color: activeDrawingColor,
        createdAt: Date.now()
      };

      updateChartDrawings((current) => [...current, drawing]);
      setDrawingDraft(null);
      setSelectedDrawingId(drawing.id);
    },
    [
      activeDrawingDraft,
      activeDrawingColor,
      activeDrawingTool,
      canDrawOnChart,
      getDrawingPointFromClientPosition,
      updateChartDrawings
    ]
  );

  const handleChartDrawingPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!canDrawOnChart) {
        return;
      }

      const point = getDrawingPointFromClientPosition(event.clientX, event.clientY);

      if (!point) {
        return;
      }

      if (drawingDragStateRef.current) {
        const { drawingId, pointerStart, originalDrawing } = drawingDragStateRef.current;
        const deltaTimeMs = point.time - pointerStart.time;
        const deltaPrice = point.price - pointerStart.price;
        const dragBounds = getVisibleDrawingDragBounds();

        updateChartDrawings((current) =>
          current.map((drawing) =>
            drawing.id === drawingId
              ? shiftChartDrawingWithinBounds(
                  originalDrawing,
                  deltaTimeMs,
                  deltaPrice,
                  dragBounds,
                  selectedTimeframe,
                  selectedAsset.tickSize
                )
              : drawing
          )
        );
        return;
      }

      if (activeDrawingDraft) {
        setDrawingDraft((current) => (current ? { ...current, current: point } : current));
      }
    },
    [
      activeDrawingDraft,
      canDrawOnChart,
      getDrawingPointFromClientPosition,
      getVisibleDrawingDragBounds,
      selectedAsset.tickSize,
      selectedTimeframe,
      updateChartDrawings
    ]
  );

  const stopChartDrawingDrag = useCallback(() => {
    drawingDragStateRef.current = null;
  }, []);

  useEffect(() => {
    if (canDrawOnChart) {
      return;
    }

    setDrawingDraft(null);
    setSelectedDrawingId(null);
  }, [canDrawOnChart]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!drawingDragStateRef.current) {
        return;
      }

      const point = getDrawingPointFromClientPosition(event.clientX, event.clientY);

      if (!point) {
        return;
      }

      const { drawingId, pointerStart, originalDrawing } = drawingDragStateRef.current;
      const deltaTimeMs = point.time - pointerStart.time;
      const deltaPrice = point.price - pointerStart.price;
      const dragBounds = getVisibleDrawingDragBounds();

      updateChartDrawings((current) =>
        current.map((drawing) =>
          drawing.id === drawingId
            ? shiftChartDrawingWithinBounds(
                originalDrawing,
                deltaTimeMs,
                deltaPrice,
                dragBounds,
                selectedTimeframe,
                selectedAsset.tickSize
              )
            : drawing
        )
      );
    };

    window.addEventListener("pointermove", handlePointerMove);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, [
    getDrawingPointFromClientPosition,
    getVisibleDrawingDragBounds,
    selectedAsset.tickSize,
    selectedTimeframe,
    updateChartDrawings
  ]);

  useEffect(() => {
    setLiveQuoteSnapshot(null);
    setLiveQuoteSchema(null);
    setLiveOrderBookSnapshot(null);
    setOrderFlowRows([]);
    setLiveDepthMessage(null);
    setLiveDepthSchema(null);
  }, [selectedSymbol]);

  useEffect(() => {
    if (showcaseMode || marketStatus !== "ready" || selectedCandles.length === 0) {
      return;
    }

    let cancelled = false;
    let eventSource: EventSource | null = null;
    let streamOpened = false;
    let streamHasDeliveredData = false;
    let streamBootstrapTimeoutId: number | null = null;
    let streamReconnectTimeoutId: number | null = null;
    let streamDisabled = false;
    let terminalStreamFailure = false;
    const configuredBackendBase = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/+$/, "");
    let usesHostedLiveBackend = Boolean(configuredBackendBase);
    let liveStreamUrl = `/api/futures/live?symbol=${encodeURIComponent(selectedSymbol)}`;

    if (configuredBackendBase) {
      liveStreamUrl = `${configuredBackendBase}/futures/live?symbol=${encodeURIComponent(selectedSymbol)}`;
    } else if (typeof window !== "undefined" && !isLikelyLocalHostname(window.location.hostname)) {
      usesHostedLiveBackend = true;
      liveStreamUrl = `/api/backend/futures/live?symbol=${encodeURIComponent(selectedSymbol)}`;
    }

    let tradeFlushTimeoutId: number | null = null;
    let pendingTrade: LiveTradeResponse | null = null;
    let orderFlowFlushTimeoutId: number | null = null;
    let pendingOrderFlowRows: OrderFlowRow[] = [];
    let lastOrderFlowPrice: number | null = null;
    let bookFlushTimeoutId: number | null = null;
    let pendingQuoteBook: { snapshot: OrderBookSnapshot; schema: string | null } | null = null;
    let pendingDepthBook: { snapshot: OrderBookSnapshot; schema: string } | null = null;
    let activeDepthSchema: string | null = null;

    const syncMarketFeedMeta = (meta?: LiveTradeResponse["meta"]) => {
      if (!meta) {
        return;
      }

      setMarketFeedMeta((prev) => ({
        provider: meta.provider,
        dataset: meta.dataset,
        sourceTimeframe: prev?.sourceTimeframe ?? selectedTimeframe,
        databentoSymbol: meta.databentoSymbol,
        updatedAt: meta.updatedAt,
        schema: meta.schema,
        resolvedSymbol: meta.resolvedSymbol ?? null
      }));
    };

    const applyLiveTrade = (payload: LiveTradeResponse) => {
      syncMarketClock(payload.time);

      setSeriesMap((prev) => {
        const activeSeries = prev[selectedKey];

        if (!activeSeries || activeSeries.length === 0) {
          return prev;
        }

        const nextSeries = applyLiveTradeToCandles(
          activeSeries,
          payload.price,
          payload.time,
          selectedTimeframe
        );

        if (!nextSeries) {
          return prev;
        }

        return {
          ...prev,
          [selectedKey]: nextSeries
        };
      });

      syncMarketFeedMeta(payload.meta);
    };

    const flushPendingTrade = () => {
      tradeFlushTimeoutId = null;

      if (!pendingTrade || cancelled) {
        return;
      }

      const nextTrade = pendingTrade;
      pendingTrade = null;
      applyLiveTrade(nextTrade);
    };

    const queueTrade = (payload: LiveTradeResponse) => {
      pendingTrade = payload;

      if (tradeFlushTimeoutId !== null) {
        return;
      }

      tradeFlushTimeoutId = window.setTimeout(() => {
        flushPendingTrade();
      }, LIVE_STREAM_FLUSH_INTERVAL_MS);
    };

    const flushPendingOrderFlow = () => {
      orderFlowFlushTimeoutId = null;

      if (cancelled || pendingOrderFlowRows.length === 0) {
        pendingOrderFlowRows = [];
        return;
      }

      const nextRows = [...pendingOrderFlowRows].sort((left, right) => {
        if (left.timeMs !== right.timeMs) {
          return right.timeMs - left.timeMs;
        }

        return right.sequence - left.sequence;
      });

      pendingOrderFlowRows = [];
      setOrderFlowRows((current) => [...nextRows, ...current].slice(0, 160));
    };

    const queueOrderFlow = (payload: Extract<DatabentoLiveEvent, { type: "trade" }>) => {
      const side: OrderFlowSide =
        payload.side === "A" || payload.side === "B" || payload.side === "N" ? payload.side : "N";
      const tone = getOrderFlowTone(side, payload.price, lastOrderFlowPrice);
      lastOrderFlowPrice = payload.price;
      pendingOrderFlowRows.push({
        id: `${payload.symbol}-${payload.time}-${payload.sequence ?? pendingOrderFlowRows.length}-${payload.price}`,
        symbol: payload.symbol,
        timeMs: payload.time,
        price: payload.price,
        size: payload.size,
        tone,
        side,
        sequence: payload.sequence ?? 0
      });

      if (orderFlowFlushTimeoutId !== null) {
        return;
      }

      orderFlowFlushTimeoutId = window.setTimeout(() => {
        flushPendingOrderFlow();
      }, LIVE_STREAM_FLUSH_INTERVAL_MS);
    };

    const flushPendingBook = () => {
      bookFlushTimeoutId = null;

      if (cancelled) {
        return;
      }

      if (pendingQuoteBook) {
        setLiveQuoteSnapshot(pendingQuoteBook.snapshot);
        setLiveQuoteSchema(pendingQuoteBook.schema);
        pendingQuoteBook = null;
      }

      if (!pendingDepthBook) {
        return;
      }

      const nextDepthBook = pendingDepthBook;
      pendingDepthBook = null;
      activeDepthSchema = nextDepthBook.schema;
      setLiveOrderBookSnapshot(nextDepthBook.snapshot);
      setLiveDepthSchema(nextDepthBook.schema);
    };

    const queueOrderBook = (snapshot: OrderBookSnapshot, schema?: string | null) => {
      pendingQuoteBook = {
        snapshot,
        schema: schema ?? null
      };

      if (isOrderBookDepthSchema(schema)) {
        const incomingRank = getLiveBookSchemaRank(schema);
        const pendingRank = getLiveBookSchemaRank(pendingDepthBook?.schema ?? null);
        const activeRank = getLiveBookSchemaRank(activeDepthSchema);

        if (incomingRank >= Math.max(pendingRank, activeRank)) {
          pendingDepthBook = {
            snapshot,
            schema
          };
        }
      }

      if (bookFlushTimeoutId !== null) {
        return;
      }

      bookFlushTimeoutId = window.setTimeout(() => {
        flushPendingBook();
      }, LIVE_STREAM_FLUSH_INTERVAL_MS);
    };

    const clearStreamBootstrapTimeout = () => {
      if (streamBootstrapTimeoutId !== null) {
        window.clearTimeout(streamBootstrapTimeoutId);
        streamBootstrapTimeoutId = null;
      }
    };

    const clearStreamReconnectTimeout = () => {
      if (streamReconnectTimeoutId !== null) {
        window.clearTimeout(streamReconnectTimeoutId);
        streamReconnectTimeoutId = null;
      }
    };

    const disableLiveStream = (message?: string) => {
      if (streamDisabled || cancelled) {
        return;
      }

      streamDisabled = true;
      clearStreamBootstrapTimeout();
      clearStreamReconnectTimeout();
      eventSource?.close();
      eventSource = null;

      if (message) {
        setMarketError(message);
      }
    };

    const markStreamAsLive = () => {
      streamHasDeliveredData = true;
      clearStreamBootstrapTimeout();
      clearStreamReconnectTimeout();
      setMarketError(null);
    };

    const armStreamBootstrapTimeout = () => {
      clearStreamBootstrapTimeout();
      streamBootstrapTimeoutId = window.setTimeout(() => {
        if (cancelled || streamDisabled || streamHasDeliveredData) {
          return;
        }

        disableLiveStream("Live stream unavailable.");
      }, usesHostedLiveBackend ? HOSTED_LIVE_STREAM_BOOTSTRAP_TIMEOUT_MS : LIVE_STREAM_BOOTSTRAP_TIMEOUT_MS);
    };

    setLiveQuoteSnapshot(null);
    setLiveQuoteSchema(null);
    setLiveOrderBookSnapshot(null);
    setOrderFlowRows([]);
    setLiveDepthMessage(null);
    setLiveDepthSchema(null);

    armStreamBootstrapTimeout();
    eventSource = new EventSource(liveStreamUrl);
    eventSource.onopen = () => {
      if (cancelled) {
        return;
      }

      streamOpened = true;
      clearStreamReconnectTimeout();
    };

    eventSource.onmessage = (messageEvent) => {
      if (cancelled) {
        return;
      }

      let payload: DatabentoLiveEvent;

      try {
        payload = JSON.parse(messageEvent.data) as DatabentoLiveEvent;
      } catch {
        return;
      }

      if (payload.type === "trade") {
        markStreamAsLive();
        queueOrderFlow(payload);
        queueTrade({
          symbol: payload.symbol,
          price: payload.price,
          time: payload.time,
          meta: payload.meta
        });
        return;
      }

      if (payload.type === "book") {
        markStreamAsLive();
        setLiveDepthMessage(null);
        queueOrderBook(payload.snapshot, payload.meta?.schema ?? null);
        syncMarketFeedMeta(payload.meta);
        return;
      }

      if (payload.type === "status") {
        if (isOrderBookDepthSchema(payload.meta?.schema)) {
          setLiveDepthSchema(payload.meta?.schema ?? null);

          if (payload.state === "connected") {
            setLiveDepthMessage(null);
          } else if (payload.state === "stopped") {
            setLiveOrderBookSnapshot(null);
            activeDepthSchema = null;
            setLiveDepthMessage(formatLiveDepthStatusMessage(payload.message, payload.meta?.schema));
          }

          syncMarketFeedMeta(payload.meta);
          return;
        }

        if (payload.state === "connected") {
          setMarketError(null);
        }
        syncMarketFeedMeta(payload.meta);
        return;
      }

      if (isOrderBookDepthSchema(payload.meta?.schema)) {
        setLiveOrderBookSnapshot(null);
        activeDepthSchema = null;
        setLiveDepthSchema(payload.meta?.schema ?? null);
        setLiveDepthMessage(formatLiveDepthStatusMessage(payload.message, payload.meta?.schema));
        return;
      }

      setMarketError(payload.message);

      if (!payload.retrying) {
        terminalStreamFailure = true;
        disableLiveStream(payload.message);
      }
    };

    eventSource.onerror = () => {
      if (cancelled) {
        return;
      }

      if (usesHostedLiveBackend && !terminalStreamFailure) {
        if (!streamHasDeliveredData) {
          return;
        }

        if (streamReconnectTimeoutId === null) {
          setMarketError("Live stream reconnecting...");
          streamReconnectTimeoutId = window.setTimeout(() => {
            if (cancelled || streamDisabled) {
              return;
            }

            disableLiveStream("Live stream unavailable.");
          }, LIVE_STREAM_RECONNECT_GRACE_MS);
        }

        return;
      }

      disableLiveStream(
        terminalStreamFailure
          ? "Live stream stopped."
          : streamOpened
            ? "Live stream disconnected."
            : "Live stream unavailable."
      );
    };

    return () => {
      cancelled = true;
      clearStreamBootstrapTimeout();
      clearStreamReconnectTimeout();

      if (tradeFlushTimeoutId !== null) {
        window.clearTimeout(tradeFlushTimeoutId);
      }

      if (orderFlowFlushTimeoutId !== null) {
        window.clearTimeout(orderFlowFlushTimeoutId);
      }

      if (bookFlushTimeoutId !== null) {
        window.clearTimeout(bookFlushTimeoutId);
      }

      pendingTrade = null;
      pendingOrderFlowRows = [];
      pendingQuoteBook = null;
      pendingDepthBook = null;
      eventSource?.close();
    };
  }, [
    marketStatus,
    selectedAsset.basePrice,
    selectedAsset.tickSize,
    selectedCandles.length,
    selectedKey,
    selectedSymbol,
    selectedTimeframe,
    showcaseMode,
    syncMarketClock
  ]);

  const marketCandlesBySymbol = useMemo<Record<string, Candle[]>>(() => {
    const next: Record<string, Candle[]> = {};

    for (const asset of orderedAssets) {
      const key = symbolTimeframeKey(asset.symbol, selectedTimeframe);
      const chartCandles = seriesMap[key] ?? [];
      const backgroundCandles = watchlistSeriesMap[key] ?? [];
      next[asset.symbol] = mergeCandles(chartCandles, backgroundCandles);
    }

    return next;
  }, [orderedAssets, selectedTimeframe, seriesMap, watchlistSeriesMap]);

  const historyCandlesBySymbol = useMemo<Record<string, Candle[]>>(() => {
    const next: Record<string, Candle[]> = {};

    for (const asset of orderedAssets) {
      const key = symbolTimeframeKey(asset.symbol, selectedTimeframe);
      const backgroundCandles = watchlistSeriesMap[key] ?? [];
      const chartCandles = seriesMap[key] ?? [];

      next[asset.symbol] =
        backgroundCandles.length >= MIN_MULTI_ASSET_TRADE_CANDLES
          ? backgroundCandles
          : mergeCandles(backgroundCandles, chartCandles);
    }

    return next;
  }, [orderedAssets, selectedTimeframe, seriesMap, watchlistSeriesMap]);

  const candleByUnix = useMemo(() => {
    const map = new Map<number, Candle>();

    for (const candle of renderedSelectedCandles) {
      map.set(toUtcTimestamp(candle.time), candle);
    }

    return map;
  }, [renderedSelectedCandles]);

  const latestCandle = renderedSelectedCandles[renderedSelectedCandles.length - 1] ?? null;
  const previousCandle =
    renderedSelectedCandles.length > 1
      ? renderedSelectedCandles[renderedSelectedCandles.length - 2]
      : latestCandle;

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

  const quoteSnapshot = useMemo<OrderBookSnapshot | null>(() => {
    if (liveQuoteSnapshot) {
      return liveQuoteSnapshot;
    }

    if (liveOrderBookSnapshot) {
      return liveOrderBookSnapshot;
    }

    return null;
  }, [liveOrderBookSnapshot, liveQuoteSnapshot]);

  const orderBookSnapshot = useMemo<OrderBookSnapshot | null>(() => {
    if (liveOrderBookSnapshot) {
      return liveOrderBookSnapshot;
    }

    return null;
  }, [liveOrderBookSnapshot]);

  const quoteOverlaySourceLabel = useMemo(() => {
    if (showcaseMode) {
      return "Simulation";
    }

    if (quoteSnapshot) {
      if (liveQuoteSnapshot || liveOrderBookSnapshot) {
        return isTopOfBookSchema(liveQuoteSchema ?? liveDepthSchema) ? "Live top of book" : "Live depth";
      }
    }

    if (liveDepthMessage) {
      return isTopOfBookSchema(liveDepthSchema)
        ? "Top of book unavailable"
        : "Trade only";
    }

    return "Waiting for depth";
  }, [
    liveDepthMessage,
    liveDepthSchema,
    liveOrderBookSnapshot,
    liveQuoteSchema,
    liveQuoteSnapshot,
    quoteSnapshot,
    showcaseMode
  ]);

  const orderBookSourceLabel = useMemo(() => {
    if (showcaseMode) {
      return "Simulation";
    }

    if (liveOrderBookSnapshot) {
      return isTopOfBookSchema(liveDepthSchema) ? "Live top of book" : "Live depth";
    }

    if (liveQuoteSnapshot) {
      return "Top of book only";
    }

    if (liveDepthMessage || marketError) {
      return "Unavailable";
    }

    return "Waiting";
  }, [
    liveDepthMessage,
    liveDepthSchema,
    liveQuoteSnapshot,
    liveOrderBookSnapshot,
    marketError,
    showcaseMode
  ]);

  const visibleOrderBookLevels = useMemo(() => {
    return orderBookSnapshot?.levels.slice(0, 10) ?? [];
  }, [orderBookSnapshot]);

  const marketMakerAskRows = useMemo(() => {
    return visibleOrderBookLevels
      .slice(0, 6)
      .map((level, index, rows) => ({
        price: level.askPrice,
        size: level.askSize,
        fillPct: level.askFillPct,
        isInside: index === 0,
        isEdge: index === rows.length - 1
      }))
      .reverse();
  }, [visibleOrderBookLevels]);

  const marketMakerBidRows = useMemo(() => {
    return visibleOrderBookLevels.slice(0, 6).map((level, index) => ({
      price: level.bidPrice,
      size: level.bidSize,
      fillPct: level.bidFillPct,
      isInside: index === 0
    }));
  }, [visibleOrderBookLevels]);

  const marketMakerInventoryLots = useMemo(() => {
    if (!quoteSnapshot) {
      return 0;
    }

    const totalDepth = Math.max(1, quoteSnapshot.bidTotal + quoteSnapshot.askTotal);
    const imbalanceLots = ((quoteSnapshot.bidTotal - quoteSnapshot.askTotal) / totalDepth) * 22;
    return Math.round(clamp(imbalanceLots, -9, 9));
  }, [quoteSnapshot]);

  const marketMakerDeltaExposurePct = useMemo(() => {
    if (!quoteSnapshot) {
      return 35;
    }

    return clamp(Math.abs(quoteSnapshot.imbalance) * 3.4 + 18, 12, 92);
  }, [quoteSnapshot]);

  const marketMakerSpreadPnl = useMemo(() => {
    if (!orderBookSnapshot) {
      return 0;
    }

    const depthWeight = clamp((orderBookSnapshot.bidTotal + orderBookSnapshot.askTotal) / 180, 0.12, 1.1);
    const directionalWeight = 0.55 + Math.abs(orderBookSnapshot.imbalance) / 260;

    return orderBookSnapshot.spread * depthWeight * directionalWeight;
  }, [orderBookSnapshot]);

  const marketMakerHedgeLabel = useMemo(() => {
    const roundedExposure = Math.round(marketMakerDeltaExposurePct);

    if (roundedExposure >= 68) {
      return `${roundedExposure}% - Hedging...`;
    }

    if (marketMakerInventoryLots === 0) {
      return `${roundedExposure}% - Balanced`;
    }

    return `${roundedExposure}% - Passive quoting`;
  }, [marketMakerDeltaExposurePct, marketMakerInventoryLots]);

  const marketMakerRecentFlow = useMemo(() => {
    if (visibleOrderBookLevels.length === 0) {
      return [];
    }

    const firstAsk = visibleOrderBookLevels[0];
    const secondAsk = visibleOrderBookLevels[1] ?? firstAsk;
    const firstBid = visibleOrderBookLevels[0];
    const maxVisibleSize = Math.max(
      1,
      ...visibleOrderBookLevels.slice(0, 4).flatMap((level) => [level.bidSize, level.askSize])
    );
    const normalize = (value: number) =>
      Math.max(1, Math.min(9, Math.round((value / maxVisibleSize) * 4) + 1));

    return [
      { id: "recent-sell-1", label: "Sold", quantity: normalize(firstAsk.askSize), tone: "down" as const },
      { id: "recent-sell-2", label: "Sold", quantity: normalize(secondAsk.askSize), tone: "down" as const },
      { id: "recent-buy-1", label: "Bought", quantity: normalize(firstBid.bidSize), tone: "up" as const }
    ];
  }, [visibleOrderBookLevels]);

  const watchlistRows = useMemo(() => {
    return orderedAssets.map((asset) => {
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
  }, [marketCandlesBySymbol, orderedAssets]);

  const historyRows = useMemo(() => {
    if (!chartSimulationEnabled) {
      return [];
    }

    if (!selectedTradeOwnerModel) {
      return [];
    }

    const rows: HistoryItem[] = [];

    for (const asset of orderedAssets) {
      const list = historyCandlesBySymbol[asset.symbol] ?? [];

      if (list.length < 16) {
        continue;
      }

      const tradeBlueprints = generateTradeBlueprintsFromCandles(
        selectedTradeOwnerModel,
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
  }, [chartSimulationEnabled, historyCandlesBySymbol, orderedAssets, selectedTradeOwnerModel, showcaseMode]);

  const currentSymbolHistoryRows = useMemo(() => {
    return historyRows.filter((row) => row.symbol === selectedSymbol);
  }, [historyRows, selectedSymbol]);

  const activeTrades = useMemo(() => {
    if (!chartSimulationEnabled) {
      return [];
    }

    if (!selectedTradeOwnerModel) {
      return [];
    }

    const rows: HistoryItem[] = [];

    for (const asset of orderedAssets) {
      const list = historyCandlesBySymbol[asset.symbol] ?? [];

      if (list.length < 40) {
        continue;
      }

      const tradeBlueprints = generateTradeBlueprintsFromCandles(
        selectedTradeOwnerModel,
        asset.symbol,
        list,
        1
      );
      const trade = buildActiveTradeFromCandles(list, tradeBlueprints, getProjectedMarketNowMs());

      if (trade) {
        rows.push(trade);
      }
    }

    return rows
      .sort((a, b) => Number(b.entryTime) - Number(a.entryTime))
      .slice(0, Math.min(12, orderedAssets.length));
  }, [
    chartSimulationEnabled,
    getProjectedMarketNowMs,
    historyCandlesBySymbol,
    orderedAssets,
    selectedTradeOwnerModel
  ]);

  const selectedHistoryTrade = useMemo(() => {
    if (!selectedHistoryId) {
      return null;
    }

    return (
      historyRows.find((row) => row.id === selectedHistoryId) ??
      activeTrades.find((row) => row.id === selectedHistoryId) ??
      null
    );
  }, [activeTrades, historyRows, selectedHistoryId]);

  const activeTrade = useMemo(() => {
    if (activeTrades.length === 0) {
      return null;
    }

    if (selectedActiveTradeId) {
      return activeTrades.find((row) => row.id === selectedActiveTradeId) ?? activeTrades[0] ?? null;
    }

    return activeTrades[0] ?? null;
  }, [activeTrades, selectedActiveTradeId]);

  const simulationToggleLabel = chartSimulationEnabled
    ? "Turn Off Simulation"
    : "Turn On Simulation";

  const activeTradeDuration = useMemo(() => {
    if (!activeTrade) {
      return null;
    }

    return formatElapsed(Number(activeTrade.entryTime), Math.floor(getProjectedMarketNowMs() / 1000));
  }, [activeTrade, getProjectedMarketNowMs]);

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

  const mobileDisplayTrade = activeTrade;
  const mobileDisplayTradeDuration = useMemo(() => {
    if (!mobileDisplayTrade) {
      return null;
    }

    return formatElapsed(Number(mobileDisplayTrade.entryTime), Math.floor(getProjectedMarketNowMs() / 1000));
  }, [getProjectedMarketNowMs, mobileDisplayTrade]);
  const mobileDisplayTradeRiskReward = useMemo(() => {
    if (!mobileDisplayTrade) {
      return null;
    }

    return (
      Math.abs(mobileDisplayTrade.targetPrice - mobileDisplayTrade.entryPrice) /
      Math.max(0.000001, Math.abs(mobileDisplayTrade.entryPrice - mobileDisplayTrade.stopPrice))
    );
  }, [mobileDisplayTrade]);
  const mobileHistoryRows = useMemo(() => {
    return historyRows.slice(0, 18);
  }, [historyRows]);
  const mobileDateLabel = useMemo(() => formatMobileDate(mobileNowMs), [mobileNowMs]);
  const mobileTimeLabel = useMemo(() => formatMobileTime(mobileNowMs), [mobileNowMs]);
  const mobileTradeSparkline = useMemo(() => {
    if (!mobileDisplayTrade) {
      return null;
    }

    const candles = historyCandlesBySymbol[mobileDisplayTrade.symbol] ?? [];

    if (candles.length === 0) {
      return null;
    }

    const entryIndex = findCandleIndexAtOrBefore(candles, Number(mobileDisplayTrade.entryTime) * 1000);
    const exitIndex = findCandleIndexAtOrBefore(candles, Number(mobileDisplayTrade.exitTime) * 1000);
    const startIndex = Math.max(0, Math.min(entryIndex, exitIndex, candles.length - 1));
    const endIndex = Math.max(startIndex + 1, Math.min(candles.length - 1, Math.max(entryIndex, exitIndex)));
    const slice = candles.slice(startIndex, endIndex + 1);
    const values = (slice.length >= 2 ? slice : candles.slice(-24)).map((candle) => candle.close);

    return buildSparklineGeometry(values);
  }, [historyCandlesBySymbol, mobileDisplayTrade]);
  const mobileTradeChartDisplayIndex =
    mobileTradeSparkline && mobileTradeChartScrubIndex !== null
      ? clamp(mobileTradeChartScrubIndex, 0, mobileTradeSparkline.points.length - 1)
      : mobileTradeSparkline
        ? mobileTradeSparkline.points.length - 1
        : null;
  const mobileTradeChartDisplayPoint =
    mobileTradeSparkline && mobileTradeChartDisplayIndex !== null
      ? mobileTradeSparkline.points[mobileTradeChartDisplayIndex] ?? null
      : null;

  const updateMobileTradeChartScrub = (clientX: number) => {
    const chart = mobileTradeChartRef.current;

    if (!chart || !mobileTradeSparkline || mobileTradeSparkline.points.length === 0) {
      return;
    }

    const bounds = chart.getBoundingClientRect();

    if (bounds.width <= 0) {
      return;
    }

    const chartX = clamp(
      ((clientX - bounds.left) / bounds.width) * mobileTradeSparkline.width,
      0,
      mobileTradeSparkline.width
    );
    let nextIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    mobileTradeSparkline.points.forEach((point, index) => {
      const distance = Math.abs(point.x - chartX);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nextIndex = index;
      }
    });

    setMobileTradeChartScrubIndex(nextIndex);
  };

  const handleMobileTradeChartPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    mobileTradeChartPointerIdRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture failures on unsupported pointer types.
    }
    updateMobileTradeChartScrub(event.clientX);
  };

  const handleMobileTradeChartPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !mobileTradeSparkline ||
      (event.pointerType !== "mouse" && mobileTradeChartPointerIdRef.current !== event.pointerId)
    ) {
      return;
    }

    if (event.pointerType !== "mouse") {
      event.preventDefault();
    }

    updateMobileTradeChartScrub(event.clientX);
  };

  const handleMobileTradeChartPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      mobileTradeChartPointerIdRef.current !== null &&
      mobileTradeChartPointerIdRef.current === event.pointerId
    ) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore release failures when capture was never established.
      }
    }

    mobileTradeChartPointerIdRef.current = null;
    setMobileTradeChartScrubIndex(null);
  };

  const candleIndexByUnix = useMemo(() => {
    const map = new Map<number, number>();

    for (let i = 0; i < renderedSelectedCandles.length; i += 1) {
      map.set(toUtcTimestamp(renderedSelectedCandles[i].time), i);
    }

    return map;
  }, [renderedSelectedCandles]);

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
          entityType: "system",
          actionCode: "risk_guard_active",
          link: "/",
          live: true
        },
        {
          id: "showcase-live-2",
          title: `${selectedSymbol} TP hit`,
          details: "+$432.80 (2.14%) captured on copied trade",
          time: formatClock(now - 14_000),
          timestamp: now - 14_000,
          tone: "up" as NotificationTone,
          symbol: selectedSymbol,
          entityType: "trade",
          actionCode: "tp_hit",
          link: "/",
          live: true
        },
        {
          id: "showcase-live-3",
          title: `${selectedSymbol} entry executed`,
          details: "Buy order synced from selected profile",
          time: formatClock(now - 34_000),
          timestamp: now - 34_000,
          tone: "neutral" as NotificationTone,
          symbol: selectedSymbol,
          entityType: "trade",
          actionCode: "entry_executed",
          link: "/",
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
            tone,
            symbol: action.symbol,
            tradeId: action.tradeId,
            entityType: "trade",
            actionCode: action.label.toLowerCase().replaceAll(" ", "_"),
            link: "/"
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
        tone,
        symbol: action.symbol,
        tradeId: action.tradeId,
        entityType: "trade",
        actionCode: action.label.toLowerCase().replaceAll(" ", "_"),
        link: "/",
        live: true
      });
    }

    const liveCutoffMs = Date.now() - NOTIFICATION_LIVE_WINDOW_MS;

    return items
      .filter((item) => item.timestamp >= liveCutoffMs)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 12);
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
    let cancelled = false;

    void (async () => {
      const insertedIds = await upsertRomanNotificationEvents(
        notificationItems.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.details,
          tone: item.tone,
          link: item.link ?? "/",
          symbol: item.symbol ?? null,
          tradeId: item.tradeId ?? null,
          entityType: item.entityType ?? null,
          actionCode: item.actionCode ?? null,
          occurredAt: item.timestamp
        }))
      );

      if (cancelled || insertedIds.length === 0) {
        return;
      }

      const hiddenDocument =
        typeof document !== "undefined" && document.visibilityState !== "visible";

      if (!hiddenDocument) {
        return;
      }

      const deliveredIds: string[] = [];

      for (const item of notificationItems) {
        if (
          !insertedIds.includes(item.id) ||
          deliveredNotificationIdsRef.current.has(item.id) ||
          item.timestamp < notificationSessionStartedAtRef.current
        ) {
          continue;
        }

        const shown = await showRomanNotification({
          id: item.id,
          title: item.title,
          body: item.details,
          tone: item.tone,
          link: item.link ?? "/",
          symbol: item.symbol ?? null,
          tradeId: item.tradeId ?? null,
          entityType: item.entityType ?? null,
          actionCode: item.actionCode ?? null,
          occurredAt: item.timestamp
        });

        if (shown) {
          deliveredIds.push(item.id);
          deliveredNotificationIdsRef.current.add(item.id);
        }
      }

      if (deliveredIds.length > 0) {
        await markRomanNotificationEventsDelivered(deliveredIds);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [notificationItems]);

  useEffect(() => {
    if (!selectedHistoryId) {
      return;
    }

    if (
      !historyRows.some((row) => row.id === selectedHistoryId) &&
      !activeTrades.some((row) => row.id === selectedHistoryId)
    ) {
      setSelectedHistoryId(null);
    }
  }, [activeTrades, historyRows, selectedHistoryId]);

  useEffect(() => {
    if (activeTrades.length === 0) {
      if (selectedActiveTradeId !== null) {
        setSelectedActiveTradeId(null);
      }
      return;
    }

    if (!selectedActiveTradeId || !activeTrades.some((row) => row.id === selectedActiveTradeId)) {
      setSelectedActiveTradeId(activeTrades[0]?.id ?? null);
    }
  }, [activeTrades, selectedActiveTradeId]);

  useEffect(() => {
    setSelectedHistoryId(null);
    setSelectedActiveTradeId(null);
    setShowAllTradesOnChart(false);
    focusTradeIdRef.current = null;
  }, [selectedModelId]);

  useEffect(() => {
    setSelectedHistoryId(null);
    setSelectedActiveTradeId(null);
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

    const unseenIds = notificationItems
      .map((item) => item.id)
      .filter((id) => !seenNotificationSet.has(id));

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

    if (unseenIds.length > 0) {
      void markRomanNotificationEventsSeen(unseenIds);
    }
  }, [notificationsOpen, notificationItems, seenNotificationSet]);

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
          priceFormatter: (price: number) => formatPrice(price),
          timeFormatter: formatChartCrosshairTime
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
          tickMarkFormatter: formatChartTickLabel,
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
      const onVisibleRangeChange = () => {
        setChartViewportVersion((version) => version + 1);
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange);

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
        setChartViewportSize({ width, height });
        setChartViewportVersion((version) => version + 1);
      });

      resizeObserver.observe(container);

      const settleResize = () => {
        chart.applyOptions({
          width: Math.max(1, Math.floor(container.clientWidth)),
          height: Math.max(1, Math.floor(container.clientHeight))
        });
        setChartViewportSize({
          width: Math.max(1, Math.floor(container.clientWidth)),
          height: Math.max(1, Math.floor(container.clientHeight))
        });
        setChartViewportVersion((version) => version + 1);
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
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange);
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
        setChartViewportSize({ width: 0, height: 0 });
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
      const nowMs = getProjectedMarketNowMs();
      const isStale = nowMs >= candleEndMs + candleMs;
      const remaining = isStale ? null : Math.max(0, Math.floor((candleEndMs - nowMs) / 1000));
      const h = remaining === null ? 0 : Math.floor(remaining / 3600);
      const m = remaining === null ? 0 : Math.floor((remaining % 3600) / 60);
      const s = remaining === null ? 0 : remaining % 60;
      const pad = (n: number) => String(n).padStart(2, "0");
      const timer =
        remaining === null
          ? "--:--"
          : h > 0
            ? `${pad(h)}:${pad(m)}:${pad(s)}`
            : `${pad(m)}:${pad(s)}`;
      const price = formatPriceByTick(latestCandle.close, selectedAsset.tickSize);
      const text = `${price}\n${timer}`;

      if (text !== lastText) {
        overlay.textContent = text;
        lastText = text;
      }

      const isUp = latestCandle.close >= latestCandle.open;
      overlay.style.background = isUp ? "rgba(27, 174, 138, 0.85)" : "rgba(240, 69, 90, 0.85)";
      overlay.style.opacity = remaining === null ? "0.68" : "1";

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
  }, [
    getProjectedMarketNowMs,
    latestCandle,
    selectedAsset.tickSize,
    selectedTimeframe,
    renderedSelectedCandles
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const selection = `${selectedSymbol}-${selectedTimeframe}`;

    if (!chart || !candleSeries) {
      return;
    }

    if (renderedSelectedCandles.length === 0) {
      candleSeries.setData([]);
      delete pendingVisibleRangeShiftRef.current[selectedKey];
      selectionRef.current = "";
      return;
    }

    const candleData: CandlestickData[] = renderedSelectedCandles.map((candle) => ({
      time: toUtcTimestamp(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    }));

    candleSeries.setData(candleData);

    const lastBar = renderedSelectedCandles[renderedSelectedCandles.length - 1];

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
  }, [chartReadyVersion, renderedSelectedCandles, selectedKey, selectedSymbol, selectedTimeframe]);

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
    const handlePointerUp = () => {
      drawingDragStateRef.current = null;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "Escape") {
        if (drawingDraft) {
          event.preventDefault();
          setDrawingDraft(null);
          return;
        }

        if (activeDrawingTool !== "cursor") {
          event.preventDefault();
          setActiveDrawingTool("cursor");
        }

        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedDrawingId) {
          event.preventDefault();
          deleteSelectedDrawing();
        }

        return;
      }

      const shortcut = event.key.toLowerCase();

      if (shortcut === "t") {
        event.preventDefault();
        setActiveDrawingTool("trendline");
        setDrawingDraft(null);
      } else if (shortcut === "g") {
        event.preventDefault();
        setActiveDrawingTool("arrow");
        setDrawingDraft(null);
      } else if (shortcut === "a") {
        event.preventDefault();
        setActiveDrawingTool("ray");
        setDrawingDraft(null);
      } else if (shortcut === "h") {
        event.preventDefault();
        setActiveDrawingTool("horizontal");
        setDrawingDraft(null);
      } else if (shortcut === "v") {
        event.preventDefault();
        setActiveDrawingTool("vertical");
        setDrawingDraft(null);
      } else if (shortcut === "r" && !event.altKey) {
        event.preventDefault();
        setActiveDrawingTool("rectangle");
        setDrawingDraft(null);
      } else if (shortcut === "o") {
        event.preventDefault();
        setActiveDrawingTool("ellipse");
        setDrawingDraft(null);
      } else if (shortcut === "m") {
        event.preventDefault();
        setActiveDrawingTool("measure");
        setDrawingDraft(null);
      } else if (shortcut === "l") {
        event.preventDefault();
        setActiveDrawingTool("longPosition");
        setDrawingDraft(null);
      } else if (shortcut === "s") {
        event.preventDefault();
        setActiveDrawingTool("shortPosition");
        setDrawingDraft(null);
      } else if (shortcut === "f") {
        event.preventDefault();
        setActiveDrawingTool("fibonacci");
        setDrawingDraft(null);
      }
    };

    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeDrawingTool, deleteSelectedDrawing, drawingDraft, selectedDrawingId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.key.toLowerCase() !== "r") {
        return;
      }

      event.preventDefault();

      const chart = chartRef.current;

      if (!chart || renderedSelectedCandles.length === 0) {
        return;
      }

      const to = renderedSelectedCandles.length - 1;
      const from = Math.max(0, to - timeframeVisibleCount[selectedTimeframe]);
      chart.timeScale().setVisibleLogicalRange({ from, to });
      focusTradeIdRef.current = null;
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [renderedSelectedCandles, selectedTimeframe]);

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
    const to = Math.min(renderedSelectedCandles.length - 1, rightBound + Math.round(span * 0.6));
    chart.timeScale().setVisibleLogicalRange({ from, to });
    focusTradeIdRef.current = null;
  }, [
    candleIndexByUnix,
    renderedSelectedCandles,
    selectedHistoryTrade,
    selectedSymbol,
    selectedTimeframe
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = chartContainerRef.current;

    if (!chart || !container) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const width = Math.max(1, Math.floor(container.clientWidth));
      const height = Math.max(1, Math.floor(container.clientHeight));

      chart.applyOptions({
        width,
        height
      });
      setChartViewportSize({ width, height });
      setChartViewportVersion((version) => version + 1);
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
      status: selectedHistoryTrade.status === "open" ? "pending" : "closed",
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
          ? renderedSelectedCandles
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
  }, [renderedSelectedCandles, selectedSymbol, selectedTimeframe, timeframePreviewMap]);
  const resetChart = () => {
    const chart = chartRef.current;

    if (!chart || renderedSelectedCandles.length === 0) {
      return;
    }

    const to = renderedSelectedCandles.length - 1;
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
  const marketStatusDetails = marketError
    ? marketError
    : `${marketFeedMeta?.provider ?? "Databento"} - ${marketFeedMeta?.sourceTimeframe ?? selectedTimeframe}`;
  const currentAccountLabel = activeAccountRole ?? (isMobileWorkspace ? "User" : "Guest");
  const isAdmin = activeAccountRole === "Admin";
  const canManageConnections = activeAccountRole !== null;
  const legacyYazanAccountSummary = yazanAccount
    ? yazanAccount.provider === "tradovate"
      ? [
          getSyncProviderLabel(yazanAccount.provider),
          yazanAccount.environment === "demo" ? "Demo" : "Live",
          yazanAccount.accountLabel || yazanAccount.connectionLabel || yazanAccount.username
        ]
          .filter(Boolean)
          .join(" • ")
      : [
          getSyncProviderLabel(yazanAccount.provider),
          yazanAccount.application.toUpperCase(),
          yazanAccount.accountNumber ? `#${yazanAccount.accountNumber}` : yazanAccount.accountLabel
        ]
          .filter(Boolean)
          .join(" • ")
    : null;

  const yazanAccountSummary = yazanAccount
    ? yazanAccount.provider === "tradovate"
      ? [
          getSyncProviderLabel(yazanAccount.provider),
          yazanAccount.environment === "demo" ? "Demo" : "Live",
          yazanAccount.connectionState === "connected"
            ? "Connected"
            : yazanAccount.connectionState === "pending"
              ? "Pending"
              : "Needs Attention",
          yazanAccount.providerAccountName ||
            yazanAccount.accountLabel ||
            yazanAccount.connectionLabel ||
            yazanAccount.username
        ]
          .filter(Boolean)
          .join(" • ")
      : [
          getSyncProviderLabel(yazanAccount.provider),
          yazanAccount.application.toUpperCase(),
          yazanAccount.connectionState === "connected"
            ? "Connected"
            : yazanAccount.connectionState === "pending"
              ? "Pending"
              : "Needs Attention",
          yazanAccount.providerAccountNumber
            ? `#${yazanAccount.providerAccountNumber}`
            : yazanAccount.accountNumber || yazanAccount.accountLabel
        ]
          .filter(Boolean)
          .join(" • ")
    : null;

  const selectedTradeOwnerLabel = hasWorkspaceProfiles
    ? selectedModel?.name ?? null
    : yazanAccount
      ? yazanAccount.providerAccountName ||
        yazanAccount.accountLabel ||
        yazanAccount.connectionLabel ||
        getSyncProviderLabel(yazanAccount.provider)
      : showcaseMode
        ? INTERNAL_SIMULATION_MODEL.name
        : null;

  const updateYazanSyncDraft = (field: keyof AccountSyncDraft, value: string) => {
    setYazanSyncError(null);
    setYazanSyncSuccess(null);
    setYazanSyncFieldErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }

      return {
        ...prev,
        [field]: undefined
      };
    });
    setYazanSyncDraft((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const updateYazanSyncProvider = (provider: SyncProvider) => {
    setYazanSyncError(null);
    setYazanSyncSuccess(null);
    setYazanSyncFieldErrors({});
    setYazanSyncDraft((current) => {
      if (current.provider === provider) {
        return current;
      }

      const next = createDefaultSyncDraft(provider);
      const builtInWebhookUrl =
        provider === "tradesyncer" && typeof window !== "undefined"
          ? buildDefaultTradesyncWebhookUrl(window.location.origin)
          : "";

      return {
        ...next,
        connectionLabel: current.connectionLabel || next.connectionLabel,
        environment: current.environment,
        accountLabel: current.accountLabel || next.accountLabel,
        accountNumber: current.accountNumber,
        username: current.username,
        webhookUrl:
          provider === "tradesyncer"
            ? current.webhookUrl || builtInWebhookUrl || next.webhookUrl
            : ""
      };
    });
  };

  const openYazanSyncDraft = (
    mode: "add" | "edit" = "edit",
    provider: SyncProvider = yazanAccount?.provider ?? "tradovate"
  ) => {
    if (!canManageConnections) {
      return;
    }

    setShowYazanAccountMenu(false);
    setYazanSyncDraftMode(mode);
    setYazanSyncError(null);
    setYazanSyncSuccess(null);
    setYazanSyncFieldErrors({});
    setYazanSyncDraft(
      (() => {
        const nextDraft =
          mode === "add"
            ? createDefaultSyncDraft(provider)
            : sanitizeAccountSyncDraft(yazanAccount ?? createDefaultSyncDraft(provider));

        if (
          nextDraft.provider === "tradesyncer" &&
          !nextDraft.webhookUrl &&
          typeof window !== "undefined"
        ) {
          return {
            ...nextDraft,
            webhookUrl: buildDefaultTradesyncWebhookUrl(window.location.origin)
          };
        }

        return nextDraft;
      })()
    );
    setShowYazanSyncDraft(true);
  };

  const openYazanAccountMenu = (clientX: number, clientY: number) => {
    if (!isAdmin) {
      return;
    }

    setShowYazanSyncDraft(false);
    setYazanAccountMenuPosition({
      x: Math.max(12, Math.min(clientX + 6, window.innerWidth - YAZAN_ACCOUNT_MENU_WIDTH)),
      y: Math.max(18, Math.min(clientY - 12, window.innerHeight - YAZAN_ACCOUNT_MENU_HEIGHT))
    });
    setShowYazanAccountMenu(true);
  };

  const handleYazanAccountContextMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    isYazan: boolean
  ) => {
    if (!isAdmin || !isYazan) {
      return;
    }

    event.preventDefault();
    openYazanAccountMenu(event.clientX, event.clientY);
  };

  const handleYazanAccountMouseDown = (
    event: ReactMouseEvent<HTMLButtonElement>,
    isYazan: boolean
  ) => {
    if (!isAdmin || !isYazan || event.button !== 2) {
      return;
    }

    event.preventDefault();
    openYazanAccountMenu(event.clientX, event.clientY);
  };

  const closeYazanSyncDraft = () => {
    setShowYazanSyncDraft(false);
    setShowYazanAccountMenu(false);
    setYazanSyncError(null);
    setYazanSyncSuccess(null);
    setYazanSyncFieldErrors({});
    setYazanSyncDraft(sanitizeAccountSyncDraft(yazanAccount ?? createDefaultSyncDraft()));
  };

  const saveYazanSyncDraft = async () => {
    const normalized = sanitizeAccountSyncDraft(yazanSyncDraft);

    setYazanSyncSaving(true);
    setYazanSyncError(null);
    setYazanSyncSuccess(null);
    setYazanSyncFieldErrors({});

    try {
      const response = await fetch("/api/broker-sync/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          draft: normalized,
          origin: typeof window !== "undefined" ? window.location.origin : null
        })
      });
      const result = (await response.json()) as BrokerSyncVerifyResponse;

      if (!response.ok || !result.ok) {
        const nextError = result.ok ? "The broker connection could not be verified." : result.error;

        setYazanSyncError(nextError);
        setYazanSyncFieldErrors(result.ok ? {} : result.fieldErrors ?? {});
        return;
      }

      const nextConnection = normalizeSavedAccountSync(result.connection) ?? result.connection;

      setYazanAccount(nextConnection);
      setYazanSyncDraft(nextConnection);
      setYazanSyncSuccess(nextConnection.connectionMessage || "Connection verified and saved.");
      setShowYazanSyncDraft(false);
      setShowYazanAccountMenu(false);
    } catch (error) {
      setYazanSyncError(
        error instanceof Error ? error.message : "The broker connection could not be verified."
      );
    } finally {
      setYazanSyncSaving(false);
    }
  };

  const removeYazanAccount = () => {
    setYazanAccount(null);
    setYazanSyncDraftMode("add");
    setYazanSyncDraft(createDefaultSyncDraft());
    setYazanSyncError(null);
    setYazanSyncSuccess(null);
    setYazanSyncFieldErrors({});
    setShowYazanSyncDraft(false);
    setShowYazanAccountMenu(false);
  };

  const moveAssetSymbol = (
    sourceSymbol: string,
    targetSymbol: string,
    placement: AssetDropPlacement = "before"
  ) => {
    if (sourceSymbol === targetSymbol) {
      return;
    }

    setAssetOrder((current) => {
      const normalized = normalizeAssetOrder(current);
      const sourceIndex = normalized.indexOf(sourceSymbol);
      const targetIndex = normalized.indexOf(targetSymbol);

      if (sourceIndex < 0 || targetIndex < 0) {
        return normalized;
      }

      const next = [...normalized];
      const [movedSymbol] = next.splice(sourceIndex, 1);
      const adjustedTargetIndex = next.indexOf(targetSymbol);

      if (adjustedTargetIndex < 0) {
        return normalized;
      }

      next.splice(adjustedTargetIndex + (placement === "after" ? 1 : 0), 0, movedSymbol);

      return next;
    });
  };

  const addAssetSymbol = (symbol: string) => {
    const normalized = normalizeAssetOrder(assetOrder);

    if (normalized.includes(symbol)) {
      return;
    }

    setAssetOrder([...normalized, symbol]);
    setAssetSearchQuery("");
    setSelectedSymbol(symbol);
    setSelectedHistoryId(null);
    setShowAllTradesOnChart(false);
    focusTradeIdRef.current = null;
  };

  const removeAssetSymbol = (symbol: string) => {
    const normalized = normalizeAssetOrder(assetOrder);

    if (!normalized.includes(symbol) || normalized.length <= 1) {
      return;
    }

    const nextOrder = normalized.filter((entry) => entry !== symbol);
    setAssetOrder(nextOrder);

    if (selectedSymbol !== symbol) {
      return;
    }

    const fallbackSymbol = nextOrder[0] ?? defaultAssetOrder[0];

    if (!fallbackSymbol) {
      return;
    }

    setSelectedSymbol(fallbackSymbol);
    setSelectedHistoryId(null);
    setShowAllTradesOnChart(false);
    focusTradeIdRef.current = null;
  };

  const handleAssetDragStart = (event: ReactDragEvent<HTMLButtonElement>, symbol: string) => {
    setDraggedAssetSymbol(symbol);
    setAssetDropTarget(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", symbol);
  };

  const handleAssetDragOver = (event: ReactDragEvent<HTMLLIElement>, symbol: string) => {
    if (!draggedAssetSymbol || draggedAssetSymbol === symbol) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement: AssetDropPlacement =
      event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";

    setAssetDropTarget((current) =>
      current?.symbol === symbol && current.placement === placement
        ? current
        : { symbol, placement }
    );
  };

  const handleAssetDrop = (event: ReactDragEvent<HTMLLIElement>, symbol: string) => {
    event.preventDefault();
    const sourceSymbol = draggedAssetSymbol ?? event.dataTransfer.getData("text/plain");

    if (!sourceSymbol) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const fallbackPlacement: AssetDropPlacement =
      event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    const placement =
      assetDropTarget?.symbol === symbol ? assetDropTarget.placement : fallbackPlacement;

    moveAssetSymbol(sourceSymbol, symbol, placement);
    setDraggedAssetSymbol(null);
    setAssetDropTarget(null);
  };

  const handleAssetDragEnd = () => {
    setDraggedAssetSymbol(null);
    setAssetDropTarget(null);
  };

  useEffect(() => {
    if (isAdmin) {
      return;
    }

    setShowYazanAccountMenu(false);
    setShowYazanSyncDraft(false);
  }, [isAdmin]);

  useEffect(() => {
    if (showYazanSyncDraft) {
      return;
    }

    setShowYazanAccountMenu(false);
  }, [selectedModelId, showYazanSyncDraft]);

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
        setYazanSyncError(null);
        setYazanSyncSuccess(null);
        setYazanSyncFieldErrors({});
        setYazanSyncDraft(sanitizeAccountSyncDraft(yazanAccount ?? createDefaultSyncDraft()));
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

  if (!showcaseMode && !activeAccountRole && !isMobileWorkspace) {
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

  if (isMobileWorkspace) {
    return (
      <main
        className={`terminal mobile-phone-shell${
          isStandaloneMobileWorkspace ? " mobile-phone-shell-standalone" : ""
        }`}
      >
        <section className="mobile-phone-frame">
          <header className="mobile-phone-header">
            <div className="mobile-phone-brand-row mobile-phone-brand-row-centered">
              <div className="mobile-phone-brand-copy mobile-phone-brand-copy-centered">
                <span className="mobile-phone-brand">Roman Capital</span>
                <h1>{mobileWorkspaceTab === "trade" ? "Active Trades" : "Trade History"}</h1>
                <p className="mobile-phone-header-date">{mobileDateLabel}</p>
                <div className="mobile-phone-header-time-row">
                  <span className="mobile-phone-header-time">{mobileTimeLabel}</span>
                  <span className="mobile-phone-header-time-badge live">Live</span>
                </div>
              </div>
            </div>
          </header>

          <div className="mobile-phone-body">
            {mobileWorkspaceTab === "trade" ? (
              <section className="mobile-phone-card mobile-phone-card-active">
                {mobileDisplayTrade ? (
                  <>
                    <div className="mobile-phone-card-head">
                      <div className="mobile-phone-card-copy">
                        <span className="mobile-phone-card-kicker">
                          {selectedTradeOwnerLabel ?? "Simulation Desk"}
                        </span>
                        <h2>Active Trades</h2>
                      </div>
                      <span className="mobile-phone-count-chip">
                        {activeTrades.length.toLocaleString("en-US")}
                      </span>
                    </div>

                    <div className="mobile-phone-active-list" role="list">
                      {activeTrades.map((trade) => (
                        <button
                          key={trade.id}
                          type="button"
                          className={`mobile-phone-active-row ${
                            mobileDisplayTrade.id === trade.id ? "selected" : ""
                          }`}
                          onClick={() => setSelectedActiveTradeId(trade.id)}
                          aria-pressed={mobileDisplayTrade.id === trade.id}
                        >
                          <span className="mobile-phone-active-row-main">
                            <span className="mobile-phone-active-row-copy">
                              <span className="mobile-phone-active-row-headline">
                                <strong>{trade.symbol}</strong>
                                <span
                                  className={`mobile-phone-side-pill ${
                                    trade.side === "Long" ? "up" : "down"
                                  }`}
                                >
                                  {trade.side === "Long" ? "Buy" : "Sell"}
                                </span>
                              </span>
                              <span className="mobile-phone-active-row-meta">
                                <em className="mobile-phone-side-pill">Open</em>
                                <span>{trade.time}</span>
                              </span>
                            </span>
                            <span className="mobile-phone-active-row-values">
                              <strong className={trade.pnlUsd >= 0 ? "up" : "down"}>
                                {formatSignedUsd(trade.pnlUsd)}
                              </strong>
                              <span className={trade.pnlPct >= 0 ? "up" : "down"}>
                                {trade.pnlPct >= 0 ? "+" : ""}
                                {trade.pnlPct.toFixed(2)}%
                              </span>
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="mobile-phone-active-detail-card">
                      <div className="mobile-phone-card-head">
                        <div className="mobile-phone-card-copy">
                          <span className="mobile-phone-card-kicker">
                            {mobileDisplayTrade.symbol}
                          </span>
                          <h2>Trade Detail</h2>
                        </div>
                        <span
                          className={`mobile-phone-side-pill ${
                            mobileDisplayTrade.side === "Long" ? "up" : "down"
                          }`}
                        >
                          {mobileDisplayTrade.side === "Long" ? "Buy" : "Sell"}
                        </span>
                      </div>

                      <div className="mobile-phone-pnl-block">
                        <span>Trade PnL</span>
                        <strong className={mobileDisplayTrade.pnlUsd >= 0 ? "up" : "down"}>
                          {formatSignedUsd(mobileDisplayTrade.pnlUsd)}
                        </strong>
                        <small className={mobileDisplayTrade.pnlPct >= 0 ? "up" : "down"}>
                          {mobileDisplayTrade.pnlPct >= 0 ? "+" : ""}
                          {mobileDisplayTrade.pnlPct.toFixed(2)}%
                        </small>
                      </div>

                      {mobileTradeSparkline ? (
                        <div className="mobile-phone-active-chart-shell">
                          <div
                            className={`mobile-phone-active-chart-change ${
                              mobileDisplayTrade.pnlUsd >= 0 ? "up" : "down"
                            }`}
                          >
                            <span className="mobile-phone-active-chart-arrow" aria-hidden="true">
                              {mobileDisplayTrade.pnlUsd >= 0 ? "^" : "v"}
                            </span>
                            <strong>{formatSignedUsd(mobileDisplayTrade.pnlUsd)}</strong>
                            <span>
                              {mobileDisplayTrade.pnlPct >= 0 ? "+" : ""}
                              {mobileDisplayTrade.pnlPct.toFixed(2)}%
                            </span>
                          </div>
                          <div
                            ref={mobileTradeChartRef}
                            className={`mobile-phone-active-chart ${
                              mobileDisplayTrade.pnlUsd >= 0
                                ? "mobile-phone-active-chart-up"
                                : "mobile-phone-active-chart-down"
                            }`}
                            onPointerDown={handleMobileTradeChartPointerDown}
                            onPointerMove={handleMobileTradeChartPointerMove}
                            onPointerUp={handleMobileTradeChartPointerEnd}
                            onPointerCancel={handleMobileTradeChartPointerEnd}
                            onPointerLeave={(event) => {
                              if (event.pointerType === "mouse") {
                                setMobileTradeChartScrubIndex(null);
                              }
                            }}
                          >
                            <svg
                              viewBox={`0 0 ${mobileTradeSparkline.width} ${mobileTradeSparkline.height}`}
                              preserveAspectRatio="none"
                              aria-hidden="true"
                            >
                              <line
                                x1="0"
                                y1={mobileTradeSparkline.height - 1}
                                x2={mobileTradeSparkline.width}
                                y2={mobileTradeSparkline.height - 1}
                                className="mobile-phone-active-chart-baseline"
                              />
                              <path
                                d={mobileTradeSparkline.path}
                                className="mobile-phone-active-chart-path"
                              />
                              {mobileTradeChartScrubIndex !== null && mobileTradeChartDisplayPoint ? (
                                <line
                                  x1={mobileTradeChartDisplayPoint.x}
                                  y1="0"
                                  x2={mobileTradeChartDisplayPoint.x}
                                  y2={mobileTradeSparkline.height}
                                  className="mobile-phone-active-chart-scrubline"
                                />
                              ) : null}
                            </svg>
                            {mobileTradeSparkline.points.length > 0 ? (
                              <span
                                className="mobile-phone-active-chart-dot mobile-phone-active-chart-endpoint"
                                style={{
                                  left: `${(mobileTradeSparkline.points[mobileTradeSparkline.points.length - 1]!.x / mobileTradeSparkline.width) * 100}%`,
                                  top: `${(mobileTradeSparkline.points[mobileTradeSparkline.points.length - 1]!.y / mobileTradeSparkline.height) * 100}%`
                                }}
                              />
                            ) : null}
                            {mobileTradeChartScrubIndex !== null && mobileTradeChartDisplayPoint ? (
                              <span
                                className="mobile-phone-active-chart-dot mobile-phone-active-chart-point"
                                style={{
                                  left: `${(mobileTradeChartDisplayPoint.x / mobileTradeSparkline.width) * 100}%`,
                                  top: `${(mobileTradeChartDisplayPoint.y / mobileTradeSparkline.height) * 100}%`
                                }}
                              />
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      <div className="mobile-phone-detail-list">
                        <div className="mobile-phone-detail-row">
                          <span>Entry Price</span>
                          <strong>{formatPrice(mobileDisplayTrade.entryPrice)}</strong>
                        </div>
                        <div className="mobile-phone-detail-row">
                          <span>Live Mark</span>
                          <strong>{formatPrice(mobileDisplayTrade.outcomePrice)}</strong>
                        </div>
                        <div className="mobile-phone-detail-row">
                          <span>Take Profit</span>
                          <strong className="up">{formatPrice(mobileDisplayTrade.targetPrice)}</strong>
                        </div>
                        <div className="mobile-phone-detail-row">
                          <span>Stop Loss</span>
                          <strong className="down">{formatPrice(mobileDisplayTrade.stopPrice)}</strong>
                        </div>
                        <div className="mobile-phone-detail-row">
                          <span>Status</span>
                          <strong>Open</strong>
                        </div>
                        <div className="mobile-phone-detail-row">
                          <span>Side</span>
                          <strong>{mobileDisplayTrade.side === "Long" ? "Buy" : "Sell"}</strong>
                        </div>
                        <div className="mobile-phone-detail-row">
                          <span>Duration</span>
                          <strong>{mobileDisplayTradeDuration ?? "--"}</strong>
                        </div>
                        <div className="mobile-phone-detail-row">
                          <span>R:R</span>
                          <strong>
                            {mobileDisplayTradeRiskReward
                              ? `1:${mobileDisplayTradeRiskReward.toFixed(2)}`
                              : "--"}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mobile-phone-empty-state">
                    <span className="mobile-phone-card-kicker">
                      {selectedTradeOwnerLabel ?? "Simulation Desk"}
                    </span>
                    <h2>No active trades</h2>
                    <p>
                      {chartSimulationEnabled
                        ? selectedTradeOwnerLabel
                          ? "Only open trades for the current model or connected account will appear here."
                          : "Add or select a model/account to populate the active blotter."
                        : "Turn simulation on to populate the active blotter and inspect trade details."}
                    </p>
                  </div>
                )}
              </section>
            ) : (
              <section className="mobile-phone-card mobile-phone-card-history">
                <div className="mobile-phone-card-head">
                  <div className="mobile-phone-card-copy">
                    <span className="mobile-phone-card-kicker">Recent Trades</span>
                    <h2>History</h2>
                  </div>
                  <span className="mobile-phone-count-chip">
                    {mobileHistoryRows.length.toLocaleString("en-US")}
                  </span>
                </div>

                {mobileHistoryRows.length === 0 ? (
                  <div className="mobile-phone-empty-state">
                    <span className="mobile-phone-card-kicker">History</span>
                    <h2>No trades yet</h2>
                    <p>
                      {chartSimulationEnabled
                        ? selectedTradeOwnerLabel
                          ? "Only closed trades for the current model or connected account will appear here."
                          : "Add or select a model/account to populate the history."
                        : "Turn simulation on to populate the history."}
                    </p>
                  </div>
                ) : (
                  <div className="mobile-phone-history-list">
                    {mobileHistoryRows.map((trade) => {
                      const railTone = getMobileHistoryRailTone(trade);

                      return (
                        <article key={trade.id} className="mobile-phone-history-row">
                          <div className="mobile-phone-history-main">
                            <div className="mobile-phone-history-copy">
                              <strong>{trade.symbol}</strong>
                              <span>
                                {trade.side === "Long" ? "Buy" : "Sell"} | {trade.result}
                              </span>
                            </div>
                            <div className="mobile-phone-history-values">
                              <strong className={trade.pnlUsd >= 0 ? "up" : "down"}>
                                {formatSignedUsd(trade.pnlUsd)}
                              </strong>
                              <span className={trade.pnlPct >= 0 ? "up" : "down"}>
                                {trade.pnlPct >= 0 ? "+" : ""}
                                {trade.pnlPct.toFixed(2)}%
                              </span>
                            </div>
                          </div>
                          <div className="mobile-phone-history-meta">
                            <span>{trade.time}</span>
                            <span>Entry {formatPrice(trade.entryPrice)}</span>
                            <span>Exit {formatPrice(trade.outcomePrice)}</span>
                          </div>
                          <span
                            className={`mobile-phone-history-rail ${railTone}`}
                            aria-hidden="true"
                          />
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>

          <nav className="mobile-phone-tabbar" aria-label="Mobile workspace tabs">
            {([
              { id: "trade", label: "Trade" },
              { id: "history", label: "History" }
            ] as Array<{ id: MobileWorkspaceTab; label: string }>).map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`mobile-phone-tab${mobileWorkspaceTab === tab.id ? " active" : ""}`}
                onClick={() => setMobileWorkspaceTab(tab.id)}
                aria-pressed={mobileWorkspaceTab === tab.id}
              >
                <span className="mobile-phone-tab-icon">
                  <MobileWorkspaceTabIcon tab={tab.id} />
                </span>
                <span className="mobile-phone-tab-label">{tab.label}</span>
              </button>
            ))}
          </nav>
        </section>
      </main>
    );
  }

  const chartDrawingsForRender = activeDrawingDraft
    ? [
        ...currentChartDrawings,
        {
          id: "draft-drawing",
          tool: activeDrawingDraft.tool,
          points: [activeDrawingDraft.start, activeDrawingDraft.current],
          color: activeDrawingColor,
          createdAt: Date.now()
        } satisfies ChartDrawing
      ]
    : currentChartDrawings;
  const chartDrawingLayerInteractive = canDrawOnChart && activeDrawingTool !== "cursor";

  const getRayScreenEndpoint = (
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): { x: number; y: number } => {
    const width = chartViewportSize.width;
    const height = chartViewportSize.height;
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001)) {
      return end;
    }

    const candidates: number[] = [];

    if (dx > 0) {
      candidates.push((width - start.x) / dx);
    } else if (dx < 0) {
      candidates.push((0 - start.x) / dx);
    }

    if (dy > 0) {
      candidates.push((height - start.y) / dy);
    } else if (dy < 0) {
      candidates.push((0 - start.y) / dy);
    }

    const positiveCandidates = candidates.filter((value) => Number.isFinite(value) && value > 0);
    const factor = positiveCandidates.length > 0 ? Math.min(...positiveCandidates) : 1;

    return {
      x: start.x + dx * factor,
      y: start.y + dy * factor
    };
  };

  const renderDrawingHandles = (drawing: ChartDrawing, points: Array<{ x: number; y: number }>) => {
    if (selectedDrawingId !== drawing.id || points.length === 0) {
      return null;
    }

    return points.map((point, index) => (
      <g key={`${drawing.id}-handle-${index}`} className="chart-drawing-handle">
        <circle cx={point.x} cy={point.y} r={8.2} fill="rgba(158, 201, 255, 0.14)" />
        <circle
          cx={point.x}
          cy={point.y}
          r={4.4}
          fill="#090d13"
          stroke="#f6fbff"
          strokeWidth={1.45}
        />
        <circle cx={point.x} cy={point.y} r={1.55} fill="#f6fbff" />
      </g>
    ));
  };

  const renderDrawingBadge = (
    x: number,
    y: number,
    label: string,
    tone: "neutral" | "up" | "down" | "accent" = "neutral",
    anchor: "start" | "center" = "start"
  ) => {
    const width = Math.max(66, label.length * 5.8 + 16);
    const height = 16;
    const badgeX = anchor === "center" ? x - width / 2 : x;
    const palette =
      tone === "up"
        ? {
            fill: "rgba(14, 36, 28, 0.92)",
            stroke: "rgba(85, 226, 154, 0.4)",
            text: "#bff5db"
          }
        : tone === "down"
          ? {
              fill: "rgba(40, 14, 18, 0.92)",
              stroke: "rgba(255, 129, 149, 0.38)",
              text: "#ffd1d8"
            }
          : tone === "accent"
            ? {
                fill: "rgba(17, 28, 44, 0.92)",
                stroke: "rgba(127, 183, 255, 0.38)",
                text: "#dcedff"
              }
            : {
                fill: "rgba(8, 13, 20, 0.88)",
                stroke: "rgba(255, 255, 255, 0.1)",
                text: "#dbe7f5"
              };

    return (
      <g pointerEvents="none">
        <rect
          x={badgeX}
          y={y}
          width={width}
          height={height}
          rx={4}
          fill={palette.fill}
          stroke={palette.stroke}
        />
        <text
          x={badgeX + 8}
          y={y + 10.8}
          fill={palette.text}
          fontSize="8.2"
          fontFamily="IBM Plex Mono, SFMono-Regular, Menlo, Monaco, monospace"
          letterSpacing="0.02em"
        >
          {label}
        </text>
      </g>
    );
  };

  const renderArrowHead = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    stroke: string,
    opacity: number
  ) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    if (!Number.isFinite(length) || length < 4) {
      return null;
    }

    const ux = dx / length;
    const uy = dy / length;
    const headLength = 12;
    const headWidth = 5.8;
    const leftX = end.x - ux * headLength + -uy * headWidth;
    const leftY = end.y - uy * headLength + ux * headWidth;
    const rightX = end.x - ux * headLength - -uy * headWidth;
    const rightY = end.y - uy * headLength - ux * headWidth;

    return (
      <path
        d={`M ${leftX} ${leftY} L ${end.x} ${end.y} L ${rightX} ${rightY}`}
        fill="none"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
      />
    );
  };

  const renderChartDrawing = (drawing: ChartDrawing) => {
    const isDraft = drawing.id === "draft-drawing";
    const isSelected = selectedDrawingId === drawing.id;
    const stroke = drawing.color || CHART_DRAWING_COLOR;
    const opacity = isDraft ? 0.76 : 1;
    const groupProps =
      !isDraft && activeDrawingTool === "cursor"
        ? {
            onPointerDown: (event: ReactPointerEvent<SVGGElement>) => {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              startDrawingDrag(drawing, event);
            }
          }
        : {};

    if (drawing.tool === "horizontal") {
      const point = getScreenPointForDrawing(drawing.points[0]);

      if (!point) {
        return null;
      }

      return (
        <g key={drawing.id} className="chart-drawing-shape" data-tool={drawing.tool} {...groupProps}>
          <line
            x1={0}
            x2={chartViewportSize.width}
            y1={point.y}
            y2={point.y}
            stroke="rgba(158, 201, 255, 0.18)"
            strokeWidth={6}
            opacity={opacity}
          />
          <line
            x1={0}
            x2={chartViewportSize.width}
            y1={point.y}
            y2={point.y}
            stroke={stroke}
            strokeWidth={isSelected ? 2.2 : 1.55}
            strokeDasharray="6 4"
            opacity={opacity}
          />
          {!isDraft ? (
            <line
              x1={0}
              x2={chartViewportSize.width}
              y1={point.y}
              y2={point.y}
              stroke="transparent"
              strokeWidth={14}
            />
          ) : null}
          {renderDrawingBadge(
            chartViewportSize.width - 108,
            point.y - 8,
            `LEVEL  ${formatPriceByTick(drawing.points[0]?.price ?? 0, selectedAsset.tickSize)}`,
            "accent"
          )}
          {renderDrawingHandles(drawing, [point])}
        </g>
      );
    }

    if (drawing.tool === "vertical") {
      const point = getScreenPointForDrawing(drawing.points[0]);

      if (!point) {
        return null;
      }

      return (
        <g key={drawing.id} className="chart-drawing-shape" data-tool={drawing.tool} {...groupProps}>
          <line
            x1={point.x}
            x2={point.x}
            y1={0}
            y2={chartViewportSize.height}
            stroke="rgba(158, 201, 255, 0.16)"
            strokeWidth={6}
            opacity={opacity}
          />
          <line
            x1={point.x}
            x2={point.x}
            y1={0}
            y2={chartViewportSize.height}
            stroke={stroke}
            strokeWidth={isSelected ? 2.2 : 1.55}
            strokeDasharray="6 4"
            opacity={opacity}
          />
          {!isDraft ? (
            <line
              x1={point.x}
              x2={point.x}
              y1={0}
              y2={chartViewportSize.height}
              stroke="transparent"
              strokeWidth={14}
            />
          ) : null}
          {renderDrawingBadge(
            Math.max(6, Math.min(point.x - 48, chartViewportSize.width - 100)),
            8,
            `TIME  ${formatChartBadgeTime(drawing.points[0]?.time ?? 0)}`,
            "neutral"
          )}
          {renderDrawingHandles(drawing, [point])}
        </g>
      );
    }

    const start = getScreenPointForDrawing(drawing.points[0]);
    const end = getScreenPointForDrawing(drawing.points[1]);

    if (!start || !end) {
      return null;
    }

    const lineMetrics = getDrawingLineMetrics(
      drawing.points[0],
      drawing.points[1],
      selectedTimeframe
    );

    if (drawing.tool === "ellipse") {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const width = Math.max(30, Math.abs(end.x - start.x));
      const height = Math.max(24, Math.abs(end.y - start.y));
      const cx = x + width / 2;
      const cy = y + height / 2;

      return (
        <g key={drawing.id} className="chart-drawing-shape" data-tool={drawing.tool} {...groupProps}>
          <ellipse
            cx={cx}
            cy={cy}
            rx={width / 2}
            ry={height / 2}
            fill={isSelected ? "rgba(158, 201, 255, 0.16)" : "rgba(115, 170, 245, 0.11)"}
            stroke="rgba(158, 201, 255, 0.18)"
            strokeWidth={7}
            opacity={opacity}
          />
          <ellipse
            cx={cx}
            cy={cy}
            rx={width / 2}
            ry={height / 2}
            fill="transparent"
            stroke={stroke}
            strokeWidth={isSelected ? 2.2 : 1.5}
            opacity={opacity}
          />
          <line
            x1={cx}
            y1={y}
            x2={cx}
            y2={y + height}
            stroke="rgba(210, 226, 245, 0.2)"
            strokeDasharray="4 4"
            strokeWidth={1}
            opacity={opacity}
          />
          <line
            x1={x}
            y1={cy}
            x2={x + width}
            y2={cy}
            stroke="rgba(210, 226, 245, 0.2)"
            strokeDasharray="4 4"
            strokeWidth={1}
            opacity={opacity}
          />
          {renderDrawingBadge(x, y - 20, `ELLIPSE  ${getDrawingRangeLabel(drawing.points[0], drawing.points[1], selectedAsset.tickSize, selectedTimeframe)}`, "accent")}
          {!isDraft ? (
            <ellipse
              cx={cx}
              cy={cy}
              rx={Math.max(width / 2, 14)}
              ry={Math.max(height / 2, 14)}
              fill="transparent"
            />
          ) : null}
          {renderDrawingHandles(drawing, [start, end])}
        </g>
      );
    }

    if (drawing.tool === "measure") {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const width = Math.max(18, Math.abs(end.x - start.x));
      const height = Math.max(18, Math.abs(end.y - start.y));
      const midX = x + width / 2;
      const midY = y + height / 2;
      const label = getDrawingRangeLabel(
        drawing.points[0],
        drawing.points[1],
        selectedAsset.tickSize,
        selectedTimeframe
      );

      return (
        <g key={drawing.id} className="chart-drawing-shape" data-tool={drawing.tool} {...groupProps}>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill="rgba(95, 163, 255, 0.06)"
            stroke="rgba(95, 163, 255, 0.55)"
            strokeWidth={isSelected ? 1.8 : 1.2}
            strokeDasharray="4 4"
            opacity={opacity}
          />
          <line
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke={stroke}
            strokeWidth={isSelected ? 2.1 : 1.4}
            opacity={opacity}
          />
          <line
            x1={x}
            y1={midY}
            x2={x + width}
            y2={midY}
            stroke="rgba(214, 227, 244, 0.18)"
            strokeWidth={1}
            opacity={opacity}
          />
          <line
            x1={midX}
            y1={y}
            x2={midX}
            y2={y + height}
            stroke="rgba(214, 227, 244, 0.18)"
            strokeWidth={1}
            opacity={opacity}
          />
          {renderDrawingBadge(midX, y - 20, label, lineMetrics.priceDelta >= 0 ? "up" : "down", "center")}
          {!isDraft ? (
            <rect
              x={x}
              y={y}
              width={Math.max(width, 14)}
              height={Math.max(height, 14)}
              fill="transparent"
            />
          ) : null}
          {renderDrawingHandles(drawing, [start, end])}
        </g>
      );
    }

    if (drawing.tool === "fibonacci") {
      const left = Math.min(start.x, end.x);
      const right = Math.max(start.x, end.x);
      const width = Math.max(56, right - left);
      const top = start.y;
      const bottom = end.y;
      const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const fibStroke = isSelected ? "#f6fbff" : "#d9bf76";
      const startPrice = drawing.points[0]?.price ?? 0;
      const endPrice = drawing.points[1]?.price ?? 0;

      return (
        <g key={drawing.id} className="chart-drawing-shape" data-tool={drawing.tool} {...groupProps}>
          <rect
            x={left}
            y={Math.min(top, bottom)}
            width={width}
            height={Math.abs(bottom - top)}
            fill="rgba(217, 191, 118, 0.04)"
            opacity={opacity}
          />
          {ratios.map((ratio) => {
            const y = top + (bottom - top) * ratio;
            const price = startPrice + (endPrice - startPrice) * ratio;

            return (
              <g key={`${drawing.id}-fib-${ratio}`}>
                <line
                  x1={left}
                  y1={y}
                  x2={left + width}
                  y2={y}
                  stroke="rgba(217, 191, 118, 0.2)"
                  strokeWidth={ratio === 0 || ratio === 1 ? 6 : 4}
                  opacity={opacity}
                />
                <line
                  x1={left}
                  y1={y}
                  x2={left + width}
                  y2={y}
                  stroke={fibStroke}
                  strokeWidth={ratio === 0 || ratio === 1 ? 1.9 : 1.2}
                  opacity={opacity}
                />
                <text
                  x={left + 6}
                  y={y - 4}
                  fill={fibStroke}
                  fontSize="9"
                  fontFamily="IBM Plex Mono, SFMono-Regular, Menlo, Monaco, monospace"
                  opacity={Math.max(0.72, opacity)}
                >
                  {ratio.toFixed(3)}  {formatPriceByTick(price, selectedAsset.tickSize)}
                </text>
              </g>
            );
          })}
          {renderDrawingBadge(
            left,
            Math.min(top, bottom) - 20,
            `FIB  ${getDrawingRangeLabel(drawing.points[0], drawing.points[1], selectedAsset.tickSize, selectedTimeframe)}`,
            "neutral"
          )}
          {!isDraft ? (
            <rect
              x={left}
              y={Math.min(top, bottom) - 10}
              width={width}
              height={Math.abs(bottom - top) + 20}
              fill="transparent"
            />
          ) : null}
          {renderDrawingHandles(drawing, [start, end])}
        </g>
      );
    }

    if (drawing.tool === "longPosition" || drawing.tool === "shortPosition") {
      const isLongPosition = drawing.tool === "longPosition";
      const left = Math.min(start.x, end.x);
      const width = Math.max(64, Math.abs(end.x - start.x));
      const entryY = start.y;
      const riskHeight = Math.max(16, Math.abs(end.y - start.y));
      const rewardHeight = riskHeight * 2;
      const stopY = isLongPosition ? entryY + riskHeight : entryY - riskHeight;
      const targetY = isLongPosition ? entryY - rewardHeight : entryY + rewardHeight;
      const stopTop = Math.min(entryY, stopY);
      const stopHeight = Math.abs(stopY - entryY);
      const targetTop = Math.min(entryY, targetY);
      const targetHeight = Math.abs(targetY - entryY);
      const targetFill = isSelected ? "rgba(72, 199, 142, 0.28)" : "rgba(38, 176, 118, 0.22)";
      const stopFill = isSelected ? "rgba(255, 111, 131, 0.24)" : "rgba(214, 74, 98, 0.18)";
      const entryPrice = drawing.points[0]?.price ?? 0;
      const stopPrice = drawing.points[1]?.price ?? entryPrice;
      const riskDistance = Math.max(selectedAsset.tickSize, Math.abs(entryPrice - stopPrice));
      const targetPrice = isLongPosition ? entryPrice + riskDistance * 2 : entryPrice - riskDistance * 2;
      const riskPct = entryPrice > 0 ? (riskDistance / entryPrice) * 100 : 0;
      const targetBadgeY = isLongPosition ? targetTop + 8 : targetTop + targetHeight - 8;
      const stopBadgeY = isLongPosition ? stopTop + stopHeight - 8 : stopTop + 8;

      return (
        <g key={drawing.id} className="chart-drawing-shape" data-tool={drawing.tool} {...groupProps}>
          <rect
            x={left}
            y={Math.min(targetTop, stopTop) - 20}
            width={Math.max(112, width)}
            height={16}
            rx={4}
            fill="rgba(8, 13, 20, 0.84)"
            stroke="rgba(255, 255, 255, 0.08)"
            opacity={opacity}
          />
          <rect
            x={left}
            y={targetTop}
            width={width}
            height={Math.max(1, targetHeight)}
            fill={targetFill}
            stroke="rgba(79, 214, 154, 0.92)"
            strokeWidth={isSelected ? 1.8 : 1.2}
            opacity={opacity}
          />
          <rect
            x={left}
            y={stopTop}
            width={width}
            height={Math.max(1, stopHeight)}
            fill={stopFill}
            stroke="rgba(255, 123, 145, 0.9)"
            strokeWidth={isSelected ? 1.8 : 1.2}
            opacity={opacity}
          />
          <line
            x1={left}
            y1={entryY}
            x2={left + width}
            y2={entryY}
            stroke={stroke}
            strokeWidth={isSelected ? 2.4 : 1.8}
            strokeDasharray="5 4"
            opacity={opacity}
          />
          <text
            x={left + 6}
            y={Math.min(targetTop, stopTop) - 9}
            fill={stroke}
            fontSize="9"
            fontFamily="IBM Plex Mono, SFMono-Regular, Menlo, Monaco, monospace"
            opacity={Math.max(0.78, opacity)}
          >
            {isLongPosition ? "LONG" : "SHORT"}  RR 2.00  RISK {riskPct.toFixed(2)}%
          </text>
          {renderDrawingBadge(
            left + 6,
            targetBadgeY,
            `TP ${formatPriceByTick(targetPrice, selectedAsset.tickSize)}`,
            "up"
          )}
          {renderDrawingBadge(
            left + 6,
            stopBadgeY,
            `SL ${formatPriceByTick(stopPrice, selectedAsset.tickSize)}`,
            "down"
          )}
          {renderDrawingBadge(
            left + width - 98,
            entryY - 8,
            `ENTRY ${formatPriceByTick(entryPrice, selectedAsset.tickSize)}`,
            "accent"
          )}
          {!isDraft ? (
            <rect
              x={left}
              y={Math.min(targetTop, stopTop)}
              width={width}
              height={Math.max(targetTop + targetHeight, stopTop + stopHeight) - Math.min(targetTop, stopTop)}
              fill="transparent"
            />
          ) : null}
          {renderDrawingHandles(drawing, [start, end])}
        </g>
      );
    }

    if (drawing.tool === "rectangle") {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);
      const label = getDrawingRangeLabel(
        drawing.points[0],
        drawing.points[1],
        selectedAsset.tickSize,
        selectedTimeframe
      );

      return (
        <g key={drawing.id} className="chart-drawing-shape" data-tool={drawing.tool} {...groupProps}>
          <rect
            x={x}
            y={y}
            width={Math.max(1, width)}
            height={Math.max(1, height)}
            fill={isSelected ? "rgba(246, 251, 255, 0.14)" : "rgba(158, 201, 255, 0.14)"}
            stroke={stroke}
            strokeWidth={isSelected ? 2.2 : 1.55}
            rx={7}
            opacity={opacity}
          />
          {renderDrawingBadge(x, y - 20, `ZONE  ${label}`, "accent")}
          {!isDraft ? (
            <rect
              x={x}
              y={y}
              width={Math.max(14, width)}
              height={Math.max(14, height)}
              fill="transparent"
            />
          ) : null}
          {renderDrawingHandles(drawing, [start, end])}
        </g>
      );
    }

    const lineEnd = drawing.tool === "ray" ? getRayScreenEndpoint(start, end) : end;
    const lineLabelPrefix =
      drawing.tool === "arrow"
        ? "ARROW"
        : drawing.tool === "ray"
          ? "RAY"
          : "TREND";
    const lineLabel = `${lineLabelPrefix}  ${formatSignedPriceDelta(
      lineMetrics.priceDelta,
      selectedAsset.tickSize
    )}  ${formatSignedPercent(lineMetrics.percentDelta)}`;
    const labelX = (start.x + lineEnd.x) / 2;
    const labelY = (start.y + lineEnd.y) / 2 - 18;

    return (
      <g key={drawing.id} className="chart-drawing-shape" data-tool={drawing.tool} {...groupProps}>
        <line
          x1={start.x}
          y1={start.y}
          x2={lineEnd.x}
          y2={lineEnd.y}
          stroke="rgba(158, 201, 255, 0.2)"
          strokeWidth={isSelected ? 7 : 5}
          strokeLinecap="round"
          opacity={opacity}
        />
        <line
          x1={start.x}
          y1={start.y}
          x2={lineEnd.x}
          y2={lineEnd.y}
          stroke={stroke}
          strokeWidth={isSelected ? 2.3 : 1.7}
          strokeLinecap="round"
          opacity={opacity}
        />
        {drawing.tool === "arrow" ? renderArrowHead(start, lineEnd, stroke, opacity) : null}
        <circle cx={start.x} cy={start.y} r={3.2} fill={stroke} opacity={opacity} />
        {drawing.tool !== "ray" ? <circle cx={lineEnd.x} cy={lineEnd.y} r={3.2} fill={stroke} opacity={opacity} /> : null}
        {renderDrawingBadge(
          labelX,
          labelY,
          lineLabel,
          lineMetrics.priceDelta >= 0 ? "up" : "down",
          "center"
        )}
        {!isDraft ? (
          <line
            x1={start.x}
            y1={start.y}
            x2={lineEnd.x}
            y2={lineEnd.y}
            stroke="transparent"
            strokeWidth={14}
            strokeLinecap="round"
          />
        ) : null}
        {renderDrawingHandles(drawing, [start, end])}
      </g>
    );
  };

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
              onClick={async () => {
                if (typeof Notification !== "undefined" && Notification.permission === "default") {
                  await requestRomanNotificationPermission();
                }

                await syncRomanNotificationDevice(
                  typeof Notification !== "undefined" && Notification.permission === "granted"
                );
                setNotificationsOpen((open) => !open);
              }}
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

      {isAdmin && hasYazanProfile && showYazanAccountMenu ? (
        <div
          ref={yazanAccountMenuRef}
          className="sync-account-menu"
          style={{
            left: `${yazanAccountMenuPosition.x}px`,
            top: `${yazanAccountMenuPosition.y}px`
          }}
        >
          <button
            type="button"
            className="sync-account-menu-btn"
            onClick={() => openYazanSyncDraft(yazanAccount ? "edit" : "add")}
          >
            {yazanAccount ? "Edit Connection" : "Add Connection"}
          </button>
          <button
            type="button"
            className="sync-account-menu-btn danger"
            onClick={removeYazanAccount}
            disabled={!yazanAccount}
          >
            Remove Connection
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

              const displayIndex = renderedSelectedCandles.indexOf(display);
              const previousDisplay =
                displayIndex > 0 ? renderedSelectedCandles[displayIndex - 1] : null;
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
            <div className="chart-drawing-toolbar" aria-label="Chart drawing tools">
              {chartDrawingToolGroups.map((group, groupIndex) => (
                <div key={group.id} className="chart-drawing-toolbar-section">
                  <span className="chart-drawing-toolbar-group-label">{group.label}</span>
                  <div className="chart-drawing-toolbar-group">
                    {group.tools.map((toolId) => {
                      const tool = chartDrawingTools.find((entry) => entry.tool === toolId);

                      if (!tool) {
                        return null;
                      }

                      return (
                        <button
                          key={tool.tool}
                          type="button"
                          className={`chart-drawing-tool-btn ${
                            activeDrawingTool === tool.tool ? "active" : ""
                          }`}
                          title={`${tool.label} (${tool.shortcut})`}
                          aria-label={`${tool.label} (${tool.shortcut})`}
                          aria-pressed={activeDrawingTool === tool.tool}
                          data-tool-label={tool.label}
                          data-tool-shortcut={tool.shortcut}
                          disabled={!canDrawOnChart && tool.tool !== "cursor"}
                          onClick={() => {
                            setActiveDrawingTool(tool.tool);
                            setDrawingDraft(null);

                            if (tool.tool === "cursor") {
                              drawingDragStateRef.current = null;
                            }
                          }}
                        >
                          {renderDrawingToolIcon(tool.tool)}
                        </button>
                      );
                    })}
                  </div>
                  {groupIndex < chartDrawingToolGroups.length - 1 ? (
                    <div className="chart-drawing-toolbar-divider" aria-hidden="true" />
                  ) : null}
                </div>
              ))}
              <div className="chart-drawing-toolbar-divider" aria-hidden="true" />
              <div className="chart-drawing-toolbar-section">
                <span className="chart-drawing-toolbar-group-label">Color</span>
                <div className="chart-drawing-color-grid">
                  {CHART_DRAWING_COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`chart-drawing-color-swatch ${
                        activeDrawingColorValue.toLowerCase() === color.toLowerCase() ? "active" : ""
                      }`}
                      style={{ "--drawing-swatch-color": color } as CSSProperties}
                      title={selectedDrawing ? `Set selected drawing color to ${color}` : `Set drawing color to ${color}`}
                      aria-label={selectedDrawing ? `Set selected drawing color to ${color}` : `Set drawing color to ${color}`}
                      onClick={() => applyDrawingColor(color)}
                    />
                  ))}
                </div>
                <label className="chart-drawing-custom-color">
                  <input
                    type="color"
                    value={activeDrawingColorValue}
                    aria-label={selectedDrawing ? "Selected drawing color" : "Drawing color"}
                    onChange={(event) => applyDrawingColor(event.target.value)}
                  />
                </label>
              </div>
              <div className="chart-drawing-toolbar-divider" aria-hidden="true" />
              <div className="chart-drawing-toolbar-group">
                <button
                  type="button"
                  className="chart-drawing-tool-btn chart-drawing-tool-btn-danger"
                  title="Delete selected drawing (Delete)"
                  aria-label="Delete selected drawing"
                  disabled={!selectedDrawingId}
                  onClick={deleteSelectedDrawing}
                >
                  {renderToolbarActionIcon("delete")}
                </button>
                <button
                  type="button"
                  className="chart-drawing-tool-btn"
                  title="Clear all drawings for this chart"
                  aria-label="Clear all drawings"
                  disabled={currentChartDrawings.length === 0}
                  onClick={clearCurrentDrawings}
                >
                  {renderToolbarActionIcon("clear")}
                </button>
              </div>
            </div>
            <div ref={chartContainerRef} className="tv-chart" aria-label="trading chart" />
            <svg
              ref={chartDrawingOverlayRef}
              className={`chart-drawing-overlay ${chartDrawingLayerInteractive ? "interactive" : ""}`}
              width={chartViewportSize.width}
              height={chartViewportSize.height}
              viewBox={`0 0 ${Math.max(1, chartViewportSize.width)} ${Math.max(1, chartViewportSize.height)}`}
              onPointerDown={chartDrawingLayerInteractive ? handleChartDrawingPointerDown : undefined}
              onPointerMove={chartDrawingLayerInteractive ? handleChartDrawingPointerMove : undefined}
              onPointerUp={stopChartDrawingDrag}
              onPointerLeave={stopChartDrawingDrag}
            >
              {chartDrawingLayerInteractive ? (
                <rect
                  className="chart-drawing-overlay-hitarea"
                  x={0}
                  y={0}
                  width={chartViewportSize.width}
                  height={chartViewportSize.height}
                />
              ) : null}
              {chartViewportSize.width > 0 && chartViewportSize.height > 0
                ? chartDrawingsForRender.map((drawing) => renderChartDrawing(drawing))
                : null}
            </svg>
            <div ref={countdownOverlayRef} className="candle-countdown-overlay" />
            <div className="chart-overlay-stack">
              <button
                type="button"
                className={`quote-overlay-card quote-overlay-toggle${
                  quoteOrderBookExpanded ? " expanded" : ""
                }`}
                aria-expanded={quoteOrderBookExpanded}
                aria-controls="chart-order-book-overlay"
                aria-label={quoteOrderBookExpanded ? "Hide order book" : "Show order book"}
                onClick={() => {
                  setQuoteOrderBookExpanded((current) => !current);
                }}
              >
                <div className="quote-overlay-head">
                  <strong>Live Quote</strong>
                  <span>{quoteOverlaySourceLabel}</span>
                </div>
                {quoteSnapshot ? (
                  <div className="quote-overlay-grid">
                    <div className="quote-overlay-item">
                      <span>Ask</span>
                      <strong className="down">
                        {formatPriceByTick(quoteSnapshot.bestAsk, selectedAsset.tickSize)}
                      </strong>
                    </div>
                    <div className="quote-overlay-item">
                      <span>Spread</span>
                      <strong className="neutral">
                        {formatPriceByTick(quoteSnapshot.spread, selectedAsset.tickSize)}
                      </strong>
                    </div>
                    <div className="quote-overlay-item">
                      <span>Bid</span>
                      <strong className="up">
                        {formatPriceByTick(quoteSnapshot.bestBid, selectedAsset.tickSize)}
                      </strong>
                    </div>
                    <div className="quote-overlay-item">
                      <span>Ask Depth</span>
                      <strong className="down">{formatDepthSize(quoteSnapshot.askTotal)}</strong>
                    </div>
                    <div className="quote-overlay-item">
                      <span>Imbalance</span>
                      <strong className={quoteSnapshot.imbalance >= 0 ? "up" : "down"}>
                        {quoteSnapshot.imbalance >= 0 ? "+" : ""}
                        {quoteSnapshot.imbalance.toFixed(1)}%
                      </strong>
                    </div>
                    <div className="quote-overlay-item">
                      <span>Bid Depth</span>
                      <strong className="up">{formatDepthSize(quoteSnapshot.bidTotal)}</strong>
                    </div>
                  </div>
                ) : (
                  <p className="quote-overlay-empty">
                    {liveDepthMessage ??
                      marketError ??
                      (isTopOfBookSchema(liveQuoteSchema ?? liveDepthSchema)
                        ? "Waiting for real Databento top-of-book."
                        : "Waiting for real Databento depth.")}
                  </p>
                )}
              </button>
              {quoteOrderBookExpanded ? (
                <div id="chart-order-book-overlay" className="order-book-card">
                  <div className="order-book-head">
                    <strong>Order Book</strong>
                    <span>{orderBookSourceLabel}</span>
                  </div>
                  {orderBookSnapshot ? (
                    <>
                      <div className="order-book-labels">
                        <span>Bid Size</span>
                        <span>Bid</span>
                        <span>Ask</span>
                        <span>Ask Size</span>
                      </div>
                      <div className="order-book-rows">
                        {visibleOrderBookLevels.map((level) => (
                          <div
                            key={`${selectedAsset.symbol}-${level.bidPrice}-${level.askPrice}`}
                            className="order-book-row"
                          >
                            <span className="order-book-depth-cell bid">
                              <span
                                className="order-book-depth-fill bid"
                                style={{ width: `${level.bidFillPct}%` }}
                              />
                              <span className="order-book-depth-value">
                                {formatDepthSize(level.bidSize)}
                              </span>
                            </span>
                            <span className="order-book-price bid">
                              {formatPriceByTick(level.bidPrice, selectedAsset.tickSize)}
                            </span>
                            <span className="order-book-price ask">
                              {formatPriceByTick(level.askPrice, selectedAsset.tickSize)}
                            </span>
                            <span className="order-book-depth-cell ask">
                              <span
                                className="order-book-depth-fill ask"
                                style={{ width: `${level.askFillPct}%` }}
                              />
                              <span className="order-book-depth-value">
                                {formatDepthSize(level.askSize)}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="order-book-empty">
                      {liveDepthMessage ??
                        marketError ??
                        (isTopOfBookSchema(liveDepthSchema)
                          ? "Waiting for real Databento top-of-book."
                          : "Waiting for real Databento depth.")}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            {renderedSelectedCandles.length === 0 ? (
              <div
                className={`chart-empty-state${marketStatus === "loading" ? " loading" : ""}`}
                role="status"
                aria-live="polite"
              >
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
                disabled={renderedSelectedCandles.length === 0}
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
                className={`rail-btn ${activePanelTab === tab.id ? "active" : ""}${
                  tab.compactLabel ? " rail-btn-compact-label" : ""
                }`}
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
                    <div className="active-tab-heading">
                      <h2>Active Trades</h2>
                      <span className="active-count-chip">
                        {activeTrades.length.toLocaleString("en-US")}
                      </span>
                    </div>
                    <div className="panel-head-actions">
                      <button
                        type="button"
                        className={`panel-action-btn panel-mode-btn ${
                          chartSimulationEnabled ? "on" : "off"
                        }`}
                        onClick={() => setChartSimulationEnabled((current) => !current)}
                      >
                        {simulationToggleLabel}
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

                  {activeTrades.length > 0 && activeTrade ? (
                    <div className="active-trade-shell">
                      <div className="active-trade-list" role="list">
                        {activeTrades.map((trade) => (
                          <button
                            key={trade.id}
                            type="button"
                            className={`active-trade-row ${
                              activeTrade.id === trade.id ? "selected" : ""
                            }`}
                            onClick={() => setSelectedActiveTradeId(trade.id)}
                            aria-pressed={activeTrade.id === trade.id}
                          >
                            <span className="active-trade-row-main">
                              <span className="active-trade-row-head">
                                <span className="active-trade-symbol-wrap">
                                  <strong className="active-trade-symbol">{trade.symbol}</strong>
                                  <span
                                    className={`active-side ${
                                      trade.side === "Long" ? "up" : "down"
                                    }`}
                                  >
                                    {trade.side === "Long" ? "Buy" : "Sell"}
                                  </span>
                                </span>
                              <span
                                  className="active-live-tag"
                                >
                                  Open
                                </span>
                              </span>
                              <span className="active-trade-row-meta">
                                <span>{trade.time}</span>
                                <span>Entry {formatPrice(trade.entryPrice)}</span>
                              </span>
                            </span>
                            <span className="active-trade-values">
                              <strong className={trade.pnlUsd >= 0 ? "up" : "down"}>
                                {formatSignedUsd(trade.pnlUsd)}
                              </strong>
                              <span className={trade.pnlPct >= 0 ? "up" : "down"}>
                                {trade.pnlPct >= 0 ? "+" : ""}
                                {trade.pnlPct.toFixed(2)}%
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className="active-card active-detail-card">
                        <div className="active-card-top">
                          <div className="active-card-symbol">
                            <span
                              className={`active-side ${
                                activeTrade.side === "Long" ? "up" : "down"
                              }`}
                            >
                              {activeTrade.side === "Long" ? "Buy" : "Sell"}
                            </span>
                            <h3>{activeTrade.symbol}</h3>
                          </div>
                          <span className="active-live-tag">Focused</span>
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
                            <span>Mark</span>
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
                            <strong>
                              {activeTradeRiskReward ? `1:${activeTradeRiskReward.toFixed(2)}` : "--"}
                            </strong>
                          </div>
                          <div className="active-metric">
                            <span>Opened</span>
                            <strong>{activeTrade.entryAt}</strong>
                          </div>
                          <div className="active-metric">
                            <span>Status</span>
                            <strong>Open</strong>
                          </div>
                          <div className="active-metric">
                            <span>Side</span>
                            <strong>{activeTrade.side === "Long" ? "Buy" : "Sell"}</strong>
                          </div>
                          <div className="active-metric">
                            <span>Duration</span>
                            <strong>{activeTradeDuration ?? "--"}</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="ai-placeholder">
                      <p>
                        {chartSimulationEnabled
                          ? selectedTradeOwnerLabel
                            ? "No open trades are available for the current model or connected account."
                            : "Add or select a model/account to populate the active blotter."
                          : "Trade simulation is turned off."}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}

              {activePanelTab === "assets" ? (
                <div className="tab-view">
                  <div className="watchlist-head with-action">
                    <div>
                      <h2>Assets</h2>
                      <p>
                        Drag rows to rearrange your symbols. Search hidden contracts to add them
                        back.
                      </p>
                    </div>
                    <div className="panel-head-actions asset-search-stack">
                      <span className="asset-search-count">
                        {orderedAssets.length} of {futuresAssets.length} symbols added
                      </span>
                      <input
                        type="search"
                        className="account-input asset-search-input"
                        placeholder={
                          hiddenAssets.length === 0
                            ? "All catalog symbols are already added"
                            : "Search hidden symbols to add"
                        }
                        value={assetSearchQuery}
                        onChange={(event) => setAssetSearchQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") {
                            return;
                          }

                          const firstMatch = filteredHiddenAssets[0];

                          if (!firstMatch) {
                            return;
                          }

                          event.preventDefault();
                          addAssetSymbol(firstMatch.symbol);
                        }}
                        disabled={hiddenAssets.length === 0}
                      />
                      {hiddenAssets.length === 0 ? (
                        <p className="asset-search-empty">All catalog symbols are already active.</p>
                      ) : filteredHiddenAssets.length > 0 ? (
                        <ul className="asset-search-results">
                          {filteredHiddenAssets.map((asset) => (
                            <li key={asset.symbol}>
                              <button
                                type="button"
                                className="asset-search-result"
                                onClick={() => addAssetSymbol(asset.symbol)}
                              >
                                <span className="asset-search-symbol">{asset.symbol}</span>
                                <span className="asset-search-meta">
                                  {asset.name} - {asset.category}
                                </span>
                                <span className="asset-search-action">Add</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="asset-search-empty">No hidden symbols match that search.</p>
                      )}
                    </div>
                  </div>

                  <ul className="watchlist-body">
                    <li className="watchlist-labels" aria-hidden>
                      <span>Symbol</span>
                      <span>Last</span>
                      <span>Chg%</span>
                    </li>
                    {watchlistRows.map((row) => (
                      <li
                        key={row.symbol}
                        className={`watchlist-item asset-managed-item${
                          assetDropTarget?.symbol === row.symbol
                            ? assetDropTarget.placement === "before"
                              ? " drop-before"
                              : " drop-after"
                            : ""
                        }${
                          draggedAssetSymbol === row.symbol ? " dragging" : ""
                        }`}
                        onDragOver={(event) => handleAssetDragOver(event, row.symbol)}
                        onDrop={(event) => handleAssetDrop(event, row.symbol)}
                      >
                        <button
                          type="button"
                          className={`watchlist-row asset-managed-row ${
                            row.symbol === selectedSymbol ? "selected" : ""
                          }`}
                          draggable={!isMobileWorkspace}
                          onClick={() => {
                            setSelectedSymbol(row.symbol);
                            setSelectedHistoryId(null);
                            setShowAllTradesOnChart(false);
                            focusTradeIdRef.current = null;
                          }}
                          onDragStart={(event) => handleAssetDragStart(event, row.symbol)}
                          onDragEnd={handleAssetDragEnd}
                        >
                          <span className="symbol-col">
                            <span className="symbol-line">{row.symbol}</span>
                            <small>
                              {row.name} - {row.category}
                            </small>
                          </span>

                          <span
                            className={`num-col ${
                              row.change === null
                                ? "neutral"
                                : row.change > 0
                                  ? "up"
                                  : row.change < 0
                                    ? "down"
                                    : "neutral"
                            }`}
                          >
                            {row.lastPrice === null ? "--" : formatPrice(row.lastPrice)}
                          </span>
                          <span
                            className={`num-col ${
                              row.change === null
                                ? "neutral"
                                : row.change > 0
                                  ? "up"
                                  : row.change < 0
                                    ? "down"
                                    : "neutral"
                            }`}
                          >
                            {row.change === null
                              ? "--"
                              : `${row.change >= 0 ? "+" : ""}${row.change.toFixed(2)}`}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="asset-row-remove"
                          onClick={() => removeAssetSymbol(row.symbol)}
                          disabled={orderedAssets.length <= 1}
                          aria-label={`Remove ${row.symbol}`}
                          title={
                            orderedAssets.length <= 1
                              ? "At least one symbol must stay active."
                              : `Remove ${row.symbol}`
                          }
                        >
                          Remove
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
                          <h2>{yazanSyncDraftMode === "add" ? "Add Connection" : "Edit Connection"}</h2>
                          <p>Connect Tradovate or Trade Syncer to this workspace.</p>
                        </div>
                        <button
                          type="button"
                          className="panel-action-btn"
                          onClick={closeYazanSyncDraft}
                          disabled={yazanSyncSaving}
                        >
                          Back
                        </button>
                      </div>
                      <form
                        className="account-editor-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveYazanSyncDraft();
                        }}
                      >
                        <div className="sync-provider-switch" role="tablist" aria-label="Sync provider">
                          <button
                            type="button"
                            className={`sync-provider-btn ${
                              yazanSyncDraft.provider === "tradovate" ? "active" : ""
                            }`}
                            onClick={() => updateYazanSyncProvider("tradovate")}
                            disabled={yazanSyncSaving}
                          >
                            Tradovate
                          </button>
                          <button
                            type="button"
                            className={`sync-provider-btn ${
                              yazanSyncDraft.provider === "tradesyncer" ? "active" : ""
                            }`}
                            onClick={() => updateYazanSyncProvider("tradesyncer")}
                            disabled={yazanSyncSaving}
                          >
                            Trade Syncer
                          </button>
                        </div>
                        {yazanSyncError ? (
                          <div className="sync-note-card sync-status-card sync-status-card-error">
                            <strong>Connection failed</strong>
                            <p>{yazanSyncError}</p>
                          </div>
                        ) : null}
                        {yazanSyncSuccess ? (
                          <div className="sync-note-card sync-status-card sync-status-card-success">
                            <strong>Connection saved</strong>
                            <p>{yazanSyncSuccess}</p>
                          </div>
                        ) : null}
                        <div className="sync-note-card sync-storage-card">
                          <strong>Storage</strong>
                          <p>
                            Verified broker connections are stored in this browser so the admin panel can
                            reopen them after refresh.
                          </p>
                        </div>
                        <label className="account-editor-row">
                          <span>Connection Label</span>
                          <input
                            className={`account-input ${
                              yazanSyncFieldErrors.connectionLabel ? "input-error" : ""
                            }`}
                            value={yazanSyncDraft.connectionLabel}
                            onChange={(event) => {
                              updateYazanSyncDraft("connectionLabel", event.target.value);
                            }}
                            placeholder={
                              yazanSyncDraft.provider === "tradovate"
                                ? "Yazan Tradovate"
                                : "Yazan Trade Syncer"
                            }
                            disabled={yazanSyncSaving}
                          />
                          {yazanSyncFieldErrors.connectionLabel ? (
                            <small className="sync-field-error">{yazanSyncFieldErrors.connectionLabel}</small>
                          ) : null}
                        </label>
                        <label className="account-editor-row">
                          <span>Account Name</span>
                          <input
                            className="account-input"
                            value={yazanSyncDraft.accountLabel}
                            onChange={(event) => {
                              updateYazanSyncDraft("accountLabel", event.target.value);
                            }}
                            placeholder="Roman Capital Primary"
                            disabled={yazanSyncSaving}
                          />
                        </label>
                        {yazanSyncDraft.provider === "tradovate" ? (
                          <>
                            <div className="account-editor-row">
                              <span>Environment</span>
                              <div className="sync-mode-row">
                                <button
                                  type="button"
                                  className={`sync-mode-btn ${
                                    yazanSyncDraft.environment === "live" ? "active" : ""
                                  }`}
                                  onClick={() => {
                                    setYazanSyncDraft((prev) => ({ ...prev, environment: "live" }));
                                  }}
                                  disabled={yazanSyncSaving}
                                >
                                  Live
                                </button>
                                <button
                                  type="button"
                                  className={`sync-mode-btn ${
                                    yazanSyncDraft.environment === "demo" ? "active" : ""
                                  }`}
                                  onClick={() => {
                                    setYazanSyncDraft((prev) => ({ ...prev, environment: "demo" }));
                                  }}
                                  disabled={yazanSyncSaving}
                                >
                                  Demo
                                </button>
                              </div>
                              <small className="sync-field-hint">
                                Tradovate API access is configured separately for live and simulation accounts.
                              </small>
                            </div>
                            <div className="account-editor-row">
                              <span>Access Mode</span>
                              <div className="sync-mode-row">
                                <button
                                  type="button"
                                  className={`sync-mode-btn ${
                                    yazanSyncDraft.accessMode === "api_key" ? "active" : ""
                                  }`}
                                  onClick={() => {
                                    setYazanSyncDraft((prev) => ({ ...prev, accessMode: "api_key" }));
                                  }}
                                  disabled={yazanSyncSaving}
                                >
                                  API Key
                                </button>
                                <button
                                  type="button"
                                  className={`sync-mode-btn ${
                                    yazanSyncDraft.accessMode === "api_key_password" ? "active" : ""
                                  }`}
                                  onClick={() => {
                                    setYazanSyncDraft((prev) => ({
                                      ...prev,
                                      accessMode: "api_key_password"
                                    }));
                                  }}
                                  disabled={yazanSyncSaving}
                                >
                                  API Key + Dedicated Password
                                </button>
                              </div>
                              <small className="sync-field-hint">
                                Dedicated-password mode is the safer fit when the key is used outside Tradovate.
                              </small>
                            </div>
                            <label className="account-editor-row">
                              <span>Username</span>
                              <input
                                className={`account-input ${
                                  yazanSyncFieldErrors.username ? "input-error" : ""
                                }`}
                                value={yazanSyncDraft.username}
                                onChange={(event) => {
                                  updateYazanSyncDraft("username", event.target.value);
                                }}
                                placeholder="yourname@tradovate"
                                disabled={yazanSyncSaving}
                              />
                              {yazanSyncFieldErrors.username ? (
                                <small className="sync-field-error">{yazanSyncFieldErrors.username}</small>
                              ) : null}
                            </label>
                            <label className="account-editor-row">
                              <span>API / Security Key</span>
                              <input
                                className={`account-input ${
                                  yazanSyncFieldErrors.apiKey ? "input-error" : ""
                                }`}
                                type="password"
                                value={yazanSyncDraft.apiKey}
                                onChange={(event) => {
                                  updateYazanSyncDraft("apiKey", event.target.value);
                                }}
                                placeholder="Tradovate API key"
                                disabled={yazanSyncSaving}
                              />
                              {yazanSyncFieldErrors.apiKey ? (
                                <small className="sync-field-error">{yazanSyncFieldErrors.apiKey}</small>
                              ) : null}
                            </label>
                            {yazanSyncDraft.accessMode === "api_key_password" ? (
                              <label className="account-editor-row">
                                <span>Dedicated Password</span>
                                <input
                                  className={`account-input ${
                                    yazanSyncFieldErrors.apiSecret ? "input-error" : ""
                                  }`}
                                  type="password"
                                  value={yazanSyncDraft.apiSecret}
                                  onChange={(event) => {
                                    updateYazanSyncDraft("apiSecret", event.target.value);
                                  }}
                                  placeholder="Dedicated API password"
                                  disabled={yazanSyncSaving}
                                />
                                {yazanSyncFieldErrors.apiSecret ? (
                                  <small className="sync-field-error">{yazanSyncFieldErrors.apiSecret}</small>
                                ) : null}
                              </label>
                            ) : null}
                            <label className="account-editor-row">
                              <span>App ID</span>
                              <input
                                className={`account-input ${
                                  yazanSyncFieldErrors.appId ? "input-error" : ""
                                }`}
                                value={yazanSyncDraft.appId}
                                onChange={(event) => {
                                  updateYazanSyncDraft("appId", event.target.value);
                                }}
                                placeholder="roman-capital-terminal"
                                disabled={yazanSyncSaving}
                              />
                              {yazanSyncFieldErrors.appId ? (
                                <small className="sync-field-error">{yazanSyncFieldErrors.appId}</small>
                              ) : null}
                            </label>
                            <label className="account-editor-row">
                              <span>App Version</span>
                              <input
                                className="account-input"
                                value={yazanSyncDraft.appVersion}
                                onChange={(event) => {
                                  updateYazanSyncDraft("appVersion", event.target.value);
                                }}
                                placeholder="1.0.0"
                                disabled={yazanSyncSaving}
                              />
                            </label>
                            <label className="account-editor-row">
                              <span>Device ID</span>
                              <input
                                className="account-input"
                                value={yazanSyncDraft.deviceId}
                                onChange={(event) => {
                                  updateYazanSyncDraft("deviceId", event.target.value);
                                }}
                                placeholder="optional-device-id"
                                disabled={yazanSyncSaving}
                              />
                            </label>
                            <label className="account-editor-row">
                              <span>Account Number</span>
                              <input
                                className={`account-input ${
                                  yazanSyncFieldErrors.accountNumber ? "input-error" : ""
                                }`}
                                value={yazanSyncDraft.accountNumber}
                                onChange={(event) => {
                                  updateYazanSyncDraft("accountNumber", event.target.value);
                                }}
                                placeholder="Optional: exact Tradovate account ID"
                                disabled={yazanSyncSaving}
                              />
                              {yazanSyncFieldErrors.accountNumber ? (
                                <small className="sync-field-error">{yazanSyncFieldErrors.accountNumber}</small>
                              ) : null}
                            </label>
                            <div className="sync-note-card">
                              <strong>Tradovate setup notes</strong>
                              <p>
                                Official Tradovate docs require API Access to be enabled in Application Settings and
                                the key permissions set for the actions you need.
                              </p>
                              <ul className="sync-note-list">
                                <li>Live API usage requires Tradovate&apos;s API add-on and account prerequisites.</li>
                                <li>Market-data permission is separate from order placement and modification.</li>
                                <li>OAuth exists for public apps, but this local flow stages API-key setups.</li>
                              </ul>
                              <div className="sync-doc-links">
                                <a href={TRADOVATE_API_ACCESS_URL} target="_blank" rel="noreferrer">
                                  API Access
                                </a>
                                <a href={TRADOVATE_AUTH_OPTIONS_URL} target="_blank" rel="noreferrer">
                                  Auth Options
                                </a>
                                <a href={TRADOVATE_MARKET_DATA_URL} target="_blank" rel="noreferrer">
                                  Market Data
                                </a>
                                <a href={TRADOVATE_PERMISSIONS_URL} target="_blank" rel="noreferrer">
                                  Permissions
                                </a>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <label className="account-editor-row">
                              <span>Account Number</span>
                              <input
                                className={`account-input ${
                                  yazanSyncFieldErrors.accountNumber ? "input-error" : ""
                                }`}
                                value={yazanSyncDraft.accountNumber}
                                onChange={(event) => {
                                  updateYazanSyncDraft("accountNumber", event.target.value);
                                }}
                                placeholder="MT4 / MT5 account number"
                                disabled={yazanSyncSaving}
                              />
                              {yazanSyncFieldErrors.accountNumber ? (
                                <small className="sync-field-error">{yazanSyncFieldErrors.accountNumber}</small>
                              ) : null}
                            </label>
                            <label className="account-editor-row">
                              <span>Account Password</span>
                              <input
                                className={`account-input ${
                                  yazanSyncFieldErrors.accountPassword ? "input-error" : ""
                                }`}
                                type="password"
                                value={yazanSyncDraft.accountPassword}
                                onChange={(event) => {
                                  updateYazanSyncDraft("accountPassword", event.target.value);
                                }}
                                placeholder="MetaTrader account password"
                                disabled={yazanSyncSaving}
                              />
                              {yazanSyncFieldErrors.accountPassword ? (
                                <small className="sync-field-error">{yazanSyncFieldErrors.accountPassword}</small>
                              ) : null}
                            </label>
                            <div className="account-editor-row">
                              <span>Application</span>
                              <div className="sync-mode-row">
                                <button
                                  type="button"
                                  className={`sync-mode-btn ${
                                    yazanSyncDraft.application === "mt4" ? "active" : ""
                                  }`}
                                  onClick={() => {
                                    setYazanSyncDraft((prev) => ({ ...prev, application: "mt4" }));
                                  }}
                                  disabled={yazanSyncSaving}
                                >
                                  MT4
                                </button>
                                <button
                                  type="button"
                                  className={`sync-mode-btn ${
                                    yazanSyncDraft.application === "mt5" ? "active" : ""
                                  }`}
                                  onClick={() => {
                                    setYazanSyncDraft((prev) => ({ ...prev, application: "mt5" }));
                                  }}
                                  disabled={yazanSyncSaving}
                                >
                                  MT5
                                </button>
                              </div>
                            </div>
                            <label className="account-editor-row">
                              <span>Broker Server ID</span>
                              <input
                                className={`account-input ${
                                  yazanSyncFieldErrors.brokerServerId ? "input-error" : ""
                                }`}
                                value={yazanSyncDraft.brokerServerId}
                                onChange={(event) => {
                                  updateYazanSyncDraft("brokerServerId", event.target.value);
                                }}
                                placeholder="Tradesync broker_server_id"
                                disabled={yazanSyncSaving}
                              />
                              {yazanSyncFieldErrors.brokerServerId ? (
                                <small className="sync-field-error">{yazanSyncFieldErrors.brokerServerId}</small>
                              ) : null}
                            </label>
                            <div className="account-editor-row">
                              <span>Account Type</span>
                              <div className="sync-mode-row">
                                <button
                                  type="button"
                                  className={`sync-mode-btn ${
                                    yazanSyncDraft.accountType === "readonly" ? "active" : ""
                                  }`}
                                  onClick={() => {
                                    setYazanSyncDraft((prev) => ({ ...prev, accountType: "readonly" }));
                                  }}
                                  disabled={yazanSyncSaving}
                                >
                                  Read-only
                                </button>
                                <button
                                  type="button"
                                  className={`sync-mode-btn ${
                                    yazanSyncDraft.accountType === "full" ? "active" : ""
                                  }`}
                                  onClick={() => {
                                    setYazanSyncDraft((prev) => ({ ...prev, accountType: "full" }));
                                  }}
                                  disabled={yazanSyncSaving}
                                >
                                  Full
                                </button>
                              </div>
                            </div>
                            <label className="account-editor-row">
                              <span>API Key</span>
                              <input
                                className={`account-input ${
                                  yazanSyncFieldErrors.apiKey ? "input-error" : ""
                                }`}
                                type="password"
                                value={yazanSyncDraft.apiKey}
                                onChange={(event) => {
                                  updateYazanSyncDraft("apiKey", event.target.value);
                                }}
                                placeholder="Trade Syncer API key"
                                disabled={yazanSyncSaving}
                              />
                              {yazanSyncFieldErrors.apiKey ? (
                                <small className="sync-field-error">{yazanSyncFieldErrors.apiKey}</small>
                              ) : null}
                            </label>
                            <label className="account-editor-row">
                              <span>API Secret</span>
                              <input
                                className={`account-input ${
                                  yazanSyncFieldErrors.apiSecret ? "input-error" : ""
                                }`}
                                type="password"
                                value={yazanSyncDraft.apiSecret}
                                onChange={(event) => {
                                  updateYazanSyncDraft("apiSecret", event.target.value);
                                }}
                                placeholder="Trade Syncer API secret"
                                disabled={yazanSyncSaving}
                              />
                              {yazanSyncFieldErrors.apiSecret ? (
                                <small className="sync-field-error">{yazanSyncFieldErrors.apiSecret}</small>
                              ) : null}
                            </label>
                            <label className="account-editor-row">
                              <span>Webhook URL</span>
                              <input
                                className={`account-input ${
                                  yazanSyncFieldErrors.webhookUrl ? "input-error" : ""
                                }`}
                                value={yazanSyncDraft.webhookUrl}
                                onChange={(event) => {
                                  updateYazanSyncDraft("webhookUrl", event.target.value);
                                }}
                                placeholder="Leave blank to use this app's built-in webhook"
                                disabled={yazanSyncSaving}
                              />
                              {yazanSyncFieldErrors.webhookUrl ? (
                                <small className="sync-field-error">{yazanSyncFieldErrors.webhookUrl}</small>
                              ) : null}
                            </label>
                            <div className="account-editor-row">
                              <span>Webhook Auth</span>
                              <div className="sync-mode-row compact">
                                <button
                                  type="button"
                                  className={`sync-mode-btn ${
                                    yazanSyncDraft.webhookAuthMode === "none" ? "active" : ""
                                  }`}
                                  onClick={() => {
                                    setYazanSyncDraft((prev) => ({ ...prev, webhookAuthMode: "none" }));
                                  }}
                                  disabled={yazanSyncSaving}
                                >
                                  None
                                </button>
                                <button
                                  type="button"
                                  className={`sync-mode-btn ${
                                    yazanSyncDraft.webhookAuthMode === "basic_auth" ? "active" : ""
                                  }`}
                                  onClick={() => {
                                    setYazanSyncDraft((prev) => ({
                                      ...prev,
                                      webhookAuthMode: "basic_auth"
                                    }));
                                  }}
                                  disabled={yazanSyncSaving}
                                >
                                  Basic
                                </button>
                                <button
                                  type="button"
                                  className={`sync-mode-btn ${
                                    yazanSyncDraft.webhookAuthMode === "bearer_token" ? "active" : ""
                                  }`}
                                  onClick={() => {
                                    setYazanSyncDraft((prev) => ({
                                      ...prev,
                                      webhookAuthMode: "bearer_token"
                                    }));
                                  }}
                                  disabled={yazanSyncSaving}
                                >
                                  Bearer
                                </button>
                                <button
                                  type="button"
                                  className={`sync-mode-btn ${
                                    yazanSyncDraft.webhookAuthMode === "api_key" ? "active" : ""
                                  }`}
                                  onClick={() => {
                                    setYazanSyncDraft((prev) => ({ ...prev, webhookAuthMode: "api_key" }));
                                  }}
                                  disabled={yazanSyncSaving}
                                >
                                  API Key
                                </button>
                              </div>
                              {yazanSyncFieldErrors.webhookAuthMode ? (
                                <small className="sync-field-error">{yazanSyncFieldErrors.webhookAuthMode}</small>
                              ) : null}
                            </div>
                            {yazanSyncDraft.webhookAuthMode === "basic_auth" ? (
                              <>
                                <label className="account-editor-row">
                                  <span>Webhook Username</span>
                                  <input
                                    className={`account-input ${
                                      yazanSyncFieldErrors.webhookUsername ? "input-error" : ""
                                    }`}
                                    value={yazanSyncDraft.webhookUsername}
                                    onChange={(event) => {
                                      updateYazanSyncDraft("webhookUsername", event.target.value);
                                    }}
                                    placeholder="Webhook username"
                                    disabled={yazanSyncSaving}
                                  />
                                  {yazanSyncFieldErrors.webhookUsername ? (
                                    <small className="sync-field-error">
                                      {yazanSyncFieldErrors.webhookUsername}
                                    </small>
                                  ) : null}
                                </label>
                                <label className="account-editor-row">
                                  <span>Webhook Password</span>
                                  <input
                                    className={`account-input ${
                                      yazanSyncFieldErrors.webhookPassword ? "input-error" : ""
                                    }`}
                                    type="password"
                                    value={yazanSyncDraft.webhookPassword}
                                    onChange={(event) => {
                                      updateYazanSyncDraft("webhookPassword", event.target.value);
                                    }}
                                    placeholder="Webhook password"
                                    disabled={yazanSyncSaving}
                                  />
                                  {yazanSyncFieldErrors.webhookPassword ? (
                                    <small className="sync-field-error">
                                      {yazanSyncFieldErrors.webhookPassword}
                                    </small>
                                  ) : null}
                                </label>
                              </>
                            ) : null}
                            {yazanSyncDraft.webhookAuthMode === "bearer_token" ? (
                              <label className="account-editor-row">
                                <span>Webhook Token</span>
                                <input
                                  className={`account-input ${
                                    yazanSyncFieldErrors.webhookToken ? "input-error" : ""
                                  }`}
                                  type="password"
                                  value={yazanSyncDraft.webhookToken}
                                  onChange={(event) => {
                                    updateYazanSyncDraft("webhookToken", event.target.value);
                                  }}
                                  placeholder="Webhook bearer token"
                                  disabled={yazanSyncSaving}
                                />
                                {yazanSyncFieldErrors.webhookToken ? (
                                  <small className="sync-field-error">
                                    {yazanSyncFieldErrors.webhookToken}
                                  </small>
                                ) : null}
                              </label>
                            ) : null}
                            {yazanSyncDraft.webhookAuthMode === "api_key" ? (
                              <>
                                <label className="account-editor-row">
                                  <span>Webhook Header Key</span>
                                  <input
                                    className={`account-input ${
                                      yazanSyncFieldErrors.webhookHeaderKey ? "input-error" : ""
                                    }`}
                                    value={yazanSyncDraft.webhookHeaderKey}
                                    onChange={(event) => {
                                      updateYazanSyncDraft("webhookHeaderKey", event.target.value);
                                    }}
                                    placeholder="x-api-key"
                                    disabled={yazanSyncSaving}
                                  />
                                  {yazanSyncFieldErrors.webhookHeaderKey ? (
                                    <small className="sync-field-error">
                                      {yazanSyncFieldErrors.webhookHeaderKey}
                                    </small>
                                  ) : null}
                                </label>
                                <label className="account-editor-row">
                                  <span>Webhook Header Value</span>
                                  <input
                                    className={`account-input ${
                                      yazanSyncFieldErrors.webhookHeaderValue ? "input-error" : ""
                                    }`}
                                    type="password"
                                    value={yazanSyncDraft.webhookHeaderValue}
                                    onChange={(event) => {
                                      updateYazanSyncDraft("webhookHeaderValue", event.target.value);
                                    }}
                                    placeholder="your-webhook-key"
                                    disabled={yazanSyncSaving}
                                  />
                                  {yazanSyncFieldErrors.webhookHeaderValue ? (
                                    <small className="sync-field-error">
                                      {yazanSyncFieldErrors.webhookHeaderValue}
                                    </small>
                                  ) : null}
                                </label>
                              </>
                            ) : null}
                            <div className="sync-note-card">
                              <strong>Trade Syncer setup notes</strong>
                              <p>
                                The official Tradesync developer docs are focused on MT4 and MT5 account onboarding,
                                broker server IDs, and API key/secret authentication.
                              </p>
                              <ul className="sync-note-list">
                                <li>API requests use Basic auth with your API key and secret.</li>
                                <li>Create-account requests require MT4 or MT5, account number, password, and broker server ID.</li>
                                <li>Webhook authorization can be none, basic, bearer, or API-key based.</li>
                              </ul>
                              <div className="sync-doc-links">
                                <a href={TRADESYNC_AUTH_URL} target="_blank" rel="noreferrer">
                                  Authentication
                                </a>
                                <a href={TRADESYNC_INTRO_BROKER_URL} target="_blank" rel="noreferrer">
                                  Brokers
                                </a>
                                <a href={TRADESYNC_CREATE_ACCOUNT_URL} target="_blank" rel="noreferrer">
                                  Create Account
                                </a>
                                <a href={TRADESYNC_WEBHOOKS_URL} target="_blank" rel="noreferrer">
                                  Webhooks
                                </a>
                              </div>
                            </div>
                          </>
                        )}
                        <div className="account-editor-actions">
                          <button
                            type="submit"
                            className="account-submit-btn account-editor-submit"
                            disabled={yazanSyncSaving}
                          >
                            {yazanSyncSaving ? "Verifying..." : "Save Connection"}
                          </button>
                        </div>
                      </form>
                    </>
                  ) : (
                    <>
                      <div className={`watchlist-head ${canManageConnections ? "with-action" : ""}`}>
                        <div>
                          <h2>Models / People</h2>
                          {hasWorkspaceProfiles ? <p>Profiles in the current workspace.</p> : null}
                        </div>
                        {canManageConnections ? (
                          <button
                            type="button"
                            className="panel-action-btn"
                            onClick={() => openYazanSyncDraft("add")}
                          >
                            Add
                          </button>
                        ) : null}
                      </div>
                      {yazanSyncSuccess ? (
                        <div className="sync-note-card sync-status-card sync-status-card-success">
                          <strong>Broker connection saved</strong>
                          <p>{yazanSyncSuccess}</p>
                        </div>
                      ) : null}
                      {yazanAccount?.connectionMessage ? (
                        <div className="sync-note-card sync-storage-card">
                          <strong>{yazanAccount.connectionState === "connected" ? "Connection healthy" : "Connection status"}</strong>
                          <p>{yazanAccount.connectionMessage}</p>
                          {yazanAccount.lastVerifiedAt ? (
                            <small className="sync-field-hint">
                              Last checked {new Date(yazanAccount.lastVerifiedAt).toLocaleString("en-US")}
                            </small>
                          ) : null}
                        </div>
                      ) : null}
                      {hasWorkspaceProfiles ? (
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
                                  onMouseDown={(event) => handleYazanAccountMouseDown(event, isYazan)}
                                  onContextMenu={(event) => handleYazanAccountContextMenu(event, isYazan)}
                                  title={
                                    isAdmin && isYazan
                                      ? "Right-click for connection options"
                                      : model.name
                                  }
                                >
                                  <span className="model-main">
                                    <span className="model-name">{model.name}</span>
                                    <span className="model-kind">{model.kind}</span>
                                  </span>
                                  {isYazan && yazanAccountSummary ? (
                                    <span className="model-account">{yazanAccountSummary}</span>
                                  ) : isYazan ? (
                                    <span className="model-account muted">No broker sync connected</span>
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
                      ) : null}
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
                        {simulationToggleLabel}
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
                          ? selectedTradeOwnerLabel
                            ? "No closed trades are available for the current model or connected account."
                            : "Add or select a model/account to populate the history."
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
                        {simulationToggleLabel}
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

              {activePanelTab === "marketMaker" ? (
                <div className="tab-view market-maker-tab">
                  <div className="watchlist-head">
                    <h2>Market Maker</h2>
                    <p>{selectedAsset.symbol} live ladder and internal quoting dashboard.</p>
                  </div>

                  {orderBookSnapshot ? (
                    <div className="market-maker-shell">
                      <div className="market-maker-ladder-card">
                        <div className="market-maker-ladder-head">
                          <span>Bid Size</span>
                          <span>Price</span>
                          <span>Ask Size</span>
                        </div>

                        <div className="market-maker-ladder-stack ask">
                          {marketMakerAskRows.map((row) => (
                            <div
                              key={`${selectedAsset.symbol}-mm-ask-${row.price}`}
                              className={`market-maker-ladder-row ask${
                                row.isInside ? " inside" : ""
                              }${row.isEdge ? " edge" : ""}`}
                            >
                              <span className="market-maker-depth-ghost" aria-hidden />
                              <span className="market-maker-ladder-price ask">
                                ${formatPriceByTick(row.price, selectedAsset.tickSize)}
                              </span>
                              <span className="market-maker-depth-cell ask">
                                <span
                                  className="market-maker-depth-fill ask"
                                  style={{ width: `${row.fillPct}%` }}
                                />
                                <span className="market-maker-depth-value">
                                  {formatDepthSize(row.size)}
                                </span>
                                {row.isInside ? <span className="market-maker-mm-badge">MM</span> : null}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="market-maker-spread-band">
                          <span>Spread: ${formatPriceByTick(orderBookSnapshot.spread, selectedAsset.tickSize)}</span>
                        </div>

                        <div className="market-maker-ladder-stack bid">
                          {marketMakerBidRows.map((row) => (
                            <div
                              key={`${selectedAsset.symbol}-mm-bid-${row.price}`}
                              className={`market-maker-ladder-row bid${row.isInside ? " inside" : ""}`}
                            >
                              <span className="market-maker-depth-cell bid">
                                <span
                                  className="market-maker-depth-fill bid"
                                  style={{ width: `${row.fillPct}%` }}
                                />
                                <span className="market-maker-depth-value">
                                  {formatDepthSize(row.size)}
                                </span>
                                {row.isInside ? <span className="market-maker-mm-badge">MM</span> : null}
                              </span>
                              <span className="market-maker-ladder-price bid">
                                ${formatPriceByTick(row.price, selectedAsset.tickSize)}
                              </span>
                              <span className="market-maker-depth-ghost" aria-hidden />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="market-maker-dashboard">
                        <div className="market-maker-dashboard-title">Market Maker Dashboard</div>

                        <div className="market-maker-stats-grid">
                          <div className="market-maker-stat-card inventory">
                            <span className="market-maker-stat-label">Inventory</span>
                            <strong className={marketMakerInventoryLots >= 0 ? "up" : "down"}>
                              {marketMakerInventoryLots >= 0 ? "+" : ""}
                              {marketMakerInventoryLots}
                            </strong>
                            <small>Lots</small>
                          </div>

                          <div className="market-maker-stat-card exposure">
                            <span className="market-maker-stat-label">Delta Exposure</span>
                            <div className="market-maker-exposure-bar">
                              <span
                                className="market-maker-exposure-fill"
                                style={{ width: `${marketMakerDeltaExposurePct}%` }}
                              />
                            </div>
                            <small>{marketMakerHedgeLabel}</small>
                          </div>

                          <div className="market-maker-stat-card pnl">
                            <span className="market-maker-stat-label">Spread P&amp;L</span>
                            <strong className="up">
                              {formatSignedUsd(marketMakerSpreadPnl)}
                            </strong>
                            <small>earned</small>
                          </div>
                        </div>

                        <div className="market-maker-recent-strip">
                          <span className="market-maker-recent-label">Recent:</span>
                          {marketMakerRecentFlow.map((event) => (
                            <span
                              key={event.id}
                              className={`market-maker-recent-item ${event.tone}`}
                            >
                              {event.label} {event.quantity}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="ai-placeholder">
                      <p>
                        {liveDepthMessage ??
                          (isTopOfBookSchema(liveDepthSchema)
                            ? "Waiting for real Databento top-of-book."
                            : "Waiting for real Databento depth.")}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}

              {activePanelTab === "orderFlow" ? (
                <div className="tab-view order-flow-tab">
                  {orderFlowRows.length > 0 ? (
                    <div className="order-flow-shell">
                      <div className="order-flow-panel">
                        <div className="order-flow-title">Order Flow</div>

                        <div className="order-flow-header">
                          <span>Time</span>
                          <span className="order-flow-header-center">
                            <span className="order-flow-header-arrow" aria-hidden />
                            Price
                            <span className="order-flow-header-arrow" aria-hidden />
                          </span>
                          <span>Size</span>
                        </div>

                        <div className="order-flow-list" role="list">
                          {orderFlowRows.map((row) => (
                            <div key={row.id} className="order-flow-row" role="listitem">
                              <span className="order-flow-time">{formatClockMillis(row.timeMs)}</span>
                              <span className={`order-flow-price ${row.tone}`}>
                                {formatPriceByTick(row.price, selectedAsset.tickSize)}
                              </span>
                              <span className={`order-flow-size ${row.tone}`}>
                                {row.tone === "down"
                                  ? `-${formatDepthSize(row.size)}`
                                  : row.tone === "up"
                                    ? `+${formatDepthSize(row.size)}`
                                    : formatDepthSize(row.size)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="order-flow-shell">
                      <div className="order-flow-panel order-flow-panel-empty">
                        <div className="order-flow-title">Order Flow</div>
                        <div className="order-flow-header">
                          <span>Time</span>
                          <span className="order-flow-header-center">
                            <span className="order-flow-header-arrow" aria-hidden />
                            Price
                            <span className="order-flow-header-arrow" aria-hidden />
                          </span>
                          <span>Size</span>
                        </div>
                        <p className="order-flow-empty">
                          {showcaseMode
                            ? "Order flow is not available while showcase simulation is driving the chart."
                            : marketError ?? "Waiting for live trade prints."}
                        </p>
                      </div>
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
        <span>Model: {hasWorkspaceProfiles ? selectedModel?.name ?? "None" : "None"}</span>
        <span>Feed: {feedStatusLabel}</span>
        <span>{marketError ? marketStatusDetails : `Contract: ${selectedAsset.contract}`}</span>
        <span>UTC</span>
      </footer>
    </main>
  );
}
