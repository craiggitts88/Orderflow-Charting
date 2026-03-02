import React, { useRef, useEffect, useCallback } from 'react';
import { FootprintCandle } from '@/lib/mockData';

const AXIS_W = 70;

interface CVDChartProps {
  candles: FootprintCandle[];
  /** Mirrors FootprintChart's scrollOffset — number of candles from right */
  scrollOffset?: number;
  candleWidth?: number;
}

const CVDChart: React.FC<CVDChartProps> = ({ candles, scrollOffset = 0, candleWidth = 120 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || candles.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = container.clientHeight;
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const CW = candleWidth;
    const chartW = W - AXIS_W;
    const PAD = 16;
    const chartH = H - PAD * 2;

    // Visible slice — mirror FootprintChart logic
    const visibleCount = Math.ceil(chartW / CW) + 2;
    const rightEdge = candles.length - scrollOffset;
    const startIdx = Math.max(0, Math.floor(rightEdge - visibleCount));
    const endIdx = Math.min(candles.length - 1, Math.floor(rightEdge));
    const vis = candles.slice(startIdx, endIdx + 1);
    if (!vis.length) return;

    const cvdVals = vis.map(c => c.cvd);
    const maxC = Math.max(...cvdVals);
    const minC = Math.min(...cvdVals);
    const range = (maxC - minC) || 1;

    const cvdToY = (v: number) => PAD + ((maxC - v) / range) * chartH;
    const candleX = (ci: number) => chartW - (endIdx - ci + 1) * CW;

    // BG
    ctx.fillStyle = 'hsl(220,20%,4%)';
    ctx.fillRect(0, 0, W, H);

    // Right axis bg
    ctx.fillStyle = 'hsl(220,18%,6%)';
    ctx.fillRect(chartW, 0, AXIS_W, H);
    ctx.strokeStyle = 'hsl(220,14%,14%)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, H); ctx.stroke();

    // zero line
    const zeroY = cvdToY(0);
    if (zeroY >= 0 && zeroY <= H) {
      ctx.strokeStyle = 'hsl(220,14%,18%)';
      ctx.lineWidth = 0.5; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(0, zeroY); ctx.lineTo(chartW, zeroY); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Delta bars (background)
    const barW = Math.max(1, CW - 2);
    vis.forEach((c, i) => {
      const ci = startIdx + i;
      const x = candleX(ci);
      const dH = Math.min(chartH * 0.3, Math.abs(c.totalDelta) / (range * 0.1 || 1) * chartH * 0.12);
      const y = c.totalDelta >= 0 ? zeroY - dH : zeroY;
      ctx.fillStyle = c.totalDelta >= 0 ? 'hsla(165,100%,42%,0.35)' : 'hsla(354,70%,54%,0.35)';
      ctx.fillRect(x + 1, y, barW, dH);
    });

    // CVD filled area
    ctx.beginPath();
    vis.forEach((c, i) => {
      const ci = startIdx + i;
      const x = candleX(ci) + CW / 2;
      const y = cvdToY(c.cvd);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    // close fill
    const lastX2 = candleX(endIdx) + CW / 2;
    const firstX2 = candleX(startIdx) + CW / 2;
    ctx.lineTo(lastX2, H); ctx.lineTo(firstX2, H); ctx.closePath();
    const grad = ctx.createLinearGradient(0, PAD, 0, H);
    const lastCVD = vis[vis.length - 1].cvd;
    if (lastCVD >= 0) {
      grad.addColorStop(0, 'hsla(165,100%,42%,0.18)');
      grad.addColorStop(1, 'hsla(165,100%,42%,0.03)');
    } else {
      grad.addColorStop(0, 'hsla(354,70%,54%,0.03)');
      grad.addColorStop(1, 'hsla(354,70%,54%,0.18)');
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // CVD line
    ctx.beginPath();
    ctx.strokeStyle = 'hsl(210,80%,62%)';
    ctx.lineWidth = 1.5;
    vis.forEach((c, i) => {
      const ci = startIdx + i;
      const x = candleX(ci) + CW / 2;
      const y = cvdToY(c.cvd);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Y-axis labels
    ctx.font = '10px "JetBrains Mono",monospace';
    ctx.fillStyle = 'hsl(215,12%,45%)';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [0, 0.25, 0.5, 0.75, 1].forEach(t => {
      const val = maxC - t * range;
      const y = PAD + t * chartH;
      ctx.fillText(Math.round(val).toString(), W - 4, y);
    });

    // Label + current value
    ctx.font = 'bold 10px "JetBrains Mono",monospace';
    ctx.fillStyle = 'hsl(210,80%,60%)';
    ctx.textAlign = 'left';
    ctx.fillText('CVD', 6, 13);
    const cv = vis[vis.length - 1].cvd;
    ctx.fillStyle = cv >= 0 ? 'hsl(165,100%,55%)' : 'hsl(354,70%,62%)';
    ctx.fillText(Math.round(cv).toString(), 38, 13);
  }, [candles, scrollOffset, candleWidth]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
};

export default CVDChart;
