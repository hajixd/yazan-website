import { NextResponse } from "next/server";
import { futuresAssets, getAssetBySymbol } from "../../../../lib/futuresCatalog";
import { buildSimulatedLatestTrade } from "../../../../lib/simulatedFutures";

type DatabentoTradeRecord = {
  hd?: {
    ts_event?: string;
  };
  price?: string | number;
};

const DATABENTO_HISTORICAL_URL = "https://hist.databento.com/v0/timeseries.get_range";
const DATABENTO_DATASET = "GLBX.MDP3";
const RECENT_TRADE_WINDOW_MS = 10 * 60_000;

const normalizeNumber = (value: string | number | undefined): number => {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : NaN;
};

const buildDatabentoUrl = (databentoSymbol: string, startMs: number, endMs: number) => {
  const url = new URL(DATABENTO_HISTORICAL_URL);

  url.searchParams.set("dataset", DATABENTO_DATASET);
  url.searchParams.set("symbols", databentoSymbol);
  url.searchParams.set("stype_in", "continuous");
  url.searchParams.set("schema", "trades");
  url.searchParams.set("start", new Date(startMs).toISOString());
  url.searchParams.set("end", new Date(endMs).toISOString());
  url.searchParams.set("encoding", "json");
  url.searchParams.set("pretty_px", "true");
  url.searchParams.set("pretty_ts", "true");

  return url;
};

const parseLatestTrade = (payload: string) => {
  const lines = payload.split("\n");
  let latestTrade: { price: number; time: number } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    try {
      const record = JSON.parse(line) as DatabentoTradeRecord;
      const time = record.hd?.ts_event ? Date.parse(record.hd.ts_event) : NaN;
      const price = normalizeNumber(record.price);

      if (!Number.isFinite(time) || !Number.isFinite(price)) {
        continue;
      }

      if (!latestTrade || time >= latestTrade.time) {
        latestTrade = { price, time };
      }
    } catch {
      continue;
    }
  }

  return latestTrade;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = String(searchParams.get("symbol") || futuresAssets[0].symbol).toUpperCase();
  const asset = getAssetBySymbol(symbol);

  if (!futuresAssets.some((entry) => entry.symbol === symbol)) {
    return NextResponse.json({ error: "Unsupported futures symbol." }, { status: 400 });
  }

  const apiKey = process.env.DATABENTO_API_KEY || process.env.DATABENTO_KEY;

  if (!apiKey) {
    const latestTrade = buildSimulatedLatestTrade(asset, "15m");

    return NextResponse.json(
      {
        symbol: asset.symbol,
        price: latestTrade.price,
        time: latestTrade.time,
        meta: {
          provider: "Simulation",
          dataset: "local",
          schema: "simulated-trades",
          databentoSymbol: asset.symbol,
          updatedAt: new Date().toISOString()
        }
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  const endMs = Date.now();
  const startMs = endMs - RECENT_TRADE_WINDOW_MS;
  const response = await fetch(buildDatabentoUrl(asset.databentoSymbol, startMs, endMs), {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });
  const payload = await response.text();

  if (!response.ok) {
    return NextResponse.json(
      {
        error: payload.slice(0, 240) || `Databento trade request failed with ${response.status}`
      },
      { status: 502 }
    );
  }

  const latestTrade = parseLatestTrade(payload);

  if (!latestTrade) {
    return NextResponse.json(
      {
        error: "Databento returned no recent trades for this symbol."
      },
      { status: 404 }
    );
  }

  return NextResponse.json(
    {
      symbol: asset.symbol,
      price: latestTrade.price,
      time: latestTrade.time,
      meta: {
        provider: "Databento",
        dataset: DATABENTO_DATASET,
        schema: "trades",
        databentoSymbol: asset.databentoSymbol,
        updatedAt: new Date().toISOString()
      }
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
