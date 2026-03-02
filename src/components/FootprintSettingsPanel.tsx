import React from 'react';
import { FootprintSettings } from '@/lib/footprintSettings';
import { FeedStatus } from '@/hooks/useBinanceFeed';
import { SYMBOLS } from '@/lib/symbolConfig';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

interface FootprintSettingsPanelProps {
  settings: FootprintSettings;
  onSettingsChange: (settings: FootprintSettings) => void;
  symbol?: string;
  dataSource?: 'mock' | 'live';
  feedStatus?: FeedStatus;
  minTick?: number;
}

const STATUS_COLOR: Record<FeedStatus, string> = {
  idle:         'bg-muted-foreground',
  connecting:   'bg-yellow-400 animate-pulse',
  connected:    'bg-green-500',
  disconnected: 'bg-red-500',
  error:        'bg-red-500',
};

const STATUS_LABEL: Record<FeedStatus, string> = {
  idle:         'Idle',
  connecting:   'Connecting…',
  connected:    'Live',
  disconnected: 'Disconnected',
  error:        'Error',
};

const FootprintSettingsPanel: React.FC<FootprintSettingsPanelProps> = ({
  settings,
  onSettingsChange,
  symbol = 'btcusdt',
  dataSource = 'mock',
  feedStatus = 'idle',
  minTick = 0.1,
}) => {
  const update = (partial: Partial<FootprintSettings>) => {
    onSettingsChange({ ...settings, ...partial });
  };

  return (
    <div className="w-full h-full overflow-y-auto p-3 space-y-4 text-xs">
      <div className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Display
        </h3>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Mode</Label>
          <Select
            value={settings.displayMode}
            onValueChange={(v) => update({ displayMode: v as FootprintSettings['displayMode'] })}
          >
            <SelectTrigger className="h-7 text-xs bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bidAsk">Bid × Ask</SelectItem>
              <SelectItem value="delta">Delta</SelectItem>
              <SelectItem value="totalVolume">Total Volume</SelectItem>
              <SelectItem value="bidAskDelta">Bid × Ask + Delta</SelectItem>
              <SelectItem value="trades">Trades Count</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Color Mode</Label>
          <Select
            value={settings.colorMode}
            onValueChange={(v) => update({ colorMode: v as FootprintSettings['colorMode'] })}
          >
            <SelectTrigger className="h-7 text-xs bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="heatmap">Heatmap</SelectItem>
              <SelectItem value="histogram">Histogram</SelectItem>
              <SelectItem value="deltaFlow">Delta Flow</SelectItem>
              <SelectItem value="gradient">Gradient</SelectItem>
              <SelectItem value="solid">Solid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator className="bg-border" />

      <div className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Overlays
        </h3>
        <ToggleRow label="POC" checked={settings.showPOC} onChange={(v) => update({ showPOC: v })} />
        <ToggleRow label="Delta" checked={settings.showDelta} onChange={(v) => update({ showDelta: v })} />
        <ToggleRow label="CVD Sub-chart" checked={settings.showCVD} onChange={(v) => update({ showCVD: v })} />
        <ToggleRow label="Volume Profile" checked={settings.showVolumeProfile} onChange={(v) => update({ showVolumeProfile: v })} />
        <ToggleRow label="Session VPOC" checked={settings.showSessionVPOC} onChange={(v) => update({ showSessionVPOC: v })} />
        <ToggleRow label="Value Area" checked={settings.showValueArea} onChange={(v) => update({ showValueArea: v })} />
        <ToggleRow label="Grid" checked={settings.showGrid} onChange={(v) => update({ showGrid: v })} />
        <ToggleRow label="Crosshair" checked={settings.showCrosshair} onChange={(v) => update({ showCrosshair: v })} />
        <ToggleRow label="Wicks" checked={settings.showWicks} onChange={(v) => update({ showWicks: v })} />
        <ToggleRow label="Candle Body" checked={settings.showCandleBody} onChange={(v) => update({ showCandleBody: v })} />
        <ToggleRow label="Imbalance" checked={settings.highlightImbalance} onChange={(v) => update({ highlightImbalance: v })} />
      </div>

      <Separator className="bg-border" />

      {/* ── Row Size ──────────────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Row Size
        </h3>

        {/* Mode toggle */}
        <div className="flex rounded overflow-hidden border border-border text-[10px] font-mono">
          {(['manual', 'atr'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => update({ rowSizeMode: mode })}
              className={`flex-1 py-1 transition-colors ${
                settings.rowSizeMode === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {mode === 'manual' ? 'Manual' : 'ATR Auto'}
            </button>
          ))}
        </div>

        {settings.rowSizeMode === 'manual' ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Row Size</Label>
              <span className="text-[10px] text-muted-foreground font-mono">
                min tick: {minTick}
              </span>
            </div>
            <input
              type="number"
              step={minTick}
              min={minTick}
              value={settings.manualRowSize}
              onChange={e => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= minTick) update({ manualRowSize: v });
              }}
              className="w-full h-7 rounded bg-secondary border border-border px-2 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-muted-foreground">Computed row size</span>
              <span className="text-primary">{settings.tickSize}</span>
            </div>
            <SliderRow
              label={`ATR Period (${settings.atrPeriod})`}
              value={settings.atrPeriod}
              min={5}
              max={50}
              step={1}
              onChange={(v) => update({ atrPeriod: v })}
            />
            <SliderRow
              label={`Rows / ATR (${settings.atrDivisor})`}
              value={settings.atrDivisor}
              min={5}
              max={100}
              step={5}
              onChange={(v) => update({ atrDivisor: v })}
            />
          </div>
        )}
      </div>

      <Separator className="bg-border" />

      <div className="space-y-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Parameters
        </h3>
        <SliderRow
          label="Font Size"
          value={settings.fontSize}
          min={8}
          max={16}
          step={1}
          onChange={(v) => update({ fontSize: v })}
        />
        <SliderRow
          label="Candle Width"
          value={settings.candleWidth}
          min={80}
          max={300}
          step={10}
          onChange={(v) => update({ candleWidth: v })}
        />
        <SliderRow
          label="Volume Filter"
          value={settings.volumeFilter}
          min={0}
          max={100}
          step={5}
          onChange={(v) => update({ volumeFilter: v })}
        />
        <SliderRow
          label="Imbalance Ratio"
          value={settings.imbalanceRatio}
          min={1.5}
          max={10}
          step={0.5}
          onChange={(v) => update({ imbalanceRatio: v })}
        />
        <SliderRow
          label="Value Area %"
          value={settings.valueAreaPercent}
          min={50}
          max={90}
          step={5}
          onChange={(v) => update({ valueAreaPercent: v })}
        />
      </div>

      <Separator className="bg-border" />

      <div className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Colours
        </h3>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <ColorRow label="Bid / Sell" value={settings.bidColor} onChange={(v) => update({ bidColor: v })} />
          <ColorRow label="Ask / Buy" value={settings.askColor} onChange={(v) => update({ askColor: v })} />
          <ColorRow label="Bid Text" value={settings.bidTextColor} onChange={(v) => update({ bidTextColor: v })} />
          <ColorRow label="Ask Text" value={settings.askTextColor} onChange={(v) => update({ askTextColor: v })} />
          <ColorRow label="POC" value={settings.pocColor} onChange={(v) => update({ pocColor: v })} />
          <ColorRow label="Imbalance" value={settings.imbalanceColor} onChange={(v) => update({ imbalanceColor: v })} />
          <ColorRow label="Up Wick" value={settings.upColor} onChange={(v) => update({ upColor: v })} />
          <ColorRow label="Down Wick" value={settings.downColor} onChange={(v) => update({ downColor: v })} />
        </div>
      </div>

      <Separator className="bg-border" />

      <div className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Connection
        </h3>
        <div className="rounded bg-secondary p-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Feed</span>
            <span className={`text-[10px] font-semibold ${dataSource === 'live' ? 'text-green-400' : 'text-muted-foreground'}`}>
              {dataSource === 'live' ? 'BINANCE' : 'MOCK'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${dataSource === 'live' ? STATUS_COLOR[feedStatus] : 'bg-muted-foreground'}`} />
              <span className={`text-[10px] ${dataSource === 'live' && feedStatus === 'connected' ? 'text-green-400' : 'text-muted-foreground'}`}>
                {dataSource === 'live' ? STATUS_LABEL[feedStatus] : 'Simulated'}
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Symbol</span>
            <span className="text-foreground font-semibold">
              {(SYMBOLS.find(s => s.value === symbol) ?? SYMBOLS[0]).label}
            </span>
          </div>
        </div>
        {dataSource === 'mock' && (
          <p className="text-[9px] text-muted-foreground leading-relaxed">
            Switch to LIVE in the toolbar to connect to Binance Futures.
          </p>
        )}
      </div>
    </div>
  );
};

const ToggleRow: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({
  label,
  checked,
  onChange,
}) => (
  <div className="flex items-center justify-between">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
  </div>
);

const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, onChange }) => (
  <div className="space-y-1">
    <div className="flex justify-between">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <span className="text-xs text-foreground font-mono">{value}</span>
    </div>
    <Slider
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([v]) => onChange(v)}
      className="py-1"
    />
  </div>
);

const ColorRow: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between gap-2">
    <Label className="text-xs text-muted-foreground truncate">{label}</Label>
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-7 h-5 rounded cursor-pointer border border-border bg-transparent p-0"
      style={{ minWidth: '28px' }}
    />
  </div>
);

export default FootprintSettingsPanel;
