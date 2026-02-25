"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";

type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";

type FutureAsset = {
  symbol: string;
  name: string;
  basePrice: number;
  volume: string;
  openInterest: string;
  funding: string;
};

type Candle = {
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  time: number;
};

type HoverState = {
  x: number;
  y: number;
  index: number;
  height: number;
};

const futuresAssets: FutureAsset[] = [
  {
    symbol: "BTCUSDT.P",
    name: "Bitcoin Perpetual",
    basePrice: 64238.7,
    volume: "7.8B",
    openInterest: "20.4B",
    funding: "+0.012%"
  },
  {
    symbol: "ETHUSDT.P",
    name: "Ethereum Perpetual",
    basePrice: 3421.85,
    volume: "4.2B",
    openInterest: "10.1B",
    funding: "+0.009%"
  },
  {
    symbol: "SOLUSDT.P",
    name: "Solana Perpetual",
    basePrice: 187.54,
    volume: "1.6B",
    openInterest: "2.8B",
    funding: "-0.004%"
  },
  {
    symbol: "XRPUSDT.P",
    name: "XRP Perpetual",
    basePrice: 0.6943,
    volume: "1.1B",
    openInterest: "1.9B",
    funding: "+0.003%"
  },
  {
    symbol: "BNBUSDT.P",
    name: "BNB Perpetual",
    basePrice: 585.19,
    volume: "760M",
    openInterest: "1.3B",
    funding: "-0.001%"
  },
  {
    symbol: "DOGEUSDT.P",
    name: "Dogecoin Perpetual",
    basePrice: 0.1921,
    volume: "950M",
    openInterest: "1.4B",
    funding: "+0.015%"
  },
  {
    symbol: "AVAXUSDT.P",
    name: "Avalanche Perpetual",
    basePrice: 42.16,
    volume: "480M",
    openInterest: "780M",
    funding: "-0.008%"
  },
  {
    symbol: "LINKUSDT.P",
    name: "Chainlink Perpetual",
    basePrice: 19.84,
    volume: "420M",
    openInterest: "640M",
    funding: "+0.006%"
  },
  {
    symbol: "ADAUSDT.P",
    name: "Cardano Perpetual",
    basePrice: 0.7862,
    volume: "390M",
    openInterest: "590M",
    funding: "-0.002%"
  },
  {
    symbol: "SUIUSDT.P",
    name: "Sui Perpetual",
    basePrice: 1.79,
    volume: "280M",
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
  "1m": 140,
  "5m": 125,
  "15m": 110,
  "1H": 95,
  "4H": 84,
  "1D": 72,
  "1W": 60
};

const REFERENCE_TS = Date.UTC(2026, 1, 25, 0, 0, 0);

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value));
};

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

const formatTimeLabel = (timestamp: number, timeframe: Timeframe): string => {
  const d = new Date(timestamp);
  const hour = d.getUTCHours().toString().padStart(2, "0");
  const minute = d.getUTCMinutes().toString().padStart(2, "0");

  if (timeframe === "1D" || timeframe === "1W") {
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    });
  }

  if (timeframe === "1H" || timeframe === "4H") {
    return `${d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    })} ${hour}:00`;
  }

  return `${hour}:${minute}`;
};

const generateFakeCandles = (
  basePrice: number,
  symbol: string,
  timeframe: Timeframe,
  count = 320
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
    const wave = Math.sin(i / 12 + phaseA) * volatility * 1.2;
    const secondaryWave = Math.cos(i / 25 + phaseB) * volatility * 0.7;
    const noise = (rand() - 0.5) * volatility * 1.8;
    const drift = wave + secondaryWave + noise;

    close = Math.max(0.000001, open * (1 + drift));

    const wickUp = 1 + rand() * volatility * 0.9;
    const wickDown = 1 - rand() * volatility * 0.9;
    const high = Math.max(open, close) * wickUp;
    const low = Math.max(0.000001, Math.min(open, close) * wickDown);
    const bodyRatio = Math.abs(close - open) / Math.max(open, 0.000001);
    const volume = (40 + rand() * 110) * (1 + bodyRatio * 75);

    series.push({
      open,
      close,
      high,
      low,
      volume,
      time: startTime + i * timeframeMs
    });
  }

  return series;
};

const getAssetBySymbol = (symbol: string) => {
  return futuresAssets.find((asset) => asset.symbol === symbol) ?? futuresAssets[0];
};

export default function Home() {
  const [selectedSymbol, setSelectedSymbol] = useState(futuresAssets[0].symbol);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("15m");
  const [seriesMap, setSeriesMap] = useState<Record<string, Candle[]>>(() => {
    const initial: Record<string, Candle[]> = {};

    for (const asset of futuresAssets) {
      const key = symbolTimeframeKey(asset.symbol, "15m");
      initial[key] = generateFakeCandles(asset.basePrice, asset.symbol, "15m");
    }

    return initial;
  });
  const [visibleCount, setVisibleCount] = useState(timeframeVisibleCount["15m"]);
  const [panOffset, setPanOffset] = useState(0);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const dragRef = useRef({
    isDragging: false,
    pointerId: -1,
    startX: 0,
    startOffset: 0
  });
  const liveStepRef = useRef(0);

  const selectedAsset = useMemo(() => {
    return getAssetBySymbol(selectedSymbol);
  }, [selectedSymbol]);

  useEffect(() => {
    setSeriesMap((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const asset of futuresAssets) {
        const key = symbolTimeframeKey(asset.symbol, selectedTimeframe);

        if (!next[key]) {
          next[key] = generateFakeCandles(asset.basePrice, asset.symbol, selectedTimeframe);
          changed = true;
        }
      }

      return changed ? next : prev;
    });

    setVisibleCount(timeframeVisibleCount[selectedTimeframe]);
    setPanOffset(0);
    setHoverState(null);
  }, [selectedTimeframe]);

  useEffect(() => {
    const key = symbolTimeframeKey(selectedAsset.symbol, selectedTimeframe);

    setSeriesMap((prev) => {
      if (prev[key]) {
        return prev;
      }

      return {
        ...prev,
        [key]: generateFakeCandles(
          selectedAsset.basePrice,
          selectedAsset.symbol,
          selectedTimeframe
        )
      };
    });

    setPanOffset(0);
    setHoverState(null);
  }, [selectedAsset.basePrice, selectedAsset.symbol, selectedTimeframe]);

  useEffect(() => {
    const key = symbolTimeframeKey(selectedAsset.symbol, selectedTimeframe);

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

        liveStepRef.current += 1;

        if (liveStepRef.current % 5 === 0) {
          const open = last.close;
          const close = Math.max(0.000001, open * (1 + drift));
          const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.8);
          const low = Math.max(
            0.000001,
            Math.min(open, close) * (1 - Math.random() * volatility * 0.8)
          );
          const volume = Math.max(10, last.volume * (0.75 + Math.random() * 0.9));

          nextSeries.push({
            open,
            close,
            high,
            low,
            volume,
            time: last.time + timeframeMinutes[selectedTimeframe] * 60_000
          });

          if (nextSeries.length > 360) {
            nextSeries.shift();
          }
        } else {
          const close = Math.max(0.000001, last.close * (1 + drift * 0.7));
          last.close = close;
          last.high = Math.max(last.high, close, last.open);
          last.low = Math.max(0.000001, Math.min(last.low, close, last.open));
          last.volume = last.volume * (1 + Math.random() * 0.12);
          nextSeries[nextSeries.length - 1] = last;
        }

        return {
          ...prev,
          [key]: nextSeries
        };
      });
    }, 1400);

    return () => {
      window.clearInterval(timer);
    };
  }, [selectedAsset.symbol, selectedTimeframe]);

  const selectedKey = symbolTimeframeKey(selectedAsset.symbol, selectedTimeframe);
  const fallbackCandles = useMemo(() => {
    return generateFakeCandles(selectedAsset.basePrice, selectedAsset.symbol, selectedTimeframe);
  }, [selectedAsset.basePrice, selectedAsset.symbol, selectedTimeframe]);

  const candles = seriesMap[selectedKey] ?? fallbackCandles;
  const boundedVisibleCount = clamp(visibleCount, 24, Math.max(24, candles.length));
  const maxPanOffset = Math.max(0, candles.length - boundedVisibleCount);
  const safePanOffset = clamp(panOffset, 0, maxPanOffset);

  useEffect(() => {
    setPanOffset((prev) => clamp(prev, 0, maxPanOffset));
  }, [maxPanOffset]);

  const start = Math.max(0, candles.length - boundedVisibleCount - safePanOffset);
  const visibleCandles = candles.slice(start, start + boundedVisibleCount);
  const slotWidth = 100 / Math.max(visibleCandles.length, 1);
  const candleWidthPx = Math.max(3, Math.min(8, 560 / Math.max(visibleCandles.length, 1)));

  const visibleMaxPrice = Math.max(...visibleCandles.map((candle) => candle.high));
  const visibleMinPrice = Math.min(...visibleCandles.map((candle) => candle.low));
  const rawRange = Math.max(visibleMaxPrice - visibleMinPrice, visibleMaxPrice * 0.002);
  const padding = Math.max(rawRange * 0.15, visibleMaxPrice * 0.001);
  const chartMax = visibleMaxPrice + padding;
  const chartMin = Math.max(0.000001, visibleMinPrice - padding);
  const chartRange = Math.max(chartMax - chartMin, 0.000001);
  const maxVolume = Math.max(...visibleCandles.map((candle) => candle.volume), 1);

  const yAxisLevels = Array.from({ length: 8 }, (_, index) => {
    return chartMax - ((chartMax - chartMin) * index) / 7;
  });

  const xAxisTicks = useMemo(() => {
    const ticks: Array<{ left: number; label: string }> = [];
    const count = visibleCandles.length;

    if (count === 0) {
      return ticks;
    }

    const step = Math.max(1, Math.floor(count / 7));

    for (let i = 0; i < count; i += step) {
      ticks.push({
        left: ((i + 0.5) / count) * 100,
        label: formatTimeLabel(visibleCandles[i].time, selectedTimeframe)
      });
    }

    const lastIndex = count - 1;
    const lastLeft = ((lastIndex + 0.5) / count) * 100;

    if (ticks[ticks.length - 1]?.left !== lastLeft) {
      ticks.push({
        left: lastLeft,
        label: formatTimeLabel(visibleCandles[lastIndex].time, selectedTimeframe)
      });
    }

    return ticks;
  }, [selectedTimeframe, visibleCandles]);

  const hoveredCandle =
    hoverState && visibleCandles[hoverState.index]
      ? visibleCandles[hoverState.index]
      : visibleCandles[visibleCandles.length - 1];

  const hoverPrice =
    hoverState && hoverState.height > 0
      ? chartMax - (hoverState.y / hoverState.height) * chartRange
      : null;

  const hoveredChangePct =
    hoveredCandle && hoveredCandle.open > 0
      ? ((hoveredCandle.close - hoveredCandle.open) / hoveredCandle.open) * 100
      : 0;

  const latestCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2] ?? latestCandle;
  const quoteChangePct =
    prevCandle && prevCandle.close > 0
      ? ((latestCandle.close - prevCandle.close) / prevCandle.close) * 100
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

  const handlePlotPointerMove = (event: ReactPointerEvent<HTMLDivElement>, allowPan: boolean) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = clamp(event.clientX - rect.left, 0, rect.width);
    const localY = clamp(event.clientY - rect.top, 0, rect.height);
    const index = clamp(
      Math.floor((localX / Math.max(rect.width, 1)) * visibleCandles.length),
      0,
      Math.max(visibleCandles.length - 1, 0)
    );

    if (allowPan && dragRef.current.isDragging && dragRef.current.pointerId === event.pointerId) {
      const pixelPerCandle = Math.max(rect.width / Math.max(visibleCandles.length, 1), 2);
      const shift = Math.round((event.clientX - dragRef.current.startX) / pixelPerCandle);
      const nextOffset = clamp(dragRef.current.startOffset + shift, 0, maxPanOffset);
      setPanOffset(nextOffset);
    }

    setHoverState({
      x: localX,
      y: localY,
      index,
      height: rect.height
    });
  };

  return (
    <main className="terminal">
      <header className="topbar">
        <div className="brand-area">
          <div className="brand-mark">TV</div>
          <div className="asset-meta">
            <h1>{selectedAsset.symbol}</h1>
            <p>{selectedAsset.name}</p>
          </div>
          <div className="live-quote">
            <span>${formatPrice(latestCandle.close)}</span>
            <span className={quoteChangePct >= 0 ? "up" : "down"}>
              {quoteChangePct >= 0 ? "+" : ""}
              {quoteChangePct.toFixed(2)}%
            </span>
          </div>
        </div>

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
      </header>

      <section className="workspace">
        <aside className="left-tools" aria-label="chart tools">
          {["+", "x", "T", "R", "L", "M", "P", "F"].map((tool, index) => (
            <button type="button" key={`${tool}-${index}`} className="tool-btn" title="Tool">
              {tool}
            </button>
          ))}
        </aside>

        <section className="chart-wrap">
          <div className="chart-toolbar">
            <span>
              O <strong>{formatPrice(hoveredCandle?.open ?? latestCandle.open)}</strong>
            </span>
            <span>
              H <strong>{formatPrice(hoveredCandle?.high ?? latestCandle.high)}</strong>
            </span>
            <span>
              L <strong>{formatPrice(hoveredCandle?.low ?? latestCandle.low)}</strong>
            </span>
            <span>
              C <strong>{formatPrice(hoveredCandle?.close ?? latestCandle.close)}</strong>
            </span>
            <span className={hoveredChangePct >= 0 ? "up" : "down"}>
              {hoveredChangePct >= 0 ? "+" : ""}
              {hoveredChangePct.toFixed(2)}%
            </span>
            <span>
              Funding <strong>{selectedAsset.funding}</strong>
            </span>
            <span>
              OI <strong>{selectedAsset.openInterest}</strong>
            </span>
            <span className="chart-hint">Drag: pan | Wheel: zoom</span>
          </div>

          <div className="chart-surface">
            <div className="plot-axis-wrap">
              <div
                className="plot"
                onWheel={(event) => {
                  event.preventDefault();
                  const direction = event.deltaY > 0 ? 1 : -1;

                  setVisibleCount((prev) => {
                    return clamp(prev + direction * 6, 24, 240);
                  });
                }}
                onPointerDown={(event) => {
                  dragRef.current = {
                    isDragging: true,
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startOffset: safePanOffset
                  };

                  event.currentTarget.setPointerCapture(event.pointerId);
                  handlePlotPointerMove(event, false);
                }}
                onPointerMove={(event) => {
                  handlePlotPointerMove(event, true);
                }}
                onPointerUp={(event) => {
                  if (dragRef.current.pointerId === event.pointerId) {
                    dragRef.current.isDragging = false;
                    dragRef.current.pointerId = -1;
                  }

                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerLeave={() => {
                  if (!dragRef.current.isDragging) {
                    setHoverState(null);
                  }
                }}
                onPointerCancel={() => {
                  dragRef.current.isDragging = false;
                  dragRef.current.pointerId = -1;
                }}
              >
                <div className="candles-layer">
                  {visibleCandles.map((candle, index) => {
                    const isUp = candle.close >= candle.open;
                    const highTop = ((chartMax - candle.high) / chartRange) * 100;
                    const lowTop = ((chartMax - candle.low) / chartRange) * 100;
                    const openTop = ((chartMax - candle.open) / chartRange) * 100;
                    const closeTop = ((chartMax - candle.close) / chartRange) * 100;
                    const bodyTop = Math.min(openTop, closeTop);
                    const bodyHeight = Math.max(1.2, Math.abs(closeTop - openTop));
                    const wickHeight = Math.max(1.2, lowTop - highTop);
                    const left = (index + 0.5) * slotWidth;

                    return (
                      <div
                        key={`${candle.time}-${index}`}
                        className={`candle ${isUp ? "up" : "down"}`}
                        style={{ left: `${left}%` }}
                      >
                        <span
                          className="wick"
                          style={{ top: `${highTop}%`, height: `${wickHeight}%` }}
                        />
                        <span
                          className="body"
                          style={{
                            top: `${bodyTop}%`,
                            height: `${bodyHeight}%`,
                            width: `${candleWidthPx}px`
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="volume-layer" aria-hidden>
                  {visibleCandles.map((candle, index) => {
                    const height = (candle.volume / maxVolume) * 100;
                    const isUp = candle.close >= candle.open;
                    const left = (index + 0.5) * slotWidth;

                    return (
                      <span
                        key={`volume-${candle.time}-${index}`}
                        className={`volume ${isUp ? "up" : "down"}`}
                        style={{
                          left: `${left}%`,
                          height: `${Math.max(3, height)}%`,
                          width: `${Math.max(2, candleWidthPx - 1)}px`
                        }}
                      />
                    );
                  })}
                </div>

                {hoverState && visibleCandles[hoverState.index] ? (
                  <>
                    <span className="crosshair-x" style={{ top: `${hoverState.y}px` }} />
                    <span className="crosshair-y" style={{ left: `${hoverState.x}px` }} />

                    {hoverPrice !== null ? (
                      <span className="crosshair-price" style={{ top: `${hoverState.y}px` }}>
                        {formatPrice(hoverPrice)}
                      </span>
                    ) : null}
                  </>
                ) : null}

                <div className="time-axis" aria-hidden>
                  {xAxisTicks.map((tick) => (
                    <span key={`${tick.left}-${tick.label}`} style={{ left: `${tick.left}%` }}>
                      {tick.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="price-axis" aria-hidden>
                {yAxisLevels.map((level, index) => (
                  <span key={`${level}-${index}`}>${formatPrice(level)}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="watchlist">
          <div className="watchlist-head">
            <h2>Futures</h2>
            <p>Perpetual Contracts</p>
          </div>

          <div className="watchlist-labels" aria-hidden>
            <span>Symbol</span>
            <span>Last</span>
            <span>Chg%</span>
            <span>Vol</span>
          </div>

          <ul className="watchlist-body">
            {watchlistRows.map((row) => (
              <li key={row.symbol}>
                <button
                  type="button"
                  className={`watchlist-row ${row.symbol === selectedSymbol ? "selected" : ""}`}
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
                  <span className="num-col">{row.volume}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <footer className="statusbar">
        <span>{selectedAsset.symbol}</span>
        <span>{selectedTimeframe}</span>
        <span>Fake feed: live</span>
        <span>Candles: {visibleCandles.length}</span>
        <span>UTC</span>
      </footer>
    </main>
  );
}
