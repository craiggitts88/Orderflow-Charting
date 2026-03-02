import { useEffect, useRef, useState } from 'react';
import { FootprintCandle, FootprintRow, TIMEFRAME_MS } from '@/lib/mockData';

/**
 * 'loading'  = fetching historical aggTrades (shows progress bar)
 * 'connecting' = historical done, opening WebSocket
 * 'connected'  = WebSocket live
 */
export type FeedStatus = 'idle' | 'connecting' | 'loading' | 'connected' | 'disconnected' | 'error';

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

/**
 * Fetch ALL aggTrades for the window [now - barsBack*period, now], paginate through them
 * and bucket every real trade into its exact candle by timestamp.
 *
 * Returns a time-sorted FootprintCandle[] where the LAST element is the
 * currently-open (unfinished) candle. No synthetic distribution — pure tick data.
 *
 * Rate notes: Binance Futures aggTrades = weight 5 per request, limit 1200/min.
 * ~20 req/s safe. For BTC 5m × 50 bars: ~25,000 trades → ~25 pages → ~1–2 s.
 * For BTC 1m × 100 bars: ~100,000 trades → ~100 pages → ~5–10 s.
 */
async function fetchAllCandlesFromAggTrades(
  symbol: string,
  period: number,
  barsBack: number,
  tickSize: number,
  onProgress: (pct: number) => void,
): Promise<FootprintCandle[]> {
  const now             = Date.now();
  const openCandleStart = Math.floor(now / period) * period;
  const histStart       = openCandleStart - barsBack * period;
  const totalSpan       = Math.max(1, now - histStart);

  type CandleData = {
    open: number; high: number; low: number; close: number;
    rowMap: Map<number, FootprintRow>;
  };
  const candleDataMap = new Map<number, CandleData>();

  let fromTime = histStart;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `https://fapi.binance.com/fapi/v1/aggTrades?symbol=${symbol.toUpperCase()}&startTime=${fromTime}&endTime=${now}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`aggTrades HTTP ${res.status}`);
    const trades: Array<{ p: string; q: string; m: boolean; T: number }> = await res.json();
    if (trades.length === 0) break;

    for (const t of trades) {
      const price       = parseFloat(t.p);
      const qty         = parseFloat(t.q);        // base asset qty — e.g. BTC
      const isSell      = t.m;                     // maker = sell (bid hit)
      const candleStart = Math.floor(t.T / period) * period;
      const bPrice      = bucketPrice(price, tickSize);

      let cd = candleDataMap.get(candleStart);
      if (!cd) {
        cd = { open: price, high: price, low: price, close: price, rowMap: new Map() };
        candleDataMap.set(candleStart, cd);
      }
      cd.close = price;
      if (price > cd.high) cd.high = price;
      if (price < cd.low)  cd.low  = price;

      let row = cd.rowMap.get(bPrice);
      if (!row) {
        row = { price: bPrice, bidVolume: 0, askVolume: 0, delta: 0, totalVolume: 0, trades: 0 };
        cd.rowMap.set(bPrice, row);
      }
      if (isSell) row.bidVolume += qty;
      else        row.askVolume += qty;
      row.delta       = row.askVolume - row.bidVolume;
      row.totalVolume = row.bidVolume + row.askVolume;
      row.trades++;
    }

    const lastT    = trades[trades.length - 1].T;
    onProgress(Math.min(99, Math.round(((lastT - histStart) / totalSpan) * 100)));

    if (trades.length < 1000) break;   // no more pages
    fromTime = lastT + 1;
  }

  // Build sorted FootprintCandle[] with running CVD
  const sortedTs = [...candleDataMap.keys()].sort((a, b) => a - b);
  const result: FootprintCandle[] = [];
  let cvd = 0;

  for (const ts of sortedTs) {
    const cd          = candleDataMap.get(ts)!;
    const rows        = [...cd.rowMap.values()].sort((a, b) => a.price - b.price);
    const totalVolume = rows.reduce((s, r) => s + r.totalVolume, 0);
    const totalDelta  = rows.reduce((s, r) => s + r.delta, 0);
    cvd              += totalDelta;
    const pocRow      = rows.length > 0
      ? rows.reduce((mx, r) => r.totalVolume > mx.totalVolume ? r : mx, rows[0])
      : null;
    result.push({
      timestamp:   ts,
      open:        cd.open,
      high:        cd.high,
      low:         cd.low,
      close:       cd.close,
      rows,
      totalVolume,
      totalDelta,
      cvd,
      pocPrice:    pocRow?.price ?? cd.open,
    });
  }

  return result; // last element = currently-open candle
}

export function useBinanceFeed(
  symbol: string,
  timeframe: string,
  tickSize: number,
  enabled: boolean,
  barsBack = 50,
) {
  const [candles,  setCandles]  = useState<FootprintCandle[]>([]);
  const [status,   setStatus]   = useState<FeedStatus>('idle');
  const [progress, setProgress] = useState(0);   // 0-100 during 'loading' phase
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
      setProgress(0);
      return;
    }

    let alive = true;
    let ws: WebSocket | null = null;
    let displayTimer: ReturnType<typeof setInterval> | null = null;

    const period = TIMEFRAME_MS[timeframe] ?? 60_000;
    stateRef.current = { candles: [], open: null, period, tickSize };
    setCandles([]);
    setProgress(0);
    setStatus('loading');

    // ── Fetch the entire lookback from real aggTrades ─────────────────────────
    fetchAllCandlesFromAggTrades(symbol, period, barsBack, tickSize, (pct) => {
      if (alive) setProgress(pct);
    })
      .then((allCandles) => {
        if (!alive) return;

        // Last candle in the array is the currently-open one
        const openCandle = allCandles.length > 0 ? allCandles[allCandles.length - 1] : null;
        const closed     = allCandles.slice(0, -1);

        stateRef.current.candles = closed;
        stateRef.current.open    = openCandle;
        setProgress(100);
        setCandles(openCandle
          ? [...closed, { ...openCandle, rows: [...openCandle.rows] }]
          : [...closed]);
        setStatus('connecting');

        // ── Open WebSocket for live ticks ─────────────────────────────────────
        ws = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@aggTrade`);

        ws.onopen  = () => { if (alive) setStatus('connected'); };
        ws.onerror = () => { if (alive) setStatus('error'); };
        ws.onclose = () => { if (alive) setStatus('disconnected'); };

        ws.onmessage = (evt: MessageEvent) => {
          if (!alive) return;
          const msg       = JSON.parse(evt.data as string);
          const price     = parseFloat(msg.p);
          const qty       = parseFloat(msg.q);   // base asset qty (e.g. BTC)
          const isSell    = msg.m as boolean;
          const tradeTime = msg.T as number;

          const s           = stateRef.current;
          const candleStart = Math.floor(tradeTime / s.period) * s.period;
          const bPrice      = bucketPrice(price, s.tickSize);

          if (!s.open || s.open.timestamp !== candleStart) {
            if (s.open) {
              const finished = { ...s.open, rows: [...s.open.rows] };
              s.candles = [...s.candles.slice(-(barsBack - 1)), finished];
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

          if (isSell) { row.bidVolume += qty; }
          else        { row.askVolume += qty; }
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
  }, [symbol, timeframe, tickSize, enabled, barsBack]);

  return { candles, status, loadingProgress: progress };
}
