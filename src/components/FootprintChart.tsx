import React, { useRef, useEffect, useCallback } from "react";
import { FootprintCandle, TIMEFRAME_MS } from "@/lib/mockData";
import { FootprintSettings, DrawingTool } from "@/lib/footprintSettings";

interface FootprintChartProps {
  candles: FootprintCandle[];
  settings: FootprintSettings;
  timeframe?: string;
}

interface ViewState {
  scrollOffset: number;
  candleWidth: number;
  priceOffset: number;
  priceZoom: number;
}

interface Drawing {
  id: number;
  type: DrawingTool;
  x1: number; y1: number;
  x2: number; y2: number;
  // for hline/vline only x1/y1 matters; price/candle stored as data coords
  price1: number; price2: number;
  time1: number; time2: number;
}

const PRICE_AXIS_W = 80;
const TIME_AXIS_H = 28;
const MIN_CANDLE_W = 20;

/** Format a volume/delta number without floating-point noise */
function fmtVol(v: number): string {
  const r = Math.round(v);
  return Math.abs(r) >= 1000 ? r.toLocaleString() : r.toString();
}
const MAX_CANDLE_W = 400;
let nextDrawingId = 1;

// Helper: rounded rect path
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

const FootprintChart: React.FC<FootprintChartProps> = ({ candles, settings, timeframe = '5m' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  //  IMPORTANT: store candles+settings in refs so render never captures stale values 
  const candlesRef = useRef(candles);
  const settingsRef = useRef(settings);
  const timeframeRef = useRef(timeframe);

  const stateRef = useRef<ViewState>({
    scrollOffset: 0,
    candleWidth: settings.candleWidth,
    priceOffset: 0,
    priceZoom: 1,
  });

  const dragRef = useRef<{
    startX: number; startY: number;
    startScroll: number; startPriceOffset: number;
    active: boolean; button: number;
  } | null>(null);

  const crosshairRef = useRef<{ x: number; y: number } | null>(null);
  const renderScheduled = useRef(false);

  // Drawing state
  const drawingsRef = useRef<Drawing[]>([]);
  const activeDrawingRef = useRef<Drawing | null>(null);

  //  Core render  reads from refs, no closure capture 
  const render = useCallback(() => {
    const candles = candlesRef.current;
    const settings = settingsRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || candles.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = container.clientHeight;
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { scrollOffset, priceOffset, priceZoom } = stateRef.current;
    const CW = stateRef.current.candleWidth;
    const chartW = W - PRICE_AXIS_W;
    const chartH = H - TIME_AXIS_H;

    //  Visible candles 
    const visibleCount = Math.ceil(chartW / CW) + 2;
    const rightEdge = Math.max(0, candles.length - scrollOffset);
    const startIdx = Math.max(0, Math.floor(rightEdge - visibleCount));
    const endIdx = Math.min(candles.length - 1, Math.ceil(rightEdge));
    const visibleCandles = candles.slice(startIdx, endIdx + 1);
    if (!visibleCandles.length) return;

    //  Price range 
    let gHigh = -Infinity, gLow = Infinity, maxVol = 0;
    visibleCandles.forEach(c => {
      if (c.high > gHigh) gHigh = c.high;
      if (c.low < gLow) gLow = c.low;
      c.rows.forEach(r => { if (r.totalVolume > maxVol) maxVol = r.totalVolume; });
    });
    const pad = settings.tickSize * 4;
    gHigh += pad; gLow -= pad;
    const priceRange = gHigh - gLow;

    //  Coordinate transforms 
    const priceToY = (price: number) =>
      ((gHigh - price) / priceRange) * chartH * priceZoom + priceOffset;

    const yToPrice = (y: number) =>
      gHigh - ((y - priceOffset) / priceZoom / chartH) * priceRange;

    const candleX = (ci: number) => chartW - (endIdx - ci + 1) * CW;

    const xToCandleIdx = (x: number) => startIdx + Math.floor(x / CW);

    // 
    // BACKGROUND
    ctx.fillStyle = "hsl(220,20%,4%)";
    ctx.fillRect(0, 0, W, H);

    //  Grid 
    if (settings.showGrid) {
      ctx.lineWidth = 0.5;
      const step = settings.tickSize;
      for (let p = Math.ceil(gLow / step) * step; p <= gHigh; p += step) {
        const y = priceToY(p);
        if (y < 0 || y > chartH) continue;
        const isWhole = Math.abs(Math.round(p) - p) < 0.001;
        ctx.strokeStyle = isWhole ? "hsl(220,14%,14%)" : "hsl(220,14%,9%)";
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
      }
    }

    const rowH = Math.max(2, (chartH * priceZoom) / Math.round(priceRange / settings.tickSize));

    //  Draw each candle 
    visibleCandles.forEach((candle, i) => {
      const ci = startIdx + i;
      const x = candleX(ci);
      const midX = x + CW / 2;
      const innerW = CW - 2;

      // column separator
      ctx.strokeStyle = "hsl(220,14%,8%)";
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x + CW, 0); ctx.lineTo(x + CW, chartH); ctx.stroke();

      //  Footprint rows 
      candle.rows.forEach(row => {
        const y = priceToY(row.price);
        if (y + rowH / 2 < 0 || y - rowH / 2 > chartH) return;

        const vI = maxVol > 0 ? row.totalVolume / maxVol : 0;
        const halfW = innerW / 2;
        const bidBarW = maxVol > 0 ? (row.bidVolume / maxVol) * halfW : 0;
        const askBarW = maxVol > 0 ? (row.askVolume / maxVol) * halfW : 0;

        // ── Color refs for this row ───────────────────────────────────────────
        const BC = settings.bidColor;     // sell bar color
        const AC = settings.askColor;     // buy  bar color
        const BTC = settings.bidTextColor; // sell text
        const ATC = settings.askTextColor; // buy  text

        // ── Cell background / histogram ───────────────────────────────────────
        if (settings.colorMode === "histogram") {
          // Only draw volume bars — no separate background tint
          ctx.globalAlpha = 0.58;
          ctx.fillStyle = BC;
          ctx.fillRect(midX - bidBarW, y - rowH / 2 + 1, bidBarW, rowH - 2);
          ctx.fillStyle = AC;
          ctx.fillRect(midX, y - rowH / 2 + 1, askBarW, rowH - 2);
          ctx.globalAlpha = 1;
        } else if (settings.colorMode === "heatmap") {
          ctx.globalAlpha = Math.min(0.18, vI * 0.22);
          ctx.fillStyle = row.delta >= 0 ? AC : BC;
          ctx.fillRect(x + 1, y - rowH / 2, innerW, rowH);
          ctx.globalAlpha = 1;
        } else if (settings.colorMode === "deltaFlow") {
          const dRatio = row.totalVolume > 0 ? row.delta / row.totalVolume : 0;
          ctx.globalAlpha = Math.min(0.3, Math.abs(dRatio) * 0.38);
          ctx.fillStyle = dRatio >= 0 ? AC : BC;
          ctx.fillRect(x + 1, y - rowH / 2, innerW, rowH);
          ctx.globalAlpha = 1;
        } else if (settings.colorMode === "gradient") {
          ctx.globalAlpha = vI * 0.16;
          ctx.fillStyle = "#3b82f6";
          ctx.fillRect(x + 1, y - rowH / 2, innerW, rowH);
          ctx.globalAlpha = 1;
        } else if (settings.colorMode === "solid") {
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = "#334155";
          ctx.fillRect(x + 1, y - rowH / 2, innerW, rowH);
          ctx.globalAlpha = 1;
        }

        // ── POC ───────────────────────────────────────────────────────────────
        if (row.price === candle.pocPrice && settings.showPOC) {
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = settings.pocColor;
          ctx.fillRect(x + 1, y - rowH / 2, innerW, rowH);
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = settings.pocColor;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1, y - rowH / 2, innerW, rowH);
          ctx.globalAlpha = 1;
        }

        // ── Imbalance — single threshold ──────────────────────────────────────
        const isImbalanced = settings.highlightImbalance
          && row.bidVolume > 0 && row.askVolume > 0
          && Math.max(row.bidVolume / row.askVolume, row.askVolume / row.bidVolume) >= settings.imbalanceRatio;

        // imbalance: text-only highlight, no background or border

        // ── Text ──────────────────────────────────────────────────────────────
        if (rowH >= settings.fontSize + 2) {
          ctx.textBaseline = "middle";
          if (isImbalanced) {
            ctx.font = `bold ${settings.fontSize}px "JetBrains Mono",monospace`;
            ctx.fillStyle = settings.imbalanceColor;
          } else {
            ctx.font = `${settings.fontSize}px "JetBrains Mono",monospace`;
          }

          if (settings.displayMode === "bidAsk") {
            const bidStr = row.bidVolume > settings.volumeFilter ? fmtVol(row.bidVolume) : "";
            const askStr = row.askVolume > settings.volumeFilter ? fmtVol(row.askVolume) : "";
            if (!isImbalanced) ctx.fillStyle = BTC;
            ctx.textAlign = "right"; ctx.fillText(bidStr, midX - 4, y);
            if (!isImbalanced) ctx.fillStyle = ATC;
            ctx.textAlign = "left"; ctx.fillText(askStr, midX + 4, y);
            ctx.strokeStyle = "hsl(220,14%,18%)";
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(midX, y - rowH / 2); ctx.lineTo(midX, y + rowH / 2); ctx.stroke();

          } else if (settings.displayMode === "delta") {
            if (!isImbalanced) ctx.fillStyle = row.delta >= 0 ? ATC : BTC;
            ctx.textAlign = "center";
            ctx.fillText((row.delta > 0 ? "+" : "") + fmtVol(row.delta), midX, y);

          } else if (settings.displayMode === "totalVolume") {
            if (!isImbalanced) ctx.fillStyle = `hsl(210,20%,${50 + vI * 30}%)`;
            ctx.textAlign = "center";
            ctx.fillText(fmtVol(row.totalVolume), midX, y);

          } else if (settings.displayMode === "trades") {
            if (!isImbalanced) ctx.fillStyle = `hsl(270,80%,${55 + vI * 20}%)`;
            ctx.textAlign = "center";
            ctx.fillText(row.trades.toString(), midX, y);

          } else if (settings.displayMode === "bidAskDelta") {
            const third = innerW / 3;
            if (!isImbalanced) ctx.fillStyle = BTC;
            ctx.textAlign = "center"; ctx.fillText(fmtVol(row.bidVolume), x + third * 0.5 + 1, y);
            if (!isImbalanced) ctx.fillStyle = ATC;
            ctx.fillText(fmtVol(row.askVolume), x + third * 1.5 + 1, y);
            if (!isImbalanced) ctx.fillStyle = row.delta >= 0 ? ATC : BTC;
            ctx.fillText((row.delta > 0 ? "+" : "") + fmtVol(row.delta), x + third * 2.5 + 1, y);
          }
        }
      });

      //  OHLC Wicks 
      if (settings.showWicks) {
        const highY = priceToY(candle.high);
        const lowY = priceToY(candle.low);
        const openY = priceToY(candle.open);
        const closeY = priceToY(candle.close);
        const isBull = candle.close >= candle.open;
        ctx.strokeStyle = isBull ? settings.upColor : settings.downColor;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(midX, highY); ctx.lineTo(midX, Math.min(openY, closeY));
        ctx.moveTo(midX, Math.max(openY, closeY)); ctx.lineTo(midX, lowY);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // ── Thin candle body ──────────────────────────────────────────────────
      if (settings.showCandleBody) {
        const openY = priceToY(candle.open);
        const closeY = priceToY(candle.close);
        const isBull = candle.close >= candle.open;
        const bodyTop = Math.min(openY, closeY);
        const bodyH = Math.max(2, Math.abs(closeY - openY));
        const bodyW = Math.max(3, Math.min(6, CW * 0.06));
        ctx.fillStyle = isBull ? settings.upColor : settings.downColor;
        ctx.globalAlpha = 0.88;
        ctx.fillRect(midX - bodyW / 2, bodyTop, bodyW, bodyH);
        ctx.globalAlpha = 1;
      }

      //  Per-candle delta footer 
      if (settings.showDelta && rowH >= 8) {
        ctx.font = `bold ${Math.max(8, settings.fontSize - 1)}px "JetBrains Mono",monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = candle.totalDelta >= 0 ? settings.askColor : settings.bidColor;
        ctx.fillText((candle.totalDelta > 0 ? "+" : "") + fmtVol(candle.totalDelta), midX, chartH - 2);
      }
    });

    // ⏱ Candle Countdown Timer — use TIMEFRAME_MS for accurate duration
    if (candles.length >= 1) {
      const candleDuration = TIMEFRAME_MS[timeframeRef.current] ?? 300_000;
      const nextCandleTime = candles[candles.length - 1].timestamp + candleDuration;
      const remainingMs = Math.max(0, nextCandleTime - Date.now());
      const totalSecs = Math.floor(remainingMs / 1000);
      const hrs = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;
      const timerStr = hrs > 0
        ? `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
        : `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

      const lastCX = candleX(endIdx) + CW / 2;
      const timerX = Math.max(40, Math.min(chartW - 40, lastCX));

      ctx.font = `bold 11px "JetBrains Mono",monospace`;
      const tw = ctx.measureText(timerStr).width + 10;
      ctx.fillStyle = "hsla(220,25%,10%,0.88)";
      roundRect(ctx, timerX - tw / 2, 4, tw, 16, 3);
      ctx.fill();
      ctx.fillStyle = remainingMs < 10_000
        ? "hsl(50,100%,65%)"
        : remainingMs < 60_000
          ? "hsl(28,100%,60%)"
          : "hsl(210,15%,72%)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(timerStr, timerX, 12);
    }

    //  Volume Profile 
    if (settings.showVolumeProfile) {
      const priceVols = new Map<number, { bid: number; ask: number }>();
      visibleCandles.forEach(c => c.rows.forEach(r => {
        const e = priceVols.get(r.price) ?? { bid: 0, ask: 0 };
        priceVols.set(r.price, { bid: e.bid + r.bidVolume, ask: e.ask + r.askVolume });
      }));
      const maxPV = Math.max(...Array.from(priceVols.values()).map(v => v.bid + v.ask));
      const profW = PRICE_AXIS_W - 8;
      priceVols.forEach(({ bid, ask }, price) => {
        const y = priceToY(price);
        const rh2 = Math.max(1, rowH);
        const total = bid + ask;
        const bw = (total / maxPV) * profW;
        const bidW = (bid / total) * bw;
        ctx.fillStyle = "hsla(165,100%,42%,0.3)";
        ctx.fillRect(chartW, y - rh2 / 2 + 1, bidW, rh2 - 2);
        ctx.fillStyle = "hsla(354,70%,54%,0.3)";
        ctx.fillRect(chartW + bidW, y - rh2 / 2 + 1, bw - bidW, rh2 - 2);
      });
    }

    //  Drawings 
    const allDrawings = [...drawingsRef.current, ...(activeDrawingRef.current ? [activeDrawingRef.current] : [])];
    allDrawings.forEach(d => {
      const y1 = priceToY(d.price1);
      const y2 = priceToY(d.price2);
      const x1 = candleX(d.time1);
      const x2 = candleX(d.time2);
      ctx.strokeStyle = "hsl(45,100%,65%)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      if (d.type === "hline") {
        ctx.setLineDash([5, 4]);
        ctx.moveTo(0, y1); ctx.lineTo(chartW, y1);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = "10px monospace";
        ctx.fillStyle = "hsl(45,100%,65%)";
        ctx.textAlign = "right"; ctx.textBaseline = "bottom";
        ctx.fillText(d.price1.toFixed(2), chartW - 2, y1 - 1);
      } else if (d.type === "vline") {
        ctx.moveTo(x1 + CW / 2, 0); ctx.lineTo(x1 + CW / 2, chartH);
        ctx.stroke();
      } else if (d.type === "line") {
        ctx.moveTo(x1 + CW / 2, y1); ctx.lineTo(x2 + CW / 2, y2);
        ctx.stroke();
      } else if (d.type === "rectangle") {
        const rx = Math.min(x1, x2) + CW / 2;
        const ry = Math.min(y1, y2);
        const rw = Math.abs(x2 - x1);
        const rh = Math.abs(y2 - y1);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.fillStyle = "hsla(45,100%,55%,0.06)";
        ctx.fillRect(rx, ry, rw, rh);
      } else if (d.type === "fib") {
        const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.764, 1];
        const high = Math.max(y1, y2);
        const low = Math.min(y1, y2);
        const range = high - low;
        fibLevels.forEach((level, li) => {
          const fy = low + range * level;
          ctx.strokeStyle = li === 0 || li === fibLevels.length - 1
            ? "hsla(45,100%,65%,0.9)" : "hsla(45,100%,65%,0.5)";
          ctx.lineWidth = li === 0 || li === fibLevels.length - 1 ? 1 : 0.75;
          ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(Math.min(x1, x2) + CW / 2, fy);
          ctx.lineTo(Math.max(x1, x2) + CW / 2, fy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = "9px monospace";
          ctx.fillStyle = "hsl(45,100%,70%)";
          ctx.textAlign = "left"; ctx.textBaseline = "bottom";
          ctx.fillText(`${(level * 100).toFixed(1)}%`, Math.min(x1, x2) + CW / 2 + 2, fy - 1);
        });

      } else if (d.type === "frvp") {
        // Fixed Range Volume Profile
        const leftCI = Math.min(d.time1, d.time2);
        const rightCI = Math.max(d.time1, d.time2);
        const rangeCandles = candles.slice(
          Math.max(0, leftCI),
          Math.min(candles.length, rightCI + 1)
        );
        if (rangeCandles.length === 0) return;

        // Build price -> volume map
        const pvMap = new Map<number, { bid: number; ask: number; total: number }>();
        rangeCandles.forEach(c => c.rows.forEach(r => {
          const e = pvMap.get(r.price) ?? { bid: 0, ask: 0, total: 0 };
          pvMap.set(r.price, {
            bid: e.bid + r.bidVolume,
            ask: e.ask + r.askVolume,
            total: e.total + r.totalVolume,
          });
        }));

        const maxPV = Math.max(...Array.from(pvMap.values()).map(v => v.total));
        const pocPrice = Array.from(pvMap.entries()).reduce((a, b) => b[1].total > a[1].total ? b : a)[0];

        // Draw region boundary lines
        const lx = candleX(leftCI);
        const rx = candleX(rightCI) + CW;
        const profileW = Math.min(rx - lx, (rx - lx) * 0.7); // bars fill up to 70% of range width

        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = "hsla(210,80%,65%,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx, 0); ctx.lineTo(lx, chartH);
        ctx.moveTo(rx, 0); ctx.lineTo(rx, chartH);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw bars for each price level
        pvMap.forEach(({ bid, ask, total }, price) => {
          const py = priceToY(price);
          const barH = Math.max(1, rowH - 1);
          const barW = maxPV > 0 ? (total / maxPV) * profileW : 0;
          const bidW = total > 0 ? (bid / total) * barW : 0;
          const isPOC = price === pocPrice;

          // Background bar
          ctx.globalAlpha = isPOC ? 0.7 : 0.45;
          ctx.fillStyle = settingsRef.current.bidColor;
          ctx.fillRect(lx, py - barH / 2, bidW, barH);
          ctx.fillStyle = settingsRef.current.askColor;
          ctx.fillRect(lx + bidW, py - barH / 2, barW - bidW, barH);
          ctx.globalAlpha = 1;

          // POC highlight line
          if (isPOC) {
            ctx.strokeStyle = settingsRef.current.pocColor;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(lx, py); ctx.lineTo(lx + profileW, py);
            ctx.stroke();
          }
        });

        // Label
        ctx.font = "bold 9px monospace";
        ctx.fillStyle = "hsla(210,80%,65%,0.8)";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        const totalVol = Array.from(pvMap.values()).reduce((s, v) => s + v.total, 0);
        ctx.fillText(`FRVP  ${totalVol.toLocaleString()}`, lx + 3, 3);
      }
    });

    //  Price Axis 
    ctx.fillStyle = "hsl(220,18%,6%)";
    ctx.fillRect(chartW, 0, PRICE_AXIS_W, chartH);
    ctx.strokeStyle = "hsl(220,14%,14%)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, chartH); ctx.stroke();

    const pixPerTick = Math.abs(priceToY(0) - priceToY(settings.tickSize));
    const labelEvery = Math.max(1, Math.ceil(18 / (pixPerTick || 1)));
    const axisStep = settings.tickSize * labelEvery;
    ctx.font = `${settings.fontSize}px "JetBrains Mono",monospace`;
    ctx.fillStyle = "hsl(210,20%,55%)";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let p = Math.ceil(gLow / axisStep) * axisStep; p <= gHigh; p += axisStep) {
      const y = priceToY(p);
      if (y < 4 || y > chartH - 4) continue;
      ctx.fillText(p.toFixed(2), W - 4, y);
    }

    // Last price badge
    const lastC = candles[candles.length - 1];
    if (lastC) {
      const lY = priceToY(lastC.close);
      const bull = lastC.close >= lastC.open;
      ctx.fillStyle = bull ? "hsl(165,100%,35%)" : "hsl(354,70%,45%)";
      ctx.fillRect(chartW, lY - 9, PRICE_AXIS_W, 18);
      ctx.fillStyle = "hsl(220,20%,95%)";
      ctx.font = `bold ${settings.fontSize}px "JetBrains Mono",monospace`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(lastC.close.toFixed(2), W - 4, lY);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = bull ? "hsla(165,100%,42%,0.35)" : "hsla(354,70%,54%,0.35)";
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, lY); ctx.lineTo(chartW, lY); ctx.stroke();
      ctx.setLineDash([]);
    }

    //  Time Axis 
    ctx.fillStyle = "hsl(220,18%,5%)";
    ctx.fillRect(0, chartH, W, TIME_AXIS_H);
    ctx.strokeStyle = "hsl(220,14%,12%)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, chartH); ctx.lineTo(W, chartH); ctx.stroke();

    const showEvery = Math.max(1, Math.ceil(60 / CW));
    ctx.font = `${Math.max(8, settings.fontSize - 1)}px "JetBrains Mono",monospace`;
    ctx.fillStyle = "hsl(215,12%,40%)";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    visibleCandles.forEach((c, i) => {
      if (i % showEvery !== 0) return;
      const ci = startIdx + i;
      const tx = candleX(ci) + CW / 2;
      if (tx < 4 || tx > chartW - 4) return;
      const d = new Date(c.timestamp);
      const label = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
      ctx.fillText(label, tx, chartH + 7);
    });

    //  Crosshair 
    if (settings.showCrosshair && crosshairRef.current) {
      const { x: cx, y: cy } = crosshairRef.current;
      if (cx >= 0 && cx <= chartW && cy >= 0 && cy <= chartH) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "hsla(210,20%,60%,0.5)";
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(cx, 0); ctx.lineTo(cx, chartH);
        ctx.moveTo(0, cy); ctx.lineTo(chartW, cy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Price label
        const cp = yToPrice(cy);
        ctx.fillStyle = "hsl(210,40%,22%)";
        ctx.fillRect(chartW, cy - 9, PRICE_AXIS_W, 18);
        ctx.strokeStyle = "hsl(210,60%,45%)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(chartW, cy - 9, PRICE_AXIS_W, 18);
        ctx.fillStyle = "hsl(210,60%,82%)";
        ctx.font = `${settings.fontSize}px "JetBrains Mono",monospace`;
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.fillText(cp.toFixed(2), W - 4, cy);

        // Time label
        const hoverCI = xToCandleIdx(cx);
        if (hoverCI >= 0 && hoverCI < candles.length) {
          const d = new Date(candles[hoverCI].timestamp);
          const tl = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
          const lw = ctx.measureText(tl).width + 10;
          ctx.fillStyle = "hsl(210,40%,22%)";
          ctx.fillRect(cx - lw / 2, chartH, lw, TIME_AXIS_H - 2);
          ctx.strokeStyle = "hsl(210,60%,45%)";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(cx - lw / 2, chartH, lw, TIME_AXIS_H - 2);
          ctx.fillStyle = "hsl(210,60%,82%)";
          ctx.textAlign = "center"; ctx.textBaseline = "top";
          ctx.fillText(tl, cx, chartH + 7);
        }
      }
    }
  }, []); // EMPTY deps  reads from refs, never stale

  //  Schedule helper (stable, always calls latest render via closure) 
  const scheduleRender = useCallback(() => {
    if (renderScheduled.current) return;
    renderScheduled.current = true;
    requestAnimationFrame(() => {
      renderScheduled.current = false;
      render();
    });
  }, [render]); // depends on render, but render has empty deps so this is stable too

  //  Keep refs current and re-render when props change 
  useEffect(() => {
    candlesRef.current = candles;
    scheduleRender();
  }, [candles, scheduleRender]);

  useEffect(() => {
    settingsRef.current = settings;
    stateRef.current.candleWidth = settings.candleWidth;
    scheduleRender();
  }, [settings, scheduleRender]);
  useEffect(() => {
    timeframeRef.current = timeframe;
  }, [timeframe]);
  //  Mouse / Wheel events 
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getCanvasPos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      const canvasLen = candlesRef.current.length;
      if (e.ctrlKey) {
        s.priceZoom = Math.max(0.2, Math.min(20, s.priceZoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      } else if (e.shiftKey) {
        s.scrollOffset = Math.max(0, Math.min(canvasLen - 5, s.scrollOffset + (e.deltaY > 0 ? -3 : 3)));
      } else {
        s.candleWidth = Math.max(MIN_CANDLE_W, Math.min(MAX_CANDLE_W, s.candleWidth * (e.deltaY < 0 ? 1.1 : 0.9)));
      }
      scheduleRender();
    };

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      const { x, y } = getCanvasPos(e);
      const tool = settingsRef.current.activeDrawingTool;

      if (e.button === 0 && tool !== "cursor" && tool !== "crosshair") {
        // Start a new drawing
        const CW = stateRef.current.candleWidth;
        const container = containerRef.current;
        if (!container) return;
        const W = container.clientWidth;
        const H = container.clientHeight;
        const chartW = W - PRICE_AXIS_W;
        const chartH = H - TIME_AXIS_H;

        const candles = candlesRef.current;
        const settings = settingsRef.current;
        const { scrollOffset, priceOffset, priceZoom } = stateRef.current;
        const visibleCount = Math.ceil(chartW / CW) + 2;
        const rightEdge = Math.max(0, candles.length - scrollOffset);
        const startIdx = Math.max(0, Math.floor(rightEdge - visibleCount));
        const endIdx = Math.min(candles.length - 1, Math.ceil(rightEdge));

        let gHigh = -Infinity, gLow = Infinity;
        candles.slice(startIdx, endIdx + 1).forEach(c => {
          if (c.high > gHigh) gHigh = c.high;
          if (c.low < gLow) gLow = c.low;
        });
        gHigh += settings.tickSize * 4; gLow -= settings.tickSize * 4;
        const priceRange = gHigh - gLow;
        const yToPrice = (yp: number) => gHigh - ((yp - priceOffset) / priceZoom / chartH) * priceRange;
        const candleX = (ci: number) => chartW - (endIdx - ci + 1) * CW;
        const xToCandleIdx = (xp: number) => startIdx + Math.floor(xp / CW);

        const price = yToPrice(y);
        const ci = xToCandleIdx(x);

        activeDrawingRef.current = {
          id: nextDrawingId++,
          type: tool,
          x1: x, y1: y, x2: x, y2: y,
          price1: price, price2: price,
          time1: ci, time2: ci,
        };
        canvas.style.cursor = "crosshair";
      } else {
        // Pan mode
        dragRef.current = {
          startX: e.clientX, startY: e.clientY,
          startScroll: stateRef.current.scrollOffset,
          startPriceOffset: stateRef.current.priceOffset,
          active: true, button: e.button,
        };
        canvas.style.cursor = e.button === 2 ? "ns-resize" : "grabbing";
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const { x, y } = getCanvasPos(e);
      crosshairRef.current = { x, y };

      if (activeDrawingRef.current) {
        // Update in-progress drawing end point
        const CW = stateRef.current.candleWidth;
        const container = containerRef.current;
        if (!container) return;
        const W = container.clientWidth;
        const H = container.clientHeight;
        const chartW = W - PRICE_AXIS_W;
        const chartH = H - TIME_AXIS_H;
        const candles = candlesRef.current;
        const settings = settingsRef.current;
        const { scrollOffset, priceOffset, priceZoom } = stateRef.current;
        const visibleCount = Math.ceil(chartW / CW) + 2;
        const rightEdge = Math.max(0, candles.length - scrollOffset);
        const startIdx = Math.max(0, Math.floor(rightEdge - visibleCount));
        const endIdx = Math.min(candles.length - 1, Math.ceil(rightEdge));
        let gHigh = -Infinity, gLow = Infinity;
        candles.slice(startIdx, endIdx + 1).forEach(c => {
          if (c.high > gHigh) gHigh = c.high;
          if (c.low < gLow) gLow = c.low;
        });
        gHigh += settings.tickSize * 4; gLow -= settings.tickSize * 4;
        const priceRange = gHigh - gLow;
        const yToPrice = (yp: number) => gHigh - ((yp - priceOffset) / priceZoom / chartH) * priceRange;
        const xToCandleIdx = (xp: number) => startIdx + Math.floor(xp / CW);

        activeDrawingRef.current.x2 = x;
        activeDrawingRef.current.y2 = y;
        activeDrawingRef.current.price2 = yToPrice(y);
        activeDrawingRef.current.time2 = xToCandleIdx(x);
      } else if (dragRef.current?.active) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        const s = stateRef.current;
        const canvasLen = candlesRef.current.length;
        if (dragRef.current.button === 0) {
          s.scrollOffset = Math.max(0, Math.min(canvasLen - 5, dragRef.current.startScroll - dx / s.candleWidth));
          s.priceOffset = dragRef.current.startPriceOffset + dy;
        } else if (dragRef.current.button === 2) {
          s.priceZoom = Math.max(0.2, Math.min(20, s.priceZoom * (1 + dy * 0.005)));
          dragRef.current.startY = e.clientY;
        }
      }
      scheduleRender();
    };

    const onMouseUp = (e: MouseEvent) => {
      if (activeDrawingRef.current) {
        // Commit drawing if it has meaningful size
        const d = activeDrawingRef.current;
        const significant = Math.abs(d.x2 - d.x1) > 3 || Math.abs(d.y2 - d.y1) > 3;
        if (significant || d.type === "hline" || d.type === "vline") {
          drawingsRef.current = [...drawingsRef.current, d];
        }
        activeDrawingRef.current = null;
        canvas.style.cursor = "crosshair";
      } else {
        dragRef.current = null;
        const tool = settingsRef.current.activeDrawingTool;
        canvas.style.cursor = tool === "cursor" ? "default" : "crosshair";
      }
      scheduleRender();
    };

    const onMouseLeave = () => {
      crosshairRef.current = null;
      dragRef.current = null;
      scheduleRender();
    };

    const onDblClick = () => {
      stateRef.current.priceOffset = 0;
      stateRef.current.priceZoom = 1;
      stateRef.current.scrollOffset = 0;
      scheduleRender();
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      // Right-click on a drawing to delete it (basic)
      const { x, y } = getCanvasPos(e);
      drawingsRef.current = drawingsRef.current.filter(d => {
        if (d.type === "hline") {
          const container = containerRef.current;
          if (!container) return true;
          const candles = candlesRef.current;
          const settings = settingsRef.current;
          const H = container.clientHeight;
          const chartH = H - TIME_AXIS_H;
          const { scrollOffset, priceOffset, priceZoom } = stateRef.current;
          const W = container.clientWidth;
          const chartW = W - PRICE_AXIS_W;
          const CW = stateRef.current.candleWidth;
          const visibleCount = Math.ceil(chartW / CW) + 2;
          const rightEdge = Math.max(0, candles.length - scrollOffset);
          const endIdx = Math.min(candles.length - 1, Math.ceil(rightEdge));
          const startIdx = Math.max(0, Math.floor(rightEdge - visibleCount));
          let gHigh = -Infinity, gLow = Infinity;
          candles.slice(startIdx, endIdx + 1).forEach(c => {
            if (c.high > gHigh) gHigh = c.high;
            if (c.low < gLow) gLow = c.low;
          });
          gHigh += settings.tickSize * 4; gLow -= settings.tickSize * 4;
          const priceRange = gHigh - gLow;
          const lineY = ((gHigh - d.price1) / priceRange) * chartH * priceZoom + priceOffset;
          return Math.abs(lineY - y) > 8;
        }
        return true;
      });
      scheduleRender();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Cancel in-progress drawing
        activeDrawingRef.current = null;
        scheduleRender();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        // Clear all drawings
        drawingsRef.current = [];
        scheduleRender();
      }
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("dblclick", onDblClick);
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("dblclick", onDblClick);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [scheduleRender]); // only depends on scheduleRender (which is stable)

  //  Resize observer 
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => scheduleRender());
    ro.observe(container);
    return () => ro.disconnect();
  }, [scheduleRender]);

  // Countdown timer — re-render every second to tick the clock
  useEffect(() => {
    const interval = setInterval(scheduleRender, 1000);
    return () => clearInterval(interval);
  }, [scheduleRender]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden relative select-none">
      <canvas ref={canvasRef} className="block" style={{ cursor: "crosshair" }} />
    </div>
  );
};

export default FootprintChart;
