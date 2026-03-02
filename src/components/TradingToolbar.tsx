import React from "react";
import {
  Settings2, RotateCcw, Clock, MousePointer2, Minus,
  MoveHorizontal, MoveVertical, Square, TrendingUp, Type, BarChart2,
  ChevronDown, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DrawingTool } from "@/lib/footprintSettings";
import { SYMBOLS } from "@/lib/symbolConfig";
import { FeedStatus } from "@/hooks/useBinanceFeed";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TradingToolbarProps {
  timeframe: string;
  onTimeframeChange: (tf: string) => void;
  onToggleSettings: () => void;
  onRegenerate: () => void;
  settingsOpen: boolean;
  activeTool: DrawingTool;
  onToolChange: (t: DrawingTool) => void;
  symbol: string;
  onSymbolChange: (s: string) => void;
  dataSource: 'mock' | 'live';
  onDataSourceChange: (src: 'mock' | 'live') => void;
  feedStatus: FeedStatus;
}

const STD_TF = ["1s", "5s", "30s", "1m", "3m", "5m", "15m", "30m", "1H", "4H", "1D"];
const ADV_TF = ["Range", "Tick", "Volume"];

const TOOLS: { id: DrawingTool; icon: React.ReactNode; label: string }[] = [
  { id: "cursor",    icon: <MousePointer2 size={12} />, label: "Select" },
  { id: "crosshair", icon: <MoveHorizontal size={12} />, label: "Crosshair" },
  { id: "line",      icon: <Minus size={12} />,         label: "Trend Line" },
  { id: "hline",     icon: <MoveVertical size={12} />,  label: "Horizontal Line" },
  { id: "rectangle", icon: <Square size={12} />,        label: "Rectangle" },
  { id: "fib",       icon: <TrendingUp size={12} />,    label: "Fibonacci" },
  { id: "frvp",      icon: <BarChart2 size={12} />,     label: "Fixed Range VP" },
  { id: "text",      icon: <Type size={12} />,          label: "Text" },
];

const STATUS_DOT: Record<FeedStatus, string> = {
  idle:         'bg-muted-foreground',
  connecting:   'bg-yellow-400 animate-pulse',
  connected:    'bg-green-500',
  disconnected: 'bg-red-500',
  error:        'bg-red-500',
};

const TradingToolbar: React.FC<TradingToolbarProps> = ({
  timeframe,
  onTimeframeChange,
  onToggleSettings,
  onRegenerate,
  settingsOpen,
  activeTool,
  onToolChange,
  symbol,
  onSymbolChange,
  dataSource,
  onDataSourceChange,
  feedStatus,
}) => {
  const isAdv = ADV_TF.includes(timeframe);
  const currentSymbol = SYMBOLS.find(s => s.value === symbol) ?? SYMBOLS[0];

  return (
    <div className="flex items-center gap-1 px-2 h-9 bg-toolbar border-b border-border flex-shrink-0 overflow-x-auto">
      {/* Symbol selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-semibold font-mono text-foreground rounded hover:bg-secondary transition-colors whitespace-nowrap flex-shrink-0">
            {currentSymbol.label} <ChevronDown size={9} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[130px]">
          {SYMBOLS.map(s => (
            <DropdownMenuItem key={s.value} onClick={() => onSymbolChange(s.value)} className="text-xs font-mono">
              {s.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Live / Mock toggle */}
      <button
        onClick={() => onDataSourceChange(dataSource === 'live' ? 'mock' : 'live')}
        className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono rounded transition-colors whitespace-nowrap flex-shrink-0 ${
          dataSource === 'live'
            ? 'bg-green-600/20 text-green-400 border border-green-600/40'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
        }`}
        title={dataSource === 'live' ? `Binance ${feedStatus}` : 'Switch to live Binance feed'}
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${dataSource === 'live' ? STATUS_DOT[feedStatus] : 'bg-muted-foreground'}`} />
        {dataSource === 'live' ? 'LIVE' : 'MOCK'}
      </button>

      <div className="h-4 w-px bg-border mx-1" />

      {/* Standard timeframes */}
      <Clock size={11} className="text-muted-foreground mr-0.5 flex-shrink-0" />
      {STD_TF.map((tf) => (
        <button
          key={tf}
          onClick={() => onTimeframeChange(tf)}
          className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors whitespace-nowrap flex-shrink-0 ${
            timeframe === tf
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
        >
          {tf}
        </button>
      ))}

      {/* Advanced TFs dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono rounded transition-colors whitespace-nowrap flex-shrink-0 ${
              isAdv
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            {isAdv ? timeframe : "Adv"} <ChevronDown size={9} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[120px]">
          {ADV_TF.map((tf) => (
            <DropdownMenuItem key={tf} onClick={() => onTimeframeChange(tf)} className="text-xs font-mono">
              {tf}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="h-4 w-px bg-border mx-1 flex-shrink-0" />

      {/* Drawing tools */}
      {TOOLS.map((t) => (
        <button
          key={t.id}
          title={t.label}
          onClick={() => onToolChange(t.id)}
          className={`p-1 rounded transition-colors flex-shrink-0 ${
            activeTool === t.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
        >
          {t.icon}
        </button>
      ))}

      <div className="h-4 w-px bg-border mx-1 flex-shrink-0" />

      {/* Actions */}
      {dataSource === 'mock' && (
        <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={onRegenerate} title="Regenerate mock data">
          <RotateCcw size={12} />
        </Button>
      )}
      <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={onToggleSettings} title="Toggle settings">
        <Settings2 size={12} className={settingsOpen ? "text-primary" : ""} />
      </Button>
    </div>
  );
};

export default TradingToolbar;
