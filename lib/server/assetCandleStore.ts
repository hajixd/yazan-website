import { FieldValue } from "firebase-admin/firestore";
import { DATABENTO_DATASET, type DatabentoLiveMeta } from "../databentoLive";
import type { FutureAsset } from "../futuresCatalog";
import { firebaseDb, hasFirebaseAdmin } from "./firebaseAdmin";

export type StoredCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type CandleStoreMeta = Partial<DatabentoLiveMeta> & {
  provider?: string;
  sourceTimeframe?: string;
};

type FirestoreCandleDocument = StoredCandle & {
  dataset?: string;
  databentoSymbol?: string;
  provider?: string;
  schema?: string;
  sourceTimeframe?: string;
  symbol?: string;
  timeframe?: string;
  timeIso?: string;
};

const DEFAULT_MARKET_DATA_COLLECTION = "yazanMarketAssets";
const MAX_BATCH_SIZE = 450;

const marketDataCollectionName = () => {
  return (
    process.env.FIREBASE_MARKET_DATA_COLLECTION?.trim() ||
    DEFAULT_MARKET_DATA_COLLECTION
  );
};

const normalizeSymbol = (symbol: string) => {
  return symbol.trim().toUpperCase();
};

const candleDocumentId = (timeMs: number) => {
  return String(Math.floor(timeMs));
};

const assetDocumentRef = (symbol: string) => {
  return firebaseDb().collection(marketDataCollectionName()).doc(normalizeSymbol(symbol));
};

const timeframeDocumentRef = (symbol: string, timeframe: string) => {
  return assetDocumentRef(symbol).collection("timeframes").doc(timeframe);
};

const candleCollectionRef = (symbol: string, timeframe: string) => {
  return timeframeDocumentRef(symbol, timeframe).collection("candles");
};

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const normalizeCandle = (value: StoredCandle): StoredCandle | null => {
  if (
    !isFiniteNumber(value.time) ||
    !isFiniteNumber(value.open) ||
    !isFiniteNumber(value.high) ||
    !isFiniteNumber(value.low) ||
    !isFiniteNumber(value.close)
  ) {
    return null;
  }

  return {
    time: Math.floor(value.time),
    open: value.open,
    high: value.high,
    low: value.low,
    close: value.close,
    ...(isFiniteNumber(value.volume) ? { volume: value.volume } : {})
  };
};

const candleFromDocument = (data: FirestoreCandleDocument): StoredCandle | null => {
  return normalizeCandle(data);
};

export const marketCandleStorageMode = (): "firebase" | "databento" => {
  return hasFirebaseAdmin() ? "firebase" : "databento";
};

export const readStoredCandles = async (
  symbol: string,
  timeframe: string,
  count: number,
  beforeMs?: number
): Promise<StoredCandle[] | null> => {
  if (!hasFirebaseAdmin()) {
    return null;
  }

  let query = candleCollectionRef(symbol, timeframe)
    .orderBy("time", "desc")
    .limit(Math.max(1, count));

  if (typeof beforeMs === "number" && Number.isFinite(beforeMs)) {
    query = query.where("time", "<", Math.floor(beforeMs));
  }

  const snapshot = await query.get();
  const candles = snapshot.docs
    .map((document) => candleFromDocument(document.data() as FirestoreCandleDocument))
    .filter((candle): candle is StoredCandle => candle !== null)
    .sort((left, right) => left.time - right.time);

  return candles;
};

export const buildStoredCandlesMeta = (
  asset: FutureAsset,
  timeframe: string,
  updatedAt = new Date().toISOString()
) => {
  return {
    provider: "Firebase Firestore",
    dataset: DATABENTO_DATASET,
    sourceTimeframe: timeframe,
    databentoSymbol: asset.databentoSymbol,
    updatedAt
  };
};

export const upsertStoredCandles = async (
  asset: FutureAsset,
  timeframe: string,
  candles: StoredCandle[],
  meta: CandleStoreMeta = {}
): Promise<void> => {
  if (!hasFirebaseAdmin() || candles.length === 0) {
    return;
  }

  const normalizedCandles = candles
    .map(normalizeCandle)
    .filter((candle): candle is StoredCandle => candle !== null);

  if (normalizedCandles.length === 0) {
    return;
  }

  const db = firebaseDb();
  const assetRef = assetDocumentRef(asset.symbol);
  const timeframeRef = timeframeDocumentRef(asset.symbol, timeframe);
  const latestCandleTime = Math.max(...normalizedCandles.map((candle) => candle.time));
  const earliestCandleTime = Math.min(...normalizedCandles.map((candle) => candle.time));
  const updatedAt = meta.updatedAt ?? new Date().toISOString();

  for (let index = 0; index < normalizedCandles.length; index += MAX_BATCH_SIZE) {
    const batch = db.batch();
    const chunk = normalizedCandles.slice(index, index + MAX_BATCH_SIZE);

    batch.set(
      assetRef,
      {
        category: asset.category,
        contract: asset.contract,
        databentoSymbol: asset.databentoSymbol,
        name: asset.name,
        symbol: asset.symbol,
        tickSize: asset.tickSize,
        updatedAt,
        venue: asset.venue,
        serverUpdatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    batch.set(
      timeframeRef,
      {
        dataset: meta.dataset ?? DATABENTO_DATASET,
        databentoSymbol: meta.databentoSymbol ?? asset.databentoSymbol,
        earliestCandleTime,
        latestCandleTime,
        latestCandleTimeIso: new Date(latestCandleTime).toISOString(),
        lastBatchSize: chunk.length,
        provider: meta.provider ?? "Databento",
        schema: meta.schema ?? timeframe,
        sourceTimeframe: meta.sourceTimeframe ?? timeframe,
        symbol: asset.symbol,
        timeframe,
        updatedAt,
        serverUpdatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    for (const candle of chunk) {
      batch.set(
        timeframeRef.collection("candles").doc(candleDocumentId(candle.time)),
        {
          ...candle,
          dataset: meta.dataset ?? DATABENTO_DATASET,
          databentoSymbol: meta.databentoSymbol ?? asset.databentoSymbol,
          provider: meta.provider ?? "Databento",
          schema: meta.schema ?? timeframe,
          sourceTimeframe: meta.sourceTimeframe ?? timeframe,
          symbol: asset.symbol,
          timeframe,
          timeIso: new Date(candle.time).toISOString(),
          updatedAt,
          serverUpdatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    await batch.commit();
  }
};

export const upsertStoredCandle = async (
  asset: FutureAsset,
  timeframe: string,
  candle: StoredCandle,
  meta: CandleStoreMeta = {}
): Promise<void> => {
  await upsertStoredCandles(asset, timeframe, [candle], meta);
};
