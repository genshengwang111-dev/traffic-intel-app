// 指标统计卡片
import { Card, CardContent } from '@/components/ui/card';

export interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'accent' | 'warn' | 'danger';
}

const toneMap = {
  default: 'text-foreground',
  accent: 'text-primary',
  warn: 'text-amber-400',
  danger: 'text-red-400',
};

export default function StatCard({ label, value, sub, tone = 'default' }: StatCardProps) {
  return (
    <Card className="bg-card/70">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 font-mono text-xl font-semibold ${toneMap[tone]}`}>{value}</div>
        {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
