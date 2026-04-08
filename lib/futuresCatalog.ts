export type FutureAsset = {
  symbol: string;
  databentoSymbol: string;
  name: string;
  venue: string;
  category: string;
  contract: string;
  basePrice: number;
  tickSize: number;
};

export const futuresAssets: FutureAsset[] = [
  {
    symbol: "ES",
    databentoSymbol: "ES.c.0",
    name: "E-mini S&P 500",
    venue: "CME",
    category: "Equity Index",
    contract: "Front month continuous",
    basePrice: 6398.0,
    tickSize: 0.25
  },
  {
    symbol: "NQ",
    databentoSymbol: "NQ.c.0",
    name: "E-mini Nasdaq-100",
    venue: "CME",
    category: "Equity Index",
    contract: "Front month continuous",
    basePrice: 23254.25,
    tickSize: 0.25
  },
  {
    symbol: "RTY",
    databentoSymbol: "RTY.c.0",
    name: "E-mini Russell 2000",
    venue: "CME",
    category: "Equity Index",
    contract: "Front month continuous",
    basePrice: 2456.0,
    tickSize: 0.1
  },
  {
    symbol: "YM",
    databentoSymbol: "YM.c.0",
    name: "E-mini Dow",
    venue: "CBOT",
    category: "Equity Index",
    contract: "Front month continuous",
    basePrice: 45310.0,
    tickSize: 1
  },
  {
    symbol: "CL",
    databentoSymbol: "CL.c.0",
    name: "WTI Crude Oil",
    venue: "NYMEX",
    category: "Energy",
    contract: "Front month continuous",
    basePrice: 101.18,
    tickSize: 0.01
  },
  {
    symbol: "NG",
    databentoSymbol: "NG.c.0",
    name: "Henry Hub Natural Gas",
    venue: "NYMEX",
    category: "Energy",
    contract: "Front month continuous",
    basePrice: 3.081,
    tickSize: 0.001
  },
  {
    symbol: "MGC",
    databentoSymbol: "MGC.c.0",
    name: "Micro Gold",
    venue: "COMEX",
    category: "Metals",
    contract: "Front month continuous",
    basePrice: 4488.9,
    tickSize: 0.1
  },
  {
    symbol: "SIL",
    databentoSymbol: "SIL.c.0",
    name: "Micro Silver",
    venue: "COMEX",
    category: "Metals",
    contract: "Front month continuous",
    basePrice: 34.725,
    tickSize: 0.001
  },
  {
    symbol: "SI",
    databentoSymbol: "SI.c.0",
    name: "Silver",
    venue: "COMEX",
    category: "Metals",
    contract: "Front month continuous",
    basePrice: 34.725,
    tickSize: 0.005
  },
  {
    symbol: "HG",
    databentoSymbol: "HG.c.0",
    name: "Copper",
    venue: "COMEX",
    category: "Metals",
    contract: "Front month continuous",
    basePrice: 5.454,
    tickSize: 0.0005
  },
  {
    symbol: "ZN",
    databentoSymbol: "ZN.c.0",
    name: "10-Year Treasury Note",
    venue: "CBOT",
    category: "Rates",
    contract: "Front month continuous",
    basePrice: 110.1875,
    tickSize: 0.015625
  },
  {
    symbol: "6E",
    databentoSymbol: "6E.c.0",
    name: "Euro FX",
    venue: "CME",
    category: "FX",
    contract: "Front month continuous",
    basePrice: 1.1521,
    tickSize: 0.00005
  },
  {
    symbol: "6J",
    databentoSymbol: "6J.c.0",
    name: "Japanese Yen",
    venue: "CME",
    category: "FX",
    contract: "Front month continuous",
    basePrice: 0.0062485,
    tickSize: 0.0000005
  },
  {
    symbol: "6A",
    databentoSymbol: "6A.c.0",
    name: "Australian Dollar",
    venue: "CME",
    category: "FX",
    contract: "Front month continuous",
    basePrice: 0.6865,
    tickSize: 0.00005
  }
];

export const getAssetBySymbol = (symbol: string): FutureAsset => {
  return futuresAssets.find((asset) => asset.symbol === symbol) ?? futuresAssets[0];
};
