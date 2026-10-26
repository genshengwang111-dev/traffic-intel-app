import { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, RotateCcw, RefreshCw, ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import type { ITrainingResult } from '@/lib/forecast/runner';
import { metricMetaList } from '@/lib/metrics';
import { CHART_HEX, AXIS_TEXT, GRID_LINE, SPLIT_LINE } from '@/lib/charts';
import { ExplainBlock, ExplainTip } from '@/components/Explain';

export interface ResultPanelProps {
  result: ITrainingResult;
  windowTime: string[];
  datasetName: string;
  runs: ITrainingResult[];
  onTrainAgain: () => void;
  onBackToConfig: () => void;
  onClearRuns: () => void;
}

function interpret(m: ITrainingResult['metrics']): { verdict: string; tone: 'good' | 'warn' | 'bad'; points: string[] } {
  const points: string[] = [];
  let tone: 'good' | 'warn' | 'bad' = 'good';
  let verdict = '预测效果整体良好。';

  if (Number.isFinite(m.mape)) {
    if (m.mape < 10) {
      verdict = '预测精度优秀（MAPE < 10%）。';
    } else if (m.mape < 20) {
      verdict = '预测精度良好（MAPE 在 10%~20% 之间）。';
      tone = 'warn';
    } else if (m.mape < 30) {
      verdict = '预测精度一般（MAPE 在 20%~30% 之间）。';
      tone = 'warn';
    } else {
      verdict = '预测偏差较大（MAPE > 30%），建议调整参数或换用推荐模型。';
      tone = 'bad';
    }
  } else if (Number.isFinite(m.r2)) {
    if (m.r2 > 0.85) verdict = '预测与真实值高度相关（R² > 0.85）。';
    else if (m.r2 > 0.6) {
      verdict = '预测与真实值相关性较好（R² 在 0.6~0.85 之间）。';
      tone = 'warn';
    } else {
      verdict = '预测相关性偏弱（R² < 0.6）。';
      tone = 'bad';
    }
  }

  if (Number.isFinite(m.mase)) {
    points.push(m.mase < 1 ? 'MASE < 1：比“照搬上一个值”的朴素方法更准。' : 'MASE ≥ 1：目前不如朴素方法，建议换算法。');
  }
  if (Number.isFinite(m.bias)) {
    const b = m.bias;
    points.push(b > 0 ? `平均偏高估 ${b.toFixed(2)}（预测值整体偏大）。` : b < 0 ? `平均偏低估 ${Math.abs(b).toFixed(2)}（预测值整体偏小）。` : '平均偏差接近零，无明显系统性高估或低估。');
  }
  if (points.length === 0) points.push('数据波动较大，指标解读请结合下方数值综合判断。');
  return { verdict, tone, points };
}

export default function ResultPanel({ result, windowTime, datasetName, runs, onTrainAgain, onBackToConfig, onClearRuns }: ResultPanelProps) {
  const [showLog, setShowLog] = useState(false);
  const m = result.metrics;
  const interp = interpret(m);
  const h = result.horizon;
  const n = result.series.length;

  const futureLabels = Array.from({ length: h }, (_, i) => (i === 0 ? 'T+1' : `T+${i + 1}`));
  const xAll = [...windowTime.map((t) => t.slice(5, 16)), ...futureLabels];

  const trainPart = result.series.slice(0, result.trainLen);
  const testPart = result.series.slice(result.trainLen);

  const compareOption: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['历史实际', '验证段实际', '验证段预测', '未来预测'],
      textStyle: { color: AXIS_TEXT },
      top: 0,
    },
    grid: { left: 64, right: 16, top: 40, bottom: 56 },
    xAxis: {
      type: 'category',
      data: xAll,
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
      { type: 'inside', start: 60, end: 100 },
      { type: 'slider', height: 16, bottom: 8, borderColor: SPLIT_LINE },
    ],
    series: [
      {
        name: '历史实际',
        type: 'line',
        data: [...trainPart, ...testPart, ...Array<number | null>(h).fill(null)],
        showSymbol: false,
        lineStyle: { width: 1.2, color: '#64748B' },
        markArea: {
          silent: true,
          itemStyle: { color: 'rgba(148,163,184,0.05)' },
          data: [
            [
              { name: '训练段', xAxis: 0 },
              { xAxis: n - h - 1 },
            ],
            [
              { name: '验证段', xAxis: n - h },
              { xAxis: n - 1 },
            ],
          ],
        },
      },
      {
        name: '验证段实际',
        type: 'line',
        data: [...Array<number | null>(n - h).fill(null), ...testPart, ...Array<number | null>(h).fill(null)],
        showSymbol: false,
        lineStyle: { width: 2, color: CHART_HEX[0] },
      },
      {
        name: '验证段预测',
        type: 'line',
        data: [...Array<number | null>(n - h).fill(null), ...result.predTest, ...Array<number | null>(h).fill(null)],
        showSymbol: true,
        symbolSize: 4,
        lineStyle: { width: 2, type: 'dashed', color: CHART_HEX[1] },
        itemStyle: { color: CHART_HEX[1] },
      },
      {
        name: '未来预测',
        type: 'line',
        data: [...Array<number | null>(n).fill(null), ...result.forecast],
        showSymbol: true,
        symbolSize: 5,
        lineStyle: { width: 2.5, color: CHART_HEX[2] },
        itemStyle: { color: CHART_HEX[2] },
      },
    ],
  };

  // 实际 vs 预测散点（验证段）
  const scatterData = result.actualTest.map((a, i) => [a, result.predTest[i] ?? null]).filter(([, y]) => y !== null && Number.isFinite(y)) as [number, number][];
  const allVals = scatterData.flat();
  const lo = Math.min(...allVals);
  const hi = Math.max(...allVals);
  const scatterOption: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const v = p.value as [number, number];
        return `实际 ${v[0].toFixed(2)}<br/>预测 ${v[1].toFixed(2)}`;
      },
    },
    grid: { left: 64, right: 16, top: 16, bottom: 40 },
    xAxis: {
      type: 'value',
      name: '实际值',
      nameTextStyle: { color: AXIS_TEXT },
      axisLabel: { color: AXIS_TEXT },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    yAxis: {
      type: 'value',
      name: '预测值',
      nameTextStyle: { color: AXIS_TEXT },
      axisLabel: { color: AXIS_TEXT },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    series: [
      { type: 'scatter', data: scatterData, symbolSize: 7, itemStyle: { color: 'rgba(45,212,191,0.75)' } },
      {
        type: 'line',
        data: [
          [lo, lo],
          [hi, hi],
        ],
        showSymbol: false,
        lineStyle: { type: 'dashed', color: CHART_HEX[1] },
      },
    ],
  };

  const resData = result.actualTest.map((a, i) => a - (result.predTest[i] ?? 0));
  const residualOption: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 64, right: 16, top: 16, bottom: 40 },
    xAxis: {
      type: 'category',
      data: windowTime.slice(-h),
      axisLabel: { color: AXIS_TEXT, fontSize: 10 },
      axisLine: { lineStyle: { color: SPLIT_LINE } },
    },
    yAxis: {
      type: 'value',
      name: '误差',
      nameTextStyle: { color: AXIS_TEXT },
      axisLabel: { color: AXIS_TEXT },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    series: [
      {
        type: 'bar',
        data: resData.map((v) => Math.round(v * 100) / 100),
        itemStyle: { color: CHART_HEX[4], borderRadius: [3, 3, 0, 0] },
      },
      {
        type: 'line',
        data: resData.map(() => 0),
        showSymbol: false,
        lineStyle: { color: SPLIT_LINE, type: 'dashed' },
      },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-foreground">
            「{result.zone}」· {result.algorithmName} · 预测结果
          </div>
          <div className="text-xs text-muted-foreground">
            数据集 {datasetName} · 输入 {result.inputLen} 步 · 验证 {result.horizon} 步 · 耗时 {(result.elapsedMs / 1000).toFixed(1)}s
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBackToConfig}>
            <ArrowLeft className="h-4 w-4" />
            换算法
          </Button>
          <Button onClick={onTrainAgain}>
            <RefreshCw className="h-4 w-4" />
            重新训练
          </Button>
        </div>
      </div>

      <ExplainBlock title="怎么看这份预测报告？">
        核心是「验证段」：我们先把最后 {result.horizon} 步真实数据藏起来，让模型只凭前面的历史预测它们，再拿真实值对比——
        这样打出的分数才是模型“真本事”，而不是背答案。最后再用全部历史预测未来。
      </ExplainBlock>

      {/* 指标卡 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        {metricMetaList.map((mm) => {
          const v = m[mm.key as keyof typeof m];
          const txt = Number.isFinite(v)
            ? mm.fmt === 'pct'
              ? `${(v as number).toFixed(2)}%`
              : (v as number).toFixed(3)
            : '—';
          return (
            <div key={mm.key} className="rounded-lg border border-border bg-card/60 p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {mm.short}
                <ExplainTip text={mm.desc} />
              </div>
              <div className="mt-1 font-mono text-base font-semibold text-foreground">{txt}</div>
              <div className="text-[10px] text-muted-foreground/70">
                {mm.better === 'low' ? '越小越好' : '越大越好'}
              </div>
            </div>
          );
        })}
      </div>

      {result.extra?.['已叠加'] ? (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
          ℹ 该算法的多步预测原本是"平滑水平"（教科书上就是一条直线），系统已自动叠加训练数据最后一周期的日周期形状，
          使预测呈现真实的周期性形态（预测的总体水平不变，更贴合交通 / 流量的昼夜规律）。
        </div>
      ) : null}

      {/* 解读 */}
      <div
        className={`rounded-xl border p-4 ${
          interp.tone === 'good'
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : interp.tone === 'warn'
              ? 'border-amber-400/30 bg-amber-400/5'
              : 'border-red-500/30 bg-red-500/5'
        }`}
      >
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Trophy className={`h-4 w-4 ${interp.tone === 'good' ? 'text-emerald-400' : interp.tone === 'warn' ? 'text-amber-400' : 'text-red-400'}`} />
          {interp.verdict}
        </div>
        {interp.points.map((p) => (
          <div key={p} className="mt-1 text-xs leading-relaxed text-muted-foreground">· {p}</div>
        ))}
      </div>

      {/* 对比图 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            真实值 vs 预测值（含未来预测）
            <ExplainTip text="灰色是历史实际，青色是验证段真实值，琥珀虚线是模型预测，蓝色是未来外推。可用滑块缩放。" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReactECharts option={compareOption} style={{ height: 380 }} notMerge />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              实际 vs 预测散点
              <ExplainTip text="点越贴近 45° 对角线，预测越准。点在对角线上方 = 高估，下方 = 低估。" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReactECharts option={scatterOption} style={{ height: 280 }} notMerge />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              预测残差
              <ExplainTip text="每个验证时刻的“实际 - 预测”误差。围绕零线上下波动属正常；若长期偏正或偏负，说明模型有系统性偏差。" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReactECharts option={residualOption} style={{ height: 280 }} notMerge />
          </CardContent>
        </Card>
      </div>

      {/* 历史运行对比 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            模型运行对比
            <span className="text-xs font-normal text-muted-foreground">同一浏览器内最多保留最近 20 次训练，方便横向比较</span>
            {runs.length > 1 ? (
              <Button size="sm" variant="ghost" className="ml-auto text-xs text-muted-foreground" onClick={onClearRuns}>
                清空历史
              </Button>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {runs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">时间</TableHead>
                  <TableHead className="whitespace-nowrap">数据集</TableHead>
                  <TableHead className="whitespace-nowrap">区域</TableHead>
                  <TableHead className="whitespace-nowrap">算法</TableHead>
                  <TableHead className="whitespace-nowrap">输入/预测</TableHead>
                  <TableHead className="whitespace-nowrap">MAPE</TableHead>
                  <TableHead className="whitespace-nowrap">RMSE</TableHead>
                  <TableHead className="whitespace-nowrap">R²</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.ts} className={r.ts === result.ts ? 'bg-primary/5' : ''}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {new Date(r.ts).toLocaleString('zh-CN', { hour12: false })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{datasetName}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.zone}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium text-foreground">{r.algorithmName}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {r.inputLen}/{r.horizon}
                    </TableCell>
                    <TableCell className="font-mono">{Number.isFinite(r.metrics.mape) ? `${r.metrics.mape.toFixed(2)}%` : '—'}</TableCell>
                    <TableCell className="font-mono">{Number.isFinite(r.metrics.rmse) ? r.metrics.rmse.toFixed(2) : '—'}</TableCell>
                    <TableCell className="font-mono">{Number.isFinite(r.metrics.r2) ? r.metrics.r2.toFixed(3) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">暂无历史记录</div>
          )}
        </CardContent>
      </Card>

      {/* 训练日志 */}
      <Card>
        <CardHeader className="pb-2">
          <button type="button" onClick={() => setShowLog(!showLog)} className="flex w-full items-center gap-2 text-left">
            <CardTitle className="flex flex-1 items-center gap-2 text-base">
              完整训练日志
              <span className="text-xs font-normal text-muted-foreground">（{result.trainLog.length} 条）</span>
            </CardTitle>
            {showLog ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
        </CardHeader>
        {showLog ? (
          <CardContent>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-[#060B15] p-3 font-mono text-xs leading-relaxed">
              {result.trainLog.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground/50">
                    {new Date(l.ts).toLocaleTimeString('zh-CN', { hour12: false })}
                  </span>
                  <span className={l.level === 'ok' ? 'text-emerald-400' : l.level === 'warn' ? 'text-amber-400' : 'text-slate-300'}>
                    {l.level === 'ok' ? '✓' : l.level === 'warn' ? '⚠' : '·'} {l.msg}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        ) : null}
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <RotateCcw className="h-3.5 w-3.5" />
        想对比更多算法？返回「算法配置」页再试几次，结果都会保存在上方对比表中。
      </div>
    </div>
  );
}
