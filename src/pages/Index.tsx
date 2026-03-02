import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import FootprintChart from '@/components/FootprintChart';
import CVDChart from '@/components/CVDChart';
import FootprintSettingsPanel from '@/components/FootprintSettingsPanel';
import TradingToolbar from '@/components/TradingToolbar';
import TradingStatsBar from '@/components/TradingStatsBar';
import { generateFootprintCandles, generateRealtimeTick, FootprintCandle } from '@/lib/mockData';
import { defaultSettings, FootprintSettings, DrawingTool } from '@/lib/footprintSettings';
import { SYMBOLS, defaultSymbol } from '@/lib/symbolConfig';
import { useBinanceFeed } from '@/hooks/useBinanceFeed';

// Compute ATR-based row size from candles
function computeAtrRowSize(candles: FootprintCandle[], period: number, divisor: number, minTick: number, fallback: number): number {
  if (candles.length < 2) return fallback;
  const slice = candles.slice(-Math.min(period + 1, candles.length));
  let sum = 0;
  for (let i = 1; i < slice.length; i++) {
    const c = slice[i], p = slice[i - 1];
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  const atr = sum / (slice.length - 1);
  const raw = atr / divisor;
  const ticks = Math.max(1, Math.round(raw / minTick));
  return parseFloat((ticks * minTick).toPrecision(10));
}

const CANDLE_COUNT = 200;

const Index = () => {
  const [settings, setSettings] = useState<FootprintSettings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [timeframe, setTimeframe] = useState('5m');
  const [candles, setCandles] = useState(() => generateFootprintCandles(CANDLE_COUNT, '5m'));
  const [activeTool, setActiveTool] = useState<DrawingTool>('cursor');
  const [symbol, setSymbol] = useState(defaultSymbol.value);
  const [dataSource, setDataSource] = useState<'mock' | 'live'>('live');
  const liveRef = useRef(true);

  // Selecting a symbol always switches to live
  const handleSymbolChange = useCallback((s: string) => {
    setSymbol(s);
    setDataSource('live');
  }, []);

  // Live Binance feed — use settings.tickSize which is kept up to date below
  const symbolConfig = SYMBOLS.find(s => s.value === symbol) ?? defaultSymbol;
  const { candles: liveCandles, status: feedStatus } = useBinanceFeed(
    symbol,
    timeframe,
    settings.tickSize,
    dataSource === 'live',
  );

  // Which candles to display
  const displayCandles = dataSource === 'live' ? liveCandles : candles;

  // Track last applied row size to avoid feed reconnect loops
  const lastRowSizeRef = useRef(0);

  // Recompute row size whenever mode/params/symbol/candle count changes (not every tick)
  useEffect(() => {
    const sc = SYMBOLS.find(s => s.value === symbol) ?? defaultSymbol;
    let rowSize: number;
    if (settings.rowSizeMode === 'manual') {
      const ticks = Math.max(1, Math.round(settings.manualRowSize / sc.minTick));
      rowSize = parseFloat((ticks * sc.minTick).toPrecision(10));
    } else {
      rowSize = computeAtrRowSize(displayCandles, settings.atrPeriod, settings.atrDivisor, sc.minTick, sc.tickSize);
    }
    if (rowSize !== lastRowSizeRef.current) {
      lastRowSizeRef.current = rowSize;
      setSettings(s => ({ ...s, tickSize: rowSize, atrRowSize: rowSize }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, settings.rowSizeMode, settings.manualRowSize, settings.atrPeriod, settings.atrDivisor, displayCandles.length]);

  // When symbol changes in live mode, seed manualRowSize with symbol default
  useEffect(() => {
    const sc = SYMBOLS.find(s => s.value === symbol) ?? defaultSymbol;
    setSettings(s => ({ ...s, tickSize: sc.tickSize, manualRowSize: sc.tickSize }));
    lastRowSizeRef.current = sc.tickSize;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const handleTimeframeChange = useCallback((tf: string) => {
    setTimeframe(tf);
    setCandles(generateFootprintCandles(CANDLE_COUNT, tf));
  }, []);

  const handleRegenerate = useCallback(() => {
    setCandles(generateFootprintCandles(CANDLE_COUNT, timeframe));
  }, [timeframe]);

  const handleToolChange = useCallback((t: DrawingTool) => {
    setActiveTool(t);
    setSettings(s => ({ ...s, activeDrawingTool: t }));
  }, []);

  // Mock live tick simulation (only when in mock mode)
  useEffect(() => {
    if (dataSource !== 'mock') return;
    liveRef.current = true;
    const interval = setInterval(() => {
      if (!liveRef.current) return;
      setCandles(prev => {
        const newCandles = [...prev];
        const last = { ...newCandles[newCandles.length - 1], rows: [...newCandles[newCandles.length - 1].rows] };
        const tick = generateRealtimeTick(last.close);

        const rowIdx = last.rows.findIndex(r => Math.abs(r.price - tick.price) < 0.001);
        if (rowIdx >= 0) {
          const row = { ...last.rows[rowIdx] };
          if (tick.side === 'bid') row.bidVolume += tick.volume;
          else row.askVolume += tick.volume;
          row.delta = row.askVolume - row.bidVolume;  // delta = buys - sells
          row.totalVolume = row.bidVolume + row.askVolume;
          last.rows[rowIdx] = row;
        }

        last.close = tick.price;
        if (tick.price > last.high) last.high = tick.price;
        if (tick.price < last.low) last.low = tick.price;
        last.totalVolume = last.rows.reduce((s, r) => s + r.totalVolume, 0);
        last.totalDelta = last.rows.reduce((s, r) => s + r.delta, 0);
        last.cvd = (newCandles.length > 1 ? newCandles[newCandles.length - 2].cvd : 0) + last.totalDelta;
        const pocRow = last.rows.reduce((mx, r) => r.totalVolume > mx.totalVolume ? r : mx, last.rows[0]);
        last.pocPrice = pocRow.price;

        newCandles[newCandles.length - 1] = last;
        return newCandles;
      });
    }, 400);
    return () => { liveRef.current = false; clearInterval(interval); };
  }, [timeframe, dataSource]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      <TradingStatsBar candles={displayCandles} symbol={symbol} />

      <TradingToolbar
        timeframe={timeframe}
        onTimeframeChange={handleTimeframeChange}
        onToggleSettings={() => setSettingsOpen(v => !v)}
        onRegenerate={handleRegenerate}
        settingsOpen={settingsOpen}
        activeTool={activeTool}
        onToolChange={handleToolChange}
        symbol={symbol}
        onSymbolChange={handleSymbolChange}
        dataSource={dataSource}
        onDataSourceChange={setDataSource}
        feedStatus={feedStatus}
      />

      <div className="flex-1 overflow-hidden min-h-0">
        <PanelGroup direction="horizontal" className="h-full">
          {/* Chart area */}
          <Panel defaultSize={settingsOpen ? 82 : 100} minSize={50} className="flex flex-col min-h-0">
            <PanelGroup direction="vertical" className="h-full">
              {/* Footprint chart */}
              <Panel defaultSize={settings.showCVD ? 75 : 100} minSize={40} className="min-h-0 relative">
                <FootprintChart candles={displayCandles} settings={settings} timeframe={timeframe} />
                {dataSource === 'live' && feedStatus === 'connecting' && displayCandles.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-muted-foreground text-xs font-mono pointer-events-none">
                    Fetching {symbol.toUpperCase()} history…
                  </div>
                )}
              </Panel>

              {/* CVD sub-chart */}
              {settings.showCVD && (
                <>
                  <PanelResizeHandle className="h-1 bg-border hover:bg-primary/40 cursor-row-resize transition-colors" />
                  <Panel defaultSize={25} minSize={10} maxSize={40} className="min-h-0">
                    <CVDChart candles={displayCandles} candleWidth={settings.candleWidth} />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          {/* Settings panel */}
          {settingsOpen && (
            <>
              <PanelResizeHandle className="w-1 bg-border hover:bg-primary/40 cursor-col-resize transition-colors" />
              <Panel defaultSize={18} minSize={12} maxSize={35} className="flex flex-col bg-card min-h-0 overflow-hidden">
                <div className="h-7 bg-panel-header flex items-center px-3 border-b border-border flex-shrink-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Chart Settings
                  </span>
                </div>
                <div className="flex-1 overflow-hidden min-h-0">
                  <FootprintSettingsPanel
                  settings={settings}
                  onSettingsChange={setSettings}
                  symbol={symbol}
                  dataSource={dataSource}
                  feedStatus={feedStatus}
                  minTick={symbolConfig.minTick}
                />
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </div>
  );
};

export default Index;
