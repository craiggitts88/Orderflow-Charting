export type DisplayMode = 'bidAsk' | 'delta' | 'totalVolume' | 'bidAskDelta' | 'trades';
export type ColorMode = 'heatmap' | 'histogram' | 'deltaFlow' | 'gradient' | 'solid';
export type DrawingTool = 'cursor' | 'crosshair' | 'line' | 'hline' | 'vline' | 'rectangle' | 'fib' | 'text' | 'frvp';
export type RowSizeMode = 'manual' | 'atr';

export interface FootprintSettings {
  displayMode: DisplayMode;
  colorMode: ColorMode;
  showPOC: boolean;
  showDelta: boolean;
  showCVD: boolean;
  showVolumeProfile: boolean;
  showSessionVPOC: boolean;
  showValueArea: boolean;
  tickSize: number;          // effective row size (computed; driven by rowSizeMode)
  rowSizeMode: RowSizeMode;
  manualRowSize: number;     // price units per row when mode=manual
  atrPeriod: number;         // periods to calculate ATR when mode=atr
  atrDivisor: number;        // number of rows per ATR range (higher = finer rows)
  atrRowSize: number;        // computed result (read-only, set by Index.tsx)
  barsBack: number;          // how many historical bars to load from real tick data
  fontSize: number;
  cellPadding: number;
  volumeFilter: number;
  highlightImbalance: boolean;
  imbalanceRatio: number;
  showGrid: boolean;
  showCrosshair: boolean;
  candleWidth: number;
  activeDrawingTool: DrawingTool;
  valueAreaPercent: number;
  showWicks: boolean;
  showCandleBorder: boolean;
  showCandleBody: boolean;
  // user-adjustable colours
  bidColor: string;
  askColor: string;
  bidTextColor: string;
  askTextColor: string;
  pocColor: string;
  imbalanceColor: string;
  upColor: string;
  downColor: string;
}

export const defaultSettings: FootprintSettings = {
  displayMode: 'bidAsk',
  colorMode: 'heatmap',
  showPOC: true,
  showDelta: true,
  showCVD: true,
  showVolumeProfile: false,
  showSessionVPOC: false,
  showValueArea: false,
  tickSize: 0.25,
  rowSizeMode: 'atr',
  manualRowSize: 5,
  atrPeriod: 14,
  atrDivisor: 20,
  atrRowSize: 5,
  barsBack: 50,
  fontSize: 11,
  cellPadding: 2,
  volumeFilter: 0,
  highlightImbalance: true,
  imbalanceRatio: 3,
  showGrid: true,
  showCrosshair: true,
  candleWidth: 120,
  activeDrawingTool: 'cursor',
  valueAreaPercent: 70,
  showWicks: true,
  showCandleBorder: true,
  showCandleBody: true,
  bidColor: '#e04444',
  askColor: '#22c55e',
  bidTextColor: '#f87171',
  askTextColor: '#4ade80',
  pocColor: '#f59e0b',
  imbalanceColor: '#ffffff',
  upColor: '#22c55e',
  downColor: '#e04444',
};
