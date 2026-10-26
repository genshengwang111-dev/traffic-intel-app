import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ITimeSeriesDataset } from '@/data/types';
import { parseTimePoints, basicStats, hourlyProfile, dowProfile, dowHourHeatmap, seasonalDecompose } from '@/lib/eda';
import { CHART_HEX, AXIS_TEXT, GRID_LINE, SPLIT_LINE } from '@/lib/charts';
import { ExplainBlock, ExplainTip } from '@/components/Explain';

export interface TemporalSectionProps {
  dataset: ITimeSeriesDataset;
  zone: string;
}

const DOW_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const HOUR_CN = Array.from({ length: 24 }, (_, i) => `${i}时`);

export default function TemporalSection({ dataset, zone }: TemporalSectionProps) {
  const zoneIdx = dataset.zones.indexOf(zone);
  const series = useMemo(() => (zoneIdx >= 0 ? dataset.values.map((r) => r[zoneIdx]) : []), [dataset, zoneIdx]);
  const dates = useMemo(() => parseTimePoints(dataset.timePoints), [dataset.timePoints]);
  const stats = useMemo(() => basicStats(series), [series]);
  const season = dataset.freqMinutes > 0 ? Math.round(1440 / dataset.freqMinutes) : 24;

  const hourly = useMemo(() => hourlyProfile(dates, series), [dates, series]);
  const dow = useMemo(() => dowProfile(dates, series), [dates, series]);
  const heat = useMemo(() => dowHourHeatmap(dates, series), [dates, series]);
  const decomp = useMemo(() => seasonalDecompose(series, Math.max(2, season)), [series, season]);

  if (series.length === 0) {
    return <div className="text-sm text-muted-foreground">未找到区域「{zone}」的数据。</div>;
  }

  const fullOption: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { data: ['流量'], textStyle: { color: AXIS_TEXT }, top: 0 },
    grid: { left: 56, right: 16, top: 32, bottom: 56 },
    xAxis: {
      type: 'category',
      data: dataset.timePoints.map((t) => t.slice(5, 16)),
      axisLabel: { color: AXIS_TEXT, fontSize: 10 },
      axisLine: { lineStyle: { color: SPLIT_LINE } },
    },
    yAxis: {
      type: 'value',
      name: '流量',
      nameTextStyle: { color: AXIS_TEXT },
      axisLabel: { color: AXIS_TEXT },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', height: 16, bottom: 8, borderColor: SPLIT_LINE },
    ],
    series: [
      {
        name: '流量',
        type: 'line',
        data: series,
        showSymbol: false,
        lineStyle: { width: 1.2, color: CHART_HEX[0] },
        areaStyle: { color: 'rgba(45,212,191,0.08)' },
      },
    ],
  };

  const hourlyOption: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 56, right: 16, top: 16, bottom: 32 },
    xAxis: {
      type: 'category',
      data: HOUR_CN,
      axisLabel: { color: AXIS_TEXT, interval: 1 },
      axisLine: { lineStyle: { color: SPLIT_LINE } },
    },
    yAxis: {
      type: 'value',
      name: '平均流量',
      nameTextStyle: { color: AXIS_TEXT },
      axisLabel: { color: AXIS_TEXT },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    series: [
      {
        type: 'line',
        data: hourly.map((h) => Math.round(h.mean * 100) / 100),
        showSymbol: true,
        symbolSize: 5,
        lineStyle: { color: CHART_HEX[1], width: 2 },
        itemStyle: { color: CHART_HEX[1] },
        areaStyle: { color: 'rgba(245,158,11,0.10)' },
      },
    ],
  };

  const dowOption: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 56, right: 16, top: 16, bottom: 32 },
    xAxis: {
      type: 'category',
      data: DOW_CN,
      axisLabel: { color: AXIS_TEXT },
      axisLine: { lineStyle: { color: SPLIT_LINE } },
    },
    yAxis: {
      type: 'value',
      name: '平均流量',
      nameTextStyle: { color: AXIS_TEXT },
      axisLabel: { color: AXIS_TEXT },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    series: [
      {
        type: 'bar',
        data: dow.map((d) => Math.round(d.mean * 100) / 100),
        barWidth: '55%',
        itemStyle: { color: CHART_HEX[2], borderRadius: [4, 4, 0, 0] },
      },
    ],
  };

  const heatOption: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { position: 'top' },
    grid: { left: 48, right: 12, top: 8, bottom: 40 },
    xAxis: {
      type: 'category',
      data: HOUR_CN,
      axisLabel: { color: AXIS_TEXT, interval: 2 },
      splitArea: { show: true, areaStyle: { color: ['rgba(0,0,0,0)', 'rgba(45,212,191,0.02)'] } },
    },
    yAxis: {
      type: 'category',
      data: DOW_CN,
      axisLabel: { color: AXIS_TEXT },
      splitArea: { show: true },
    },
    visualMap: {
      min: 0,
      max: Math.max(...heat.flat(), 1),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: ['#134E4A', '#2DD4BF', '#FBBF24', '#F59E0B', '#EF4444'] },
      textStyle: { color: AXIS_TEXT },
    },
    series: [
      {
        type: 'heatmap',
        data: heat.flatMap((row, d) => row.map((v, h) => [h, d, Math.round(v * 100) / 100])),
        label: { show: false },
        itemStyle: { borderWidth: 1, borderColor: '#0A111F' },
      },
    ],
  };

  const decompOption: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { data: ['趋势', '季节分量', '残差'], textStyle: { color: AXIS_TEXT }, top: 0 },
    grid: { left: 56, right: 16, top: 32, bottom: 32 },
    xAxis: {
      type: 'category',
      data: dataset.timePoints.map((t) => t.slice(5, 13)),
      axisLabel: { color: AXIS_TEXT, fontSize: 10 },
      axisLine: { lineStyle: { color: SPLIT_LINE } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: AXIS_TEXT },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    series: [
      { name: '趋势', type: 'line', data: decomp.trend.map((v) => Math.round(v * 100) / 100), showSymbol: false, lineStyle: { color: CHART_HEX[0] } },
      { name: '季节分量', type: 'line', data: decomp.seasonal.map((v) => Math.round(v * 100) / 100), showSymbol: false, lineStyle: { color: CHART_HEX[1] } },
      { name: '残差', type: 'line', data: decomp.residual.map((v) => Math.round(v * 100) / 100), showSymbol: false, lineStyle: { color: CHART_HEX[3], type: 'dashed' } },
    ],
  };

  return (
    <div className="space-y-4">
      <ExplainBlock title="时间维度在讲什么？">
        「{zone}」的流量随时间起伏：白天高、深夜低（日周期），工作日与周末不同（周周期），还有整体的上升或下降（趋势）。
        下面几张图分别把这些规律拆出来看。
      </ExplainBlock>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {[
          { label: '平均流量', value: stats.mean.toFixed(0) },
          { label: '峰值流量', value: stats.max.toFixed(0) },
          { label: '谷值流量', value: stats.min.toFixed(0) },
          { label: '标准差', value: stats.std.toFixed(1), tip: '波动幅度：越大说明流量越不稳定' },
          { label: 'P95 分位', value: stats.p95.toFixed(0), tip: '95% 的时间流量不超过该值' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card/60 p-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {s.label}
              {s.tip ? <ExplainTip text={s.tip} /> : null}
            </div>
            <div className="mt-1 font-mono text-lg font-semibold text-foreground">{s.value}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            完整时间序列
            <ExplainTip text="把全部历史流量画成一条线。可以用下方滑块缩放查看任意时间段。" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReactECharts option={fullOption} style={{ height: 320 }} notMerge />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              一天 24 小时的平均形态
              <ExplainTip text="把所有天同一小时的值取平均。能清楚看到早晚高峰和深夜低谷。" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReactECharts option={hourlyOption} style={{ height: 260 }} notMerge />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              一周七天的平均流量
              <ExplainTip text="对比工作日和周末的流量差异，识别“上班型”还是“休闲型”区域。" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReactECharts option={dowOption} style={{ height: 260 }} notMerge />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            星期 × 小时 热力图
            <ExplainTip text="颜色越亮流量越高。横轴是小时，纵轴是星期几，一眼看出什么时段最忙。" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReactECharts option={heatOption} style={{ height: 300 }} notMerge />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            趋势分解：趋势 / 季节 / 残差
            <ExplainTip text="把序列拆成三部分：长期趋势、以天为周期的季节波动、以及说不清的随机残差。" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReactECharts option={decompOption} style={{ height: 300 }} notMerge />
        </CardContent>
      </Card>
    </div>
  );
}
