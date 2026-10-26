import { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ITimeSeriesDataset } from '@/data/types';
import GeoMap, { type IGeoMapEntry } from '@/components/GeoMap';
import { findGeoByName } from '@/lib/csv';
import { parseTimePoints } from '@/lib/eda';
import { CHART_HEX, AXIS_TEXT, GRID_LINE, SPLIT_LINE } from '@/lib/charts';
import { ExplainBlock, ExplainTip } from '@/components/Explain';
import { format } from 'date-fns';

export interface SpatialSectionProps {
  dataset: ITimeSeriesDataset;
  onSelectZone: (zone: string) => void;
}

type PeriodMode = 'daily' | 'morning' | 'evening' | 'daytime' | 'night' | 'date';

const MODES: { id: PeriodMode; label: string; tip: string }[] = [
  { id: 'daily', label: '全天平均', tip: '每个区域全时段平均流量，看谁最繁忙。' },
  { id: 'morning', label: '早高峰 7-10', tip: '只看早上 7 点到 10 点的平均流量，识别上班通勤热点。' },
  { id: 'evening', label: '晚高峰 17-20', tip: '只看下午 5 点到 8 点的平均流量，识别下班通勤热点。' },
  { id: 'daytime', label: '白天 10-17', tip: '工作日白天时段，识别办公与商业活跃区。' },
  { id: 'night', label: '夜间 22-6', tip: '深夜时段，识别居住与夜间活跃区。' },
  { id: 'date', label: '指定日期', tip: '查看某一天的整体流量分布。' },
];

function periodValue(dates: Date[], series: number[], from: number, to: number): number | null {
  const vals: number[] = [];
  for (let i = 0; i < series.length && i < dates.length; i++) {
    const h = dates[i].getHours();
    const inRange = from <= to ? h >= from && h < to : h >= from || h < to;
    if (inRange && Number.isFinite(series[i])) vals.push(series[i]);
  }
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

export default function SpatialSection({ dataset, onSelectZone }: SpatialSectionProps) {
  const [mode, setMode] = useState<PeriodMode>('daily');
  const [date, setDate] = useState<string>('');
  const dates = useMemo(() => parseTimePoints(dataset.timePoints), [dataset.timePoints]);

  const dayOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of dates) set.add(format(d, 'yyyy-MM-dd'));
    return [...set].slice(0, 60);
  }, [dates]);

  const entries: IGeoMapEntry[] = useMemo(() => {
    return dataset.zones.map((z, zi) => {
      const geo = dataset.geo ? findGeoByName(dataset.geo, z) : null;
      const series = dataset.values.map((r) => r[zi]);
      let value: number | null = null;
      if (mode === 'daily') value = periodValue(dates, series, 0, 24);
      else if (mode === 'morning') value = periodValue(dates, series, 7, 10);
      else if (mode === 'evening') value = periodValue(dates, series, 17, 20);
      else if (mode === 'daytime') value = periodValue(dates, series, 10, 17);
      else if (mode === 'night') value = periodValue(dates, series, 22, 6);
      else if (mode === 'date' && date) {
        const vals: number[] = [];
        for (let i = 0; i < series.length && i < dates.length; i++) {
          if (format(dates[i], 'yyyy-MM-dd') === date && Number.isFinite(series[i])) vals.push(series[i]);
        }
        value = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      }
      return { name: z, label: z, rings: geo ? geo.rings : [], value };
    });
  }, [dataset, dates, mode, date]);

  // Top10 排名（只看有值且有边界的区域）
  const ranking = useMemo(() => {
    const valid = entries
      .filter((e) => e.value !== null && Number.isFinite(e.value) && e.rings.length > 0)
      .sort((a, b) => (b.value as number) - (a.value as number));
    return valid.slice(0, 10).reverse(); // reverse 让条形图顶部为最大
  }, [entries]);

  const rankOption: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 96, right: 48, top: 8, bottom: 24 },
    xAxis: {
      type: 'value',
      axisLabel: { color: AXIS_TEXT },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    yAxis: {
      type: 'category',
      data: ranking.map((r) => r.label),
      axisLabel: { color: AXIS_TEXT, fontSize: 11, width: 86, overflow: 'truncate' },
      axisLine: { lineStyle: { color: SPLIT_LINE } },
    },
    series: [
      {
        type: 'bar',
        data: ranking.map((r) => Math.round((r.value as number) * 100) / 100),
        barWidth: '60%',
        itemStyle: { color: CHART_HEX[1], borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: AXIS_TEXT, fontSize: 10 },
      },
    ],
  };

  const fmtVal = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div className="space-y-4">
      <ExplainBlock title="空间维度在讲什么？">
        把每个区域在某个时段的平均流量画在地图上：颜色越偏红流量越高，越偏青越低。
        可以切换“早高峰 / 晚高峰 / 夜间”等时段，看城市热点如何随一天的时间移动。
      </ExplainBlock>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={mode} onValueChange={(v) => setMode(v as PeriodMode)}>
          <TabsList className="flex-wrap">
            {MODES.map((m) => (
              <TabsTrigger key={m.id} value={m.id}>
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {mode === 'date' ? (
          <Select value={date} onValueChange={setDate}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="选择日期" />
            </SelectTrigger>
            <SelectContent>
              {dayOptions.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <span className="text-xs text-muted-foreground">{MODES.find((m) => m.id === mode)?.tip}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              空间流量分布
              <ExplainTip text="点击地图上的区域，会自动切换到该区域的时序分析。灰色区域表示无边界数据。" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <GeoMap
              entries={entries}
              height={460}
              valueFormatter={fmtVal}
              onSelect={onSelectZone}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              流量 Top 10 区域
              <ExplainTip text="按当前时段的平均流量从高到低排列。" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ranking.length > 0 ? (
              <ReactECharts option={rankOption} style={{ height: 420 }} notMerge />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                暂无可排名的区域
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {dataset.geoMatchRate === 0 ? (
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          当前数据集没有可用的地理边界（GeoJSON），无法展示地图。可以回到「概览」页导入带边界的数据，或在导入时附加 GeoJSON 文件。
        </div>
      ) : null}
    </div>
  );
}
