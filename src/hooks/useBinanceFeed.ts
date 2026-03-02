import { useEffect, useRef, useState } from 'react';
import { FootprintCandle, FootprintRow, TIMEFRAME_MS } from '@/lib/mockData';

export type FeedStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

// ── Binance interval mapping ──────────────────────────────────────────────────
const TF_TO_BINANCE: Record<string, string> = {
  '1s': '1m', '5s': '1m', '30s': '1m',
  '1m': '1m', '3m': '3m', '5m': '5m',
  '15m': '15m', '30m': '30m',
  '1H': '1h', '4H': '4h', '1D': '1d',
  'Range': '5m', 'Tick': '5m', 'Volume': '5m',
};

function binanceInterval(tf: string): string {
  return TF_TO_BINANCE[tf] ?? '5m';
}

interface InternalState {
  candles: FootprintCandle[];
  open: FootprintCandle | null;
  period: number;
  tickSize: number;
}

function bucketPrice(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

function makeEmptyCandle(startTime: number, openPrice: number, prevCvd: number): FootprintCandle {
  return {
    timestamp: startTime,
    open: openPrice,
    high: openPrice,
    low: openPrice,
    close: openPrice,
    rows: [],
    totalVolume: 0,
    totalDelta: 0,
    cvd: prevCvd,
    pocPrice: openPrice,
  };
}

/** Convert a Binance kline array to a FootprintCandle with synthetic row distribution */
function klineToCandle(kline: unknown[], prevCvd: number, tickSize: number): FootprintCandle {
  const openTime     = kline[0]  as number;
  const open         = parseFloat(kline[1] as string);
  const high         = parseFloat(kline[2] as string);
  const low          = parseFloat(kline[3] as string);
  const close        = parseFloat(kline[4] as string);
  const trades       = parseInt(kline[8]   as string, 10);
  const buyBaseVol   = parseFloat(kline[9] as string);
  const totalBaseVol = parseFloat(kline[5] as string);
  const sellBaseVol  = totalBaseVol - buyBaseVol;

  const rows: FootprintRow[] = [];
  const lo     = bucketPrice(low,  tickSize);
  const hi     = bucketPrice(high, tickSize);
  const levels = Math.max(1, Math.round((hi - lo) / tickSize) + 1);
  const mid    = (hi + lo) / 2;

  // Bell-curve weight — more volume near middle (POC approximation)
  // No +0.1 floor: tail levels receive near-zero weight and are excluded if they round to 0
  const weights: number[] = [];
  let wSum = 0;
  for (let i = 0; i < levels; i++) {
    const price = lo + i * tickSize;
    const dist  = Math.abs(price - mid) / ((hi - lo + tickSize) / 2);
    const w     = Math.exp(-4 * dist * dist); // tighter bell, no floor
    weights.push(w);
    wSum += w;
  }

  let totalDelta = 0;
  for (let i = 0; i < levels; i++) {
    const price    = parseFloat((lo + i * tickSize).toFixed(10));
    const frac     = weights[i] / wSum;
    const askVol   = Math.round(buyBaseVol  * frac);
    const bidVol   = Math.round(sellBaseVol * frac);
    if (askVol === 0 && bidVol === 0) continue; // skip phantom zero-volume rows
    const delta    = askVol - bidVol;
    totalDelta    += delta;
    rows.push({ price, bidVolume: bidVol, askVolume: askVol, delta, totalVolume: askVol + bidVol, trades: Math.max(1, Math.round(trades * frac)) });
  }

  const totalVolume = rows.reduce((s, r) => s + r.totalVolume, 0);
  const pocRow      = rows.reduce((mx, r) => r.totalVolume > mx.totalVolume ? r : mx, rows[0]);
  return {
    timestamp: openTime,
    open, high, low, close,
    rows,
    totalVolume,
    totalDelta,
    cvd: prevCvd + totalDelta,
    pocPrice: pocRow.price,
  };
}

async function fetchKlines(
  symbol: string,
  interval: string,
  limit: number,
  tickSize: number,
): Promise<{ closed: FootprintCandle[]; openKlineStart: number; openKlineOpen: number }> {
  const url  = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`Klines HTTP ${res.status}`);
  const data: unknown[][] = await res.json();
  const out: FootprintCandle[] = [];
  for (const k of data.slice(0, -1)) { // exclude still-open last kline
    out.push(klineToCandle(k, out.length > 0 ? out[out.length - 1].cvd : 0, tickSize));
  }
  const lastKline      = data[data.length - 1];
  const openKlineStart = lastKline[0] as number;
  const openKlineOpen  = parseFloat(lastKline[1] as string);
  return { closed: out, openKlineStart, openKlineOpen };
}

/**
 * Fetch real Binance aggTrades for the current open candle window and build
 * an accurate FootprintCandle from actual tick data.
 */
async function fetchOpenCandleFromAggTrades(
  symbol: string,
  startMs: number,
  prevCvd: number,
  tickSize: number,
  openPrice: number,
): Promise<FootprintCandle> {
  const endMs  = Date.now();
  const rowMap = new Map<number, FootprintRow>();
  let closePrice = openPrice;
  let high = openPrice;
  let low  = openPrice;

  let fromTime = startMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `https://fapi.binance.com/fapi/v1/aggTrades?symbol=${symbol.toUpperCase()}&startTime=${fromTime}&endTime=${endMs}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) break;
    const trades: Array<{ p: string; q: string; m: boolean; T: number }> = await res.json();
    if (trades.length === 0) break;

    for (const t of trades) {
      const price  = parseFloat(t.p);
      const qty    = parseFloat(t.q);
      const isSell = t.m;
      const bPrice = bucketPrice(price, tickSize);

      closePrice = price;
      if (price > high) high = price;
      if (price < low)  low  = price;

      let row = rowMap.get(bPrice);
      if (!row) {
        row = { price: bPrice, bidVolume: 0, askVolume: 0, delta: 0, totalVolume: 0, trades: 0 };
        rowMap.set(bPrice, row);
      }
      if (isSell) row.bidVolume += qty;
      else        row.askVolume += qty;
      row.delta       = row.askVolume - row.bidVolume;
      row.totalVolume = row.bidVolume + row.askVolume;
      row.trades++;
    }

    fromTime = trades[trades.length - 1].T + 1;
    if (trades.length < 1000) break; // no more pages
  }

  const rows        = [...rowMap.values()].sort((a, b) => a.price - b.price);
  const totalVolume = rows.reduce((s, r) => s + r.totalVolume, 0);
  const totalDelta  = rows.reduce((s, r) => s + r.delta, 0);
  const pocRow      = rows.length > 0 ? rows.reduce((mx, r) => r.totalVolume > mx.totalVolume ? r : mx, rows[0]) : null;
  return {
    timestamp: startMs,
    open:  openPrice,
    close: closePrice,
    high,
    low,
    rows,
    totalVolume,
    totalDelta,
    cvd: prevCvd + totalDelta,
    pocPrice: pocRow?.price ?? openPrice,
  };
}

export function useBinanceFeed(
  symbol: string,
  timeframe: string,
  tickSize: number,
  enabled: boolean,
  maxCandles = 200,
) {
  const [candles, setCandles] = useState<FootprintCandle[]>([]);
  const [status,  setStatus]  = useState<FeedStatus>('idle');
  const stateRef = useRef<InternalState>({
    candles: [],
    open: null,
    period: TIMEFRAME_MS[timeframe] ?? 60_000,
    tickSize,
  });

  useEffect(() => {
    if (!enabled) {
      setCandles([]);
      setStatus('idle');
      return;
    }

    let alive = true;
    let ws: WebSocket | null = null;
    let displayTimer: ReturnType<typeof setInterval> | null = null;

    stateRef.current = { candles: [], open: null, period: TIMEFRAME_MS[timeframe] ?? 60_000, tickSize };
    setCandles([]);
    setStatus('connecting');

    const period   = TIMEFRAME_MS[timeframe] ?? 60_000;
    const interval = binanceInterval(timeframe);

    // 1. Load historical klines, then fetch real aggTrades for the current open candle
    fetchKlines(symbol, interval, maxCandles + 1, tickSize)
      .then(async ({ closed, openKlineStart, openKlineOpen }) => {
        if (!alive) return;

        stateRef.current.candles = closed;
        const prevCvd = closed.length > 0 ? closed[closed.length - 1].cvd : 0;

        // Show chart immediately with empty open candle while we load real ticks
        const placeholder = makeEmptyCandle(openKlineStart, openKlineOpen, prevCvd);
        stateRef.current.open = placeholder;
        setCandles([...closed, { ...placeholder }]);

        // Fetch real tick data for the current open candle (accurate orderflow)
        let openCandle: FootprintCandle;
        try {
          openCandle = await fetchOpenCandleFromAggTrades(symbol, openKlineStart, prevCvd, tickSize, openKlineOpen);
        } catch {
          openCandle = placeholder;
        }
        if (!alive) return;
        stateRef.current.open = openCandle;
        setCandles([...stateRef.current.candles, { ...openCandle, rows: [...openCandle.rows] }]);

        // 2. Subscribe to live aggTrade stream
        ws = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@aggTrade`);

        ws.onopen  = () => { if (alive) setStatus('connected'); };
        ws.onerror = () => { if (alive) setStatus('error'); };
        ws.onclose = () => { if (alive) setStatus('disconnected'); };

        ws.onmessage = (evt: MessageEvent) => {
          if (!alive) return;
          const msg       = JSON.parse(evt.data as string);
          const price     = parseFloat(msg.p);
          const qty       = parseFloat(msg.q);   // base asset qty (e.g. BTC), not USDT
          const isSell    = msg.m as boolean;
          const tradeTime = msg.T as number;

          const s           = stateRef.current;
          const candleStart = Math.floor(tradeTime / s.period) * s.period;
          const volume      = qty;   // use raw base asset quantity
          const bPrice      = bucketPrice(price, s.tickSize);

          if (!s.open || s.open.timestamp !== candleStart) {
            if (s.open) {
              const closed = { ...s.open, rows: [...s.open.rows] };
              s.candles = [...s.candles.slice(-(maxCandles - 1)), closed];
            }
            const prevCvd = s.candles.length > 0 ? s.candles[s.candles.length - 1].cvd : 0;
            s.open = makeEmptyCandle(candleStart, price, prevCvd);
          }

          const open = s.open!;
          const rows = open.rows;

          let row = rows.find(r => Math.abs(r.price - bPrice) < s.tickSize * 0.5);
          if (!row) {
            row = { price: bPrice, bidVolume: 0, askVolume: 0, delta: 0, totalVolume: 0, trades: 0 };
            rows.push(row);
            rows.sort((a, b) => a.price - b.price);
          }

          if (isSell) { row.bidVolume += volume; }
          else        { row.askVolume += volume; }
          row.delta       = row.askVolume - row.bidVolume;
          row.totalVolume = row.bidVolume + row.askVolume;
          row.trades     += 1;

          open.close = price;
          if (price > open.high) open.high = price;
          if (price < open.low)  open.low  = price;
          open.totalVolume = rows.reduce((a, r) => a + r.totalVolume, 0);
          open.totalDelta  = rows.reduce((a, r) => a + r.delta, 0);
          const prevCvd    = s.candles.length > 0 ? s.candles[s.candles.length - 1].cvd : 0;
          open.cvd         = prevCvd + open.totalDelta;
          open.pocPrice    = rows.reduce((mx, r) => r.totalVolume > mx.totalVolume ? r : mx, rows[0]).price;
        };

        // Throttle UI updates to ~10 fps
        displayTimer = setInterval(() => {
          if (!alive) return;
          const s = stateRef.current;
          const snapshot: FootprintCandle[] = s.open
            ? [...s.candles, { ...s.open, rows: [...s.open.rows] }]
            : [...s.candles];
          if (snapshot.length > 0) setCandles(snapshot);
        }, 100);
      })
      .catch(() => {
        if (alive) setStatus('error');
      });

    return () => {
      alive = false;
      if (displayTimer) clearInterval(displayTimer);
      if (ws) ws.close();
    };
  }, [symbol, timeframe, tickSize, enabled, maxCandles]);

  return { candles, status };
}
