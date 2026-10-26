import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, Sparkles, Loader2, Trophy, RefreshCw } from 'lucide-react';
import { ALGORITHMS, getAlgorithmMeta, type IParamDef } from '@/lib/forecast/registry';
import type { IForecastParams } from '@/lib/forecast/algorithms';
import { runRecommendation, type IRecommendation } from '@/lib/forecast/recommend';
import { ExplainTip } from '@/components/Explain';

export interface AlgorithmConfigProps {
  datasetName: string;
  season: number;
  series: number[];
  inputLen: number;
  horizon: number;
  selectedId: string;
  params: IForecastParams;
  onSelect: (id: string) => void;
  onParamsChange: (params: IForecastParams) => void;
  onApplyRecommendation: (algoId: string, params: IForecastParams) => void;
  onBack: () => void;
  onNext: () => void;
}

const CATEGORY_ORDER = ['统计模型', '机器学习', '深度学习'] as const;

export default function AlgorithmConfig({
  datasetName,
  season,
  series,
  inputLen,
  horizon,
  selectedId,
  params,
  onSelect,
  onParamsChange,
  onApplyRecommendation,
  onBack,
  onNext,
}: AlgorithmConfigProps) {
  const [recommend, setRecommend] = useState<IRecommendation | null>(null);
  const [running, setRunning] = useState(false);
  const meta = getAlgorithmMeta(selectedId);

  const sorted = useMemo(
    () =>
      [...ALGORITHMS].sort((a, b) => CATEGORY_ORDER.indexOf(a.category as (typeof CATEGORY_ORDER)[number]) - CATEGORY_ORDER.indexOf(b.category as (typeof CATEGORY_ORDER)[number])),
    [],
  );

  const run = () => {
    if (series.length < 10) return;
    setRunning(true);
    setTimeout(() => {
      void (async () => {
        try {
          setRecommend(await runRecommendation(series, inputLen, horizon, season));
        } catch {
          setRecommend(null);
        } finally {
          setRunning(false);
        }
      })();
    }, 30);
  };

  const renderParam = (p: IParamDef) => {
    const v = params[p.key] ?? p.default;
    if (p.type === 'boolean') {
      return (
        <Button
          size="sm"
          variant={v ? 'default' : 'outline'}
          onClick={() => onParamsChange({ ...params, [p.key]: !v })}
          className="w-20"
        >
          {v ? '开启' : '关闭'}
        </Button>
      );
    }
    if (p.type === 'select' && p.options) {
      return (
        <select
          value={String(v)}
          onChange={(e) => onParamsChange({ ...params, [p.key]: e.target.value })}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none"
        >
          {p.options.map((o) => (
            <option key={o.value} value={o.value} className="bg-card text-foreground">
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <Input
        type="number"
        className="w-28"
        min={p.min}
        max={p.max}
        step={p.step}
        value={Number(v)}
        onChange={(e) => onParamsChange({ ...params, [p.key]: Number(e.target.value) || 0 })}
      />
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            选择预测算法
            <span className="text-xs font-normal text-muted-foreground">
              {ALGORITHMS.length} 种可选，均可在右侧调整核心参数
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map((a) => {
              const active = a.id === selectedId;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onSelect(a.id)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    active ? 'border-primary/60 bg-primary/5' : 'border-border bg-card/50 hover:border-border'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-foreground">{a.name}</div>
                    <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                      {a.category}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{a.tagline}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 参数区 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              「{meta.name}」参数
              <ExplainTip text="每个参数都有通俗说明。拿不准时，尽量开启“自动寻优”或使用推荐。" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {meta.params.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                该算法无需调参，开箱即用。
              </div>
            ) : (
              meta.params.map((p) => (
                <div key={p.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <LabelWithTip label={p.label} tip={p.desc} />
                    {renderParam(p)}
                  </div>
                </div>
              ))
            )}
            {meta.needsSeason ? (
              <div className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                季节周期自动取 <span className="font-mono text-foreground">{season}</span> 步（一天的数据量），无需手动设置。
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* 推荐区 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-amber-400" />
              让系统推荐
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              基于「{datasetName}」区域序列，在验证集（最后 {horizon} 步）上快速试跑 5 种统计与机器学习算法，按真实误差推荐最合适的模型。
            </p>
            <Button size="sm" variant="outline" onClick={run} disabled={running || series.length < 10}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {recommend ? '重新推荐' : '运行推荐'}
            </Button>
            {recommend ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Trophy className="h-4 w-4 text-amber-400" />
                    <span className="text-muted-foreground">推荐：</span>
                    <span className="font-medium text-foreground">{recommend.best.name}</span>
                    <span className="text-xs text-muted-foreground">
                      (MAPE {recommend.best.mape !== null ? `${recommend.best.mape.toFixed(2)}%` : '—'})
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{recommend.reason}</p>
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={() => onApplyRecommendation(recommend.best.algorithmId, getAlgorithmMeta(recommend.best.algorithmId).defaultParams)}
                  >
                    采用推荐
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                  {recommend.items.slice(0, 6).map((it, i) => (
                    <div key={it.algorithmId} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1.5">
                      <span>
                        <span className="mr-1 font-mono text-foreground/60">{i + 1}</span>
                        {it.name}
                      </span>
                      <span className="font-mono">{it.mape !== null ? `${it.mape.toFixed(1)}%` : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                运行推荐后，这里会显示最佳模型与基线对比。
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          上一步
        </Button>
        <Button onClick={onNext}>
          下一步：开始训练
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function LabelWithTip({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="flex items-center gap-1 text-sm text-foreground">
      {label}
      <ExplainTip text={tip} />
    </span>
  );
}
