"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState, useEffect } from "react";
import styles from "./showcase.module.css";

type PanelTab = "active" | "assets" | "history" | "actions";
type TradeSide = "Long" | "Short";
type TradeResult = "Win" | "Loss";

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

const assets = ["BTCUSDT.P", "ETHUSDT.P", "SOLUSDT.P", "XRPUSDT.P"];

const createCandles = (tick: number): Candle[] => {
  const count = 56;
  const series: Candle[] = [];
  let close = 64200 + Math.sin(tick / 4.8) * 120;

  for (let i = 0; i < count; i += 1) {
    const slope = Math.sin((tick + i) / 8) * 24;
    const impulse = ((tick + i) % 13 === 0 ? 1 : -1) * (8 + (i % 6));
    const drift = slope + impulse * 0.55;
    const open = close;
    close = open + drift;

    const wickRange = 14 + Math.abs(Math.sin((tick + i) / 3.2)) * 20;
    const high = Math.max(open, close) + wickRange;
    const low = Math.min(open, close) - wickRange;

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

const tradeMarkerText = (trade: OverlayTrade): string => {
  if (trade.status === "pending") {
    return ".";
  }

  return trade.result === "Win" ? "✓" : "x";
};

const tradeMarkerColor = (trade: OverlayTrade): string => {
  if (trade.status === "pending") {
    return "#2d6cff";
  }

  return trade.result === "Win" ? "#1ec8a6" : "#ff4f6d";
};

export default function ShowcaseAnimation() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrame((current) => current + 1);
    }, 110);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const loopFrame = frame % 182;
  const typedCount = Math.min(urlTarget.length, Math.floor(loopFrame / 3));
  const typedUrl = urlTarget.slice(0, typedCount);
  const showCaret = typedCount < urlTarget.length && loopFrame % 2 === 0;

  const phase: "typing" | "tabs" | "history" | "active" =
    loopFrame < 40 ? "typing" : loopFrame < 104 ? "tabs" : loopFrame < 146 ? "history" : "active";

  const activeTab: PanelTab =
    phase === "typing"
      ? "active"
      : phase === "tabs"
        ? tabs[Math.floor((loopFrame - 40) / 16) % tabs.length].id
        : phase === "history"
          ? "history"
          : "active";

  const showAllOnChart = phase === "history";

  const candles = useMemo(() => {
    return createCandles(frame);
  }, [frame]);

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
    const makeTrade = (
      id: string,
      side: TradeSide,
      result: TradeResult,
      entryIndex: number,
      exitIndex: number
    ): OverlayTrade => {
      const entryPrice = candles[entryIndex].close;
      const risk = Math.max(65, Math.abs(candles[entryIndex].high - candles[entryIndex].low) * 1.1);
      const targetPrice =
        side === "Long" ? entryPrice + risk * 1.5 : Math.max(0.000001, entryPrice - risk * 1.5);
      const stopPrice = side === "Long" ? entryPrice - risk : entryPrice + risk;
      const outcomePrice = result === "Win" ? targetPrice : stopPrice;
      const units = 0.42;
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
      makeTrade("h1", "Long", "Win", 11, 19),
      makeTrade("h2", "Short", "Loss", 18, 27),
      makeTrade("h3", "Long", "Win", 30, 39)
    ];
  }, [candles]);

  const pendingTrade = useMemo<OverlayTrade>(() => {
    const entryIndex = candles.length - 13;
    const exitIndex = candles.length - 2;
    const side: TradeSide = "Long";
    const entryPrice = candles[entryIndex].close;
    const risk = Math.max(58, Math.abs(candles[entryIndex].high - candles[entryIndex].low));
    const targetPrice = entryPrice + risk * 1.75;
    const stopPrice = entryPrice - risk;
    const outcomePrice = latest.close;
    const units = 0.55;
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
  }, [candles, latest.close]);

  const chartLine = useMemo(() => {
    return candles
      .map((candle, index) => {
        const x = 34 + index * 15;
        const y = toChartY(candle.close, minPrice, maxPrice);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [candles, maxPrice, minPrice]);

  const highlightedTrade = activeTab === "history" ? closedTrades[0] : pendingTrade;
  const progress = clamp(
    ((pendingTrade.outcomePrice - pendingTrade.stopPrice) /
      Math.max(0.000001, pendingTrade.targetPrice - pendingTrade.stopPrice)) *
      100,
    0,
    100
  );

  const sceneLabel =
    phase === "typing"
      ? "Typing yazan.trade and launching platform"
      : phase === "tabs"
        ? "Browsing Active, Assets, History, and Action tabs"
        : phase === "history"
          ? "History mode with Show All On Chart visualization"
          : "Active trade panel with pending execution marker";

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
          <h1>From URL Entry to Trade Visualization</h1>
          <p className={styles.copy}>
            This reel simulates a real user typing `yazan.trade`, navigating the trading workspace tabs,
            and toggling chart trade overlays in a polished dark interface.
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
          animate={{
            rotateX: phase === "typing" ? -3 : -1.5,
            y: phase === "history" ? -1.5 : 0,
            scale: phase === "active" ? 1.01 : 1
          }}
          transition={{ duration: 0.5, ease: "easeOut" }}
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
                <svg className={styles.chartSvg} viewBox="0 0 880 440" preserveAspectRatio="none" aria-label="trade animation chart">
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
                    const x = 34 + index * 15;
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

                  {!showAllOnChart ? (
                    <g>
                      <rect
                        x={34 + highlightedTrade.entryIndex * 15}
                        y={toChartY(highlightedTrade.targetPrice, minPrice, maxPrice)}
                        width={(highlightedTrade.exitIndex - highlightedTrade.entryIndex) * 15}
                        height={Math.abs(
                          toChartY(highlightedTrade.entryPrice, minPrice, maxPrice) -
                            toChartY(highlightedTrade.targetPrice, minPrice, maxPrice)
                        )}
                        fill="url(#zoneUp)"
                      />
                      <rect
                        x={34 + highlightedTrade.entryIndex * 15}
                        y={Math.min(
                          toChartY(highlightedTrade.entryPrice, minPrice, maxPrice),
                          toChartY(highlightedTrade.stopPrice, minPrice, maxPrice)
                        )}
                        width={(highlightedTrade.exitIndex - highlightedTrade.entryIndex) * 15}
                        height={Math.abs(
                          toChartY(highlightedTrade.stopPrice, minPrice, maxPrice) -
                            toChartY(highlightedTrade.entryPrice, minPrice, maxPrice)
                        )}
                        fill="url(#zoneDown)"
                      />

                      <line
                        x1={34 + highlightedTrade.entryIndex * 15}
                        x2={34 + highlightedTrade.exitIndex * 15}
                        y1={toChartY(highlightedTrade.entryPrice, minPrice, maxPrice)}
                        y2={toChartY(highlightedTrade.outcomePrice, minPrice, maxPrice)}
                        stroke="rgba(226, 236, 252, 0.82)"
                        strokeWidth={2.1}
                        strokeDasharray="4 6"
                      />

                      <g>
                        <circle
                          cx={34 + highlightedTrade.entryIndex * 15}
                          cy={toChartY(highlightedTrade.entryPrice, minPrice, maxPrice)}
                          r={5.6}
                          fill={highlightedTrade.side === "Long" ? "#1ec8a6" : "#ff4f6d"}
                        />
                        <text
                          x={34 + highlightedTrade.entryIndex * 15}
                          y={toChartY(highlightedTrade.entryPrice, minPrice, maxPrice) + 2.2}
                          textAnchor="middle"
                          fontSize="7"
                          fill="#06101d"
                          fontFamily="IBM Plex Mono, Menlo, Monaco, monospace"
                        >
                          {highlightedTrade.side === "Long" ? "Buy" : "Sell"}
                        </text>
                      </g>

                      <g>
                        <circle
                          cx={34 + highlightedTrade.exitIndex * 15}
                          cy={toChartY(highlightedTrade.outcomePrice, minPrice, maxPrice)}
                          r={5.6}
                          fill={tradeMarkerColor(highlightedTrade)}
                        />
                        <text
                          x={34 + highlightedTrade.exitIndex * 15}
                          y={toChartY(highlightedTrade.outcomePrice, minPrice, maxPrice) + 2.2}
                          textAnchor="middle"
                          fontSize="9"
                          fill="#09101a"
                          fontFamily="IBM Plex Mono, Menlo, Monaco, monospace"
                        >
                          {tradeMarkerText(highlightedTrade)}
                        </text>
                      </g>
                    </g>
                  ) : (
                    <g>
                      {closedTrades.map((trade) => (
                        <g key={trade.id}>
                          <circle
                            cx={34 + trade.entryIndex * 15}
                            cy={toChartY(trade.entryPrice, minPrice, maxPrice)}
                            r={5.2}
                            fill={trade.side === "Long" ? "#1ec8a6" : "#ff4f6d"}
                          />
                          <text
                            x={34 + trade.entryIndex * 15}
                            y={toChartY(trade.entryPrice, minPrice, maxPrice) + 2.2}
                            textAnchor="middle"
                            fontSize="7"
                            fill="#06101d"
                            fontFamily="IBM Plex Mono, Menlo, Monaco, monospace"
                          >
                            {trade.side === "Long" ? "Buy" : "Sell"}
                          </text>

                          <circle
                            cx={34 + trade.exitIndex * 15}
                            cy={toChartY(trade.outcomePrice, minPrice, maxPrice)}
                            r={5.2}
                            fill={tradeMarkerColor(trade)}
                          />
                          <text
                            x={34 + trade.exitIndex * 15}
                            y={toChartY(trade.outcomePrice, minPrice, maxPrice) + 2.2}
                            textAnchor="middle"
                            fontSize="9"
                            fill="#09101a"
                            fontFamily="IBM Plex Mono, Menlo, Monaco, monospace"
                          >
                            {tradeMarkerText(trade)}
                          </text>
                        </g>
                      ))}
                    </g>
                  )}
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
                        <p>Pending trade with live TP/SL tracking</p>
                        <div className={styles.metricGrid}>
                          <div className={styles.metric}><span>Entry</span><strong>{formatPrice(pendingTrade.entryPrice)}</strong></div>
                          <div className={styles.metric}><span>Mark</span><strong>{formatPrice(pendingTrade.outcomePrice)}</strong></div>
                          <div className={styles.metric}><span>TP</span><strong className={styles.up}>{formatPrice(pendingTrade.targetPrice)}</strong></div>
                          <div className={styles.metric}><span>SL</span><strong className={styles.down}>{formatPrice(pendingTrade.stopPrice)}</strong></div>
                          <div className={styles.metric}><span>PnL $</span><strong className={pendingTrade.pnlUsd >= 0 ? styles.up : styles.down}>{formatSignedUsd(pendingTrade.pnlUsd)}</strong></div>
                          <div className={styles.metric}><span>PnL %</span><strong className={pendingTrade.pnlPct >= 0 ? styles.up : styles.down}>{pendingTrade.pnlPct >= 0 ? "+" : ""}{pendingTrade.pnlPct.toFixed(2)}%</strong></div>
                        </div>
                        <div className={styles.progressBlock}>
                          <div className={styles.progressHead}><span>Progress To TP</span><span>{progress.toFixed(1)}%</span></div>
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

                    {activeTab === "assets" ? (
                      <>
                        <h3>Assets</h3>
                        <p>Perpetual contracts</p>
                        <ul className={styles.simpleList}>
                          {assets.map((symbol, index) => (
                            <li key={symbol}>
                              <span>{symbol}</span>
                              <span className={index % 2 === 0 ? styles.up : styles.down}>
                                {index % 2 === 0 ? "+" : "-"}{(0.2 + index * 0.17).toFixed(2)}%
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}

                    {activeTab === "history" ? (
                      <>
                        <h3>History</h3>
                        <p>Closed trades and chart outcomes</p>
                        <ul className={styles.simpleList}>
                          {closedTrades.map((trade) => (
                            <li key={trade.id}>
                              <span>{trade.side === "Long" ? "Buy" : "Sell"} BTCUSDT.P</span>
                              <span className={trade.pnlUsd >= 0 ? styles.up : styles.down}>
                                {formatSignedUsd(trade.pnlUsd)} ({trade.pnlPct >= 0 ? "+" : ""}{trade.pnlPct.toFixed(2)}%)
                              </span>
                            </li>
                          ))}
                        </ul>
                        <span className={styles.showAllBadge}>Show All On Chart</span>
                      </>
                    ) : null}

                    {activeTab === "actions" ? (
                      <>
                        <h3>Action</h3>
                        <p>Order lifecycle stream</p>
                        <ul className={styles.simpleList}>
                          <li><span>Buy Order Placed</span><span>64,522.1</span></li>
                          <li><span>SL Added</span><span>64,391.0</span></li>
                          <li><span>TP Added</span><span>64,801.5</span></li>
                          <li><span>Pending Update</span><span className={styles.up}>Live</span></li>
                        </ul>
                      </>
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className={styles.rail}>
                {tabs.map((tab) => (
                  <div key={tab.id} className={`${styles.railIcon} ${activeTab === tab.id ? styles.railIconActive : ""}`}>
                    {tabIcon(tab.id)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
