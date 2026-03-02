export type DisplayMode = 'bidAsk' | 'delta' | 'totalVolume' | 'bidAskDelta' | 'trades';
export type ColorMode = 'heatmap' | 'gradient' | 'solid' | 'deltaFlow';
export type DrawingTool = 'cursor' | 'crosshair' | 'line' | 'hline' | 'vline' | 'rectangle' | 'fib' | 'text';

export interface FootprintSettings {
  displayMode: DisplayMode;
  colorMode: ColorMode;
  showPOC: boolean;
  showDelta: boolean;
  showCVD: boolean;
  showVolumeProfile: boolean;
  showSessionVPOC: boolean;
  showValueArea: boolean;
  tickSize: number;
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
};
