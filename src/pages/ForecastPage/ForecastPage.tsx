import { useCallback, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Loader2, ArrowRight } from 'lucide-react';
import { useDatasetStore } from '@/data/store-context';
import { runTraining, type ITrainingResult, type ITrainingState } from '@/lib/forecast/runner';
import { getAlgorithmMeta } from '@/lib/forecast/registry';
import type { IForecastParams } from '@/lib/forecast/algorithms';
import { ExplainTip } from '@/components/Explain';
import AlgorithmConfig from './AlgorithmConfig';
import TrainingMonitor from './TrainingMonitor';
import ResultPanel from './ResultPanel';

const NS = 'traffic-intel-app';

const STEPS = ['数据构建', '算法配置', '训练监控', '结果评估'];

function loadRuns(): ITrainingResult[] {
  try {
    const raw = localStorage.getItem(`${NS}:runs`);
    return raw ? (JSON.parse(raw) as ITrainingResult[]) : [];
  } catch {
    return [];
  }
}

export default function ForecastPage() {
  const { current, loading } = useDatasetStore();
  const [step, setStep] = useState(0);
  const [zone, setZone] = useState('');
  const [inputLen, setInputLen] = useState(800);
  const [horizon, setHorizon] = useState(96);
  const [algorithmId, setAlgorithmId] = useState('arima');
  const [params, setParams] = useState<IForecastParams>({});
  const [training, setTraining] = useState<ITrainingState | null>(null);
  const [result, setResult] = useState<ITrainingResult | null>(null);
  const [runs, setRuns] = useState<ITrainingResult[]>(loadRuns);
  const abortRef = useRef<AbortController | null>(null);

  const season = useMemo(() => {
    if (!current || current.freqMinutes <= 0) return 24;
    return Math.round(1440 / current.freqMinutes);
  }, [current]);

  // 有效值派生：数据集/区域切换后自动落到默认，无需 effect 重置
  const maxLen = current ? current.timePoints.length : 0;
  const s = current && current.freqMinutes > 0 ? Math.round(1440 / current.freqMinutes) : 24;
  const effZone = current && current.zones.length > 0 && current.zones.includes(zone) ? zone : (current?.zones[0] ?? '');
  const effHorizon = horizon >= 4 && horizon <= Math.max(4, Math.floor(maxLen / 3)) ? horizon : s;
  const effInputLen = inputLen >= s * 3 && inputLen <= Math.max(s * 3, maxLen - s) ? inputLen : Math.min(Math.max(maxLen - s, s * 3), s * 14);
  const resultValid =
    result !== null &&
    result.zone === effZone &&
    result.inputLen === effInputLen &&
    result.horizon === effHorizon &&
    result.algorithmId === algorithmId;

  // 切换算法时重置参数
  const handleSelectAlgorithm = useCallback((id: string) => {
    setAlgorithmId(id);
    setParams({ ...getAlgorithmMeta(id).defaultParams });
    setResult(null);
  }, []);

  const handleParamsChange = useCallback((next: IForecastParams) => {
    setParams(next);
    setResult(null);
  }, []);

  const series = useMemo(() => {
    if (!current) return [];
    const zi = current.zones.indexOf(effZone);
    if (zi < 0) return [];
    const win = current.values.map((r) => r[zi]).slice(-Math.min(effInputLen, current.timePoints.length));
    return win;
  }, [current, effZone, effInputLen]);

  const windowTime = useMemo(() => {
    if (!current) return [];
    return current.timePoints.slice(-Math.min(effInputLen, current.timePoints.length));
  }, [current, effInputLen]);

  const canTrain = series.length >= 20 && effHorizon >= 1 && effHorizon < series.length;

  const startTraining = async () => {
    if (!canTrain || training?.status === 'running') return;
    const abort = new AbortController();
    abortRef.current = abort;
    const initState: ITrainingState = { phase: '准备', progress: 0, logs: [], status: 'running' };
    setTraining(initState);
    setResult(null);
    try {
      const res = await runTraining(
        { series, zone: effZone, inputLen: effInputLen, horizon: effHorizon, algorithmId, params, season, signal: abort.signal },
        setTraining,
      );
      setResult(res);
      setRuns((prev) => {
        const next = [res, ...prev].slice(0, 20);
        try {
          localStorage.setItem(`${NS}:runs`, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      setStep(3);
    } catch {
      if (abort.signal.aborted) {
        setTraining((s) => (s ? { ...s, status: 'done' as const, logs: [...s.logs, { ts: Date.now(), level: 'warn' as const, msg: '训练已取消。' }] } : s));
      } else {
        setTraining((s) => (s ? { ...s, status: 'error' as const } : s));
      }
    }
  };

  const cancelTraining = () => {
    abortRef.current?.abort();
  };

  const applyRecommendation = (algoId: string, algoParams: IForecastParams) => {
    setAlgorithmId(algoId);
    setParams({ ...algoParams });
    setResult(null);
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
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">预测建模</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          人工设定输入 / 输出长度，从 10 种现代算法中选一个（参数可调），实时观看训练过程，最后用真实数据验证预测质量。
        </p>
      </div>

      {/* 步骤条 */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (i < step ? setStep(i) : undefined)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-colors ${
                i === step
                  ? 'bg-primary/15 font-medium text-primary'
                  : i < step
                    ? 'cursor-pointer text-primary/70 hover:bg-primary/10'
                    : 'text-muted-foreground'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                  i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-primary/30 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {i + 1}
              </span>
              {s}
            </button>
            {i < STEPS.length - 1 ? <div className="h-px w-6 bg-border" /> : null}
          </div>
        ))}
      </div>

      {step === 0 ? (
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>预测区域</Label>
                <Select value={effZone} onValueChange={setZone}>
                  <SelectTrigger>
                    <SelectValue />
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
                  输入长度（喂给模型的历史步数）
                  <ExplainTip text="取最近多少个时间点的数据作为模型输入。越长越能看全长期规律。" />
                </Label>
                <div className="flex items-center gap-3">
                  <Slider
                    className="flex-1"
                    min={Math.max(20, season * 2)}
                    max={Math.max(20, current.timePoints.length - Math.max(effHorizon, 1))}
                    step={1}
                    value={[effInputLen]}
                    onValueChange={(v) => setInputLen(v[0])}
                  />
                  <Input
                    type="number"
                    className="w-28"
                    min={Math.max(20, season * 2)}
                    max={Math.max(20, current.timePoints.length - Math.max(effHorizon, 1))}
                    value={effInputLen}
                    onChange={(e) => setInputLen(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">
                  输出长度（预测步数）
                  <ExplainTip text="预测未来多少步；同时这最后几段会被“藏起来”用于验证模型真实误差。" />
                </Label>
                <div className="flex items-center gap-3">
                  <Slider
                    className="flex-1"
                    min={4}
                    max={Math.max(4, Math.floor(current.timePoints.length / 3))}
                    step={1}
                    value={[effHorizon]}
                    onValueChange={(v) => setHorizon(v[0])}
                  />
                  <Input
                    type="number"
                    className="w-28"
                    min={4}
                    max={Math.max(4, Math.floor(current.timePoints.length / 3))}
                    value={effHorizon}
                    onChange={(e) => setHorizon(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="flex items-end">
                <div className="w-full rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  <div className="mb-1 font-medium text-foreground">当前配置</div>
                  区域「{effZone}」· 输入 {effInputLen} 步 · 预测 {effHorizon} 步（约{' '}
                  {current.freqMinutes > 0 ? ((effHorizon * current.freqMinutes) / 60).toFixed(1) : '—'} 小时）
                  <br />
                  自动切分：前 {Math.max(2, effInputLen - effHorizon)} 步训练，后 {effHorizon} 步验证
                </div>
              </div>
            </div>

            {/* 切分示意图 */}
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">数据切分示意</div>
              <div className="flex h-8 w-full overflow-hidden rounded-lg border border-border">
                <div className="flex items-center justify-center bg-primary/20 text-[11px] text-primary" style={{ width: `${Math.max(20, effInputLen - effHorizon)}%` }}>
                  训练段
                </div>
                <div className="flex items-center justify-center bg-amber-400/20 text-[11px] text-amber-400" style={{ width: `${Math.max(10, effHorizon)}%` }}>
                  验证段
                </div>
                <div className="flex items-center justify-center bg-blue-400/20 text-[11px] text-blue-300" style={{ width: '6%' }}>
                  未来
                </div>
              </div>
              <div className="mt-1.5 text-[11px] text-muted-foreground">
                验证段 = 最后 {effHorizon} 步真实数据（用于打分）；训练完成后会用全部 {effInputLen} 步再训练一次，外推未来 {effHorizon} 步。
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep(1)} disabled={!canTrain}>
                下一步：选择算法
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <AlgorithmConfig
          datasetName={current.name}
          season={season}
          series={series}
          inputLen={effInputLen}
          horizon={effHorizon}
          selectedId={algorithmId}
          params={params}
          onSelect={handleSelectAlgorithm}
          onParamsChange={handleParamsChange}
          onApplyRecommendation={applyRecommendation}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      ) : null}

      {step === 2 ? (
        <TrainingMonitor
          state={training}
          algorithmName={getAlgorithmMeta(algorithmId).name}
          zone={effZone}
          canTrain={canTrain}
          onStart={() => void startTraining()}
          onCancel={cancelTraining}
          onBack={() => setStep(1)}
        />
      ) : null}

      {step === 3 && resultValid ? (
        <ResultPanel
          result={result}
          windowTime={windowTime}
          datasetName={current.name}
          runs={runs}
          onTrainAgain={() => {
            setStep(2);
            setTraining(null);
            setResult(null);
          }}
          onBackToConfig={() => setStep(1)}
          onClearRuns={() => {
            setRuns([]);
            try {
              localStorage.removeItem(`${NS}:runs`);
            } catch {
              // ignore
            }
          }}
        />
      ) : null}
    </div>
  );
}
