"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type CandlestickData,
  type ColorType,
  type CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type LineStyle,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp
} from "lightweight-charts";
import { futuresAssets, getAssetBySymbol } from "../lib/futuresCatalog";

type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";
type PanelTab = "active" | "assets" | "models" | "history" | "actions" | "ai";
type SurfaceTab = "chart";
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

type ActiveTrade = {
  symbol: string;
  side: TradeSide;
  units: number;
  entryPrice: number;
  markPrice: number;
  targetPrice: number;
  stopPrice: number;
  openedAt: UTCTimestamp;
  openedAtLabel: string;
  elapsed: string;
  pnlPct: number;
  pnlValue: number;
  progressPct: number;
  rr: number;
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

type OverlayTrade = {
  id: string;
  symbol: string;
  side: TradeSide;
  status: "closed" | "pending";
  entryTime: UTCTimestamp;
  exitTime: UTCTimestamp;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  outcomePrice: number;
  result: TradeResult;
  pnlUsd: number;
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

const ACCOUNT_GATE_STORAGE_KEY = "yazan-active-account";
const ADMIN_ACCESS_CODE = "12345";
const LIGHTWEIGHT_CHART_SOLID_BACKGROUND: ColorType = "solid" as ColorType;
const LIGHTWEIGHT_CHART_CROSSHAIR_NORMAL: CrosshairMode = 0;
const LIGHTWEIGHT_CHART_LINE_SOLID: LineStyle = 0;
const LIGHTWEIGHT_CHART_LINE_DOTTED: LineStyle = 1;

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
  },
  {
    id: "lyra",
    name: "Lyra",
    kind: "Model",
    riskMin: 0.0012,
    riskMax: 0.0032,
    rrMin: 1.15,
    rrMax: 2.0,
    longBias: 0.49,
    winRate: 0.53
  },
  {
    id: "atlas",
    name: "Atlas",
    kind: "Model",
    riskMin: 0.002,
    riskMax: 0.0055,
    rrMin: 1.25,
    rrMax: 2.3,
    longBias: 0.54,
    winRate: 0.57
  },
  {
    id: "orion",
    name: "Orion",
    kind: "Model",
    riskMin: 0.0017,
    riskMax: 0.0044,
    rrMin: 1.3,
    rrMax: 2.7,
    longBias: 0.5,
    winRate: 0.56
  }
];

const sidebarTabs: Array<{ id: PanelTab; label: string }> = [
  { id: "active", label: "Active" },
  { id: "assets", label: "Assets" },
  { id: "models", label: "Models" },
  { id: "history", label: "History" },
  { id: "actions", label: "Action" },
  { id: "ai", label: "AI" }
];

const surfaceTabs: Array<{ id: SurfaceTab; label: string }> = [
  { id: "chart", label: "Chart" }
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

const watchlistSnapshotCountByTimeframe: Record<Timeframe, number> = {
  "1m": 4,
  "5m": 4,
  "15m": 4,
  "1H": 4,
  "4H": 4,
  "1D": 4,
  "1W": 4
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
  signal?: AbortSignal
): Promise<MarketFeedResponse> => {
  const params = new URLSearchParams({
    symbol,
    timeframe,
    count: String(count)
  });
  const response = await fetch(`/api/futures/candles?${params.toString()}`, {
    cache: "no-store",
    signal
  });
  const payload = (await response.json()) as MarketFeedResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Failed to load market candles.");
  }

  return payload;
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

const randomDriftForCandle = (volatility: number): number => {
  return (Math.random() - 0.5) * volatility * (1.15 + Math.random() * 1.1);
};

const createNextCandle = (
  previousClose: number,
  timestampMs: number,
  timeframe: Timeframe
): Candle => {
  const volatility = timeframeVolatility[timeframe];
  const drift = randomDriftForCandle(volatility);
  const open = previousClose;
  const close = Math.max(0.000001, open * (1 + drift));
  const wickRange = volatility * (0.5 + Math.random() * 1.5);
  const high = Math.max(open, close) * (1 + wickRange * (0.28 + Math.random() * 0.72));
  const low = Math.max(0.000001, Math.min(open, close) * (1 - wickRange * (0.28 + Math.random() * 0.72)));

  return {
    open,
    close,
    high,
    low,
    time: timestampMs
  };
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
  const [activePanelSimulationEnabled, setActivePanelSimulationEnabled] = useState(true);
  const [showAllTradesOnChart, setShowAllTradesOnChart] = useState(false);
  const [showActiveTradeOnChart, setShowActiveTradeOnChart] = useState(false);
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

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
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
  const selectedSurfaceTab: SurfaceTab = "chart";

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
    if (showcaseMode) {
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
    setMarketStatus("loading");
    setMarketError(null);

    fetchFuturesCandles(
      selectedSymbol,
      selectedTimeframe,
      candleHistoryCountByTimeframe[selectedTimeframe],
      controller.signal
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
        setMarketFeedMeta(payload.meta ?? null);
        setMarketStatus("ready");
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        setSeriesMap((prev) => {
          if (prev[selectedKey]?.length) {
            return prev;
          }

          return {
            ...prev,
            [selectedKey]: generateFakeCandles(
              selectedAsset.basePrice,
              selectedSymbol,
              selectedTimeframe,
              candleHistoryCountByTimeframe[selectedTimeframe],
              referenceNowMs
            )
          };
        });
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
    if (showcaseMode) {
      const next: Record<string, Candle[]> = {};

      for (const asset of futuresAssets) {
        const key = symbolTimeframeKey(asset.symbol, selectedTimeframe);
        next[key] = generateFakeCandles(
          asset.basePrice,
          asset.symbol,
          selectedTimeframe,
          watchlistSnapshotCountByTimeframe[selectedTimeframe],
          referenceNowMs
        );
      }

      setWatchlistSeriesMap(next);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    Promise.allSettled(
      futuresAssets.map(async (asset) => {
        const payload = await fetchFuturesCandles(
          asset.symbol,
          selectedTimeframe,
          watchlistSnapshotCountByTimeframe[selectedTimeframe],
          controller.signal
        );

        return {
          symbol: asset.symbol,
          candles: Array.isArray(payload.candles) ? payload.candles : []
        };
      })
    ).then((results) => {
      if (cancelled || controller.signal.aborted) {
        return;
      }

      setWatchlistSeriesMap((prev) => {
        const next = { ...prev };

        results.forEach((result, index) => {
          const asset = futuresAssets[index];
          const key = symbolTimeframeKey(asset.symbol, selectedTimeframe);

          if (result.status === "fulfilled" && result.value.candles.length > 0) {
            next[key] = result.value.candles;
            return;
          }

          if (!next[key]) {
            next[key] = generateFakeCandles(
              asset.basePrice,
              asset.symbol,
              selectedTimeframe,
              watchlistSnapshotCountByTimeframe[selectedTimeframe],
              referenceNowMs
            );
          }
        });

        return next;
      });
    });

    return () => {
      cancelled = true;
      controller.abort();
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
          controller.signal
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
            return;
          }

          if (!next[key]) {
            next[key] = generateFakeCandles(
              selectedAsset.basePrice,
              selectedSymbol,
              timeframe,
              watchlistSnapshotCountByTimeframe[timeframe],
              referenceNowMs
            );
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

  useEffect(() => {
    if (showcaseMode) {
      return;
    }

    const key = selectedKey;
    const timeframeMs = getTimeframeMs(selectedTimeframe);
    const maxBars = candleHistoryCountByTimeframe[selectedTimeframe];

    const timer = window.setInterval(() => {
      setSeriesMap((prev) => {
        const currentSeries = prev[key];

        if (!currentSeries || currentSeries.length < 2) {
          return prev;
        }

        const nextSeries = currentSeries.slice();
        let changed = false;
        const latestBoundary = floorToTimeframe(Date.now(), selectedTimeframe);

        while (nextSeries[nextSeries.length - 1].time < latestBoundary) {
          const previous = nextSeries[nextSeries.length - 1];
          nextSeries.push(
            createNextCandle(previous.close, previous.time + timeframeMs, selectedTimeframe)
          );
          changed = true;
        }

        const formingIndex = nextSeries.length - 1;
        const forming = { ...nextSeries[formingIndex] };
        const drift = randomDriftForCandle(timeframeVolatility[selectedTimeframe]) * 0.42;
        const nextClose = Math.max(0.000001, forming.close * (1 + drift));

        if (nextClose !== forming.close) {
          forming.close = nextClose;
          forming.high = Math.max(forming.high, nextClose, forming.open);
          forming.low = Math.max(0.000001, Math.min(forming.low, nextClose, forming.open));
          nextSeries[formingIndex] = forming;
          changed = true;
        }

        if (!changed) {
          return prev;
        }

        const trimmedSeries =
          nextSeries.length > maxBars ? nextSeries.slice(nextSeries.length - maxBars) : nextSeries;

        return {
          ...prev,
          [key]: trimmedSeries
        };
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [selectedKey, selectedTimeframe, showcaseMode]);

  const fallbackCandles = useMemo(() => {
    return generateFakeCandles(
      selectedAsset.basePrice,
      selectedSymbol,
      selectedTimeframe,
      candleHistoryCountByTimeframe[selectedTimeframe],
      referenceNowMs
    );
  }, [referenceNowMs, selectedAsset.basePrice, selectedSymbol, selectedTimeframe]);

  const selectedCandles = seriesMap[selectedKey] ?? fallbackCandles;

  const candleByUnix = useMemo(() => {
    const map = new Map<number, Candle>();

    for (const candle of selectedCandles) {
      map.set(toUtcTimestamp(candle.time), candle);
    }

    return map;
  }, [selectedCandles]);

  const latestCandle = selectedCandles[selectedCandles.length - 1];
  const previousCandle = selectedCandles[selectedCandles.length - 2] ?? latestCandle;

  const quoteChange =
    previousCandle.close > 0
      ? ((latestCandle.close - previousCandle.close) / previousCandle.close) * 100
      : 0;

  const hoveredCandle = hoveredTime ? candleByUnix.get(hoveredTime) ?? latestCandle : latestCandle;

  const hoveredChange =
    hoveredCandle.open > 0
      ? ((hoveredCandle.close - hoveredCandle.open) / hoveredCandle.open) * 100
      : 0;

  const watchlistRows = useMemo(() => {
    return futuresAssets.map((asset) => {
      const key = symbolTimeframeKey(asset.symbol, selectedTimeframe);
      const list =
        asset.symbol === selectedSymbol
          ? seriesMap[key] ?? fallbackCandles
          : watchlistSeriesMap[key] ??
            generateFakeCandles(
              asset.basePrice,
              asset.symbol,
              selectedTimeframe,
              watchlistSnapshotCountByTimeframe[selectedTimeframe],
              referenceNowMs
            );
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
  }, [
    fallbackCandles,
    referenceNowMs,
    selectedSymbol,
    selectedTimeframe,
    seriesMap,
    watchlistSeriesMap
  ]);

  const tradeBlueprints = useMemo(() => {
    if (!chartSimulationEnabled) {
      return [];
    }

    return generateTradeBlueprintsFromCandles(
      selectedModel,
      selectedSymbol,
      selectedCandles,
      showcaseMode ? 42 : 54
    );
  }, [chartSimulationEnabled, selectedCandles, selectedModel, selectedSymbol, showcaseMode]);

  const activeTrade = useMemo<ActiveTrade | null>(() => {
    if (!activePanelSimulationEnabled || selectedCandles.length < 70) {
      return null;
    }

    const latestIndex = selectedCandles.length - 1;
    const latest = selectedCandles[latestIndex];
    const rand = createSeededRng(hashString(`active-${selectedModel.id}-${selectedSymbol}`));
    const lookbackBars = 6 + Math.floor(rand() * Math.max(18, Math.min(120, latestIndex - 24)));
    let entryIndex = Math.max(20, latestIndex - lookbackBars);

    if (entryIndex < 22 || entryIndex >= latestIndex - 4) {
      const fallbackBars = 28 + Math.floor(rand() * Math.max(8, Math.min(220, latestIndex - 30)));
      entryIndex = Math.max(20, latestIndex - fallbackBars);
    }

    const entryPrice = selectedCandles[entryIndex].close;
    const side: TradeSide = rand() <= selectedModel.longBias ? "Long" : "Short";
    const rr = selectedModel.rrMin + rand() * (selectedModel.rrMax - selectedModel.rrMin);

    let atr = 0;
    let atrCount = 0;

    for (let i = Math.max(1, entryIndex - 28); i <= entryIndex; i += 1) {
      atr += selectedCandles[i].high - selectedCandles[i].low;
      atrCount += 1;
    }

    atr /= Math.max(1, atrCount);

    let riskPerUnit = Math.max(
      entryPrice * (selectedModel.riskMin + rand() * (selectedModel.riskMax - selectedModel.riskMin)),
      atr * (0.75 + rand() * 1.1)
    );

    let stopPrice = side === "Long" ? Math.max(0.000001, entryPrice - riskPerUnit) : entryPrice + riskPerUnit;
    let targetPrice =
      side === "Long"
        ? entryPrice + riskPerUnit * rr
        : Math.max(0.000001, entryPrice - riskPerUnit * rr);

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const path = evaluateTpSlPath(
        selectedCandles,
        side,
        entryIndex,
        targetPrice,
        stopPrice,
        latestIndex
      );

      if (!path.hit) {
        break;
      }

      riskPerUnit *= 1.22;
      stopPrice =
        side === "Long" ? Math.max(0.000001, entryPrice - riskPerUnit) : entryPrice + riskPerUnit;
      targetPrice =
        side === "Long"
          ? entryPrice + riskPerUnit * rr
          : Math.max(0.000001, entryPrice - riskPerUnit * rr);
    }

    const maxRiskUsd = 60 + rand() * 240;
    const maxNotionalUsd = 1400 + rand() * 5200;
    const units = Math.max(
      0.001,
      Math.min(
        maxRiskUsd / Math.max(0.000001, riskPerUnit),
        maxNotionalUsd / Math.max(0.000001, entryPrice)
      )
    );
    const curatedMarkPrice =
      side === "Long"
        ? entryPrice + (targetPrice - entryPrice) * 0.86
        : entryPrice - (entryPrice - targetPrice) * 0.86;
    const markPrice = showcaseMode
      ? clamp(
          curatedMarkPrice,
          Math.min(targetPrice, stopPrice) + 0.000001,
          Math.max(targetPrice, stopPrice) - 0.000001
        )
      : latest.close;
    const pnlPct =
      side === "Long"
        ? ((markPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - markPrice) / entryPrice) * 100;
    const pnlValue = side === "Long" ? (markPrice - entryPrice) * units : (entryPrice - markPrice) * units;
    const progressRaw =
      side === "Long"
        ? (markPrice - stopPrice) / Math.max(0.000001, targetPrice - stopPrice)
        : (stopPrice - markPrice) / Math.max(0.000001, stopPrice - targetPrice);
    const openedAt = toUtcTimestamp(selectedCandles[entryIndex].time);

    return {
      symbol: selectedSymbol,
      side,
      units,
      entryPrice,
      markPrice,
      targetPrice,
      stopPrice,
      openedAt,
      openedAtLabel: formatDateTime(selectedCandles[entryIndex].time),
      elapsed: formatElapsed(Number(openedAt), toUtcTimestamp(selectedCandles[latestIndex].time)),
      pnlPct,
      pnlValue,
      progressPct: clamp(progressRaw * 100, 0, 100),
      rr
    };
  }, [
    activePanelSimulationEnabled,
    selectedCandles,
    selectedModel,
    selectedSymbol,
    showcaseMode
  ]);

  const historyRows = useMemo(() => {
    if (!chartSimulationEnabled) {
      return [];
    }

    const rows: HistoryItem[] = [];
    const list = selectedCandles;

    if (list.length < 16) {
      return rows;
    }

    for (const blueprint of tradeBlueprints) {
      const entryIndex = findCandleIndexAtOrBefore(list, blueprint.entryMs);
      const rawExitIndex = findCandleIndexAtOrBefore(list, blueprint.exitMs);

      if (entryIndex < 0 || rawExitIndex < 0) {
        continue;
      }

      const exitIndex = Math.min(list.length - 1, Math.max(entryIndex + 1, rawExitIndex));

      if (exitIndex <= entryIndex) {
        continue;
      }

      const entryPrice = list[entryIndex].close;
      const rand = createSeededRng(hashString(`mapped-${blueprint.id}`));
      let atr = 0;
      let atrCount = 0;

      for (let i = Math.max(1, entryIndex - 20); i <= entryIndex; i += 1) {
        atr += list[i].high - list[i].low;
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
        list,
        blueprint.side,
        entryIndex,
        targetPrice,
        stopPrice,
        exitIndex
      );

      const resolvedExitIndex = path.hit ? path.hitIndex : exitIndex;
      const rawOutcomePrice = path.hit ? path.outcomePrice : list[resolvedExitIndex].close;
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
        entryTime: toUtcTimestamp(list[entryIndex].time),
        exitTime: toUtcTimestamp(list[resolvedExitIndex].time),
        entryPrice,
        targetPrice,
        stopPrice,
        outcomePrice,
        units: blueprint.units,
        entryAt: formatDateTime(list[entryIndex].time),
        exitAt: formatDateTime(list[resolvedExitIndex].time),
        time: formatDateTime(list[resolvedExitIndex].time)
      });
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
  }, [chartSimulationEnabled, selectedCandles, showcaseMode, tradeBlueprints]);

  const selectedHistoryTrade = useMemo(() => {
    if (!selectedHistoryId) {
      return null;
    }

    return historyRows.find((row) => row.id === selectedHistoryId) ?? null;
  }, [historyRows, selectedHistoryId]);

  const currentSymbolHistoryRows = useMemo(() => {
    return historyRows.filter((row) => row.symbol === selectedSymbol);
  }, [historyRows, selectedSymbol]);

  const candleIndexByUnix = useMemo(() => {
    const map = new Map<number, number>();

    for (let i = 0; i < selectedCandles.length; i += 1) {
      map.set(toUtcTimestamp(selectedCandles[i].time), i);
    }

    return map;
  }, [selectedCandles]);

  const activeChartTrade = useMemo<OverlayTrade | null>(() => {
    if (!activeTrade || selectedCandles.length === 0) {
      return null;
    }

    const latestTime = toUtcTimestamp(selectedCandles[selectedCandles.length - 1].time);

    return {
      id: "active-live",
      symbol: activeTrade.symbol,
      side: activeTrade.side,
      status: "pending",
      entryTime: activeTrade.openedAt,
      exitTime:
        latestTime > activeTrade.openedAt
          ? latestTime
          : ((activeTrade.openedAt + timeframeMinutes[selectedTimeframe] * 60) as UTCTimestamp),
      entryPrice: activeTrade.entryPrice,
      targetPrice: activeTrade.targetPrice,
      stopPrice: activeTrade.stopPrice,
      outcomePrice: activeTrade.markPrice,
      result: activeTrade.pnlValue >= 0 ? "Win" : "Loss",
      pnlUsd: activeTrade.pnlValue
    };
  }, [activeTrade, selectedCandles, selectedTimeframe]);

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
    const now = Date.now();

    if (activeTrade) {
      const liveTitle =
        activeTrade.progressPct >= 78
          ? `${activeTrade.symbol} near TP`
          : activeTrade.progressPct <= 22
            ? `${activeTrade.symbol} near SL`
            : `${activeTrade.symbol} mark update`;
      const liveTone: NotificationTone =
        activeTrade.progressPct >= 78
          ? "up"
          : activeTrade.progressPct <= 22
            ? "down"
            : "neutral";

      items.push({
        id: `live-progress-${activeTrade.symbol}`,
        title: liveTitle,
        details: `Progress ${activeTrade.progressPct.toFixed(1)}% | TP ${formatPrice(
          activeTrade.targetPrice
        )} | SL ${formatPrice(activeTrade.stopPrice)}`,
        time: formatClock(now),
        timestamp: now,
        tone: liveTone,
        live: true
      });

      items.push({
        id: `live-pnl-${activeTrade.symbol}`,
        title: `${activeTrade.symbol} unrealized`,
        details: `${activeTrade.pnlValue >= 0 ? "+" : "-"}$${formatUsd(
          Math.abs(activeTrade.pnlValue)
        )} (${activeTrade.pnlPct >= 0 ? "+" : ""}${activeTrade.pnlPct.toFixed(2)}%)`,
        time: formatClock(now - 1000),
        timestamp: now - 1000,
        tone: activeTrade.pnlValue >= 0 ? "up" : "down",
        live: true
      });
    }

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
  }, [actionRows, activeTrade, referenceNowMs, selectedSymbol, showcaseMode]);

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
    setShowActiveTradeOnChart(false);
    focusTradeIdRef.current = null;
  }, [selectedModelId]);

  useEffect(() => {
    setSelectedHistoryId(null);
    setShowAllTradesOnChart(false);
    setShowActiveTradeOnChart(false);
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
        priceLineVisible: false,
        lastValueVisible: true
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
    const candleSeries = candleSeriesRef.current;

    if (!chart || !candleSeries || selectedCandles.length === 0) {
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

    const selection = `${selectedSymbol}-${selectedTimeframe}`;

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
  }, [chartReadyVersion, selectedCandles, selectedSymbol, selectedTimeframe]);

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

    if (showActiveTradeOnChart && activeChartTrade && activeChartTrade.symbol === selectedSymbol) {
      renderSingleTrade({
        side: activeChartTrade.side,
        status: activeChartTrade.status,
        result: activeChartTrade.result,
        entryTime: activeChartTrade.entryTime,
        exitTime: activeChartTrade.exitTime,
        entryPrice: activeChartTrade.entryPrice,
        targetPrice: activeChartTrade.targetPrice,
        stopPrice: activeChartTrade.stopPrice,
        outcomePrice: activeChartTrade.outcomePrice,
        pnlUsd: activeChartTrade.pnlUsd
      });
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
    activeChartTrade,
    currentSymbolHistoryRows,
    selectedHistoryTrade,
    selectedSymbol,
    selectedTimeframe,
    showActiveTradeOnChart,
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
        ? "Fallback replay"
        : `${marketFeedMeta?.provider ?? "Databento"} - ${marketFeedMeta?.sourceTimeframe ?? selectedTimeframe}`;
  const currentAccountLabel = activeAccountRole ?? "Guest";

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

  const handleAdminUnlock = () => {
    if (adminCodeInput === ADMIN_ACCESS_CODE) {
      grantAccountAccess("Admin");
      return;
    }

    setAccountAccessError("Incorrect admin code. Enter the 5-digit code to continue.");
  };

  if (!accountGateReady) {
    return (
      <main className="terminal account-screen">
        <section className="account-screen-shell">
          <div className="account-shell-panel account-shell-panel-loading">
            <span className="account-shell-kicker">Yazan Futures</span>
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
          <div className="account-shell-panel">
            <span className="account-shell-kicker">Yazan Futures</span>
            <div className="account-shell-header">
              <h1>Select an account</h1>
              <p>Choose User for instant access, or unlock Admin with the 5-digit code.</p>
            </div>

            <div className="account-choice-grid">
              <button
                type="button"
                className={`account-choice-card ${
                  accountEntryMode === "Admin" ? "active" : ""
                }`}
                onClick={() => {
                  setAccountEntryMode("Admin");
                  setAdminCodeInput("");
                  setAccountAccessError("");
                }}
              >
                <span className="account-choice-kicker">Protected</span>
                <strong>Admin</strong>
                <p>Requires the 5-digit access code.</p>
              </button>

              <button
                type="button"
                className="account-choice-card"
                onClick={() => grantAccountAccess("User")}
              >
                <span className="account-choice-kicker">Instant Access</span>
                <strong>User</strong>
                <p>Enter directly into the trading terminal.</p>
              </button>
            </div>

            {accountEntryMode === "Admin" ? (
              <form
                className="account-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleAdminUnlock();
                }}
              >
                <label className="account-field">
                  <span>Admin Code</span>
                  <input
                    className="account-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={5}
                    autoFocus
                    value={adminCodeInput}
                    onChange={(event) => {
                      setAdminCodeInput(event.target.value.replace(/\D/g, "").slice(0, 5));
                      setAccountAccessError("");
                    }}
                    placeholder="Enter 5 digits"
                  />
                </label>
                <button type="submit" className="account-submit-btn">
                  Unlock Admin
                </button>
              </form>
            ) : (
              <div className="account-inline-note">
                Admin stays locked until the correct 5-digit code is entered.
              </div>
            )}

            {accountAccessError ? (
              <div className="account-form-error">{accountAccessError}</div>
            ) : null}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="terminal">
      <div className="surface-strip">
        <span className="site-tag surface-brand">Yazan Futures</span>
        <nav className="surface-tabs" aria-label="primary views">
          {surfaceTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`surface-tab ${selectedSurfaceTab === tab.id ? "active" : ""}`}
              aria-current={selectedSurfaceTab === tab.id ? "page" : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
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

      <header className="topbar">
            <div className="brand-area">
              <div className="asset-meta">
                <h1>{selectedAsset.symbol}</h1>
                <p>{selectedAsset.name}</p>
              </div>
              <div className="live-quote">
                <span className={quoteChange >= 0 ? "up" : "down"}>
                  ${formatPrice(latestCandle.close)}
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
            <div className="chart-stage-actions">
              <button
                type="button"
                className="chart-reset-btn"
                onClick={resetChart}
                title="Reset chart view (Opt+R)"
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
                      <p>{selectedAsset.symbol} replayed on live futures candles</p>
                    </div>
                    <div className="panel-head-actions">
                      <button
                        type="button"
                        className={`panel-action-btn panel-mode-btn ${
                          activePanelSimulationEnabled ? "on" : "off"
                        }`}
                        onClick={() => setActivePanelSimulationEnabled((current) => !current)}
                      >
                        {activePanelSimulationEnabled ? "Simulation ON" : "Simulation OFF"}
                      </button>
                      <button
                        type="button"
                        className="panel-action-btn"
                        disabled={!activeTrade}
                        onClick={() => {
                          if (!activeTrade) {
                            return;
                          }

                          setSelectedSymbol(activeTrade.symbol);
                          setShowAllTradesOnChart(false);
                          setShowActiveTradeOnChart((current) => !current);
                          setSelectedHistoryId(null);
                          focusTradeIdRef.current = null;
                        }}
                      >
                        {showActiveTradeOnChart ? "Hide On Chart" : "Show On Chart"}
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
                        <span className="active-live-tag">Live</span>
                      </div>

                      <div className="active-pnl">
                        <span>Unrealized PnL</span>
                        <strong className={activeTrade.pnlValue >= 0 ? "up" : "down"}>
                          {activeTrade.pnlValue >= 0 ? "+" : "-"}${formatUsd(Math.abs(activeTrade.pnlValue))}
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
                          <strong>{formatPrice(activeTrade.markPrice)}</strong>
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
                          <strong>1:{activeTrade.rr.toFixed(2)}</strong>
                        </div>
                        <div className="active-metric">
                          <span>Opened</span>
                          <strong>{activeTrade.openedAtLabel}</strong>
                        </div>
                        <div className="active-metric">
                          <span>Duration</span>
                          <strong>{activeTrade.elapsed}</strong>
                        </div>
                      </div>

                      <div className="active-progress">
                        <div className="active-progress-head">
                          <span>Progress To TP</span>
                          <span>{activeTrade.progressPct.toFixed(1)}%</span>
                        </div>
                        <div className="active-progress-track">
                          <div
                            className="active-progress-fill"
                            style={{ width: `${activeTrade.progressPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="ai-placeholder">
                      <p>
                        {activePanelSimulationEnabled
                          ? "No active replay trade is open on this chart yet."
                          : "Active trade simulation is turned off."}
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
                      <p>Databento continuous futures watchlist</p>
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
                            setShowActiveTradeOnChart(false);
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
                  <div className="watchlist-head">
                    <div>
                      <h2>Models / People</h2>
                      <p>Select one profile to drive history and actions</p>
                    </div>
                  </div>
                  <ul className="model-list">
                    {modelProfiles.map((model) => {
                      const selected = model.id === selectedModelId;

                      return (
                        <li key={model.id}>
                          <button
                            type="button"
                            className={`model-row ${selected ? "selected" : ""}`}
                            onClick={() => setSelectedModelId(model.id)}
                          >
                            <span className="model-main">
                              <span className="model-name">{model.name}</span>
                              <span className="model-kind">{model.kind}</span>
                            </span>
                            {model.accountNumber ? (
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
                </div>
              ) : null}

              {activePanelTab === "history" ? (
                <div className="tab-view">
                  <div className="watchlist-head with-action">
                    <div>
                      <h2>History</h2>
                      <p>{selectedAsset.symbol} simulated fills from {selectedModel.name}</p>
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
                          setShowActiveTradeOnChart(false);
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
                              setShowActiveTradeOnChart(false);
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
                      <p>{selectedAsset.symbol} order timeline and risk actions</p>
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
                              setShowActiveTradeOnChart(false);
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

              {activePanelTab === "ai" ? (
                <div className="tab-view ai-tab">
                  <div className="watchlist-head">
                    <div>
                      <h2>AI</h2>
                      <p>Assistant module</p>
                    </div>
                  </div>
                  <div className="ai-placeholder">
                    <p>AI panel is reserved for upcoming features.</p>
                    <p>No actions are connected yet.</p>
                  </div>
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
        <span>{marketError ? "Mode: fallback replay" : `Contract: ${selectedAsset.contract}`}</span>
        <span>UTC</span>
      </footer>
    </main>
  );
}
