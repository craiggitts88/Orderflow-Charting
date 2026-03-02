// Mock Rithmic-style Level 2 tick data for order flow visualization

export type Timeframe = '1s' | '5s' | '30s' | '1m' | '3m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D' | 'Range' | 'Tick' | 'Volume';

export const TIMEFRAME_MS: Record<string, number> = {
  '1s': 1000,
  '5s': 5000,
  '30s': 30000,
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1H': 3_600_000,
  '4H': 14_400_000,
  '1D': 86_400_000,
  'Range': 300_000,
  'Tick': 300_000,
  'Volume': 300_000,
};

export const TIMEFRAME_LABELS: string[] = ['1s', '5s', '30s', '1m', '3m', '5m', '15m', '30m', '1H', '4H', '1D', 'Range', 'Tick', 'Volume'];

export interface TickData {
  timestamp: number;
  price: number;
  volume: number;
  side: 'bid' | 'ask';
  aggressor: 'buyer' | 'seller';
}

export interface FootprintRow {
  price: number;
  bidVolume: number;
  askVolume: number;
  delta: number;
  totalVolume: number;
  trades: number;
}

export interface FootprintCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  rows: FootprintRow[];
  totalVolume: number;
  totalDelta: number;
  cvd: number;
  pocPrice: number;
}

const BASE_PRICE = 5425.50;
const TICK_SIZE = 0.25;

function generateFootprintRows(open: number, high: number, low: number, close: number): FootprintRow[] {
  const rows: FootprintRow[] = [];
  const priceRange = Math.round((high - low) / TICK_SIZE);
  const midPrice = (high + low) / 2;

  for (let i = 0; i <= priceRange; i++) {
    const price = low + i * TICK_SIZE;
    const distFromMid = Math.abs(price - midPrice);
    const intensity = Math.max(0.2, 1 - distFromMid / ((high - low) / 2));

    // Generate realistic volume distribution - more at POC, less at extremes
    const baseVol = Math.floor(Math.random() * 200 * intensity + 20);
    const isBullish = close > open;
    const bidBias = isBullish ? 0.55 : 0.45;

    const bidVolume = Math.floor(baseVol * bidBias + Math.random() * 50);
    const askVolume = Math.floor(baseVol * (1 - bidBias) + Math.random() * 50);

    rows.push({
      price,
      bidVolume,
      askVolume,
      delta: askVolume - bidVolume,  // delta = buys(ask) - sells(bid)
      totalVolume: bidVolume + askVolume,
      trades: Math.floor(Math.random() * 30 + 5),
    });
  }

  return rows;
}

export function generateFootprintCandles(count: number, timeframe: string = '5m'): FootprintCandle[] {
  const candles: FootprintCandle[] = [];
  let currentPrice = BASE_PRICE;
  let cumulativeCVD = 0;
  const now = Date.now();
  const candleInterval = TIMEFRAME_MS[timeframe] ?? 300_000;

  for (let i = 0; i < count; i++) {
    const direction = Math.random() > 0.48 ? 1 : -1;
    const range = Math.floor(Math.random() * 12 + 4) * TICK_SIZE;
    const bodySize = Math.floor(Math.random() * 6 + 1) * TICK_SIZE;
    const wickUp = Math.floor(Math.random() * 4) * TICK_SIZE;
    const wickDown = Math.floor(Math.random() * 4) * TICK_SIZE;

    const open = currentPrice;
    const close = open + direction * bodySize;
    const high = Math.max(open, close) + wickUp;
    const low = Math.min(open, close) - wickDown;

    const rows = generateFootprintRows(open, high, low, close);
    const totalVolume = rows.reduce((s, r) => s + r.totalVolume, 0);
    const totalDelta = rows.reduce((s, r) => s + r.delta, 0);
    cumulativeCVD += totalDelta;

    // Find POC (Point of Control) - price with highest volume
    const pocRow = rows.reduce((max, r) => r.totalVolume > max.totalVolume ? r : max, rows[0]);

    candles.push({
      timestamp: now - (count - 1 - i) * candleInterval,  // last candle = now (currently forming)
      open,
      high,
      low,
      close,
      rows,
      totalVolume,
      totalDelta,
      cvd: cumulativeCVD,
      pocPrice: pocRow.price,
    });

    currentPrice = close + (Math.random() - 0.5) * TICK_SIZE * 2;
  }

  return candles;
}

export function generateRealtimeTick(lastPrice: number): TickData {
  const priceChange = (Math.random() - 0.5) * TICK_SIZE * 2;
  const price = Math.round((lastPrice + priceChange) / TICK_SIZE) * TICK_SIZE;
  const side = Math.random() > 0.5 ? 'bid' : 'ask';

  return {
    timestamp: Date.now(),
    price,
    volume: Math.floor(Math.random() * 50 + 1),
    side,
    aggressor: side === 'ask' ? 'buyer' : 'seller',
  };
}
