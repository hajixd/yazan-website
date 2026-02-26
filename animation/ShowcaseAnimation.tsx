"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import styles from "./showcase.module.css";

type PanelTab = "active" | "assets" | "history" | "actions";
type TradeSide = "Long" | "Short";
type TradeResult = "Win" | "Loss";
type AnimationPhase =
  | "typing"
  | "history_show_all"
  | "history_focus"
  | "active_switch"
  | "active_chart";

type Candle = {
  open: number;
  close: number;
  high: number;
  low: number;
};

type OverlayTrade = {
  id: string;
  side: TradeSide;
  status: "closed" | "pending";
  result: TradeResult;
  entryIndex: number;
  exitIndex: number;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  outcomePrice: number;
  pnlUsd: number;
  pnlPct: number;
};

const urlTarget = "yazan.trade";

const tabs: Array<{ id: PanelTab; label: string }> = [
  { id: "active", label: "Active" },
  { id: "assets", label: "Assets" },
  { id: "history", label: "History" },
  { id: "actions", label: "Action" }
];

const createCandles = (): Candle[] => {
  const count = 56;
  const series: Candle[] = [];
  let close = 64210;

  for (let i = 0; i < count; i += 1) {
    const waveFast = Math.sin(i / 3.4) * 22;
    const waveSlow = Math.sin(i / 8.4) * 34;
    const trend = (i - count * 0.45) * 0.82;
    const open = close;
    close = open + waveFast * 0.34 + waveSlow * 0.2 + trend * 0.06;

    const wick = 18 + Math.abs(Math.cos(i / 4.6)) * 21;
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick;

    series.push({ open, close, high, low });
  }

  return series;
};

const formatPrice = (value: number): string => {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
};

const formatSignedUsd = (value: number): string => {
  const abs = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return `${value >= 0 ? "+" : "-"}$${abs}`;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const toChartY = (price: number, min: number, max: number): number => {
  const top = 24;
  const bottom = 418;
  const ratio = (price - min) / Math.max(1, max - min);

  return bottom - ratio * (bottom - top);
};

const toChartX = (index: number): number => {
  return 34 + index * 15;
};

const tabIcon = (id: PanelTab) => {
  if (id === "active") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="2.1" fill="currentColor" />
      </svg>
    );
  }

  if (id === "assets") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 17l4-5 3 3 5-7 4 9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (id === "history") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M6 7v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7.5 16.5a7 7 0 1 0-1.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M7 6h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 12h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 18h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
};

const tradeOutcomeLabel = (trade: OverlayTrade): string => {
  const prefix = trade.status === "pending" ? "Pending" : trade.result === "Win" ? "✓" : "x";

  return `${prefix} ${formatSignedUsd(trade.pnlUsd)}`;
};

const tradeOutcomeColor = (trade: OverlayTrade): string => {
  if (trade.status === "pending") {
    return "#4c86ff";
  }

  return trade.result === "Win" ? "#1ec8a6" : "#ff4f6d";
};

export default function ShowcaseAnimation() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrame((current) => current + 1);
    }, 120);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const loopFrame = frame % 226;
  const typedCount = loopFrame < 36 ? Math.min(urlTarget.length, Math.floor(loopFrame / 2.6)) : urlTarget.length;
  const typedUrl = urlTarget.slice(0, typedCount);
  const showCaret = loopFrame < 38 && loopFrame % 2 === 0;

  const phase: AnimationPhase =
    loopFrame < 42
      ? "typing"
      : loopFrame < 96
        ? "history_show_all"
        : loopFrame < 146
          ? "history_focus"
          : loopFrame < 178
            ? "active_switch"
            : "active_chart";

  const candles = useMemo(() => {
    return createCandles();
  }, []);

  const minPrice = useMemo(() => {
    return Math.min(...candles.map((item) => item.low));
  }, [candles]);

  const maxPrice = useMemo(() => {
    return Math.max(...candles.map((item) => item.high));
  }, [candles]);

  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2] ?? latest;
  const quoteChange = previous.close > 0 ? ((latest.close - previous.close) / previous.close) * 100 : 0;

  const closedTrades = useMemo<OverlayTrade[]>(() => {
    const createTrade = (
      id: string,
      side: TradeSide,
      result: TradeResult,
      entryIndex: number,
      exitIndex: number,
      units: number
    ): OverlayTrade => {
      const entryPrice = candles[entryIndex].close;
      const risk = Math.max(58, Math.abs(candles[entryIndex].high - candles[entryIndex].low) * 1.05);
      const targetPrice =
        side === "Long" ? entryPrice + risk * 1.5 : Math.max(0.000001, entryPrice - risk * 1.5);
      const stopPrice = side === "Long" ? entryPrice - risk : entryPrice + risk;
      const outcomePrice = result === "Win" ? targetPrice : stopPrice;
      const pnlUsd =
        side === "Long"
          ? (outcomePrice - entryPrice) * units
          : (entryPrice - outcomePrice) * units;
      const pnlPct =
        side === "Long"
          ? ((outcomePrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - outcomePrice) / entryPrice) * 100;

      return {
        id,
        side,
        status: "closed",
        result,
        entryIndex,
        exitIndex,
        entryPrice,
        targetPrice,
        stopPrice,
        outcomePrice,
        pnlUsd,
        pnlPct
      };
    };

    return [
      createTrade("h1", "Long", "Win", 14, 28, 0.86),
      createTrade("h2", "Short", "Loss", 22, 33, 0.64),
      createTrade("h3", "Long", "Win", 35, 46, 0.74)
    ];
  }, [candles]);

  const pendingTrade = useMemo<OverlayTrade>(() => {
    const entryIndex = 36;
    const exitIndex = 49;
    const side: TradeSide = "Long";
    const entryPrice = candles[entryIndex].close;
    const risk = Math.max(56, Math.abs(candles[entryIndex].high - candles[entryIndex].low));
    const targetPrice = entryPrice + risk * 1.85;
    const stopPrice = entryPrice - risk;
    const outcomePrice = candles[exitIndex].close;
    const units = 0.71;
    const pnlUsd = (outcomePrice - entryPrice) * units;
    const pnlPct = ((outcomePrice - entryPrice) / entryPrice) * 100;

    return {
      id: "active",
      side,
      status: "pending",
      result: pnlUsd >= 0 ? "Win" : "Loss",
      entryIndex,
      exitIndex,
      entryPrice,
      targetPrice,
      stopPrice,
      outcomePrice,
      pnlUsd,
      pnlPct
    };
  }, [candles]);

  const chartLine = useMemo(() => {
    return candles
      .map((candle, index) => {
        const x = toChartX(index);
        const y = toChartY(candle.close, minPrice, maxPrice);

        return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [candles, maxPrice, minPrice]);

  const chartMode: "none" | "all" | "single" | "pending" =
    phase === "typing"
      ? "none"
      : phase === "history_show_all"
        ? loopFrame >= 58
          ? "all"
          : "none"
        : phase === "history_focus" || phase === "active_switch"
          ? "single"
          : "pending";

  const activeTab: PanelTab =
    phase === "active_chart" || (phase === "active_switch" && loopFrame >= 162)
      ? "active"
      : "history";

  const showAllActive = phase === "history_show_all" || phase === "history_focus";
  const showActiveOnChart = phase === "active_chart";

  const focusedTrade = closedTrades[0];
  const visibleTrade = chartMode === "pending" ? pendingTrade : focusedTrade;

  const progress = clamp(
    ((pendingTrade.outcomePrice - pendingTrade.stopPrice) /
      Math.max(0.000001, pendingTrade.targetPrice - pendingTrade.stopPrice)) *
      100,
    0,
    100
  );

  const cursor = useMemo(() => {
    if (phase === "typing") {
      return { x: 45 + typedCount * 1.1, y: 8.6 };
    }

    if (phase === "history_show_all") {
      return { x: 84.8, y: 57.8 };
    }

    if (phase === "history_focus") {
      return { x: 79, y: 70.8 };
    }

    if (phase === "active_switch" && loopFrame < 162) {
      return { x: 95.7, y: 24.2 };
    }

    return { x: 84.8, y: 37.4 };
  }, [loopFrame, phase, typedCount]);

  const clickPulse =
    (phase === "typing" && loopFrame >= 33 && loopFrame <= 35) ||
    (phase === "history_show_all" && loopFrame >= 58 && loopFrame <= 60) ||
    (phase === "history_focus" && loopFrame >= 114 && loopFrame <= 116) ||
    (phase === "active_switch" && loopFrame >= 161 && loopFrame <= 163) ||
    (phase === "active_chart" && loopFrame >= 178 && loopFrame <= 180);

  const sceneLabel =
    phase === "typing"
      ? "Typing yazan.trade"
      : phase === "history_show_all"
        ? "Clicking Show All On Chart in History"
        : phase === "history_focus"
          ? "Selecting a trade to inspect TP/SL zones"
          : phase === "active_switch"
            ? "Switching to the Active tab"
            : "Applying the active trade visualization";

  return (
    <section className={styles.stage}>
      <motion.div
        className={styles.glowOne}
        animate={{ x: [0, 40, -22, 0], y: [0, 12, -10, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={styles.glowTwo}
        animate={{ x: [0, -34, 16, 0], y: [0, -14, 10, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className={styles.shell}>
        <div className={styles.operator}>
          <p className={styles.kicker}>Operator View</p>
          <h1>yazan.trade Product Reel</h1>
          <p className={styles.copy}>
            Static market chart, realistic cursor actions, and tab transitions that demonstrate
            history overlays and the active-trade workflow.
          </p>

          <div className={styles.operatorRig}>
            <div className={styles.avatarWrap}>
              <motion.div
                className={styles.head}
                animate={{ y: [0, -2, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className={styles.body} />
              <motion.div
                className={styles.armLeft}
                animate={{ rotate: [8, 2, 9] }}
                transition={{ duration: 0.55, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className={styles.armRight}
                animate={{ rotate: [-8, -2, -10] }}
                transition={{ duration: 0.62, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>

            <div className={styles.keyboard}>
              {Array.from({ length: 18 }).map((_, index) => (
                <motion.span
                  key={`key-${index}`}
                  className={styles.key}
                  animate={{ opacity: [0.28, 0.9, 0.28], y: [0, -1.4, 0] }}
                  transition={{
                    duration: 0.54,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: (index % 6) * 0.06
                  }}
                />
              ))}
            </div>
          </div>

          <div className={styles.sceneLabel}>{sceneLabel}</div>
        </div>

        <motion.div
          className={styles.browser}
          animate={{ rotateX: phase === "typing" ? -3 : -1.5, y: phase === "history_focus" ? -2 : 0, scale: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <div className={styles.browserTop}>
            <div className={styles.controls}>
              <span />
              <span />
              <span />
            </div>

            <div className={styles.addressBar}>
              <span className={styles.addressPrefix}>https://</span>
              <span className={styles.addressText}>{typedUrl}</span>
              <span className={styles.caret}>{showCaret ? "|" : " "}</span>
            </div>

            <div className={styles.brand}>yazan.trade</div>
          </div>

          <div className={styles.workspace}>
            <div className={styles.chartCol}>
              <div className={styles.chartToolbar}>
                <span>O {formatPrice(latest.open)}</span>
                <span>H {formatPrice(latest.high)}</span>
                <span>L {formatPrice(latest.low)}</span>
                <span>C {formatPrice(latest.close)}</span>
                <span className={quoteChange >= 0 ? styles.up : styles.down}>
                  {quoteChange >= 0 ? "+" : ""}
                  {quoteChange.toFixed(2)}%
                </span>
              </div>

              <div className={styles.chartViewport}>
                <svg
                  className={styles.chartSvg}
                  viewBox="0 0 880 440"
                  preserveAspectRatio="none"
                  aria-label="trade animation chart"
                >
                  <defs>
                    <linearGradient id="zoneUp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(30, 200, 166, 0.22)" />
                      <stop offset="100%" stopColor="rgba(30, 200, 166, 0.02)" />
                    </linearGradient>
                    <linearGradient id="zoneDown" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(255, 79, 109, 0.24)" />
                      <stop offset="100%" stopColor="rgba(255, 79, 109, 0.03)" />
                    </linearGradient>
                  </defs>

                  {Array.from({ length: 8 }).map((_, index) => (
                    <line
                      key={`gh-${index}`}
                      x1={24}
                      x2={856}
                      y1={30 + index * 52}
                      y2={30 + index * 52}
                      stroke="rgba(23, 37, 60, 0.38)"
                      strokeWidth={1}
                    />
                  ))}

                  {Array.from({ length: 11 }).map((_, index) => (
                    <line
                      key={`gv-${index}`}
                      y1={24}
                      y2={420}
                      x1={34 + index * 76}
                      x2={34 + index * 76}
                      stroke="rgba(18, 31, 50, 0.36)"
                      strokeWidth={1}
                    />
                  ))}

                  {candles.map((candle, index) => {
                    const x = toChartX(index);
                    const openY = toChartY(candle.open, minPrice, maxPrice);
                    const closeY = toChartY(candle.close, minPrice, maxPrice);
                    const highY = toChartY(candle.high, minPrice, maxPrice);
                    const lowY = toChartY(candle.low, minPrice, maxPrice);
                    const bodyTop = Math.min(openY, closeY);
                    const bodyHeight = Math.max(2, Math.abs(closeY - openY));
                    const isUp = candle.close >= candle.open;

                    return (
                      <g key={`candle-${index}`}>
                        <line
                          x1={x}
                          x2={x}
                          y1={highY}
                          y2={lowY}
                          stroke={isUp ? "#1ec8a6" : "#ff4f6d"}
                          strokeWidth={1.2}
                        />
                        <rect
                          x={x - 3.8}
                          y={bodyTop}
                          width={7.6}
                          height={bodyHeight}
                          fill={isUp ? "#1ec8a6" : "#ff4f6d"}
                          rx={1.1}
                        />
                      </g>
                    );
                  })}

                  <path d={chartLine} fill="none" stroke="rgba(218, 228, 245, 0.34)" strokeWidth={1.15} />

                  {chartMode === "all" ? (
                    <g>
                      {closedTrades.map((trade) => {
                        const entryX = toChartX(trade.entryIndex);
                        const exitX = toChartX(trade.exitIndex);
                        const entryY = toChartY(trade.entryPrice, minPrice, maxPrice);
                        const exitY = toChartY(trade.outcomePrice, minPrice, maxPrice);
                        const isLong = trade.side === "Long";
                        const exitTextY = trade.result === "Win" ? exitY - 8 : exitY + 14;

                        return (
                          <g key={trade.id}>
                            <path
                              d={`M ${entryX} ${entryY + (isLong ? 18 : -18)} L ${entryX - 6} ${entryY + (isLong ? 28 : -28)} L ${entryX + 6} ${entryY + (isLong ? 28 : -28)} Z`}
                              fill={isLong ? "#1ec8a6" : "#ff4f6d"}
                            />
                            <text
                              x={entryX}
                              y={entryY + (isLong ? 46 : -34)}
                              textAnchor="middle"
                              fontSize="8"
                              fill={isLong ? "#1ec8a6" : "#ff4f6d"}
                              fontFamily="IBM Plex Mono, Menlo, Monaco, monospace"
                            >
                              {isLong ? "Buy" : "Sell"}
                            </text>

                            <text
                              x={Math.min(exitX + 8, 795)}
                              y={exitTextY}
                              fontSize="8.2"
                              fill={trade.result === "Win" ? "#1ec8a6" : "#ff4f6d"}
                              fontFamily="IBM Plex Mono, Menlo, Monaco, monospace"
                            >
                              {tradeOutcomeLabel(trade)}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  ) : null}

                  {chartMode === "single" || chartMode === "pending" ? (
                    <g>
                      <rect
                        x={toChartX(visibleTrade.entryIndex)}
                        y={toChartY(visibleTrade.targetPrice, minPrice, maxPrice)}
                        width={(visibleTrade.exitIndex - visibleTrade.entryIndex) * 15}
                        height={Math.abs(
                          toChartY(visibleTrade.entryPrice, minPrice, maxPrice) -
                            toChartY(visibleTrade.targetPrice, minPrice, maxPrice)
                        )}
                        fill="url(#zoneUp)"
                      />
                      <rect
                        x={toChartX(visibleTrade.entryIndex)}
                        y={Math.min(
                          toChartY(visibleTrade.entryPrice, minPrice, maxPrice),
                          toChartY(visibleTrade.stopPrice, minPrice, maxPrice)
                        )}
                        width={(visibleTrade.exitIndex - visibleTrade.entryIndex) * 15}
                        height={Math.abs(
                          toChartY(visibleTrade.stopPrice, minPrice, maxPrice) -
                            toChartY(visibleTrade.entryPrice, minPrice, maxPrice)
                        )}
                        fill="url(#zoneDown)"
                      />

                      <line
                        x1={toChartX(visibleTrade.entryIndex)}
                        x2={toChartX(visibleTrade.exitIndex)}
                        y1={toChartY(visibleTrade.entryPrice, minPrice, maxPrice)}
                        y2={toChartY(visibleTrade.outcomePrice, minPrice, maxPrice)}
                        stroke="rgba(226, 236, 252, 0.82)"
                        strokeWidth={2.1}
                        strokeDasharray="4 6"
                      />

                      <path
                        d={`M ${toChartX(visibleTrade.entryIndex)} ${toChartY(visibleTrade.entryPrice, minPrice, maxPrice) + 18} L ${toChartX(visibleTrade.entryIndex) - 7} ${toChartY(visibleTrade.entryPrice, minPrice, maxPrice) + 30} L ${toChartX(visibleTrade.entryIndex) + 7} ${toChartY(visibleTrade.entryPrice, minPrice, maxPrice) + 30} Z`}
                        fill={visibleTrade.side === "Long" ? "#1ec8a6" : "#ff4f6d"}
                      />

                      <text
                        x={toChartX(visibleTrade.entryIndex)}
                        y={toChartY(visibleTrade.entryPrice, minPrice, maxPrice) + 44}
                        textAnchor="middle"
                        fontSize="8"
                        fill={visibleTrade.side === "Long" ? "#1ec8a6" : "#ff4f6d"}
                        fontFamily="IBM Plex Mono, Menlo, Monaco, monospace"
                      >
                        {visibleTrade.side === "Long" ? "Buy" : "Sell"}
                      </text>

                      <rect
                        x={Math.min(toChartX(visibleTrade.exitIndex) + 6, 705)}
                        y={toChartY(visibleTrade.outcomePrice, minPrice, maxPrice) - 18}
                        width={145}
                        height={18}
                        rx={5}
                        fill="rgba(8, 18, 33, 0.84)"
                        stroke={tradeOutcomeColor(visibleTrade)}
                        strokeWidth={1}
                      />
                      <text
                        x={Math.min(toChartX(visibleTrade.exitIndex) + 12, 711)}
                        y={toChartY(visibleTrade.outcomePrice, minPrice, maxPrice) - 6}
                        fontSize="8"
                        fill={tradeOutcomeColor(visibleTrade)}
                        fontFamily="IBM Plex Mono, Menlo, Monaco, monospace"
                      >
                        {tradeOutcomeLabel(visibleTrade)}
                      </text>
                    </g>
                  ) : null}
                </svg>
              </div>
            </div>

            <div className={styles.panelCol}>
              <div className={styles.panelBody}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -7 }}
                    transition={{ duration: 0.22 }}
                  >
                    {activeTab === "active" ? (
                      <>
                        <h3>Active Trade</h3>
                        <p>Open trade with live TP/SL workflow</p>
                        <button
                          type="button"
                          className={`${styles.panelButton} ${showActiveOnChart ? styles.panelButtonActive : ""}`}
                        >
                          Show On Chart
                        </button>
                        <div className={styles.metricGrid}>
                          <div className={styles.metric}>
                            <span>Entry</span>
                            <strong>{formatPrice(pendingTrade.entryPrice)}</strong>
                          </div>
                          <div className={styles.metric}>
                            <span>Mark</span>
                            <strong>{formatPrice(pendingTrade.outcomePrice)}</strong>
                          </div>
                          <div className={styles.metric}>
                            <span>TP</span>
                            <strong className={styles.up}>{formatPrice(pendingTrade.targetPrice)}</strong>
                          </div>
                          <div className={styles.metric}>
                            <span>SL</span>
                            <strong className={styles.down}>{formatPrice(pendingTrade.stopPrice)}</strong>
                          </div>
                          <div className={styles.metric}>
                            <span>PnL $</span>
                            <strong className={pendingTrade.pnlUsd >= 0 ? styles.up : styles.down}>
                              {formatSignedUsd(pendingTrade.pnlUsd)}
                            </strong>
                          </div>
                          <div className={styles.metric}>
                            <span>PnL %</span>
                            <strong className={pendingTrade.pnlPct >= 0 ? styles.up : styles.down}>
                              {pendingTrade.pnlPct >= 0 ? "+" : ""}
                              {pendingTrade.pnlPct.toFixed(2)}%
                            </strong>
                          </div>
                        </div>
                        <div className={styles.progressBlock}>
                          <div className={styles.progressHead}>
                            <span>Progress To TP</span>
                            <span>{progress.toFixed(1)}%</span>
                          </div>
                          <div className={styles.progressTrack}>
                            <motion.div
                              className={styles.progressFill}
                              animate={{ width: `${progress}%` }}
                              transition={{ duration: 0.5, ease: "easeOut" }}
                            />
                          </div>
                        </div>
                      </>
                    ) : null}

                    {activeTab === "history" ? (
                      <>
                        <h3>History</h3>
                        <p>Closed trades and chart outcomes</p>
                        <button
                          type="button"
                          className={`${styles.panelButton} ${showAllActive ? styles.panelButtonActive : ""}`}
                        >
                          Show All On Chart
                        </button>
                        <ul className={styles.simpleList}>
                          {closedTrades.map((trade, index) => {
                            const selected = chartMode === "single" && index === 0;

                            return (
                              <li
                                key={trade.id}
                                className={`${styles.historyRow} ${selected ? styles.historyRowSelected : ""}`}
                              >
                                <span>{trade.side === "Long" ? "Buy" : "Sell"} BTCUSDT.P</span>
                                <span className={trade.pnlUsd >= 0 ? styles.up : styles.down}>
                                  {formatSignedUsd(trade.pnlUsd)} ({trade.pnlPct >= 0 ? "+" : ""}
                                  {trade.pnlPct.toFixed(2)}%)
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className={styles.rail}>
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`${styles.railIcon} ${activeTab === tab.id ? styles.railIconActive : ""}`}
                  >
                    {tabIcon(tab.id)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <motion.div
            className={styles.cursor}
            animate={{ left: `${cursor.x}%`, top: `${cursor.y}%`, scale: clickPulse ? 0.93 : 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.35 }}
          >
            <svg className={styles.cursorArrow} viewBox="0 0 20 20" aria-hidden>
              <path d="M3 2l11.5 10.8-5.2.7-2.2 4.4L3 2z" fill="currentColor" />
            </svg>
            {clickPulse ? (
              <motion.span
                className={styles.clickRipple}
                initial={{ opacity: 0.55, scale: 0.25 }}
                animate={{ opacity: 0, scale: 1.9 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
            ) : null}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
