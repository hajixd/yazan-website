export const DATABENTO_DATASET = "GLBX.MDP3";

export type DatabentoLiveMeta = {
  provider: string;
  dataset: string;
  schema: string;
  databentoSymbol: string;
  updatedAt: string;
  resolvedSymbol?: string | null;
};

export type DatabentoOrderBookLevel = {
  bidPrice: number;
  askPrice: number;
  bidSize: number;
  askSize: number;
  bidFillPct: number;
  askFillPct: number;
};

export type DatabentoOrderBookSnapshot = {
  levels: DatabentoOrderBookLevel[];
  bestBid: number;
  bestAsk: number;
  spread: number;
  bidTotal: number;
  askTotal: number;
  imbalance: number;
};

export type DatabentoLiveTradeEvent = {
  type: "trade";
  symbol: string;
  price: number;
  size: number;
  side?: "A" | "B" | "N";
  sequence?: number;
  time: number;
  meta: DatabentoLiveMeta;
};

export type DatabentoLiveBookEvent = {
  type: "book";
  symbol: string;
  time: number;
  snapshot: DatabentoOrderBookSnapshot;
  meta: DatabentoLiveMeta;
};

export type DatabentoLiveStatusEvent = {
  type: "status";
  symbol: string;
  state: "opening" | "connecting" | "connected" | "reconnecting" | "stopped";
  message: string;
  time: number;
  meta?: DatabentoLiveMeta;
};

export type DatabentoLiveErrorEvent = {
  type: "error";
  symbol: string;
  message: string;
  retrying: boolean;
  time: number;
  meta?: Partial<DatabentoLiveMeta>;
};

export type DatabentoLiveEvent =
  | DatabentoLiveTradeEvent
  | DatabentoLiveBookEvent
  | DatabentoLiveStatusEvent
  | DatabentoLiveErrorEvent;

export type DatabentoLatestTradeResponse = {
  symbol: string;
  price: number;
  time: number;
  meta?: DatabentoLiveMeta;
  error?: string;
};
