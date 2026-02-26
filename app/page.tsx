"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp
} from "lightweight-charts";

type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";
type PanelTab = "active" | "assets" | "history" | "actions" | "ai";

type FutureAsset = {
  symbol: string;
  name: string;
  basePrice: number;
  openInterest: string;
  funding: string;
};

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
  result: TradeResult;
  pnl: string;
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

const futuresAssets: FutureAsset[] = [
  {
    symbol: "BTCUSDT.P",
    name: "Bitcoin Perpetual",
    basePrice: 64238.7,
    openInterest: "20.4B",
    funding: "+0.012%"
  },
  {
    symbol: "ETHUSDT.P",
    name: "Ethereum Perpetual",
    basePrice: 3421.85,
    openInterest: "10.1B",
    funding: "+0.009%"
  },
  {
    symbol: "SOLUSDT.P",
    name: "Solana Perpetual",
    basePrice: 187.54,
    openInterest: "2.8B",
    funding: "-0.004%"
  },
  {
    symbol: "XRPUSDT.P",
    name: "XRP Perpetual",
    basePrice: 0.6943,
    openInterest: "1.9B",
    funding: "+0.003%"
  },
  {
    symbol: "BNBUSDT.P",
    name: "BNB Perpetual",
    basePrice: 585.19,
    openInterest: "1.3B",
    funding: "-0.001%"
  },
  {
    symbol: "DOGEUSDT.P",
    name: "Dogecoin Perpetual",
    basePrice: 0.1921,
    openInterest: "1.4B",
    funding: "+0.015%"
  },
  {
    symbol: "AVAXUSDT.P",
    name: "Avalanche Perpetual",
    basePrice: 42.16,
    openInterest: "780M",
    funding: "-0.008%"
  },
  {
    symbol: "LINKUSDT.P",
    name: "Chainlink Perpetual",
    basePrice: 19.84,
    openInterest: "640M",
    funding: "+0.006%"
  },
  {
    symbol: "ADAUSDT.P",
    name: "Cardano Perpetual",
    basePrice: 0.7862,
    openInterest: "590M",
    funding: "-0.002%"
  },
  {
    symbol: "SUIUSDT.P",
    name: "Sui Perpetual",
    basePrice: 1.79,
    openInterest: "410M",
    funding: "+0.011%"
  }
];

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

const sidebarTabs: Array<{ id: PanelTab; label: string }> = [
  { id: "active", label: "Active" },
  { id: "assets", label: "Assets" },
  { id: "history", label: "History" },
  { id: "actions", label: "Action" },
  { id: "ai", label: "AI" }
];

const candleHistoryCountByTimeframe: Record<Timeframe, number> = {
  "1m": 9000,
  "5m": 7800,
  "15m": 6400,
  "1H": 4800,
  "4H": 3400,
  "1D": 2200,
  "1W": 900
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
  if (value < 1) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    });
  }

  if (value < 100) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
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

const formatElapsed = (openedAtSeconds: number): string => {
  const nowSeconds = Math.floor(Date.now() / 1000);
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

const generateFakeCandles = (
  basePrice: number,
  symbol: string,
  timeframe: Timeframe,
  count = candleHistoryCountByTimeframe[timeframe]
): Candle[] => {
  const series: Candle[] = [];
  const timeframeMs = getTimeframeMs(timeframe);
  const baseVolatility = timeframeVolatility[timeframe];
  const seed = hashString(`${symbol}-${timeframe}`);
  const rand = createSeededRng(seed);
  const latestAlignedTime = floorToTimeframe(Date.now(), timeframe);
  const startTime = latestAlignedTime - (count - 1) * timeframeMs;
  let close = basePrice * (0.9 + rand() * 0.22);
  let regimeBarsLeft = 0;
  let driftBias = 0;
  let volMultiplier = 1;
  let momentumCarry = 0;

  for (let i = 0; i < count; i += 1) {
    if (regimeBarsLeft <= 0) {
      regimeBarsLeft = 35 + Math.floor(rand() * 150);
      driftBias = (rand() - 0.5) * baseVolatility * (0.9 + rand() * 1.5);
      volMultiplier = 0.65 + rand() * 2.2;
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
    const returnMove = driftBias + microNoise + trendNoise + momentumCarry + shock;

    close = Math.max(0.000001, open * (1 + returnMove));
    momentumCarry = returnMove * 0.22;

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

const getAssetBySymbol = (symbol: string): FutureAsset => {
  return futuresAssets.find((asset) => asset.symbol === symbol) ?? futuresAssets[0];
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

export default function Home() {
  const [selectedSymbol, setSelectedSymbol] = useState(futuresAssets[0].symbol);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("15m");
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState<PanelTab>("active");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [seriesMap, setSeriesMap] = useState<Record<string, Candle[]>>(() => {
    const initial: Record<string, Candle[]> = {};

    for (const asset of futuresAssets) {
      const key = symbolTimeframeKey(asset.symbol, "15m");
      initial[key] = generateFakeCandles(asset.basePrice, asset.symbol, "15m");
    }

    return initial;
  });

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const tradeProfitZoneRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const tradeLossZoneRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const tradeEntryLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const tradeTargetLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const tradeStopLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const tradePathLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const selectionRef = useRef<string>("");
  const focusTradeIdRef = useRef<string | null>(null);
  const notificationRef = useRef<HTMLDivElement | null>(null);

  const selectedAsset = useMemo(() => {
    return getAssetBySymbol(selectedSymbol);
  }, [selectedSymbol]);

  const selectedKey = symbolTimeframeKey(selectedSymbol, selectedTimeframe);

  useEffect(() => {
    setSeriesMap((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const asset of futuresAssets) {
        const key = symbolTimeframeKey(asset.symbol, selectedTimeframe);

        if (next[key]) {
          continue;
        }

        next[key] = generateFakeCandles(asset.basePrice, asset.symbol, selectedTimeframe);
        changed = true;
      }

      if (!changed) {
        return prev;
      }

      return next;
    });

    setHoveredTime(null);
  }, [selectedTimeframe]);

  useEffect(() => {
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
  }, [selectedKey, selectedTimeframe]);

  const fallbackCandles = useMemo(() => {
    return generateFakeCandles(selectedAsset.basePrice, selectedSymbol, selectedTimeframe);
  }, [selectedAsset.basePrice, selectedSymbol, selectedTimeframe]);

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
        seriesMap[key] ?? generateFakeCandles(asset.basePrice, asset.symbol, selectedTimeframe);
      const last = list[list.length - 1];
      const prev = list[list.length - 2] ?? last;
      const change = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;

      return {
        ...asset,
        lastPrice: last.close,
        change
      };
    });
  }, [selectedTimeframe, seriesMap]);

  const activeTrade = useMemo<ActiveTrade | null>(() => {
    if (selectedCandles.length < 40) {
      return null;
    }

    const seed = hashString(`active-${selectedSymbol}-${selectedTimeframe}`);
    const rand = createSeededRng(seed);
    const maxLookback = Math.min(160, Math.max(36, Math.floor(selectedCandles.length * 0.09)));
    const entryLookback = 24 + Math.floor(rand() * maxLookback);
    const entryIndex = Math.max(8, selectedCandles.length - 1 - entryLookback);
    const entryCandle = selectedCandles[entryIndex];
    const markPrice = latestCandle.close;
    const side: TradeSide = rand() >= 0.5 ? "Long" : "Short";

    let atr = 0;
    let atrCount = 0;
    for (let i = Math.max(1, entryIndex - 24); i <= entryIndex; i += 1) {
      atr += selectedCandles[i].high - selectedCandles[i].low;
      atrCount += 1;
    }
    atr /= Math.max(1, atrCount);

    const risk =
      Math.max(
        atr * (0.8 + rand() * 0.8),
        entryCandle.close * timeframeVolatility[selectedTimeframe] * (2.6 + rand() * 1.8)
      ) || entryCandle.close * 0.0028;
    const rr = 1.35 + rand() * 1.35;
    const units = Math.max(
      0.001,
      (1800 + rand() * 3800) / Math.max(entryCandle.close * (0.95 + rand() * 0.25), 0.000001)
    );
    const stopPrice =
      side === "Long"
        ? Math.max(0.000001, entryCandle.close - risk)
        : entryCandle.close + risk;
    const targetPrice =
      side === "Long"
        ? entryCandle.close + risk * rr
        : Math.max(0.000001, entryCandle.close - risk * rr);
    const pnlPct =
      side === "Long"
        ? ((markPrice - entryCandle.close) / entryCandle.close) * 100
        : ((entryCandle.close - markPrice) / entryCandle.close) * 100;
    const pnlValue =
      side === "Long"
        ? (markPrice - entryCandle.close) * units
        : (entryCandle.close - markPrice) * units;
    const progressRaw =
      side === "Long"
        ? (markPrice - stopPrice) / Math.max(0.000001, targetPrice - stopPrice)
        : (stopPrice - markPrice) / Math.max(0.000001, stopPrice - targetPrice);
    const openedAt = toUtcTimestamp(entryCandle.time);

    return {
      symbol: selectedSymbol,
      side,
      units,
      entryPrice: entryCandle.close,
      markPrice,
      targetPrice,
      stopPrice,
      openedAt,
      openedAtLabel: formatDateTime(entryCandle.time),
      elapsed: formatElapsed(Number(openedAt)),
      pnlPct,
      pnlValue,
      progressPct: clamp(progressRaw * 100, 0, 100),
      rr
    };
  }, [latestCandle.close, selectedCandles, selectedSymbol, selectedTimeframe]);

  const historyRows = useMemo(() => {
    const rows: HistoryItem[] = [];
    const maxTrades = 60;
    const rand = createSeededRng(hashString(`history-${selectedTimeframe}`));
    let tradeId = 1;
    let attempts = 0;

    while (rows.length < maxTrades && attempts < maxTrades * 20) {
      attempts += 1;
      const asset = futuresAssets[Math.floor(rand() * futuresAssets.length)];
      const key = symbolTimeframeKey(asset.symbol, selectedTimeframe);
      const list = seriesMap[key] ?? generateFakeCandles(asset.basePrice, asset.symbol, selectedTimeframe);

      if (list.length < 220) {
        continue;
      }

      const minEntry = Math.floor(list.length * 0.18);
      const maxEntry = list.length - 54;
      const entryIndex = Math.floor(minEntry + rand() * Math.max(1, maxEntry - minEntry));
      const maxHold = 8 + Math.floor(rand() * 32);
      const entryPrice = list[entryIndex].close;
      const units =
        Math.max(
          0.001,
          (900 + rand() * 2800) / Math.max(entryPrice * (0.9 + rand() * 0.55), 0.000001)
        ) || 0.001;

      let atr = 0;
      let atrCount = 0;

      for (let i = Math.max(1, entryIndex - 18); i <= entryIndex; i += 1) {
        atr += list[i].high - list[i].low;
        atrCount += 1;
      }

      atr /= Math.max(1, atrCount);

      const risk =
        Math.max(
          atr * (0.7 + rand() * 0.9),
          entryPrice * timeframeVolatility[selectedTimeframe] * (3.4 + rand() * 2.2)
        ) || entryPrice * 0.0025;
      const rr = 1.2 + rand() * 1.6;
      const stopPrice = Math.max(0.000001, entryPrice - risk);
      const targetPrice = entryPrice + risk * rr;

      let exitIndex = Math.min(list.length - 1, entryIndex + maxHold);
      let result: TradeResult | null = null;
      let outcomePrice = list[exitIndex].close;

      for (let i = entryIndex + 1; i <= Math.min(list.length - 1, entryIndex + maxHold); i += 1) {
        const candle = list[i];
        const hitTarget = candle.high >= targetPrice;
        const hitStop = candle.low <= stopPrice;

        if (hitTarget || hitStop) {
          exitIndex = i;

          if (hitTarget && hitStop) {
            const distTarget = Math.abs(candle.open - targetPrice);
            const distStop = Math.abs(candle.open - stopPrice);
            const targetFirst = distTarget <= distStop;
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
      }

      if (!result) {
        const finalPrice = list[exitIndex].close;
        if (finalPrice >= entryPrice) {
          result = "Win";
          outcomePrice = Math.min(finalPrice, targetPrice);
        } else {
          result = "Loss";
          outcomePrice = Math.max(finalPrice, stopPrice);
        }
      }

      const pnlPct = ((outcomePrice - entryPrice) / entryPrice) * 100;

      rows.push({
        id: `h${tradeId}`,
        symbol: asset.symbol,
        result,
        pnl: `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`,
        entryTime: toUtcTimestamp(list[entryIndex].time),
        exitTime: toUtcTimestamp(list[exitIndex].time),
        entryPrice,
        targetPrice,
        stopPrice,
        outcomePrice,
        units,
        entryAt: formatDateTime(list[entryIndex].time),
        exitAt: formatDateTime(list[exitIndex].time),
        time: formatDateTime(list[exitIndex].time)
      });

      tradeId += 1;
    }

    return rows.sort((a, b) => Number(b.exitTime) - Number(a.exitTime));
  }, [selectedTimeframe, seriesMap]);

  const selectedHistoryTrade = useMemo(() => {
    if (!selectedHistoryId) {
      return null;
    }

    return historyRows.find((row) => row.id === selectedHistoryId) ?? null;
  }, [historyRows, selectedHistoryId]);

  const displayedHistoryRows = useMemo(() => {
    return showAllHistory ? historyRows : historyRows.slice(0, 18);
  }, [historyRows, showAllHistory]);

  const actionRows = useMemo(() => {
    const rows: ActionItem[] = [];
    const stepSeconds = timeframeMinutes[selectedTimeframe] * 60;

    for (const trade of historyRows) {
      rows.push({
        id: `${trade.id}-entry`,
        tradeId: trade.id,
        symbol: trade.symbol,
        label: "Entry Order Placed",
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
        details: `${trade.pnl} @ ${formatPrice(trade.outcomePrice)}`,
        timestamp: trade.exitTime,
        time: trade.exitAt
      });
    }

    return rows.sort(
      (a, b) => Number(b.timestamp) - Number(a.timestamp) || b.id.localeCompare(a.id)
    );
  }, [historyRows, selectedTimeframe]);

  const notificationItems = useMemo<NotificationItem[]>(() => {
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
        id: `live-progress-${activeTrade.symbol}-${Math.round(activeTrade.progressPct)}`,
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
        id: `live-pnl-${activeTrade.symbol}-${Math.round(activeTrade.markPrice * 1000)}`,
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
  }, [actionRows, activeTrade]);

  const liveNotificationCount = useMemo(() => {
    return notificationItems.reduce((count, item) => {
      return count + (item.live ? 1 : 0);
    }, 0);
  }, [notificationItems]);

  useEffect(() => {
    if (!selectedHistoryId) {
      return;
    }

    if (!historyRows.some((row) => row.id === selectedHistoryId)) {
      setSelectedHistoryId(null);
    }
  }, [historyRows, selectedHistoryId]);

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
    const container = chartContainerRef.current;

    if (!container || chartRef.current) {
      return;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#090d13" },
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
        mode: CrosshairMode.Normal,
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
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    const tradeTargetLine = chart.addLineSeries({
      color: "rgba(53, 201, 113, 0.95)",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    const tradeStopLine = chart.addLineSeries({
      color: "rgba(255, 76, 104, 0.95)",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    const tradePathLine = chart.addLineSeries({
      color: "rgba(220, 230, 248, 0.82)",
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
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

      chart.applyOptions({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height)
      });
    });

    resizeObserver.observe(container);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    tradeProfitZoneRef.current = tradeProfitZone;
    tradeLossZoneRef.current = tradeLossZone;
    tradeEntryLineRef.current = tradeEntryLine;
    tradeTargetLineRef.current = tradeTargetLine;
    tradeStopLineRef.current = tradeStopLine;
    tradePathLineRef.current = tradePathLine;

    return () => {
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
    };
  }, []);

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

      chart.timeScale().setVisibleLogicalRange({ from, to });
      selectionRef.current = selection;
    }
  }, [selectedCandles, selectedSymbol, selectedTimeframe]);

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

    const entryIndex = selectedCandles.findIndex((candle) => {
      return toUtcTimestamp(candle.time) === selectedHistoryTrade.entryTime;
    });
    const exitIndexRaw = selectedCandles.findIndex((candle) => {
      return toUtcTimestamp(candle.time) === selectedHistoryTrade.exitTime;
    });
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
  }, [selectedCandles, selectedHistoryTrade, selectedSymbol, selectedTimeframe]);

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
    const candleSeries = candleSeriesRef.current;
    const tradeProfitZone = tradeProfitZoneRef.current;
    const tradeLossZone = tradeLossZoneRef.current;
    const tradeEntryLine = tradeEntryLineRef.current;
    const tradeTargetLine = tradeTargetLineRef.current;
    const tradeStopLine = tradeStopLineRef.current;
    const tradePathLine = tradePathLineRef.current;

    if (
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

    if (!selectedHistoryTrade || selectedHistoryTrade.symbol !== selectedSymbol) {
      candleSeries.setMarkers([]);
      tradeProfitZone.setData([]);
      tradeLossZone.setData([]);
      tradeEntryLine.setData([]);
      tradeTargetLine.setData([]);
      tradeStopLine.setData([]);
      tradePathLine.setData([]);
      return;
    }

    const startTime = selectedHistoryTrade.entryTime;
    const endTime =
      selectedHistoryTrade.exitTime > selectedHistoryTrade.entryTime
        ? selectedHistoryTrade.exitTime
        : ((selectedHistoryTrade.entryTime + timeframeMinutes[selectedTimeframe] * 60) as UTCTimestamp);

    const markers: SeriesMarker<Time>[] = [
      {
        time: startTime,
        position: "belowBar",
        shape: "arrowUp",
        color: "#30b76f",
        text: "Entry"
      },
      {
        time: endTime,
        position: selectedHistoryTrade.result === "Win" ? "aboveBar" : "belowBar",
        shape: "circle",
        color: selectedHistoryTrade.result === "Win" ? "#35c971" : "#f0455a",
        text: selectedHistoryTrade.result
      }
    ];

    candleSeries.setMarkers(markers);
    tradeProfitZone.applyOptions({
      baseValue: { type: "price", price: selectedHistoryTrade.entryPrice }
    });
    tradeLossZone.applyOptions({
      baseValue: { type: "price", price: selectedHistoryTrade.entryPrice }
    });

    const tradeZoneData = [
      { time: startTime, value: selectedHistoryTrade.targetPrice },
      { time: endTime, value: selectedHistoryTrade.targetPrice }
    ];
    const stopZoneData = [
      { time: startTime, value: selectedHistoryTrade.stopPrice },
      { time: endTime, value: selectedHistoryTrade.stopPrice }
    ];

    tradeProfitZone.setData(tradeZoneData);
    tradeLossZone.setData(stopZoneData);
    tradeEntryLine.setData([
      { time: startTime, value: selectedHistoryTrade.entryPrice },
      { time: endTime, value: selectedHistoryTrade.entryPrice }
    ]);
    tradeTargetLine.setData(tradeZoneData);
    tradeStopLine.setData(stopZoneData);
    tradePathLine.setData([
      { time: startTime, value: selectedHistoryTrade.entryPrice },
      { time: endTime, value: selectedHistoryTrade.outcomePrice }
    ]);
  }, [selectedHistoryTrade, selectedSymbol, selectedTimeframe]);

  return (
    <main className="terminal">
      <header className="topbar">
        <div className="brand-area">
          <div className="asset-meta">
            <h1>{selectedAsset.symbol}</h1>
            <p>{selectedAsset.name}</p>
          </div>
          <div className="live-quote">
            <span>${formatPrice(latestCandle.close)}</span>
            <span className={quoteChange >= 0 ? "up" : "down"}>
              {quoteChange >= 0 ? "+" : ""}
              {quoteChange.toFixed(2)}%
            </span>
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
          <div className="top-utility">
            <span className="site-tag">yazan.trade</span>
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
                {liveNotificationCount > 0 ? (
                  <span className="notif-badge">{Math.min(9, liveNotificationCount)}</span>
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
      </header>

      <section className={`workspace ${panelExpanded ? "" : "panel-collapsed"}`}>
        <section className="chart-wrap">
          <div className="chart-toolbar">
            <span>
              O <strong>{formatPrice(hoveredCandle.open)}</strong>
            </span>
            <span>
              H <strong>{formatPrice(hoveredCandle.high)}</strong>
            </span>
            <span>
              L <strong>{formatPrice(hoveredCandle.low)}</strong>
            </span>
            <span>
              C <strong>{formatPrice(hoveredCandle.close)}</strong>
            </span>
            <span className={hoveredChange >= 0 ? "up" : "down"}>
              {hoveredChange >= 0 ? "+" : ""}
              {hoveredChange.toFixed(2)}%
            </span>
            <span>
              Funding <strong>{selectedAsset.funding}</strong>
            </span>
            <span>
              OI <strong>{selectedAsset.openInterest}</strong>
            </span>
            <span className="chart-hint">Scroll: zoom | Drag: pan | Opt+R: latest</span>
          </div>
          <div className="chart-stage">
            <div ref={chartContainerRef} className="tv-chart" aria-label="trading chart" />
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
              </button>
            ))}
          </nav>

          {panelExpanded ? (
            <div className="panel-content">
              {activePanelTab === "active" ? (
                <div className="tab-view active-tab">
                  <div className="watchlist-head">
                    <div>
                      <h2>Active Trade</h2>
                      <p>Current open position</p>
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
                      <p>No active trade data yet.</p>
                    </div>
                  )}
                </div>
              ) : null}

              {activePanelTab === "assets" ? (
                <div className="tab-view">
                  <div className="watchlist-head">
                    <div>
                      <h2>Assets</h2>
                      <p>Perpetual Contracts</p>
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
                          onClick={() => setSelectedSymbol(row.symbol)}
                        >
                          <span className="symbol-col">
                            <span>{row.symbol}</span>
                            <small>{row.name}</small>
                          </span>

                          <span className="num-col">{formatPrice(row.lastPrice)}</span>
                          <span className={`num-col ${row.change >= 0 ? "up" : "down"}`}>
                            {row.change >= 0 ? "+" : ""}
                            {row.change.toFixed(2)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {activePanelTab === "history" ? (
                <div className="tab-view">
                  <div className="watchlist-head with-action">
                    <div>
                      <h2>History</h2>
                      <p>Simulated trade outcomes</p>
                    </div>
                    <button
                      type="button"
                      className="panel-action-btn"
                      onClick={() => setShowAllHistory((current) => !current)}
                    >
                      {showAllHistory ? "Show Less" : "Show All"}
                    </button>
                  </div>
                  <ul className="history-list">
                    {displayedHistoryRows.map((item) => (
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
                          }}
                        >
                          <span className="history-info">
                            <span className="history-main">
                              <span
                                className={`history-action ${
                                  item.result === "Loss" ? "down" : "up"
                                }`}
                              >
                                {item.result}
                              </span>
                              <span className="history-symbol">{item.symbol}</span>
                            </span>
                            <span className="history-levels">
                              Entry {formatPrice(item.entryPrice)} | TP {formatPrice(item.targetPrice)} | SL{" "}
                              {formatPrice(item.stopPrice)}
                            </span>
                          </span>
                          <span className="history-meta">
                            <span className={item.result === "Loss" ? "down" : "up"}>
                              {item.pnl}
                            </span>
                            <span>{item.time}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {activePanelTab === "actions" ? (
                <div className="tab-view">
                  <div className="watchlist-head">
                    <div>
                      <h2>Action</h2>
                      <p>Entry, SL, TP, and exits</p>
                    </div>
                  </div>
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

      <footer className="statusbar">
        <span>{selectedAsset.symbol}</span>
        <span>{selectedTimeframe}</span>
        <span>Feed: simulated</span>
        <span>UTC</span>
      </footer>
    </main>
  );
}
