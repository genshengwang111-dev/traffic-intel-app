import { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Loader2, Wand2, Boxes } from 'lucide-react';
import { useDatasetStore } from '@/data/store-context';
import {
  buildDailyProfiles,
  kmeans,
  elbowSse,
  silhouetteScore,
  interpretCluster,
  clusterPalette,
} from '@/lib/cluster';
import { parseTimePoints } from '@/lib/eda';
import { findGeoByName } from '@/lib/csv';
import GeoMap, { type IGeoMapEntry } from '@/components/GeoMap';
import { CHART_HEX, AXIS_TEXT, GRID_LINE, SPLIT_LINE } from '@/lib/charts';
import { ExplainBlock, ExplainTip } from '@/components/Explain';

const HOUR_CN = Array.from({ length: 24 }, (_, i) => `${i}时`);

export default function ClusterPage() {
  const { current, loading } = useDatasetStore();
  const [k, setK] = useState(4);
  const [computed, setComputed] = useState(false);
  const [running, setRunning] = useState(false);

  const dates = useMemo(() => (current ? parseTimePoints(current.timePoints) : []), [current]);

  const profiles = useMemo(() => (current && dates.length > 0 ? buildDailyProfiles(dates, current.values) : []), [current, dates]);

  const elbow = useMemo(() => (profiles.length > 0 ? elbowSse(profiles, Math.min(10, profiles.length - 1)) : []), [profiles]);

  // 自动推荐 K：找 SSE 相对下降明显放缓的点（二阶变化最大处）
  const autoK = useMemo(() => {
    if (elbow.length < 4) return null;
    let bestK = 2;
    let bestScore = -Infinity;
    for (let i = 2; i < elbow.length - 1; i++) {
      const d1 = elbow[i - 1].sse - elbow[i].sse;
      const d2 = elbow[i].sse - elbow[i + 1].sse;
      const score = d1 - d2;
      if (score > bestScore) {
        bestScore = score;
        bestK = elbow[i].k;
      }
    }
    return bestK;
  }, [elbow]);

  const runCluster = () => {
    if (profiles.length === 0) return;
    setRunning(true);
    setTimeout(() => {
      setComputed(true);
      setRunning(false);
    }, 30);
  };

  const result = useMemo(() => {
    if (!computed || profiles.length === 0 || k < 1) return null;
    return kmeans(profiles, k);
  }, [computed, profiles, k]);

  const silhouette = useMemo(() => {
    if (!result) return null;
    return silhouetteScore(profiles, result.labels);
  }, [result, profiles]);

  // 聚类结果视图
  const clusterViews = useMemo(() => {
    if (!result || !current) return [];
    const counts = new Array<number>(k).fill(0);
    for (const l of result.labels) counts[l]++;
    return Array.from({ length: k }, (_, c) => {
      const members = current.zones.filter((_, i) => result.labels[i] === c);
      const centroid = result.centroids[c];
      const interp = interpretCluster(centroid);
      return { c, count: counts[c], members, centroid, interp, color: clusterPalette[c % clusterPalette.length] };
    });
  }, [result, current, k]);

  const mapEntries: IGeoMapEntry[] = useMemo(() => {
    if (!result || !current) return [];
    return current.zones.map((z, zi) => {
      const geo = current.geo ? findGeoByName(current.geo, z) : null;
      return { name: z, label: z, rings: geo ? geo.rings : [], value: result.labels[zi] };
    });
  }, [result, current]);

  const elbowOption: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 48, top: 24, bottom: 32 },
    xAxis: {
      type: 'category',
      data: elbow.map((e) => `k=${e.k}`),
      axisLabel: { color: AXIS_TEXT },
      axisLine: { lineStyle: { color: SPLIT_LINE } },
    },
    yAxis: {
      type: 'value',
      name: 'SSE（簇内距离和）',
      nameTextStyle: { color: AXIS_TEXT },
      axisLabel: { color: AXIS_TEXT },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    series: [
      {
        type: 'line',
        data: elbow.map((e) => Math.round(e.sse)),
        showSymbol: true,
        symbolSize: 6,
        lineStyle: { color: CHART_HEX[0], width: 2 },
        itemStyle: { color: CHART_HEX[0] },
        markPoint: {
          data: autoK
            ? [{ coord: [autoK - 1, elbow[autoK - 1]?.sse ?? 0], name: '推荐拐点', symbolSize: 46, itemStyle: { color: CHART_HEX[1] } }]
            : [],
          label: { show: false },
        },
      },
    ],
  };

  const clusterCurveOption: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: {
      data: clusterViews.map((v) => `簇 ${v.c + 1}`),
      textStyle: { color: AXIS_TEXT },
      top: 0,
    },
    grid: { left: 48, right: 16, top: 32, bottom: 32 },
    xAxis: {
      type: 'category',
      data: HOUR_CN,
      axisLabel: { color: AXIS_TEXT, interval: 1 },
      axisLine: { lineStyle: { color: SPLIT_LINE } },
    },
    yAxis: {
      type: 'value',
      name: '归一化流量',
      nameTextStyle: { color: AXIS_TEXT },
      axisLabel: { color: AXIS_TEXT },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    series: clusterViews.map((v) => ({
      name: `簇 ${v.c + 1}`,
      type: 'line',
      data: v.centroid.map((x) => Math.round(x * 1000) / 1000),
      showSymbol: false,
      lineStyle: { color: v.color, width: 2.5 },
    })),
  };

  if (!current || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {loading ? '正在加载数据…' : '请先在「概览」页选择一个数据集。'}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <Boxes className="h-6 w-6 text-primary" />
          功能区聚类
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          把“一天 24 小时流量形态相似”的区域自动归为一类，探索城市的功能分区——哪些是商业区、居住区、混合区。
        </p>
      </div>

      <ExplainBlock title="聚类在做什么？">
        每个区域先被压缩成一条“一天 24 小时的平均曲线”（归一化后），然后交给 KMeans 算法：
        形态相似的曲线归为一类。结果不预设标签，完全由数据自己说话。
      </ExplainBlock>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              聚类数量 K 的选择（肘部法则）
              <ExplainTip text="横轴是分成几类，纵轴是簇内总距离（越小越紧凑）。曲线拐弯的地方通常是合适的 K。" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReactECharts option={elbowOption} style={{ height: 260 }} notMerge />
            <div className="mt-4 flex items-center gap-4">
              <Label className="shrink-0">聚类数量 K = {k}</Label>
              <Slider
                min={2}
                max={Math.max(3, Math.min(10, profiles.length - 1))}
                step={1}
                value={[k]}
                onValueChange={(v) => setK(v[0])}
                className="flex-1"
              />
              {autoK ? (
                <Button size="sm" variant="outline" onClick={() => setK(autoK)}>
                  <Wand2 className="h-3.5 w-3.5" />
                  用推荐值 {autoK}
                </Button>
              ) : null}
            </div>
            {silhouette !== null ? (
              <div className="mt-3 text-xs text-muted-foreground">
                当前 K={k} 的平均轮廓系数：<span className="font-mono text-primary">{silhouette.toFixed(3)}</span>
                <ExplainTip text="轮廓系数衡量“簇之间分离得多开”：大于 0.5 分离良好，0.25~0.5 结构明显，小于 0.25 结构较弱。" />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              每类区域的平均日曲线
              <ExplainTip text="每条线是一类区域的“典型一天”：横轴是小时，纵轴是归一化流量（0~1）。看形态就能理解这类区域的作息。" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clusterViews.length > 0 ? (
              <ReactECharts option={clusterCurveOption} style={{ height: 260 }} notMerge />
            ) : (
              <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">运行聚类后显示</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={runCluster} disabled={running || profiles.length === 0}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Boxes className="h-4 w-4" />}
          {computed ? '重新聚类' : '开始聚类'}
        </Button>
        <span className="text-xs text-muted-foreground">
          基于 {current.zones.length} 个区域的日内曲线 · K = {k}
        </span>
      </div>

      {computed && result ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  聚类结果地图
                  <ExplainTip text="同一种颜色的区域属于同一类（功能区）。颜色只是类别标记，不代表流量高低。" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <GeoMap
                  entries={mapEntries}
                  height={460}
                  showLegend={false}
                  colorFor={(e) => {
                    if (e.value === null) return 'rgba(148,163,184,0.15)';
                    return clusterPalette[e.value % clusterPalette.length] + 'CC';
                  }}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {clusterViews.map((v) => (
                    <span key={v.c} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-3 w-3 rounded-sm" style={{ background: v.color }} />
                      簇 {v.c + 1}（{v.count} 个区域）
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {clusterViews.map((v) => (
                <Card key={v.c}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-sm" style={{ background: v.color }} />
                      <span className="font-medium text-foreground">簇 {v.c + 1}</span>
                      <Badge variant="outline">{v.count} 个区域</Badge>
                    </div>
                    <div className="mt-2 text-sm font-medium text-foreground">
                      {v.interp.emoji} {v.interp.type}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{v.interp.desc}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {v.members.slice(0, 8).map((m) => (
                        <span key={m} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {m}
                        </span>
                      ))}
                      {v.members.length > 8 ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          +{v.members.length - 8} 个
                        </span>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          设置好聚类数量 K 后，点击「开始聚类」查看功能区划分结果。
        </div>
      )}
    </div>
  );
}
