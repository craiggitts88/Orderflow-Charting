export interface SymbolConfig {
  /** Display label shown in the toolbar */
  label: string;
  /** Binance futures stream symbol (lowercase) */
  value: string;
  /** Default row size (price per footprint row) */
  tickSize: number;
  /** Minimum price increment for this market */
  minTick: number;
  /** Decimal places to show for prices (informational) */
  pricePrecision: number;
}

export const SYMBOLS: SymbolConfig[] = [
  { label: 'BTC/USDT', value: 'btcusdt', tickSize: 5,      minTick: 0.1,    pricePrecision: 0 },
  { label: 'ETH/USDT', value: 'ethusdt', tickSize: 0.5,    minTick: 0.01,   pricePrecision: 1 },
  { label: 'SOL/USDT', value: 'solusdt', tickSize: 0.05,   minTick: 0.001,  pricePrecision: 2 },
  { label: 'BNB/USDT', value: 'bnbusdt', tickSize: 0.1,    minTick: 0.01,   pricePrecision: 1 },
  { label: 'XRP/USDT', value: 'xrpusdt', tickSize: 0.001,  minTick: 0.0001, pricePrecision: 3 },
  { label: 'DOGE/USDT',value: 'dogeusdt',tickSize: 0.0001, minTick: 0.00001,pricePrecision: 4 },
  { label: 'ADA/USDT', value: 'adausdt', tickSize: 0.001,  minTick: 0.0001, pricePrecision: 3 },
  { label: 'AVAX/USDT',value: 'avaxusdt',tickSize: 0.01,   minTick: 0.001,  pricePrecision: 2 },
  { label: 'LINK/USDT',value: 'linkusdt',tickSize: 0.01,   minTick: 0.001,  pricePrecision: 2 },
  { label: 'SUI/USDT', value: 'suiusdt', tickSize: 0.001,  minTick: 0.0001, pricePrecision: 3 },
];

export const defaultSymbol = SYMBOLS[0];
