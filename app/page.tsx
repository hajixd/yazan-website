"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
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
type PanelTab = "assets" | "history" | "ai";

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

type HistorySeed = {
  id: string;
  symbol: string;
  result: TradeResult;
  pnl: string;
  candleOffset: number;
};

type HistoryItem = {
  id: string;
  symbol: string;
  result: TradeResult;
  pnl: string;
  time: string;
  markerTime: UTCTimestamp;
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

const REFERENCE_TS = Date.UTC(2026, 1, 25, 0, 0, 0);

const sidebarTabs: Array<{ id: PanelTab; label: string }> = [
  { id: "assets", label: "Assets" },
  { id: "history", label: "History" },
  { id: "ai", label: "AI" }
];

const historySeeds: HistorySeed[] = [
  { id: "h1", symbol: "BTCUSDT.P", result: "Win", pnl: "+2.10%", candleOffset: 18 },
  { id: "h2", symbol: "ETHUSDT.P", result: "Loss", pnl: "-0.84%", candleOffset: 27 },
  { id: "h3", symbol: "SOLUSDT.P", result: "Win", pnl: "+1.35%", candleOffset: 33 },
  { id: "h4", symbol: "XRPUSDT.P", result: "Loss", pnl: "-0.48%", candleOffset: 41 },
  { id: "h5", symbol: "BNBUSDT.P", result: "Win", pnl: "+0.93%", candleOffset: 49 },
  { id: "h6", symbol: "DOGEUSDT.P", result: "Win", pnl: "+2.74%", candleOffset: 57 }
];

const symbolTimeframeKey = (symbol: string, timeframe: Timeframe) => {
  return `${symbol}__${timeframe}`;
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
  count = 340
): Candle[] => {
  const series: Candle[] = [];
  const timeframeMs = timeframeMinutes[timeframe] * 60_000;
  const volatility = timeframeVolatility[timeframe];
  const seed = hashString(`${symbol}-${timeframe}`);
  const rand = createSeededRng(seed);
  const phaseA = rand() * Math.PI;
  const phaseB = rand() * Math.PI;
  const startTime = REFERENCE_TS - count * timeframeMs;
  let close = basePrice * (0.95 + rand() * 0.08);

  for (let i = 0; i < count; i += 1) {
    const open = close;
    const wave = Math.sin(i / 11 + phaseA) * volatility * 1.15;
    const secondary = Math.cos(i / 24 + phaseB) * volatility * 0.7;
    const noise = (rand() - 0.5) * volatility * 1.75;
    const drift = wave + secondary + noise;

    close = Math.max(0.000001, open * (1 + drift));

    const high = Math.max(open, close) * (1 + rand() * volatility * 0.85);
    const low = Math.max(0.000001, Math.min(open, close) * (1 - rand() * volatility * 0.85));

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

const getAssetBySymbol = (symbol: string): FutureAsset => {
  return futuresAssets.find((asset) => asset.symbol === symbol) ?? futuresAssets[0];
};

const TabIcon = ({ tab }: { tab: PanelTab }) => {
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
  const [activePanelTab, setActivePanelTab] = useState<PanelTab>("assets");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
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
  const selectionRef = useRef<string>("");

  const selectedAsset = useMemo(() => {
    return getAssetBySymbol(selectedSymbol);
  }, [selectedSymbol]);

  const selectedKey = symbolTimeframeKey(selectedSymbol, selectedTimeframe);

  useEffect(() => {
    setSeriesMap((prev) => {
      if (prev[selectedKey]) {
        return prev;
      }

      return {
        ...prev,
        [selectedKey]: generateFakeCandles(
          selectedAsset.basePrice,
          selectedSymbol,
          selectedTimeframe
        )
      };
    });

    setHoveredTime(null);
  }, [selectedAsset.basePrice, selectedKey, selectedSymbol, selectedTimeframe]);

  useEffect(() => {
    const key = selectedKey;

    const timer = window.setInterval(() => {
      setSeriesMap((prev) => {
        const currentSeries = prev[key];

        if (!currentSeries || currentSeries.length < 2) {
          return prev;
        }

        const nextSeries = currentSeries.slice();
        const last = { ...nextSeries[nextSeries.length - 1] };
        const volatility = timeframeVolatility[selectedTimeframe];
        const drift = (Math.random() - 0.5) * volatility * 1.7;

        if (Math.random() > 0.72) {
          const open = last.close;
          const close = Math.max(0.000001, open * (1 + drift));
          const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.8);
          const low = Math.max(
            0.000001,
            Math.min(open, close) * (1 - Math.random() * volatility * 0.8)
          );

          nextSeries.push({
            open,
            close,
            high,
            low,
            time: last.time + timeframeMinutes[selectedTimeframe] * 60_000
          });

          if (nextSeries.length > 420) {
            nextSeries.shift();
          }
        } else {
          const close = Math.max(0.000001, last.close * (1 + drift * 0.7));
          last.close = close;
          last.high = Math.max(last.high, close, last.open);
          last.low = Math.max(0.000001, Math.min(last.low, close, last.open));
          nextSeries[nextSeries.length - 1] = last;
        }

        return {
          ...prev,
          [key]: nextSeries
        };
      });
    }, 1450);

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

  const historyRows = useMemo(() => {
    return historySeeds.map((seed) => {
      const asset = getAssetBySymbol(seed.symbol);
      const key = symbolTimeframeKey(seed.symbol, selectedTimeframe);
      const list =
        seriesMap[key] ?? generateFakeCandles(asset.basePrice, seed.symbol, selectedTimeframe);
      const index = Math.max(4, list.length - 1 - seed.candleOffset);
      const candle = list[index];

      return {
        id: seed.id,
        symbol: seed.symbol,
        result: seed.result,
        pnl: seed.pnl,
        markerTime: toUtcTimestamp(candle.time),
        time: new Date(candle.time).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "UTC"
        })
      } satisfies HistoryItem;
    });
  }, [selectedTimeframe, seriesMap]);

  const selectedHistoryTrade = useMemo(() => {
    if (!selectedHistoryId) {
      return null;
    }

    return historyRows.find((row) => row.id === selectedHistoryId) ?? null;
  }, [historyRows, selectedHistoryId]);

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

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
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

    if (!candleSeries) {
      return;
    }

    if (!selectedHistoryTrade || selectedHistoryTrade.symbol !== selectedSymbol) {
      candleSeries.setMarkers([]);
      return;
    }

    const markers: SeriesMarker<Time>[] = [
      {
        time: selectedHistoryTrade.markerTime,
        position: selectedHistoryTrade.result === "Win" ? "belowBar" : "aboveBar",
        shape: selectedHistoryTrade.result === "Win" ? "arrowUp" : "arrowDown",
        color: selectedHistoryTrade.result === "Win" ? "#1bae8a" : "#f0455a",
        text: `${selectedHistoryTrade.result} ${selectedHistoryTrade.pnl}`
      }
    ];

    candleSeries.setMarkers(markers);
  }, [selectedHistoryTrade, selectedSymbol, selectedTimeframe, selectedCandles]);

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
          <span className="site-tag">yazan.trades</span>
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
            <span className="chart-hint">Scroll: zoom | Drag: pan</span>
          </div>
          <div ref={chartContainerRef} className="tv-chart" aria-label="trading chart" />
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
                  <div className="watchlist-head">
                    <div>
                      <h2>History</h2>
                      <p>Simulated trade outcomes</p>
                    </div>
                  </div>
                  <ul className="history-list">
                    {historyRows.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`history-row ${
                            selectedHistoryId === item.id ? "selected" : ""
                          }`}
                          onClick={() => {
                            setSelectedHistoryId(item.id);
                            setSelectedSymbol(item.symbol);
                          }}
                        >
                          <span className="history-main">
                            <span
                              className={`history-action ${
                                item.result === "Loss" ? "down" : "up"
                              }`}
                            >
                              {item.result}
                            </span>
                            <span>{item.symbol}</span>
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
