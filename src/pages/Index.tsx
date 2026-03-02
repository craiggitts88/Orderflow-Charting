import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import FootprintChart from '@/components/FootprintChart';
import CVDChart from '@/components/CVDChart';
import FootprintSettingsPanel from '@/components/FootprintSettingsPanel';
import TradingToolbar from '@/components/TradingToolbar';
import TradingStatsBar from '@/components/TradingStatsBar';
import { generateFootprintCandles, generateRealtimeTick } from '@/lib/mockData';
import { defaultSettings, FootprintSettings, DrawingTool } from '@/lib/footprintSettings';

const CANDLE_COUNT = 200;

const Index = () => {
  const [settings, setSettings] = useState<FootprintSettings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [timeframe, setTimeframe] = useState('5m');
  const [candles, setCandles] = useState(() => generateFootprintCandles(CANDLE_COUNT, '5m'));
  const [activeTool, setActiveTool] = useState<DrawingTool>('cursor');
  const liveRef = useRef(true);

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

  // Live tick simulation
  useEffect(() => {
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
          row.delta = row.bidVolume - row.askVolume;
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
  }, [timeframe]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      <TradingStatsBar candles={candles} />

      <TradingToolbar
        timeframe={timeframe}
        onTimeframeChange={handleTimeframeChange}
        onToggleSettings={() => setSettingsOpen(v => !v)}
        onRegenerate={handleRegenerate}
        settingsOpen={settingsOpen}
        activeTool={activeTool}
        onToolChange={handleToolChange}
      />

      <div className="flex-1 overflow-hidden min-h-0">
        <PanelGroup direction="horizontal" className="h-full">
          {/* Chart area */}
          <Panel defaultSize={settingsOpen ? 82 : 100} minSize={50} className="flex flex-col min-h-0">
            <PanelGroup direction="vertical" className="h-full">
              {/* Footprint chart */}
              <Panel defaultSize={settings.showCVD ? 75 : 100} minSize={40} className="min-h-0">
                <FootprintChart candles={candles} settings={settings} />
              </Panel>

              {/* CVD sub-chart */}
              {settings.showCVD && (
                <>
                  <PanelResizeHandle className="h-1 bg-border hover:bg-primary/40 cursor-row-resize transition-colors" />
                  <Panel defaultSize={25} minSize={10} maxSize={40} className="min-h-0">
                    <CVDChart candles={candles} candleWidth={settings.candleWidth} />
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
                  <FootprintSettingsPanel settings={settings} onSettingsChange={setSettings} />
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
