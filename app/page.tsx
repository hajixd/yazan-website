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
};

const futuresAssets: FutureAsset[] = [
  {
    symbol: "BTCUSDT.P",
    name: "Bitcoin Perpetual",
    price: 64238.7,
    change: 2.42,
    volume: "$7.8B",
    openInterest: "$20.4B",
    funding: "+0.012%"
  },
  {
    symbol: "ETHUSDT.P",
    name: "Ethereum Perpetual",
    price: 3421.85,
    change: 1.88,
    volume: "$4.2B",
    openInterest: "$10.1B",
    funding: "+0.009%"
  },
  {
    symbol: "SOLUSDT.P",
    name: "Solana Perpetual",
    price: 187.54,
    change: -0.74,
    volume: "$1.6B",
    openInterest: "$2.8B",
    funding: "-0.004%"
  },
  {
    symbol: "XRPUSDT.P",
    name: "XRP Perpetual",
    price: 0.6943,
    change: 0.58,
    volume: "$1.1B",
    openInterest: "$1.9B",
    funding: "+0.003%"
  },
  {
    symbol: "BNBUSDT.P",
    name: "BNB Perpetual",
    price: 585.19,
    change: -1.12,
    volume: "$760M",
    openInterest: "$1.3B",
    funding: "-0.001%"
  },
  {
    symbol: "DOGEUSDT.P",
    name: "Dogecoin Perpetual",
    price: 0.1921,
    change: 3.17,
    volume: "$950M",
    openInterest: "$1.4B",
    funding: "+0.015%"
  },
  {
    symbol: "AVAXUSDT.P",
    name: "Avalanche Perpetual",
    price: 42.16,
    change: -2.06,
    volume: "$480M",
    openInterest: "$780M",
    funding: "-0.008%"
  },
  {
    symbol: "LINKUSDT.P",
    name: "Chainlink Perpetual",
    price: 19.84,
    change: 0.94,
    volume: "$420M",
    openInterest: "$640M",
    funding: "+0.006%"
  }
];

const timeframes = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];
const selectedTimeframe = "4H";
const closes = [
  63880, 63922, 63908, 63966, 64014, 63991, 64052, 64083, 64045, 64092, 64138,
  64108, 64172, 64144, 64196, 64208, 64180, 64236, 64222, 64258, 64214, 64281,
  64308, 64267, 64314, 64294, 64336, 64381, 64348, 64394, 64422, 64397
];

const candles: Candle[] = closes.map((close, index) => {
  const open = index === 0 ? 63842 : closes[index - 1];
  const high = Math.max(open, close) + 20 + (index % 4) * 5;
  const low = Math.min(open, close) - 18 - (index % 3) * 4;
  const volume = 52 + Math.abs(close - open) * 0.9 + (index % 5) * 7;

  return { open, close, high, low, volume };
});

const formatPrice = (price: number) => {
  if (price < 1) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    });
  }

  if (price < 100) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  return price.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2
  });
};

export default function Home() {
  const currentAsset = futuresAssets[0];
  const maxPrice = Math.max(...candles.map((candle) => candle.high));
  const minPrice = Math.min(...candles.map((candle) => candle.low));
  const priceSpan = maxPrice - minPrice;
  const maxVolume = Math.max(...candles.map((candle) => candle.volume));
  const candleStep = 100 / (candles.length - 1);

  const yAxisLevels = Array.from({ length: 6 }, (_, index) => {
    return maxPrice - ((maxPrice - minPrice) * index) / 5;
  });

  return (
    <main className="page-shell">
      <div className="ambient-glow ambient-glow--one" />
      <div className="ambient-glow ambient-glow--two" />

      <div className="trading-layout">
        <section className="chart-section">
          <header className="chart-header">
            <div className="asset-title-block">
              <p className="label">Current Asset</p>
              <h1>{currentAsset.symbol}</h1>
              <p className="asset-subtitle">{currentAsset.name}</p>

              <div className="spot-line">
                <span className="spot-price">${formatPrice(currentAsset.price)}</span>
                <span
                  className={`delta ${
                    currentAsset.change >= 0 ? "positive" : "negative"
                  }`}
                >
                  {currentAsset.change >= 0 ? "+" : ""}
                  {currentAsset.change.toFixed(2)}%
                </span>
                <span className="subtle">24h</span>
              </div>
            </div>

            <nav className="timeframe-tabs" aria-label="Chart timeframes">
              {timeframes.map((frame) => (
                <button
                  type="button"
                  key={frame}
                  className={`timeframe-tab ${
                    frame === selectedTimeframe ? "active" : ""
                  }`}
                >
                  {frame}
                </button>
              ))}
            </nav>
          </header>

          <div className="chart-card">
            <div className="chart-meta-row">
              <div className="meta-chip">
                Mark <strong>${formatPrice(currentAsset.price - 11.6)}</strong>
              </div>
              <div className="meta-chip">
                Index <strong>${formatPrice(currentAsset.price - 29.3)}</strong>
              </div>
              <div className="meta-chip">
                Funding <strong>{currentAsset.funding}</strong>
              </div>
              <div className="meta-chip">
                OI <strong>{currentAsset.openInterest}</strong>
              </div>
            </div>

            <div className="chart-area">
              <div className="y-axis" aria-hidden>
                {yAxisLevels.map((level, index) => (
                  <span key={`${level}-${index}`}>${formatPrice(level)}</span>
                ))}
              </div>

              <div className="plot-area" aria-label="candlestick chart">
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
                        key={`${index}-volume`}
                        className={`volume-bar ${isUp ? "up" : "down"}`}
                        style={{
                          left: `${index * candleStep}%`,
                          height: `${Math.max(6, height)}%`
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="futures-panel">
          <div className="panel-header">
            <div>
              <p className="label">Markets</p>
              <h2>Futures Watchlist</h2>
            </div>
            <button type="button" className="ghost-btn">
              Filter
            </button>
          </div>

          <ul className="asset-list">
            {futuresAssets.map((asset) => (
              <li key={asset.symbol} className="asset-item">
                <div className="asset-row">
                  <div>
                    <p className="asset-symbol">{asset.symbol}</p>
                    <p className="asset-name">{asset.name}</p>
                  </div>

                  <div className="asset-price-wrap">
                    <p className="asset-price">${formatPrice(asset.price)}</p>
                    <p
                      className={`asset-change ${
                        asset.change >= 0 ? "positive" : "negative"
                      }`}
                    >
                      {asset.change >= 0 ? "+" : ""}
                      {asset.change.toFixed(2)}%
                    </p>
                  </div>
                </div>

                <div className="asset-stats">
                  <span>Vol {asset.volume}</span>
                  <span>OI {asset.openInterest}</span>
                  <span>Funding {asset.funding}</span>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
