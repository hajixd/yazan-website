"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import styles from "./showcase.module.css";

type DemoTab = "assets" | "models" | "history" | "active";
type Scene = "typing" | "models" | "history_all" | "history_focus" | "active";
type TradeSide = "Long" | "Short";
type TradeResult = "Win" | "Loss";

type Candle = {
  open: number;
  close: number;
  high: number;
  low: number;
};

type TradeOverlay = {
  id: string;
  side: TradeSide;
  result: TradeResult;
  status: "closed" | "pending";
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

const models = [
  "Yazan",
  "ICT",
  "Lyra",
  "Atlas",
  "Orion"
] as const;

const createStaticCandles = (): Candle[] => {
  const rows: Candle[] = [];
  let close = 64420;

  for (let i = 0; i < 64; i += 1) {
    const macroWave = Math.sin(i / 8.6) * 38;
    const microWave = Math.sin(i / 2.8) * 13;
    const drift = (i - 27) * 0.42;
    const open = close;

    close = open + macroWave * 0.16 + microWave * 0.24 + drift * 0.08;

    const wick = 15 + Math.abs(Math.cos(i / 3.8)) * 24;
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick;

    rows.push({ open, close, high, low });
  }

  return rows;
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

const toChartX = (index: number): number => {
  return 30 + index * 13;
};

const toChartY = (price: number, min: number, max: number): number => {
  const top = 26;
  const bottom = 432;
  const ratio = (price - min) / Math.max(1, max - min);

  return bottom - ratio * (bottom - top);
};

const buildTrade = (
  candles: Candle[],
  id: string,
  side: TradeSide,
  entryIndex: number,
  plannedExitIndex: number,
  rr: number,
  units: number
): TradeOverlay => {
  const safeExitIndex = Math.min(candles.length - 1, Math.max(entryIndex + 1, plannedExitIndex));
  const entryPrice = candles[entryIndex].close;
  const risk = Math.max(58, Math.abs(candles[entryIndex].high - candles[entryIndex].low));
  const targetPrice =
    side === "Long" ? entryPrice + risk * rr : Math.max(0.000001, entryPrice - risk * rr);
  const stopPrice = side === "Long" ? entryPrice - risk : entryPrice + risk;
  let exitIndex = safeExitIndex;
  let outcomePrice = candles[safeExitIndex].close;
  let result: TradeResult =
    side === "Long" ? (outcomePrice >= entryPrice ? "Win" : "Loss") : outcomePrice <= entryPrice ? "Win" : "Loss";

  for (let i = entryIndex + 1; i <= safeExitIndex; i += 1) {
    const candle = candles[i];
    const hitTarget = side === "Long" ? candle.high >= targetPrice : candle.low <= targetPrice;
    const hitStop = side === "Long" ? candle.low <= stopPrice : candle.high >= stopPrice;

    if (!hitTarget && !hitStop) {
      continue;
    }

    exitIndex = i;

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
    result,
    status: "closed",
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

const cursorTargetForScene = (scene: Scene, sceneProgress: number): { x: number; y: number } => {
  if (scene === "typing") {
    return { x: 42.8, y: 8.4 };
  }

  if (scene === "models") {
    return sceneProgress < 0.42 ? { x: 93.2, y: 24.5 } : { x: 79.8, y: 45.8 };
  }

  if (scene === "history_all") {
    return sceneProgress < 0.35 ? { x: 93.2, y: 29.1 } : { x: 81.4, y: 37.8 };
  }

  if (scene === "history_focus") {
    return { x: 79.2, y: 45.2 };
  }

  return sceneProgress < 0.32 ? { x: 93.2, y: 19.8 } : { x: 81.4, y: 36.8 };
};

const tabLabel = (tab: DemoTab): string => {
  if (tab === "assets") {
    return "Assets";
  }

  if (tab === "models") {
    return "Models";
  }

  if (tab === "history") {
    return "History";
  }

  return "Active";
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

  const candles = useMemo(() => createStaticCandles(), []);

  const minPrice = useMemo(() => Math.min(...candles.map((item) => item.low)), [candles]);
  const maxPrice = useMemo(() => Math.max(...candles.map((item) => item.high)), [candles]);

  const loopFrame = frame % 250;
  const typedCount = loopFrame < 42 ? Math.min(urlTarget.length, Math.floor(loopFrame / 2.6)) : urlTarget.length;
  const typedUrl = urlTarget.slice(0, typedCount);
  const showCaret = loopFrame < 45 && loopFrame % 2 === 0;

  const scene: Scene =
    loopFrame < 46
      ? "typing"
      : loopFrame < 92
        ? "models"
        : loopFrame < 140
          ? "history_all"
          : loopFrame < 188
            ? "history_focus"
            : "active";

  const sceneProgress =
    scene === "typing"
      ? clamp(loopFrame / 45, 0, 1)
      : scene === "models"
        ? clamp((loopFrame - 46) / 45, 0, 1)
        : scene === "history_all"
          ? clamp((loopFrame - 92) / 47, 0, 1)
          : scene === "history_focus"
            ? clamp((loopFrame - 140) / 47, 0, 1)
            : clamp((loopFrame - 188) / 61, 0, 1);

  const closedTrades = useMemo(() => {
    return [
      buildTrade(candles, "h1", "Long", 16, 31, 1.7, 0.72),
      buildTrade(candles, "h2", "Short", 28, 39, 1.55, 0.64),
      buildTrade(candles, "h3", "Long", 41, 53, 1.8, 0.66)
    ];
  }, [candles]);

  const pendingTrade = useMemo<TradeOverlay>(() => {
    const entryIndex = 44;
    const exitIndex = 58;
    const entryPrice = candles[entryIndex].close;
    let risk = Math.max(56, Math.abs(candles[entryIndex].high - candles[entryIndex].low));
    let targetPrice = entryPrice + risk * 1.9;
    let stopPrice = entryPrice - risk;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      let hit = false;

      for (let i = entryIndex + 1; i <= exitIndex; i += 1) {
        const candle = candles[i];
        const hitTarget = candle.high >= targetPrice;
        const hitStop = candle.low <= stopPrice;

        if (hitTarget || hitStop) {
          hit = true;
          break;
        }
      }

      if (!hit) {
        break;
      }

      risk *= 1.24;
      targetPrice = entryPrice + risk * 1.9;
      stopPrice = entryPrice - risk;
    }

    const outcomePrice = candles[exitIndex].close;
    const units = 0.74;
    const pnlUsd = (outcomePrice - entryPrice) * units;
    const pnlPct = ((outcomePrice - entryPrice) / entryPrice) * 100;

    return {
      id: "active",
      side: "Long",
      result: pnlUsd >= 0 ? "Win" : "Loss",
      status: "pending",
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

  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2] ?? latest;
  const quoteChange = previous.close > 0 ? ((latest.close - previous.close) / previous.close) * 100 : 0;

  const chartPath = useMemo(() => {
    return candles
      .map((candle, index) => {
        const x = toChartX(index);
        const y = toChartY(candle.close, minPrice, maxPrice);

        return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [candles, minPrice, maxPrice]);

  const activeTab: DemoTab =
    scene === "typing"
      ? "assets"
      : scene === "models"
        ? "models"
        : scene === "active"
          ? "active"
          : "history";

  const selectedModel = scene === "models" ? "ICT" : "Yazan";
  const showAllOnChart = scene === "history_all";
  const showFocusedTrade = scene === "history_focus";
  const showActiveTrade = scene === "active" && sceneProgress > 0.45;

  const cursor = cursorTargetForScene(scene, sceneProgress);

  const clickPulse =
    (scene === "typing" && loopFrame >= 39 && loopFrame <= 41) ||
    (scene === "models" && (loopFrame === 58 || loopFrame === 71)) ||
    (scene === "history_all" && loopFrame >= 108 && loopFrame <= 110) ||
    (scene === "history_focus" && loopFrame >= 155 && loopFrame <= 157) ||
    (scene === "active" && (loopFrame === 196 || loopFrame === 214));

  const sceneTitle =
    scene === "typing"
      ? "1. Opening yazan.trade"
      : scene === "models"
        ? "2. Picking a model"
        : scene === "history_all"
          ? "3. Show All On Chart"
          : scene === "history_focus"
            ? "4. Inspecting a specific history trade"
            : "5. Active trade visualization";

  const sceneCopy =
    scene === "typing"
      ? "User types the URL and lands on the trading workspace."
      : scene === "models"
        ? "Models / People tab selects who drives the strategy feed."
        : scene === "history_all"
          ? "History toggles all closed trades directly on the chart."
          : scene === "history_focus"
            ? "A single trade is focused to inspect TP, SL, and outcome."
            : "Active tab shows current position metrics and chart overlay.";

  const progressToTp = clamp(
    ((pendingTrade.outcomePrice - pendingTrade.stopPrice) /
      Math.max(0.000001, pendingTrade.targetPrice - pendingTrade.stopPrice)) *
      100,
    0,
    100
  );

  return (
    <section className={styles.stage}>
      <div className={styles.haloA} />
      <div className={styles.haloB} />

      <div className={styles.demoWrap}>
        <header className={styles.headline}>
          <h1>yazan.trade Demo Animation</h1>
          <p>Interactive walkthrough with a static market chart and realistic UI actions.</p>
        </header>

        <motion.div
          className={styles.viewport}
          animate={{ rotateX: scene === "typing" ? -2.8 : -1.2, scale: scene === "active" ? 1.01 : 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <div className={styles.chrome}>
            <div className={styles.chromeDots}>
              <span />
              <span />
              <span />
            </div>
            <div className={styles.address}>
              <span>https://</span>
              <span>{typedUrl}</span>
              <span className={styles.caret}>{showCaret ? "|" : " "}</span>
            </div>
            <div className={styles.brand}>yazan.trade</div>
          </div>

          <div className={styles.subbar}>
            <div className={styles.subLeft}>BTCUSDT.P</div>
            <div className={styles.subMid}>
              <span className={styles.subTf}>1m</span>
              <span className={styles.subTf}>5m</span>
              <span className={`${styles.subTf} ${styles.subTfActive}`}>15m</span>
              <span className={styles.subTf}>1H</span>
              <span className={styles.subTf}>4H</span>
            </div>
            <div className={styles.subRight}>
              C {formatPrice(latest.close)}
              <span className={quoteChange >= 0 ? styles.up : styles.down}>
                {quoteChange >= 0 ? "+" : ""}
                {quoteChange.toFixed(2)}%
              </span>
            </div>
          </div>

          <div className={styles.workspace}>
            <section className={styles.chartPane}>
              <svg className={styles.chartSvg} viewBox="0 0 900 460" preserveAspectRatio="none" aria-label="chart demo">
                <defs>
                  <linearGradient id="gainZone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(30, 200, 166, 0.24)" />
                    <stop offset="100%" stopColor="rgba(30, 200, 166, 0.03)" />
                  </linearGradient>
                  <linearGradient id="lossZone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(255, 79, 109, 0.28)" />
                    <stop offset="100%" stopColor="rgba(255, 79, 109, 0.04)" />
                  </linearGradient>
                </defs>

                {Array.from({ length: 9 }).map((_, idx) => (
                  <line
                    key={`h-${idx}`}
                    x1={20}
                    x2={880}
                    y1={28 + idx * 48}
                    y2={28 + idx * 48}
                    stroke="rgba(22, 36, 56, 0.44)"
                    strokeWidth={1}
                  />
                ))}

                {Array.from({ length: 12 }).map((_, idx) => (
                  <line
                    key={`v-${idx}`}
                    y1={22}
                    y2={438}
                    x1={30 + idx * 72}
                    x2={30 + idx * 72}
                    stroke="rgba(16, 28, 45, 0.32)"
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
                    <g key={`c-${index}`}>
                      <line
                        x1={x}
                        x2={x}
                        y1={highY}
                        y2={lowY}
                        stroke={isUp ? "#1ec8a6" : "#ff4f6d"}
                        strokeWidth={1.1}
                      />
                      <rect
                        x={x - 3.6}
                        y={bodyTop}
                        width={7.2}
                        height={bodyHeight}
                        fill={isUp ? "#1ec8a6" : "#ff4f6d"}
                        rx={1}
                      />
                    </g>
                  );
                })}

                <path d={chartPath} fill="none" stroke="rgba(222, 232, 248, 0.3)" strokeWidth={1.15} />

                {showAllOnChart ? (
                  <g>
                    {closedTrades.map((trade) => {
                      const entryX = toChartX(trade.entryIndex);
                      const exitX = toChartX(trade.exitIndex);
                      const entryY = toChartY(trade.entryPrice, minPrice, maxPrice);
                      const exitY = toChartY(trade.outcomePrice, minPrice, maxPrice);

                      return (
                        <g key={trade.id}>
                          <path
                            d={`M ${entryX} ${entryY + 16} L ${entryX - 7} ${entryY + 28} L ${entryX + 7} ${entryY + 28} Z`}
                            fill={trade.side === "Long" ? "#1ec8a6" : "#ff4f6d"}
                          />
                          <text
                            x={entryX}
                            y={entryY + 44}
                            textAnchor="middle"
                            fontSize="8"
                            fill={trade.side === "Long" ? "#1ec8a6" : "#ff4f6d"}
                            fontFamily="IBM Plex Mono, Menlo, Monaco, monospace"
                          >
                            {trade.side === "Long" ? "Buy" : "Sell"}
                          </text>

                          <text
                            x={Math.min(exitX + 8, 792)}
                            y={trade.result === "Win" ? exitY - 8 : exitY + 16}
                            fontSize="8.2"
                            fill={trade.result === "Win" ? "#1ec8a6" : "#ff4f6d"}
                            fontFamily="IBM Plex Mono, Menlo, Monaco, monospace"
                          >
                            {`${trade.result === "Win" ? "✓" : "x"} ${formatSignedUsd(trade.pnlUsd)}`}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                ) : null}

                {showFocusedTrade || showActiveTrade ? (
                  <g>
                    {(() => {
                      const trade = showActiveTrade ? pendingTrade : closedTrades[0];
                      const entryX = toChartX(trade.entryIndex);
                      const exitX = toChartX(trade.exitIndex);
                      const entryY = toChartY(trade.entryPrice, minPrice, maxPrice);
                      const exitY = toChartY(trade.outcomePrice, minPrice, maxPrice);
                      const isPositiveExit = showActiveTrade ? trade.pnlUsd >= 0 : trade.result === "Win";
                      const exitLabel = `${isPositiveExit ? "✓" : "x"} ${formatSignedUsd(trade.pnlUsd)}`;
                      const exitStroke = isPositiveExit ? "#1ec8a6" : "#ff4f6d";
                      const exitRectY = isPositiveExit ? exitY - 20 : exitY + 4;
                      const exitTextY = isPositiveExit ? exitY - 7 : exitY + 17;

                      return (
                        <>
                          <rect
                            x={entryX}
                            y={toChartY(trade.targetPrice, minPrice, maxPrice)}
                            width={(trade.exitIndex - trade.entryIndex) * 13}
                            height={Math.abs(
                              toChartY(trade.entryPrice, minPrice, maxPrice) -
                                toChartY(trade.targetPrice, minPrice, maxPrice)
                            )}
                            fill="url(#gainZone)"
                          />
                          <rect
                            x={entryX}
                            y={Math.min(
                              toChartY(trade.entryPrice, minPrice, maxPrice),
                              toChartY(trade.stopPrice, minPrice, maxPrice)
                            )}
                            width={(trade.exitIndex - trade.entryIndex) * 13}
                            height={Math.abs(
                              toChartY(trade.stopPrice, minPrice, maxPrice) -
                                toChartY(trade.entryPrice, minPrice, maxPrice)
                            )}
                            fill="url(#lossZone)"
                          />

                          <line
                            x1={entryX}
                            x2={exitX}
                            y1={entryY}
                            y2={exitY}
                            stroke="rgba(228, 238, 252, 0.84)"
                            strokeWidth={2.1}
                            strokeDasharray="4 6"
                          />

                          <path
                            d={`M ${entryX} ${entryY + 16} L ${entryX - 7} ${entryY + 28} L ${entryX + 7} ${entryY + 28} Z`}
                            fill={trade.side === "Long" ? "#1ec8a6" : "#ff4f6d"}
                          />
                          <text
                            x={entryX}
                            y={entryY + 44}
                            textAnchor="middle"
                            fontSize="8"
                            fill={trade.side === "Long" ? "#1ec8a6" : "#ff4f6d"}
                            fontFamily="IBM Plex Mono, Menlo, Monaco, monospace"
                          >
                            {trade.side === "Long" ? "Buy" : "Sell"}
                          </text>

                          <rect
                            x={Math.min(exitX + 8, 695)}
                            y={exitRectY}
                            width={168}
                            height={19}
                            rx={5}
                            fill="rgba(8, 18, 34, 0.88)"
                            stroke={exitStroke}
                            strokeWidth={1}
                          />
                          <text
                            x={Math.min(exitX + 14, 701)}
                            y={exitTextY}
                            fontSize="8"
                            fill={exitStroke}
                            fontFamily="IBM Plex Mono, Menlo, Monaco, monospace"
                          >
                            {exitLabel}
                          </text>
                        </>
                      );
                    })()}
                  </g>
                ) : null}
              </svg>
            </section>

            <aside className={styles.panelPane}>
              <nav className={styles.panelTabs} aria-label="demo tabs">
                {(["assets", "models", "history", "active"] as DemoTab[]).map((tab) => (
                  <span
                    key={tab}
                    className={`${styles.panelTab} ${activeTab === tab ? styles.panelTabActive : ""}`}
                  >
                    {tabLabel(tab)}
                  </span>
                ))}
              </nav>

              <div className={styles.panelBody}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -7 }}
                    transition={{ duration: 0.2 }}
                  >
                    {activeTab === "assets" ? (
                      <>
                        <h3>Assets</h3>
                        <p>Perpetual contracts watchlist</p>
                        <ul className={styles.list}>
                          <li><span>BTCUSDT.P</span><span className={styles.up}>+0.27%</span></li>
                          <li><span>ETHUSDT.P</span><span className={styles.down}>-0.18%</span></li>
                          <li><span>SOLUSDT.P</span><span className={styles.up}>+0.44%</span></li>
                          <li><span>XRPUSDT.P</span><span className={styles.up}>+0.09%</span></li>
                        </ul>
                      </>
                    ) : null}

                    {activeTab === "models" ? (
                      <>
                        <h3>Models / People</h3>
                        <p>Select one profile</p>
                        <ul className={styles.modelList}>
                          {models.map((name) => (
                            <li
                              key={name}
                              className={`${styles.modelRow} ${selectedModel === name ? styles.modelRowActive : ""}`}
                            >
                              <span>{name}</span>
                              <span>{selectedModel === name ? "Active" : ""}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}

                    {activeTab === "history" ? (
                      <>
                        <h3>History</h3>
                        <p>Trades generated by {selectedModel}</p>
                        <button
                          type="button"
                          className={`${styles.panelBtn} ${showAllOnChart ? styles.panelBtnActive : ""}`}
                        >
                          Show All On Chart
                        </button>
                        <ul className={styles.list}>
                          {closedTrades.map((trade, index) => (
                            <li key={trade.id} className={showFocusedTrade && index === 0 ? styles.listRowActive : ""}>
                              <span>{trade.side === "Long" ? "Buy" : "Sell"} BTCUSDT.P</span>
                              <span className={trade.pnlUsd >= 0 ? styles.up : styles.down}>
                                {formatSignedUsd(trade.pnlUsd)} ({trade.pnlPct >= 0 ? "+" : ""}
                                {trade.pnlPct.toFixed(2)}%)
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}

                    {activeTab === "active" ? (
                      <>
                        <h3>Active Trade</h3>
                        <p>Live position card</p>
                        <button
                          type="button"
                          className={`${styles.panelBtn} ${showActiveTrade ? styles.panelBtnActive : ""}`}
                        >
                          Show On Chart
                        </button>
                        <div className={styles.metricGrid}>
                          <div>
                            <span>Entry</span>
                            <strong>{formatPrice(pendingTrade.entryPrice)}</strong>
                          </div>
                          <div>
                            <span>Mark</span>
                            <strong>{formatPrice(pendingTrade.outcomePrice)}</strong>
                          </div>
                          <div>
                            <span>TP</span>
                            <strong className={styles.up}>{formatPrice(pendingTrade.targetPrice)}</strong>
                          </div>
                          <div>
                            <span>SL</span>
                            <strong className={styles.down}>{formatPrice(pendingTrade.stopPrice)}</strong>
                          </div>
                          <div>
                            <span>PnL $</span>
                            <strong className={pendingTrade.pnlUsd >= 0 ? styles.up : styles.down}>
                              {formatSignedUsd(pendingTrade.pnlUsd)}
                            </strong>
                          </div>
                          <div>
                            <span>PnL %</span>
                            <strong className={pendingTrade.pnlPct >= 0 ? styles.up : styles.down}>
                              {pendingTrade.pnlPct >= 0 ? "+" : ""}
                              {pendingTrade.pnlPct.toFixed(2)}%
                            </strong>
                          </div>
                        </div>
                        <div className={styles.progressWrap}>
                          <div className={styles.progressHead}>
                            <span>Progress To TP</span>
                            <span>{progressToTp.toFixed(1)}%</span>
                          </div>
                          <div className={styles.progressTrack}>
                            <motion.span
                              className={styles.progressFill}
                              animate={{ width: `${progressToTp}%` }}
                              transition={{ duration: 0.45, ease: "easeOut" }}
                            />
                          </div>
                        </div>
                      </>
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              </div>
            </aside>
          </div>

          <footer className={styles.caption}>
            <strong>{sceneTitle}</strong>
            <span>{sceneCopy}</span>
          </footer>

          <motion.div
            className={styles.cursor}
            animate={{ left: `${cursor.x}%`, top: `${cursor.y}%`, scale: clickPulse ? 0.9 : 1 }}
            transition={{ type: "spring", stiffness: 340, damping: 28, mass: 0.34 }}
          >
            <svg viewBox="0 0 20 20" aria-hidden>
              <path d="M3 2l11.5 10.8-5.2.7-2.2 4.4L3 2z" fill="currentColor" />
            </svg>
            {clickPulse ? (
              <motion.span
                className={styles.cursorRipple}
                initial={{ opacity: 0.6, scale: 0.2 }}
                animate={{ opacity: 0, scale: 1.8 }}
                transition={{ duration: 0.33, ease: "easeOut" }}
              />
            ) : null}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
