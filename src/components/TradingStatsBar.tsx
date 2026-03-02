import React from 'react';
import { FootprintCandle } from '@/lib/mockData';
import { ArrowUpRight, ArrowDownRight, Activity, BarChart3, TrendingUp, Zap } from 'lucide-react';

interface TradingStatsBarProps {
  candles: FootprintCandle[];
}

const TradingStatsBar: React.FC<TradingStatsBarProps> = ({ candles }) => {
  if (candles.length === 0) return null;

  const last = candles[candles.length - 1];
  const prev = candles.length > 1 ? candles[candles.length - 2] : last;
  const change = last.close - prev.close;
  const changePercent = (change / prev.close) * 100;
  const isBullish = change >= 0;

  const sessionVolume = candles.reduce((s, c) => s + c.totalVolume, 0);
  const sessionDelta = candles.reduce((s, c) => s + c.totalDelta, 0);

  return (
    <div className="flex items-center gap-6 px-4 h-8 bg-toolbar border-b border-border text-[11px] font-mono overflow-x-auto">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">ES 03-26</span>
        <span className={`font-bold ${isBullish ? 'text-bid glow-bid' : 'text-ask glow-ask'}`}>
          {last.close.toFixed(2)}
        </span>
        <span className={`flex items-center gap-0.5 ${isBullish ? 'text-bid' : 'text-ask'}`}>
          {isBullish ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {Math.abs(change).toFixed(2)} ({changePercent.toFixed(2)}%)
        </span>
      </div>

      <div className="h-4 w-px bg-border" />

      <StatItem icon={<BarChart3 size={11} />} label="Vol" value={sessionVolume.toLocaleString()} />
      <StatItem
        icon={<TrendingUp size={11} />}
        label="Δ"
        value={(sessionDelta >= 0 ? '+' : '') + sessionDelta.toLocaleString()}
        color={sessionDelta >= 0 ? 'text-bid' : 'text-ask'}
      />
      <StatItem
        icon={<Activity size={11} />}
        label="CVD"
        value={Math.round(last.cvd).toLocaleString()}
        color={last.cvd >= 0 ? 'text-bid' : 'text-ask'}
      />
      <StatItem icon={<Zap size={11} />} label="H" value={last.high.toFixed(2)} />
      <StatItem icon={<Zap size={11} />} label="L" value={last.low.toFixed(2)} />
      <StatItem
        icon={<Activity size={11} />}
        label="POC"
        value={last.pocPrice.toFixed(2)}
        color="text-poc"
      />
    </div>
  );
};

const StatItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}> = ({ icon, label, value, color = 'text-foreground' }) => (
  <div className="flex items-center gap-1.5 whitespace-nowrap">
    <span className="text-muted-foreground">{icon}</span>
    <span className="text-muted-foreground">{label}</span>
    <span className={color}>{value}</span>
  </div>
);

export default TradingStatsBar;
