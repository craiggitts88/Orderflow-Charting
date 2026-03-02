import React, { useRef, useEffect, useCallback, useState } from 'react';
import { FootprintCandle } from '@/lib/mockData';
import { FootprintSettings } from '@/lib/footprintSettings';

interface FootprintChartProps {
  candles: FootprintCandle[];
  settings: FootprintSettings;
  /** shared offset in candle-index units (0 = fully right-aligned) */
  offsetX?: number;
  onOffsetXChange?: (v: number) => void;
}

interface ViewState {
  /** How many candles are shifted left from the right edge (scroll position) */
  scrollOffset: number;
  /** Zoom: candle width in pixels */
  candleWidth: number;
  /** Vertical price offset in pixels (pan up/down) */
  priceOffset: number;
  /** Vertical zoom multiplier */
  priceZoom: number;
}

const PRICE_AXIS_W = 80;
const TIME_AXIS_H = 28;
const MIN_CANDLE_W = 20;
const MAX_CANDLE_W = 400;

const FootprintChart: React.FC<FootprintChartProps> = ({ candles, settings }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<ViewState>({
    scrollOffset: 0,
    candleWidth: settings.candleWidth,
    priceOffset: 0,
    priceZoom: 1,
  });
  const dragRef = useRef<{ startX: number; startY: number; startScroll: number; startPriceOffset: number; active: boolean; button: number } | null>(null);
  const crosshairRef = useRef<{ x: number; y: number } | null>(null);
  const renderScheduled = useRef(false);


  // â”€â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const scheduleRender = useCallback(() => {
    if (renderScheduled.current) return;
    renderScheduled.current = true;
    requestAnimationFrame(() => {
      renderScheduled.current = false;
      render();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || candles.length === 0) return;
    const ctx = canvas.getContext('2d');
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

    // â”€â”€ Visible candle range â”€â”€
    const visibleCount = Math.ceil(chartW / CW) + 2;
    const rightEdge = candles.length - scrollOffset;
    const startIdx = Math.max(0, Math.floor(rightEdge - visibleCount));
    const endIdx = Math.min(candles.length - 1, rightEdge);
    const visibleCandles = candles.slice(startIdx, endIdx + 1);
    if (!visibleCandles.length) return;

    // â”€â”€ Global price range from visible candles â”€â”€
    let gHigh = -Infinity, gLow = Infinity, maxVol = 0;
    visibleCandles.forEach(c => {
      if (c.high > gHigh) gHigh = c.high;
      if (c.low < gLow) gLow = c.low;
      c.rows.forEach(r => { if (r.totalVolume > maxVol) maxVol = r.totalVolume; });
    });
    const pad = settings.tickSize * 4;
    gHigh += pad; gLow -= pad;
    const priceRange = gHigh - gLow;

    // â”€â”€ Price <-> Y with pan+zoom â”€â”€
    const priceToY = (price: number) => {
      const base = ((gHigh - price) / priceRange) * chartH * priceZoom;
      return base + priceOffset;
    };
    const yToPrice = (y: number) => {
      const base = (y - priceOffset) / priceZoom;
      return gHigh - (base / chartH) * priceRange;
    };

    // â”€â”€ Candle x-position (right-aligned) â”€â”€
    const candleX = (candleIdx: number) => {
      // rightmost candle ends at chartW
      return chartW - (endIdx - candleIdx + 1) * CW;
    };

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // BACKGROUND
    ctx.fillStyle = 'hsl(220, 20%, 4%)';
    ctx.fillRect(0, 0, W, H);

    // â”€â”€ Grid â”€â”€
    if (settings.showGrid) {
      const step = settings.tickSize;
      ctx.lineWidth = 0.5;
      for (let p = Math.ceil(gLow / step) * step; p <= gHigh; p += step) {
        const y = priceToY(p);
        if (y < 0 || y > chartH) continue;
        const isWhole = Math.abs(Math.round(p) - p) < 0.001;
        ctx.strokeStyle = isWhole ? 'hsl(220,14%,13%)' : 'hsl(220,14%,9%)';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(chartW, y);
        ctx.stroke();
      }
    }

    // â”€â”€ Draw candles â”€â”€
    visibleCandles.forEach((candle, i) => {
      const ci = startIdx + i;
      const x = candleX(ci);
      const midX = x + CW / 2;
      const innerW = CW - 2;

      // Row height from zoom
      const rowH = Math.max(2, (chartH * priceZoom) / Math.round(priceRange / settings.tickSize));

      // vertical column separator
      ctx.strokeStyle = 'hsl(220,14%,8%)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x + CW, 0);
      ctx.lineTo(x + CW, chartH);
      ctx.stroke();

      // â”€â”€ Footprint rows â”€â”€
      candle.rows.forEach(row => {
        const y = priceToY(row.price);
        if (y + rowH / 2 < 0 || y - rowH / 2 > chartH) return;

        const vI = maxVol > 0 ? row.totalVolume / maxVol : 0;
        const halfW = innerW / 2;
        const bidBarW = maxVol > 0 ? (row.bidVolume / maxVol) * halfW : 0;
        const askBarW = maxVol > 0 ? (row.askVolume / maxVol) * halfW : 0;

        // Heatmap background
        if (settings.colorMode === 'heatmap') {
          const alpha = Math.min(0.25, vI * 0.3);
          ctx.fillStyle = row.delta > 0
            ? `hsla(165,100%,42%,${alpha})`
            : `hsla(354,70%,54%,${alpha})`;
          ctx.fillRect(x + 1, y - rowH / 2, innerW, rowH);
        } else if (settings.colorMode === 'deltaFlow') {
          const dRatio = row.totalVolume > 0 ? row.delta / row.totalVolume : 0;
          const h = dRatio > 0 ? 165 : 354;
          ctx.fillStyle = `hsla(${h},80%,45%,${Math.abs(dRatio) * 0.4})`;
          ctx.fillRect(x + 1, y - rowH / 2, innerW, rowH);
        }

        // Volume bars
        ctx.fillStyle = 'hsla(165,100%,42%,0.22)';
        ctx.fillRect(midX - bidBarW, y - rowH / 2 + 1, bidBarW, rowH - 2);
        ctx.fillStyle = 'hsla(354,70%,54%,0.22)';
        ctx.fillRect(midX, y - rowH / 2 + 1, askBarW, rowH - 2);

        // POC
        if (row.price === candle.pocPrice && settings.showPOC) {
          ctx.fillStyle = 'hsla(45,100%,55%,0.14)';
          ctx.fillRect(x + 1, y - rowH / 2, innerW, rowH);
          ctx.strokeStyle = 'hsla(45,100%,55%,0.6)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1, y - rowH / 2, innerW, rowH);
        }

        // Imbalance
        if (settings.highlightImbalance && row.bidVolume > 0 && row.askVolume > 0) {
          const ratio = Math.max(row.bidVolume / row.askVolume, row.askVolume / row.bidVolume);
          if (ratio >= settings.imbalanceRatio) {
            const isAsk = row.askVolume > row.bidVolume;
            ctx.fillStyle = isAsk ? 'hsla(354,70%,54%,0.2)' : 'hsla(165,100%,42%,0.2)';
            ctx.fillRect(x + 1, y - rowH / 2, innerW, rowH);
          }
        }

        // Only render text if rows are large enough
        if (rowH >= settings.fontSize + 2) {
          ctx.font = `${settings.fontSize}px "JetBrains Mono", monospace`;
          ctx.textBaseline = 'middle';

          if (settings.displayMode === 'bidAsk') {
            const bidStr = row.bidVolume > settings.volumeFilter ? row.bidVolume.toString() : '';
            const askStr = row.askVolume > settings.volumeFilter ? row.askVolume.toString() : '';
            ctx.fillStyle = `hsl(165,100%,${45 + vI * 20}%)`;
            ctx.textAlign = 'right';
            ctx.fillText(bidStr, midX - 4, y);
            ctx.fillStyle = `hsl(354,70%,${50 + vI * 15}%)`;
            ctx.textAlign = 'left';
            ctx.fillText(askStr, midX + 4, y);
            ctx.strokeStyle = 'hsl(220,14%,18%)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(midX, y - rowH / 2);
            ctx.lineTo(midX, y + rowH / 2);
            ctx.stroke();
          } else if (settings.displayMode === 'delta') {
            ctx.fillStyle = row.delta >= 0 ? 'hsl(165,100%,50%)' : 'hsl(354,70%,58%)';
            ctx.textAlign = 'center';
            ctx.fillText((row.delta > 0 ? '+' : '') + row.delta, midX, y);
          } else if (settings.displayMode === 'totalVolume') {
            ctx.fillStyle = `hsl(210,20%,${50 + vI * 30}%)`;
            ctx.textAlign = 'center';
            ctx.fillText(row.totalVolume.toString(), midX, y);
          } else if (settings.displayMode === 'trades') {
            ctx.fillStyle = `hsl(270,80%,${55 + vI * 20}%)`;
            ctx.textAlign = 'center';
            ctx.fillText(row.trades.toString(), midX, y);
          } else if (settings.displayMode === 'bidAskDelta') {
            ctx.fillStyle = 'hsl(165,100%,50%)';
            ctx.textAlign = 'right';
            ctx.fillText(row.bidVolume.toString(), x + CW * 0.32, y);
            ctx.fillStyle = 'hsl(354,70%,58%)';
            ctx.textAlign = 'left';
            ctx.fillText(row.askVolume.toString(), x + CW * 0.35, y);
            ctx.fillStyle = row.delta >= 0 ? 'hsl(165,100%,50%)' : 'hsl(354,70%,58%)';
            ctx.textAlign = 'right';
            ctx.fillText((row.delta > 0 ? '+' : '') + row.delta, x + CW - 4, y);
          }
        }
      });

      // Candle OHLC wick
      if (settings.showWicks) {
        const openY = priceToY(candle.open);
        const closeY = priceToY(candle.close);
        const highY = priceToY(candle.high);
        const lowY = priceToY(candle.low);
        const isBull = candle.close >= candle.open;
        ctx.strokeStyle = isBull ? 'hsla(165,100%,50%,0.7)' : 'hsla(354,70%,54%,0.7)';
        ctx.lineWidth = 1;
        const bodyTop = Math.min(openY, closeY);
        const bodyBot = Math.max(openY, closeY);
        ctx.beginPath();
        ctx.moveTo(midX, highY);
        ctx.lineTo(midX, bodyTop);
        ctx.moveTo(midX, bodyBot);
        ctx.lineTo(midX, lowY);
        ctx.stroke();
      }

      // Delta footer
      if (settings.showDelta && rowH >= 8) {
        const dText = (candle.totalDelta > 0 ? '+' : '') + candle.totalDelta;
        ctx.font = `bold ${settings.fontSize - 1}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = candle.totalDelta >= 0 ? 'hsl(165,100%,50%)' : 'hsl(354,70%,58%)';
        ctx.fillText(dText, midX, chartH - 2);
      }
    });

    // â”€â”€ Volume Profile â”€â”€
    if (settings.showVolumeProfile) {
      const priceVols = new Map<number, { bid: number; ask: number }>();
      visibleCandles.forEach(c => c.rows.forEach(r => {
        const e = priceVols.get(r.price) ?? { bid: 0, ask: 0 };
        priceVols.set(r.price, { bid: e.bid + r.bidVolume, ask: e.ask + r.askVolume });
      }));
      const maxPVol = Math.max(...Array.from(priceVols.values()).map(v => v.bid + v.ask));
      const profW = PRICE_AXIS_W - 8;
      priceVols.forEach(({ bid, ask }, price) => {
        const y = priceToY(price);
        const rowH2 = Math.max(1, (chartH * priceZoom) / Math.round(priceRange / settings.tickSize));
        const total = bid + ask;
        const bw = (total / maxPVol) * profW;
        const bidW = (bid / total) * bw;
        ctx.fillStyle = 'hsla(165,100%,42%,0.3)';
        ctx.fillRect(chartW + 2, y - rowH2 / 2 + 1, bidW, rowH2 - 2);
        ctx.fillStyle = 'hsla(354,70%,54%,0.3)';
        ctx.fillRect(chartW + 2 + bidW, y - rowH2 / 2 + 1, bw - bidW, rowH2 - 2);
      });
    }

    // â”€â”€ Price axis â”€â”€
    ctx.fillStyle = 'hsl(220,18%,6%)';
    ctx.fillRect(chartW, 0, PRICE_AXIS_W, chartH);
    ctx.strokeStyle = 'hsl(220,14%,14%)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, chartH); ctx.stroke();

    // Price labels â€” find a sensible step
    const pixPerTick = Math.abs(priceToY(0) - priceToY(settings.tickSize));
    const labelEvery = Math.max(1, Math.ceil(18 / pixPerTick));
    const step = settings.tickSize * labelEvery;

    ctx.font = `${settings.fontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = 'hsl(210,20%,55%)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let p = Math.ceil(gLow / step) * step; p <= gHigh; p += step) {
      const y = priceToY(p);
      if (y < 4 || y > chartH - 4) continue;
      ctx.fillText(p.toFixed(2), W - 4, y);
    }

    // Last price badge
    const lastC = candles[candles.length - 1];
    if (lastC) {
      const lY = priceToY(lastC.close);
      const bull = lastC.close >= lastC.open;
      ctx.fillStyle = bull ? 'hsl(165,100%,38%)' : 'hsl(354,70%,50%)';
      ctx.fillRect(chartW, lY - 9, PRICE_AXIS_W, 18);
      ctx.fillStyle = 'hsl(220,20%,4%)';
      ctx.font = `bold ${settings.fontSize}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(lastC.close.toFixed(2), W - 4, lY);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = bull ? 'hsla(165,100%,42%,0.35)' : 'hsla(354,70%,54%,0.35)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, lY); ctx.lineTo(chartW, lY); ctx.stroke();
      ctx.setLineDash([]);
    }

    // â”€â”€ Time axis â”€â”€
    ctx.fillStyle = 'hsl(220,18%,5%)';
    ctx.fillRect(0, chartH, W, TIME_AXIS_H);
    ctx.strokeStyle = 'hsl(220,14%,12%)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, chartH); ctx.lineTo(W, chartH); ctx.stroke();
    ctx.font = `${settings.fontSize - 1}px "JetBrains Mono", monospace`;
    ctx.fillStyle = 'hsl(215,12%,40%)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const showEvery = Math.max(1, Math.ceil(60 / CW));
    visibleCandles.forEach((c, i) => {
      if (i % showEvery !== 0) return;
      const ci = startIdx + i;
      const tx = candleX(ci) + CW / 2;
      if (tx < 0 || tx > chartW) return;
      const d = new Date(c.timestamp);
      const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      ctx.fillText(label, tx, chartH + 7);
    });

    // â”€â”€ Crosshair â”€â”€
    if (settings.showCrosshair && crosshairRef.current) {
      const { x: cx, y: cy } = crosshairRef.current;
      if (cx >= 0 && cx <= chartW && cy >= 0 && cy <= chartH) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'hsla(210,20%,60%,0.5)';
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(cx, 0); ctx.lineTo(cx, chartH);
        ctx.moveTo(0, cy); ctx.lineTo(chartW, cy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Price label on axis
        const crossPrice = yToPrice(cy);
        ctx.fillStyle = 'hsl(210,40%,25%)';
        ctx.fillRect(chartW, cy - 9, PRICE_AXIS_W, 18);
        ctx.strokeStyle = 'hsl(210,40%,40%)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(chartW, cy - 9, PRICE_AXIS_W, 18);
        ctx.fillStyle = 'hsl(210,60%,80%)';
        ctx.font = `${settings.fontSize}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(crossPrice.toFixed(2), W - 4, cy);

        // Time label on axis
        const candleIdx = Math.floor((cx) / CW);
        const ci = startIdx + candleIdx;
        if (ci >= 0 && ci < candles.length) {
          const d = new Date(candles[ci].timestamp);
          const tLabel = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
          const lw = ctx.measureText(tLabel).width + 10;
          ctx.fillStyle = 'hsl(210,40%,25%)';
          ctx.fillRect(cx - lw / 2, chartH, lw, TIME_AXIS_H - 2);
          ctx.strokeStyle = 'hsl(210,40%,40%)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(cx - lw / 2, chartH, lw, TIME_AXIS_H - 2);
          ctx.fillStyle = 'hsl(210,60%,80%)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(tLabel, cx, chartH + 7);
        }
      }
    }
  }, [candles, settings]);

  // â”€â”€â”€ Mouse / wheel events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = stateRef.current;

      if (e.ctrlKey) {
        // Ctrl+wheel â†’ vertical zoom
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        s.priceZoom = Math.max(0.2, Math.min(20, s.priceZoom * delta));
      } else if (e.shiftKey) {
        // Shift+wheel â†’ pan left/right by candles
        s.scrollOffset = Math.max(0, Math.min(candles.length - 5, s.scrollOffset + (e.deltaY > 0 ? -3 : 3)));
      } else {
        // Wheel â†’ horizontal zoom (candle width)
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        s.candleWidth = Math.max(MIN_CANDLE_W, Math.min(MAX_CANDLE_W, s.candleWidth * zoomFactor));
      }
      scheduleRender();
    };

    const onMouseDown = (e: MouseEvent) => {
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startScroll: stateRef.current.scrollOffset,
        startPriceOffset: stateRef.current.priceOffset,
        active: true,
        button: e.button,
      };
      canvas.style.cursor = 'grabbing';
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      crosshairRef.current = { x, y };

      if (dragRef.current?.active) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        const s = stateRef.current;

        if (dragRef.current.button === 0) {
          // Left drag â†’ scroll horizontally + pan vertically
          const candlesScrolled = -dx / s.candleWidth;
          s.scrollOffset = Math.max(0, Math.min(candles.length - 5, dragRef.current.startScroll + candlesScrolled));
          s.priceOffset = dragRef.current.startPriceOffset + dy;
        } else if (dragRef.current.button === 2) {
          // Right drag â†’ vertical zoom
          const zf = 1 + dy * 0.005;
          s.priceZoom = Math.max(0.2, Math.min(20, s.priceZoom * zf));
          dragRef.current.startY = e.clientY;
        }
      }
      scheduleRender();
    };

    const onMouseUp = () => {
      dragRef.current = null;
      canvas.style.cursor = 'crosshair';
    };

    const onMouseLeave = () => {
      crosshairRef.current = null;
      dragRef.current = null;
      canvas.style.cursor = 'default';
      scheduleRender();
    };

    const onDblClick = () => {
      // Double-click resets zoom/pan
      stateRef.current.priceOffset = 0;
      stateRef.current.priceZoom = 1;
      stateRef.current.scrollOffset = 0;
      scheduleRender();
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('dblclick', onDblClick);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }, [candles, scheduleRender]);

  // Sync candleWidth setting â†’ stateRef
  useEffect(() => {
    stateRef.current.candleWidth = settings.candleWidth;
    scheduleRender();
  }, [settings.candleWidth, scheduleRender]);

  // Re-render whenever candles or settings change
  useEffect(() => { scheduleRender(); }, [candles, settings, scheduleRender]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => scheduleRender());
    ro.observe(container);
    return () => ro.disconnect();
  }, [scheduleRender]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden relative select-none">
      <canvas ref={canvasRef} className="block" style={{ cursor: 'crosshair' }} />
    </div>
  );
};

export default FootprintChart;
