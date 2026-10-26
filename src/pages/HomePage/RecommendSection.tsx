import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, ArrowRight, Trophy } from 'lucide-react';
import { useDatasetStore } from '@/data/store-context';
import { runRecommendation, type IRecommendation } from '@/lib/forecast/recommend';
import { ExplainTip } from '@/components/Explain';
import { useNavigate } from 'react-router-dom';

export default function RecommendSection() {
  const { current } = useDatasetStore();
  const navigate = useNavigate();
  const [zone, setZone] = useState<string>('');
  const [inputLen, setInputLen] = useState<number>(1500);
  const [horizon, setHorizon] = useState<number>(144);
  const [result, setResult] = useState<IRecommendation | null>(null);
  const [resultKey, setResultKey] = useState('');
  const [running, setRunning] = useState(false);

  const season = useMemo(() => {
    if (!current || current.freqMinutes <= 0) return 24;
    return Math.round(1440 / current.freqMinutes);
  }, [current]);

  // 有效值派生：数据集切换后自动落到默认，无需 effect 重置
  const maxLen = current ? current.timePoints.length : 0;
  const s = current && current.freqMinutes > 0 ? Math.round(1440 / current.freqMinutes) : 24;
  const activeZone = current && current.zones.length > 0 && current.zones.includes(zone) ? zone : (current?.zones[0] ?? '');
  const effHorizon = horizon >= 4 && horizon <= Math.max(4, Math.floor(maxLen / 3)) ? horizon : s;
  const effInputLen =
    inputLen >= s * 2 && inputLen <= Math.max(s * 2, maxLen - s) ? inputLen : Math.min(Math.max(maxLen - s, s * 2), s * 21);
  const resultValid = result !== null && resultKey === `${current?.id ?? ''}:${activeZone}:${effInputLen}:${effHorizon}`;

  if (!current || current.zones.length === 0) return null;

  const zoneIdx = current.zones.indexOf(activeZone);
  const series = zoneIdx >= 0 ? current.values.map((r) => r[zoneIdx]) : [];

  const run = () => {
    if (series.length < 10) return;
    setRunning(true);
    // 放在异步回调中计算，避免阻塞渲染
    setTimeout(() => {
      void (async () => {
        try {
          const rec = await runRecommendation(series, effInputLen, effHorizon, season);
          setResult(rec);
          setResultKey(`${current.id}:${activeZone}:${effInputLen}:${effHorizon}`);
        } catch (e) {
          setResult(null);
          setResultKey('');
          // 静默失败：推荐只是辅助功能
          console.warn(String(e));
        } finally {
          setRunning(false);
        }
      })();
    }, 30);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-amber-400" />
          根据你的数据推荐预测模型
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>预测哪个区域</Label>
            <Select value={activeZone} onValueChange={setZone}>
              <SelectTrigger>
                <SelectValue placeholder="选择区域" />
              </SelectTrigger>
              <SelectContent>
                {current.zones.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1">
              输入长度（历史步数）
              <ExplainTip text="喂给模型的最近多少条历史数据。越长，模型越能看清长期规律，但近期变化权重被稀释。" />
            </Label>
            <Input
              type="number"
              min={Math.max(20, season * 2)}
              max={Math.max(20, current.timePoints.length - effHorizon)}
              value={effInputLen}
              onChange={(e) => setInputLen(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1">
              预测长度（步数）
              <ExplainTip text="想往未来预测多少步。比如数据每 10 分钟一条，预测 144 步就是未来 24 小时。" />
            </Label>
            <Input
              type="number"
              min={4}
              max={Math.max(4, Math.floor(current.timePoints.length / 3))}
              value={effHorizon}
              onChange={(e) => setHorizon(Number(e.target.value) || 0)}
            />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={run} disabled={running || series.length < 10}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              运行推荐
            </Button>
          </div>
        </div>

        {resultValid ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-amber-400">
                  <Trophy className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    推荐使用 <span className="text-base font-semibold text-foreground">{result.best.name}</span>
                    <span className="ml-2 text-xs">{result.best.category}</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{result.reason}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
                      验证 MAPE：{result.best.mape !== null ? `${result.best.mape.toFixed(2)}%` : '—'}
                    </span>
                    <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
                      RMSE：{Number.isFinite(result.best.rmse) ? result.best.rmse.toFixed(2) : '—'}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => navigate('/forecast')}
                    >
                      去预测页用这个模型
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">排名</TableHead>
                    <TableHead className="whitespace-nowrap">算法</TableHead>
                    <TableHead className="whitespace-nowrap">类别</TableHead>
                    <TableHead className="whitespace-nowrap">MAPE</TableHead>
                    <TableHead className="whitespace-nowrap">RMSE</TableHead>
                    <TableHead className="whitespace-nowrap">MAE</TableHead>
                    <TableHead className="whitespace-nowrap">R²</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((it, i) => (
                    <TableRow key={it.algorithmId} className={i === 0 ? 'bg-primary/5' : ''}>
                      <TableCell className="font-mono">{i + 1}</TableCell>
                      <TableCell className="font-medium text-foreground">
                        {it.name}
                        {i === 0 ? <span className="ml-2 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] text-amber-400">推荐</span> : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{it.category}</TableCell>
                      <TableCell className="font-mono">{it.mape !== null ? `${it.mape.toFixed(2)}%` : '—'}</TableCell>
                      <TableCell className="font-mono">{Number.isFinite(it.rmse) ? it.rmse.toFixed(2) : '—'}</TableCell>
                      <TableCell className="font-mono">{Number.isFinite(it.mae) ? it.mae.toFixed(2) : '—'}</TableCell>
                      <TableCell className="font-mono">{it.r2 !== null ? it.r2.toFixed(3) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="text-[11px] text-muted-foreground">
              说明：排名依据验证集（最后 {result.horizon} 步）的预测误差；MAPE 无法计算时用 RMSE 兜底。更精细的训练与调参请到「预测建模」页。
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            点击「运行推荐」，系统将用 5 种统计与机器学习算法在验证集上快速试跑，按真实误差为你推荐最合适的模型。
          </div>
        )}
      </CardContent>
    </Card>
  );
}
