import { useEffect, useRef, useState } from 'react';
import { FootprintCandle, FootprintRow, TIMEFRAME_MS } from '@/lib/mockData';

export type FeedStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface InternalState {
  candles: FootprintCandle[];      // committed (closed) candles
  open: FootprintCandle | null;    // current building candle
  period: number;                  // timeframe in ms
  tickSize: number;
}

function bucketPrice(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

function makeCandle(startTime: number, openPrice: number, prevCvd: number): FootprintCandle {
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

export function useBinanceFeed(
  symbol: string,
  timeframe: string,
  tickSize: number,
  enabled: boolean,
  maxCandles = 200,
) {
  const [candles, setCandles] = useState<FootprintCandle[]>([]);
  const [status, setStatus] = useState<FeedStatus>('idle');
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

    // Reset state whenever symbol / timeframe / tickSize changes
    stateRef.current = {
      candles: [],
      open: null,
      period: TIMEFRAME_MS[timeframe] ?? 60_000,
      tickSize,
    };
    setCandles([]);
    setStatus('connecting');

    const url = `wss://fstream.binance.com/ws/${symbol}@aggTrade`;
    let ws: WebSocket;
    let alive = true;

    try {
      ws = new WebSocket(url);
    } catch {
      setStatus('error');
      return;
    }

    ws.onopen = () => { if (alive) setStatus('connected'); };
    ws.onerror = () => { if (alive) setStatus('error'); };
    ws.onclose = () => { if (alive) setStatus('disconnected'); };

    ws.onmessage = (evt: MessageEvent) => {
      if (!alive) return;
      const msg = JSON.parse(evt.data as string);
      const price  = parseFloat(msg.p);
      const qty    = parseFloat(msg.q);
      const isSell = msg.m as boolean;  // true = buyer is maker = sell aggressor
      const tradeTime = msg.T as number;

      const s = stateRef.current;
      const candleStart = Math.floor(tradeTime / s.period) * s.period;

      // Volume as USDT notional, min 1
      const volume = Math.max(1, Math.round(price * qty));
      const bPrice = bucketPrice(price, s.tickSize);

      // Close old candle and open a new one if period rolled
      if (!s.open || s.open.timestamp !== candleStart) {
        if (s.open) {
          const closed = { ...s.open, rows: [...s.open.rows] };
          s.candles = [...s.candles.slice(-(maxCandles - 1)), closed];
        }
        const prevCvd = s.candles.length > 0 ? s.candles[s.candles.length - 1].cvd : 0;
        s.open = makeCandle(candleStart, price, prevCvd);
      }

      const open = s.open!;
      const rows = open.rows;

      // Find or create the price row
      let row = rows.find(r => Math.abs(r.price - bPrice) < s.tickSize * 0.5);
      if (!row) {
        row = { price: bPrice, bidVolume: 0, askVolume: 0, delta: 0, totalVolume: 0, trades: 0 };
        rows.push(row);
        rows.sort((a, b) => a.price - b.price);
      }

      if (isSell) {
        row.bidVolume += volume;   // sell-side aggressor hits the bid
      } else {
        row.askVolume += volume;   // buy-side aggressor lifts the ask
      }
      row.delta       = row.askVolume - row.bidVolume;
      row.totalVolume = row.bidVolume + row.askVolume;
      row.trades     += 1;

      open.close = price;
      if (price > open.high) open.high = price;
      if (price < open.low)  open.low  = price;
      open.totalVolume = rows.reduce((s, r) => s + r.totalVolume, 0);
      open.totalDelta  = rows.reduce((s, r) => s + r.delta, 0);
      const prevCvd = s.candles.length > 0 ? s.candles[s.candles.length - 1].cvd : 0;
      open.cvd = prevCvd + open.totalDelta;
      const pocRow = rows.reduce((mx, r) => r.totalVolume > mx.totalVolume ? r : mx, rows[0]);
      open.pocPrice = pocRow.price;
    };

    // Throttle React state updates to ~10 fps so we don't re-render on every tick
    const displayTimer = setInterval(() => {
      if (!alive) return;
      const s = stateRef.current;
      if (!s.open) return;
      const snapshot: FootprintCandle[] = [
        ...s.candles,
        { ...s.open, rows: [...s.open.rows] },
      ];
      setCandles(snapshot);
    }, 100);

    return () => {
      alive = false;
      clearInterval(displayTimer);
      ws.close();
    };
  }, [symbol, timeframe, tickSize, enabled, maxCandles]);

  return { candles, status };
}
