export type FutureAsset = {
  symbol: string;
  databentoSymbol: string;
  name: string;
  venue: string;
  category: string;
  contract: string;
  basePrice: number;
};

export const futuresAssets: FutureAsset[] = [
  {
    symbol: "ES",
    databentoSymbol: "ES.c.0",
    name: "E-mini S&P 500",
    venue: "CME",
    category: "Equity Index",
    contract: "Front month continuous",
    basePrice: 6771.0
  },
  {
    symbol: "NQ",
    databentoSymbol: "NQ.c.0",
    name: "E-mini Nasdaq-100",
    venue: "CME",
    category: "Equity Index",
    contract: "Front month continuous",
    basePrice: 21314.5
  },
  {
    symbol: "RTY",
    databentoSymbol: "RTY.c.0",
    name: "E-mini Russell 2000",
    venue: "CME",
    category: "Equity Index",
    contract: "Front month continuous",
    basePrice: 2312.8
  },
  {
    symbol: "YM",
    databentoSymbol: "YM.c.0",
    name: "E-mini Dow",
    venue: "CBOT",
    category: "Equity Index",
    contract: "Front month continuous",
    basePrice: 42085
  },
  {
    symbol: "CL",
    databentoSymbol: "CL.c.0",
    name: "WTI Crude Oil",
    venue: "NYMEX",
    category: "Energy",
    contract: "Front month continuous",
    basePrice: 67.35
  },
  {
    symbol: "NG",
    databentoSymbol: "NG.c.0",
    name: "Henry Hub Natural Gas",
    venue: "NYMEX",
    category: "Energy",
    contract: "Front month continuous",
    basePrice: 4.18
  },
  {
    symbol: "MGC",
    databentoSymbol: "MGC.c.0",
    name: "Micro Gold",
    venue: "COMEX",
    category: "Metals",
    contract: "Front month continuous",
    basePrice: 2945.3
  },
  {
    symbol: "HG",
    databentoSymbol: "HG.c.0",
    name: "Copper",
    venue: "COMEX",
    category: "Metals",
    contract: "Front month continuous",
    basePrice: 4.73
  },
  {
    symbol: "ZN",
    databentoSymbol: "ZN.c.0",
    name: "10-Year Treasury Note",
    venue: "CBOT",
    category: "Rates",
    contract: "Front month continuous",
    basePrice: 111.25
  },
  {
    symbol: "6E",
    databentoSymbol: "6E.c.0",
    name: "Euro FX",
    venue: "CME",
    category: "FX",
    contract: "Front month continuous",
    basePrice: 1.0836
  },
  {
    symbol: "6J",
    databentoSymbol: "6J.c.0",
    name: "Japanese Yen",
    venue: "CME",
    category: "FX",
    contract: "Front month continuous",
    basePrice: 0.00672
  },
  {
    symbol: "6A",
    databentoSymbol: "6A.c.0",
    name: "Australian Dollar",
    venue: "CME",
    category: "FX",
    contract: "Front month continuous",
    basePrice: 0.6484
  }
];

export const getAssetBySymbol = (symbol: string): FutureAsset => {
  return futuresAssets.find((asset) => asset.symbol === symbol) ?? futuresAssets[0];
};
