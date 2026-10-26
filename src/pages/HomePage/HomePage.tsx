import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, LineChart, Boxes, BrainCircuit, Upload, ArrowRight, Loader2 } from 'lucide-react';
import { useDatasetStore } from '@/data/store-context';
import DatasetSection from './DatasetSection';
import ImportDialog from './ImportDialog';
import RecommendSection from './RecommendSection';
import StatCard from '@/components/StatCard';
import { ExplainTip, ExplainBlock } from '@/components/Explain';
import { format } from 'date-fns';

const QUICK_LINKS = [
  { to: '/explore', icon: LineChart, title: '探索分析', desc: '看时间规律、看空间分布，读懂数据长什么样。' },
  { to: '/cluster', icon: Boxes, title: '功能区聚类', desc: '自动把行为相似的区域归为一类，发现城市功能区。' },
  { to: '/forecast', icon: BrainCircuit, title: '预测建模', desc: '用 10 种现代算法预测未来流量，实时监控训练过程。' },
];

export default function HomePage() {
  const { current, loading, error } = useDatasetStore();
  const [importOpen, setImportOpen] = useState(false);

  const missingRate = current
    ? (() => {
        let nan = 0;
        let total = 0;
        for (const row of current.values) {
          for (const v of row) {
            total++;
            if (Number.isNaN(v)) nan++;
          }
        }
        return total > 0 ? (nan / total) * 100 : 0;
      })()
    : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-[radial-gradient(ellipse_at_top_right,rgba(45,212,191,0.14),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(245,158,11,0.10),transparent_50%)] p-8">
        {/* 城市网格背景 */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(45,212,191,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.12) 1px, transparent 1px)',
            backgroundSize: '42px 42px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary">
            <Activity className="h-4 w-4" />
            城市流量智能分析工作台
          </div>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold leading-tight text-foreground">
            看懂城市脉搏，
            <span className="text-primary">预测未来流量</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            从探索分析、功能区聚类到 10 种预测算法的实时训练与评估，一站式完成交通 / 网络流量数据的智能分析。
            每一步都有大白话解释，零基础也能上手。
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              导入我的数据
            </Button>
            <Button variant="outline" asChild>
              <Link to="/explore">
                开始探索分析
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
      ) : null}

      {/* 数据集 */}
      <DatasetSection onImportClick={() => setImportOpen(true)} />

      {/* 数据统计 */}
      {current && !loading ? (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            当前数据集总览
            <ExplainTip text="这里的指标帮助你快速了解数据规模与质量，为后续分析做参考。" />
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="区域数量" value={current.zones.length.toLocaleString()} sub="参与分析的区域/街区" tone="accent" />
            <StatCard label="时间点数量" value={current.timePoints.length.toLocaleString()} sub={`每 ${current.freqMinutes || '—'} 分钟一条`} />
            <StatCard
              label="时间范围"
              value={
                current.timePoints.length > 0
                  ? `${format(new Date(current.timePoints[0].replace(' ', 'T')), 'MM-dd')} ~ ${format(
                      new Date(current.timePoints[current.timePoints.length - 1].replace(' ', 'T')),
                      'MM-dd',
                    )}`
                  : '—'
              }
              sub={`${current.timePoints.length > 0 ? format(new Date(current.timePoints[0].replace(' ', 'T')), 'yyyy') : ''} 年`}
            />
            <StatCard label="数据缺失率" value={`${missingRate.toFixed(2)}%`} tone={missingRate > 5 ? 'warn' : 'default'} sub="缺失值占比" />
            <StatCard
              label="地图匹配率"
              value={current.geo ? `${Math.round(current.geoMatchRate * 100)}%` : '无地图'}
              sub="可用于空间展示"
            />
            <StatCard
              label="每日周期步数"
              value={`${current.freqMinutes > 0 ? Math.round(1440 / current.freqMinutes) : '—'}`}
              sub="一天 = 这么多条记录"
            />
          </div>
          {current.geoMatchRate < 0.9 ? (
            <ExplainBlock title="地图覆盖不完整？">
              当前数据集的地图匹配率为 {Math.round(current.geoMatchRate * 100)}%。
              没有匹配到边界的区域将无法在地图上着色，但不影响时间曲线分析与预测。可在导入时提供字段一致的 GeoJSON 提高匹配率。
            </ExplainBlock>
          ) : null}
        </section>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-border p-6 text-sm text-muted-foreground">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
          {loading ? '正在加载内置数据集（首次加载约需数秒）…' : '请选择一个数据集开始分析。'}
        </div>
      )}

      {/* 推荐模型 */}
      {current && !loading ? <RecommendSection /> : null}

      {/* 快速入口 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">分析工作流</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {QUICK_LINKS.map((q) => {
            const Icon = q.icon;
            return (
              <Link key={q.to} to={q.to}>
                <Card className="group h-full transition-colors hover:border-primary/50">
                  <CardContent className="flex h-full flex-col p-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="mt-3 font-medium text-foreground">{q.title}</div>
                    <div className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{q.desc}</div>
                    <div className="mt-3 flex items-center gap-1 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      前往
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
