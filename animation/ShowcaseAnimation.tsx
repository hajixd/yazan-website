"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import styles from "./showcase.module.css";

type SceneId = "active" | "history" | "notify";
type PanelTab = "active" | "history" | "actions";

type Scene = {
  id: SceneId;
  title: string;
  description: string;
  panelTab: PanelTab;
  showAllTrades: boolean;
  showNotification: boolean;
};

type Candle = {
  open: number;
  close: number;
  high: number;
  low: number;
};

const scenes: Scene[] = [
  {
    id: "active",
    title: "Live Active Trade Monitoring",
    description: "Real-time mark price, TP/SL guardrails, and performance telemetry inside a clean pro UI.",
    panelTab: "active",
    showAllTrades: false,
    showNotification: false
  },
  {
    id: "history",
    title: "History Mode, All Trades On Chart",
    description:
      "The history workflow highlights past entries/exits while showing every trade footprint directly on the chart.",
    panelTab: "history",
    showAllTrades: true,
    showNotification: false
  },
  {
    id: "notify",
    title: "Live Activity Notification Feed",
    description:
      "Market events, PnL updates, and execution signals stream into a compact top-right notification rail.",
    panelTab: "active",
    showAllTrades: false,
    showNotification: true
  }
];

const timeframeLabels = ["1m", "5m", "15m", "1H", "4H", "1D"];

const historyRows = [
  { symbol: "BTCUSDT.P", status: "Win", pnl: "+1.84%" },
  { symbol: "ETHUSDT.P", status: "Loss", pnl: "-0.62%" },
  { symbol: "SOLUSDT.P", status: "Win", pnl: "+2.17%" },
  { symbol: "XRPUSDT.P", status: "Win", pnl: "+0.93%" }
];

const notificationRows = [
  { title: "BTCUSDT.P near TP", details: "Progress 78.3% | TP 64,851.20", time: "14:22:08", tone: "up" },
  { title: "ETHUSDT.P SL added", details: "Stop-loss @ 3,443.10", time: "14:21:52", tone: "down" },
  {
    title: "SOLUSDT.P unrealized",
    details: "+$318.55 (+1.22%)",
    time: "14:21:19",
    tone: "up"
  }
] as const;

const createCandles = (tick: number): Candle[] => {
  const series: Candle[] = [];
  const count = 46;
  let close = 64280 + Math.sin(tick * 0.2) * 120;

  for (let i = 0; i < count; i += 1) {
    const wave = Math.sin((i + tick) / 5) * 52 + Math.cos((i + tick) / 8) * 23;
    const impulse = ((i + tick) % 11 === 0 ? 1 : -1) * (8 + (i % 5));
    const drift = wave * 0.18 + impulse;
    const open = close;
    close = open + drift;

    const wick = 11 + Math.abs(Math.sin((tick + i) / 3.2)) * 27;
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick;

    series.push({ open, close, high, low });
  }

  return series;
};

const mapPriceToY = (price: number, min: number, max: number): number => {
  const top = 28;
  const bottom = 414;
  const ratio = (price - min) / Math.max(1, max - min);
  return bottom - ratio * (bottom - top);
};

const formatPrice = (value: number): string => {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export default function ShowcaseAnimation() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const sceneTimer = window.setInterval(() => {
      setSceneIndex((current) => (current + 1) % scenes.length);
    }, 4300);

    const candleTimer = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 780);

    return () => {
      window.clearInterval(sceneTimer);
      window.clearInterval(candleTimer);
    };
  }, []);

  const scene = scenes[sceneIndex];

  const candles = useMemo(() => {
    return createCandles(tick);
  }, [tick]);

  const minPrice = useMemo(() => {
    return Math.min(...candles.map((item) => item.low));
  }, [candles]);

  const maxPrice = useMemo(() => {
    return Math.max(...candles.map((item) => item.high));
  }, [candles]);

  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2] ?? latest;
  const quoteChange = previous.close > 0 ? ((latest.close - previous.close) / previous.close) * 100 : 0;

  const activeEntryIndex = Math.max(6, candles.length - 22);
  const activeExitIndex = candles.length - 4;
  const entryPrice = candles[activeEntryIndex].close;
  const markPrice = latest.close;
  const stopPrice = entryPrice - 148;
  const targetPrice = entryPrice + 265;
  const progress = clamp(((markPrice - stopPrice) / (targetPrice - stopPrice)) * 100, 0, 100);

  const chartPath = useMemo(() => {
    return candles
      .map((candle, index) => {
        const x = 36 + index * 18;
        const y = mapPriceToY(candle.close, minPrice, maxPrice);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [candles, maxPrice, minPrice]);

  return (
    <section className={styles.stage}>
      <motion.div
        className={styles.aurora}
        animate={{ x: [0, 26, -18, 0], y: [0, 14, -9, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={styles.auroraTwo}
        animate={{ x: [0, -34, 16, 0], y: [0, -18, 12, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className={styles.content}>
        <motion.div
          className={styles.copy}
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
        >
          <p className={styles.kicker}>Animation Reel</p>
          <h1>Trading Platform Showcase Sequence</h1>
          <p>
            A cinematic browser-native promo built with React + TypeScript + Framer Motion, featuring
            animated chart rendering, SVG trade overlays, and live activity moments.
          </p>
          <ul className={styles.pills}>
            <li>Framer Motion</li>
            <li>TypeScript</li>
            <li>SVG Signals</li>
            <li>Cinematic UI</li>
          </ul>

          <AnimatePresence mode="wait">
            <motion.div
              key={scene.id}
              className={styles.sceneCaption}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.34 }}
            >
              <strong>{scene.title}</strong>
              <span>{scene.description}</span>
            </motion.div>
          </AnimatePresence>

          <div className={styles.footer}>Designed for /animation route on Vercel</div>
        </motion.div>

        <div className={styles.viewport}>
          <motion.div
            className={styles.frame}
            animate={{
              rotateX: scene.id === "notify" ? -2.4 : -1.4,
              y: scene.id === "history" ? -2 : 0,
              scale: scene.id === "notify" ? 1.01 : 1
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className={styles.topbar}>
              <div className={styles.asset}>
                <strong>BTCUSDT.P</strong>
                <span>{formatPrice(latest.close)} ({quoteChange >= 0 ? "+" : ""}{quoteChange.toFixed(2)}%)</span>
              </div>
              <div className={styles.topRight}>
                <div className={styles.timeframe}>
                  {timeframeLabels.map((label) => (
                    <span key={label} className={label === "15m" ? styles.activeTf : ""}>
                      {label}
                    </span>
                  ))}
                </div>
                <span className={styles.brand}>yazan.trade</span>
              </div>
            </div>

            <div className={styles.workspace}>
              <div className={styles.chartCol}>
                <div className={styles.toolbar}>
                  <span>O {formatPrice(latest.open)}</span>
                  <span>H {formatPrice(latest.high)}</span>
                  <span>L {formatPrice(latest.low)}</span>
                  <span>C {formatPrice(latest.close)}</span>
                  <span>Funding +0.012%</span>
                </div>

                <div className={styles.chart}>
                  <svg className={styles.chartSvg} viewBox="0 0 900 440" preserveAspectRatio="none" role="img" aria-label="animated market chart">
                    <defs>
                      <linearGradient id="tradeZoneUp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(30,200,166,0.24)" />
                        <stop offset="100%" stopColor="rgba(30,200,166,0.02)" />
                      </linearGradient>
                      <linearGradient id="tradeZoneDown" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(255,79,109,0.26)" />
                        <stop offset="100%" stopColor="rgba(255,79,109,0.03)" />
                      </linearGradient>
                    </defs>

                    {Array.from({ length: 8 }).map((_, i) => (
                      <line
                        key={`h-${i}`}
                        x1={24}
                        x2={876}
                        y1={30 + i * 49}
                        y2={30 + i * 49}
                        stroke="rgba(27, 42, 69, 0.35)"
                        strokeWidth={1}
                      />
                    ))}

                    {Array.from({ length: 10 }).map((_, i) => (
                      <line
                        key={`v-${i}`}
                        y1={28}
                        y2={414}
                        x1={36 + i * 84}
                        x2={36 + i * 84}
                        stroke="rgba(23, 36, 58, 0.34)"
                        strokeWidth={1}
                      />
                    ))}

                    <rect
                      x={36 + activeEntryIndex * 18}
                      y={mapPriceToY(targetPrice, minPrice, maxPrice)}
                      width={(activeExitIndex - activeEntryIndex) * 18}
                      height={mapPriceToY(entryPrice, minPrice, maxPrice) - mapPriceToY(targetPrice, minPrice, maxPrice)}
                      fill="url(#tradeZoneUp)"
                      opacity={scene.panelTab === "active" ? 1 : 0.72}
                    />

                    <rect
                      x={36 + activeEntryIndex * 18}
                      y={mapPriceToY(entryPrice, minPrice, maxPrice)}
                      width={(activeExitIndex - activeEntryIndex) * 18}
                      height={mapPriceToY(stopPrice, minPrice, maxPrice) - mapPriceToY(entryPrice, minPrice, maxPrice)}
                      fill="url(#tradeZoneDown)"
                      opacity={scene.panelTab === "active" ? 1 : 0.72}
                    />

                    {candles.map((candle, index) => {
                      const x = 36 + index * 18;
                      const openY = mapPriceToY(candle.open, minPrice, maxPrice);
                      const closeY = mapPriceToY(candle.close, minPrice, maxPrice);
                      const highY = mapPriceToY(candle.high, minPrice, maxPrice);
                      const lowY = mapPriceToY(candle.low, minPrice, maxPrice);
                      const bodyTop = Math.min(openY, closeY);
                      const bodyHeight = Math.max(2, Math.abs(closeY - openY));
                      const up = candle.close >= candle.open;

                      return (
                        <g key={`candle-${index}`}>
                          <line
                            x1={x}
                            x2={x}
                            y1={highY}
                            y2={lowY}
                            stroke={up ? "#1ec8a6" : "#ff4f6d"}
                            strokeWidth={1.3}
                          />
                          <rect
                            x={x - 4.1}
                            y={bodyTop}
                            width={8.2}
                            height={bodyHeight}
                            fill={up ? "#1ec8a6" : "#ff4f6d"}
                            rx={1.3}
                          />
                        </g>
                      );
                    })}

                    <path d={chartPath} fill="none" stroke="rgba(215, 228, 250, 0.32)" strokeWidth={1.2} />

                    <line
                      x1={36 + activeEntryIndex * 18}
                      x2={36 + activeExitIndex * 18}
                      y1={mapPriceToY(entryPrice, minPrice, maxPrice)}
                      y2={mapPriceToY(markPrice, minPrice, maxPrice)}
                      stroke="rgba(230, 238, 252, 0.8)"
                      strokeWidth={2.2}
                      strokeDasharray="5 6"
                    />

                    <circle
                      cx={36 + activeEntryIndex * 18}
                      cy={mapPriceToY(entryPrice, minPrice, maxPrice)}
                      r={4.4}
                      fill="#1ec8a6"
                    />
                    <circle
                      cx={36 + activeExitIndex * 18}
                      cy={mapPriceToY(markPrice, minPrice, maxPrice)}
                      r={4.4}
                      fill={markPrice >= entryPrice ? "#1ec8a6" : "#ff4f6d"}
                    />

                    {scene.showAllTrades
                      ? [
                          { x: 36 + 8 * 18, y: mapPriceToY(candles[8].close, minPrice, maxPrice), up: true },
                          { x: 36 + 18 * 18, y: mapPriceToY(candles[18].close, minPrice, maxPrice), up: false },
                          { x: 36 + 28 * 18, y: mapPriceToY(candles[28].close, minPrice, maxPrice), up: true }
                        ].map((marker, index) => (
                          <g key={`marker-${index}`}>
                            <circle cx={marker.x} cy={marker.y} r={5} fill={marker.up ? "#1ec8a6" : "#ff4f6d"} />
                            <circle cx={marker.x} cy={marker.y} r={8} fill="none" stroke={marker.up ? "#1ec8a6" : "#ff4f6d"} strokeOpacity={0.4} />
                          </g>
                        ))
                      : null}
                  </svg>
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelBody}>
                  {scene.panelTab === "active" ? (
                    <>
                      <h3>Active Trade</h3>
                      <p>Live execution metrics</p>
                      <div className={styles.activeGrid}>
                        <div className={styles.metric}>
                          <span>Entry</span>
                          <strong>{formatPrice(entryPrice)}</strong>
                        </div>
                        <div className={styles.metric}>
                          <span>Mark</span>
                          <strong>{formatPrice(markPrice)}</strong>
                        </div>
                        <div className={styles.metric}>
                          <span>TP</span>
                          <strong className={styles.up}>{formatPrice(targetPrice)}</strong>
                        </div>
                        <div className={styles.metric}>
                          <span>SL</span>
                          <strong className={styles.down}>{formatPrice(stopPrice)}</strong>
                        </div>
                        <div className={styles.metric}>
                          <span>PnL</span>
                          <strong className={markPrice >= entryPrice ? styles.up : styles.down}>
                            {markPrice >= entryPrice ? "+" : ""}
                            {(((markPrice - entryPrice) / entryPrice) * 100).toFixed(2)}%
                          </strong>
                        </div>
                        <div className={styles.metric}>
                          <span>Duration</span>
                          <strong>00:18:42</strong>
                        </div>
                      </div>

                      <div className={styles.progressWrap}>
                        <div className={styles.progressHead}>
                          <span>Progress To TP</span>
                          <span>{progress.toFixed(1)}%</span>
                        </div>
                        <div className={styles.progressTrack}>
                          <motion.div
                            className={styles.progressFill}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.7, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3>History</h3>
                      <p>Simulated trade outcomes</p>
                      <ul className={styles.historyList}>
                        {historyRows.map((row) => (
                          <li key={row.symbol} className={styles.historyItem}>
                            <div>
                              <strong>{row.symbol}</strong>
                              <span>{row.status}</span>
                            </div>
                            <strong className={row.status === "Win" ? styles.up : styles.down}>{row.pnl}</strong>
                          </li>
                        ))}
                      </ul>
                      <span className={styles.historyMode}>Show All Trades On Chart</span>
                    </>
                  )}
                </div>

                <div className={styles.rail}>
                  <div className={`${styles.icon} ${scene.panelTab === "active" ? styles.activeIcon : ""}`}>
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                    </svg>
                  </div>
                  <div className={`${styles.icon} ${scene.panelTab === "history" ? styles.activeIcon : ""}`}>
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d="M6 7v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M7.5 16.5a7 7 0 1 0-1.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  </div>
                  <div className={`${styles.icon} ${scene.panelTab === "actions" ? styles.activeIcon : ""}`}>
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d="M7 6h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M7 12h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M7 18h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {scene.showNotification ? (
                <motion.div
                  key="notif"
                  className={styles.notif}
                  initial={{ opacity: 0, y: -14, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.97 }}
                  transition={{ duration: 0.26, ease: "easeOut" }}
                >
                  <div className={styles.notifHead}>
                    <span>Live Activity</span>
                    <span>3 Events</span>
                  </div>
                  <ul className={styles.notifList}>
                    {notificationRows.map((item) => (
                      <li key={item.title}>
                        <span className={`${styles.dot} ${item.tone === "up" ? styles.dotUp : item.tone === "down" ? styles.dotDown : ""}`} />
                        <div className={styles.notifCopy}>
                          <strong>{item.title}</strong>
                          <span>{item.details}</span>
                        </div>
                        <span className={styles.notifTime}>{item.time}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
