type FutureAsset = {
  symbol: string;
  name: string;
  price: number;
  change: number;
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
  time: string;
};

const futuresAssets: FutureAsset[] = [
  {
    symbol: "BTCUSDT.P",
    name: "Bitcoin Perpetual",
    price: 64238.7,
    change: 2.42,
    volume: "7.8B",
    openInterest: "20.4B",
    funding: "+0.012%"
  },
  {
    symbol: "ETHUSDT.P",
    name: "Ethereum Perpetual",
    price: 3421.85,
    change: 1.88,
    volume: "4.2B",
    openInterest: "10.1B",
    funding: "+0.009%"
  },
  {
    symbol: "SOLUSDT.P",
    name: "Solana Perpetual",
    price: 187.54,
    change: -0.74,
    volume: "1.6B",
    openInterest: "2.8B",
    funding: "-0.004%"
  },
  {
    symbol: "XRPUSDT.P",
    name: "XRP Perpetual",
    price: 0.6943,
    change: 0.58,
    volume: "1.1B",
    openInterest: "1.9B",
    funding: "+0.003%"
  },
  {
    symbol: "BNBUSDT.P",
    name: "BNB Perpetual",
    price: 585.19,
    change: -1.12,
    volume: "760M",
    openInterest: "1.3B",
    funding: "-0.001%"
  },
  {
    symbol: "DOGEUSDT.P",
    name: "Dogecoin Perpetual",
    price: 0.1921,
    change: 3.17,
    volume: "950M",
    openInterest: "1.4B",
    funding: "+0.015%"
  },
  {
    symbol: "AVAXUSDT.P",
    name: "Avalanche Perpetual",
    price: 42.16,
    change: -2.06,
    volume: "480M",
    openInterest: "780M",
    funding: "-0.008%"
  },
  {
    symbol: "LINKUSDT.P",
    name: "Chainlink Perpetual",
    price: 19.84,
    change: 0.94,
    volume: "420M",
    openInterest: "640M",
    funding: "+0.006%"
  },
  {
    symbol: "ADAUSDT.P",
    name: "Cardano Perpetual",
    price: 0.7862,
    change: -0.22,
    volume: "390M",
    openInterest: "590M",
    funding: "-0.002%"
  },
  {
    symbol: "SUIUSDT.P",
    name: "Sui Perpetual",
    price: 1.79,
    change: 2.04,
    volume: "280M",
    openInterest: "410M",
    funding: "+0.011%"
  }
];

const timeframes = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];
const selectedTimeframe = "4H";
const closeSeries = [
  63880, 63910, 63896, 63944, 63990, 63972, 64018, 64074, 64040, 64083, 64122,
  64096, 64144, 64122, 64181, 64198, 64156, 64204, 64184, 64232, 64192, 64262,
  64296, 64250, 64288, 64261, 64308, 64354, 64327, 64385, 64418, 64378, 64412,
  64390, 64444, 64422, 64469, 64446
];

const candles: Candle[] = closeSeries.map((close, index) => {
  const open = index === 0 ? 63840 : closeSeries[index - 1];
  const high = Math.max(open, close) + 18 + (index % 4) * 4;
  const low = Math.min(open, close) - 16 - (index % 3) * 3;
  const volume = 60 + Math.abs(close - open) * 0.9 + (index % 6) * 8;
  const hour = (8 + index) % 24;

  return {
    open,
    close,
    high,
    low,
    volume,
    time: `${hour.toString().padStart(2, "0")}:00`
  };
});

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

export default function Home() {
  const currentAsset = futuresAssets[0];
  const lastCandle = candles[candles.length - 1];
  const maxPrice = Math.max(...candles.map((c) => c.high));
  const minPrice = Math.min(...candles.map((c) => c.low));
  const priceSpan = maxPrice - minPrice;
  const maxVolume = Math.max(...candles.map((c) => c.volume));
  const candleStep = 100 / (candles.length - 1);

  const yAxis = Array.from({ length: 8 }, (_, index) => {
    return maxPrice - ((maxPrice - minPrice) * index) / 7;
  });

  const xAxis = candles.filter((_, index) => index % 6 === 0);

  return (
    <main className="terminal">
      <header className="topbar">
        <div className="brand-area">
          <div className="brand-mark">TV</div>
          <div className="asset-meta">
            <h1>{currentAsset.symbol}</h1>
            <p>{currentAsset.name}</p>
          </div>
          <div className="live-quote">
            <span>${formatPrice(currentAsset.price)}</span>
            <span className={currentAsset.change >= 0 ? "up" : "down"}>
              {currentAsset.change >= 0 ? "+" : ""}
              {currentAsset.change.toFixed(2)}%
            </span>
          </div>
        </div>

        <nav className="timeframe-row" aria-label="timeframes">
          {timeframes.map((frame) => (
            <button
              key={frame}
              type="button"
              className={`timeframe ${frame === selectedTimeframe ? "active" : ""}`}
            >
              {frame}
            </button>
          ))}
        </nav>
      </header>

      <section className="workspace">
        <aside className="left-tools" aria-label="chart tools">
          {[
            "Cursor",
            "Cross",
            "Trend",
            "Fib",
            "Brush",
            "Text",
            "Measure",
            "Zoom"
          ].map((tool) => (
            <button type="button" key={tool} className="tool-btn" title={tool}>
              {tool.slice(0, 1)}
            </button>
          ))}
        </aside>

        <section className="chart-wrap">
          <div className="chart-toolbar">
            <span>
              O <strong>{formatPrice(lastCandle.open)}</strong>
            </span>
            <span>
              H <strong>{formatPrice(lastCandle.high)}</strong>
            </span>
            <span>
              L <strong>{formatPrice(lastCandle.low)}</strong>
            </span>
            <span>
              C <strong>{formatPrice(lastCandle.close)}</strong>
            </span>
            <span>
              Funding <strong>{currentAsset.funding}</strong>
            </span>
            <span>
              OI <strong>{currentAsset.openInterest}</strong>
            </span>
          </div>

          <div className="chart-surface">
            <div className="price-axis" aria-hidden>
              {yAxis.map((level, index) => (
                <span key={`${level}-${index}`}>${formatPrice(level)}</span>
              ))}
            </div>

            <div className="plot" aria-label="candlestick chart">
              <div className="candles-layer">
                {candles.map((candle, index) => {
                  const isUp = candle.close >= candle.open;
                  const highTop = ((maxPrice - candle.high) / priceSpan) * 100;
                  const lowTop = ((maxPrice - candle.low) / priceSpan) * 100;
                  const openTop = ((maxPrice - candle.open) / priceSpan) * 100;
                  const closeTop = ((maxPrice - candle.close) / priceSpan) * 100;
                  const bodyTop = Math.min(openTop, closeTop);
                  const bodyHeight = Math.max(1.2, Math.abs(closeTop - openTop));
                  const wickHeight = Math.max(1.2, lowTop - highTop);

                  return (
                    <div
                      key={`${index}-${candle.close}`}
                      className={`candle ${isUp ? "up" : "down"}`}
                      style={{ left: `${index * candleStep}%` }}
                    >
                      <span
                        className="wick"
                        style={{ top: `${highTop}%`, height: `${wickHeight}%` }}
                      />
                      <span
                        className="body"
                        style={{ top: `${bodyTop}%`, height: `${bodyHeight}%` }}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="volume-layer" aria-hidden>
                {candles.map((candle, index) => {
                  const height = (candle.volume / maxVolume) * 100;
                  const isUp = candle.close >= candle.open;

                  return (
                    <span
                      key={`${index}-${candle.volume}`}
                      className={`volume ${isUp ? "up" : "down"}`}
                      style={{
                        left: `${index * candleStep}%`,
                        height: `${Math.max(5, height)}%`
                      }}
                    />
                  );
                })}
              </div>

              <div className="time-axis" aria-hidden>
                {xAxis.map((item, index) => (
                  <span key={`${index}-${item.time}`}>{item.time}</span>
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
            {futuresAssets.map((asset) => (
              <li key={asset.symbol} className="watchlist-row">
                <div className="symbol-col">
                  <p>{asset.symbol}</p>
                  <small>{asset.name}</small>
                </div>

                <div className="num-col">{formatPrice(asset.price)}</div>
                <div className={`num-col ${asset.change >= 0 ? "up" : "down"}`}>
                  {asset.change >= 0 ? "+" : ""}
                  {asset.change.toFixed(2)}
                </div>
                <div className="num-col">{asset.volume}</div>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <footer className="statusbar">
        <span>{currentAsset.symbol}</span>
        <span>{selectedTimeframe}</span>
        <span>UTC</span>
        <span>Volume profile</span>
        <span>Auto</span>
      </footer>
    </main>
  );
}
