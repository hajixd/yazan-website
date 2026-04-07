import type { FutureAsset } from "./futuresCatalog";

export type SimulatedTimeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";

export type SimulatedCandle = {
  open: number;
  close: number;
  high: number;
  low: number;
  time: number;
};

const timeframeMinutes: Record<SimulatedTimeframe, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "1H": 60,
  "4H": 240,
  "1D": 1440,
  "1W": 10080
};

const timeframeVolatility: Record<SimulatedTimeframe, number> = {
  "1m": 0.0018,
  "5m": 0.0026,
  "15m": 0.0038,
  "1H": 0.006,
  "4H": 0.009,
  "1D": 0.015,
  "1W": 0.025
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
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

export const getSimulatedTimeframeMs = (timeframe: SimulatedTimeframe): number => {
  return timeframeMinutes[timeframe] * 60_000;
};

const floorToTimeframe = (timestampMs: number, timeframe: SimulatedTimeframe): number => {
  const step = getSimulatedTimeframeMs(timeframe);
  return Math.floor(timestampMs / step) * step;
};

const roundToTick = (value: number, tickSize: number): number => {
  if (!Number.isFinite(tickSize) || tickSize <= 0) {
    return value;
  }

  return Math.round(value / tickSize) * tickSize;
};

export const generateSimulatedFuturesCandles = (
  asset: FutureAsset,
  timeframe: SimulatedTimeframe,
  count: number,
  referenceNowMs = Date.now()
): SimulatedCandle[] => {
  const series: SimulatedCandle[] = [];
  const timeframeMs = getSimulatedTimeframeMs(timeframe);
  const baseVolatility = timeframeVolatility[timeframe];
  const seed = hashString(`${asset.symbol}-${timeframe}`);
  const rand = createSeededRng(seed);
  const latestAlignedTime = floorToTimeframe(referenceNowMs, timeframe);
  const startTime = latestAlignedTime - (count - 1) * timeframeMs;
  let close = asset.basePrice * (0.9 + rand() * 0.22);
  let regimeBarsLeft = 0;
  let driftBias = 0;
  let volMultiplier = 1;
  let momentumCarry = 0;
  let regimeAnchor = asset.basePrice;

  for (let i = 0; i < count; i += 1) {
    if (regimeBarsLeft <= 0) {
      regimeBarsLeft = 35 + Math.floor(rand() * 150);
      driftBias = (rand() - 0.5) * baseVolatility * (0.9 + rand() * 1.5);
      volMultiplier = 0.65 + rand() * 2.2;
      regimeAnchor = asset.basePrice * (0.94 + rand() * 0.12);
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
      ((regimeAnchor - open) / Math.max(asset.basePrice, 0.000001)) * baseVolatility * 0.55;
    const returnMove = driftBias + microNoise + trendNoise + momentumCarry + shock + meanReversion;

    close = clamp(open * (1 + returnMove), asset.basePrice * 0.72, asset.basePrice * 1.34);
    momentumCarry = returnMove * 0.14;

    const wickVol = baseVolatility * (0.45 + rand() * 2.2) * volMultiplier;
    const high = Math.max(open, close) * (1 + wickVol * (0.35 + rand() * 0.8));
    const low = Math.max(
      0.000001,
      Math.min(open, close) * (1 - wickVol * (0.35 + rand() * 0.8))
    );

    series.push({
      open: roundToTick(open, asset.tickSize),
      close: roundToTick(close, asset.tickSize),
      high: roundToTick(high, asset.tickSize),
      low: roundToTick(low, asset.tickSize),
      time: startTime + i * timeframeMs
    });
  }

  return series;
};

export const buildSimulatedLatestTrade = (
  asset: FutureAsset,
  timeframe: SimulatedTimeframe,
  referenceNowMs = Date.now()
) => {
  const candles = generateSimulatedFuturesCandles(asset, timeframe, 320, referenceNowMs);
  const latest = candles[candles.length - 1] ?? {
    time: floorToTimeframe(referenceNowMs, timeframe),
    open: asset.basePrice,
    high: asset.basePrice,
    low: asset.basePrice,
    close: asset.basePrice
  };
  const seed = hashString(`${asset.symbol}-${timeframe}-trade-${Math.floor(referenceNowMs / 1000)}`);
  const rand = createSeededRng(seed);
  const secondIndex = Math.floor(referenceNowMs / 1000);
  const stepCycle = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 3, 1, -1, -3];
  const stepOffsetTicks = stepCycle[secondIndex % stepCycle.length] ?? 1;
  const microMove = Math.max(
    asset.tickSize * 2,
    latest.close * timeframeVolatility[timeframe] * 0.04
  );
  const wave = Math.sin(referenceNowMs / 2_500 + seed * 0.0001) * microMove;
  const noise = (rand() - 0.5) * microMove * 1.5;
  const price = roundToTick(
    clamp(
      latest.close + stepOffsetTicks * asset.tickSize + wave * 0.35 + noise * 0.45,
      asset.basePrice * 0.72,
      asset.basePrice * 1.34
    ),
    asset.tickSize
  );

  return {
    price,
    time: referenceNowMs
  };
};
