import { useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Square, ArrowLeft, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { ITrainingState } from '@/lib/forecast/runner';
import { ExplainBlock } from '@/components/Explain';

export interface TrainingMonitorProps {
  state: ITrainingState | null;
  algorithmName: string;
  zone: string;
  canTrain: boolean;
  onStart: () => void;
  onCancel: () => void;
  onBack: () => void;
}

const PHASE_CN: Record<string, string> = {
  数据准备: '数据准备',
  数据切分: '数据切分',
  参数配置: '参数配置',
  模型训练: '模型训练',
  验证评估: '验证评估',
  未来预测: '未来预测',
};

export default function TrainingMonitor({ state, algorithmName, zone, canTrain, onStart, onCancel, onBack }: TrainingMonitorProps) {
  const running = state?.status === 'running';
  const done = state?.status === 'done';
  const error = state?.status === 'error';
  const logRef = useRef<HTMLDivElement | null>(null);

  // 日志自动滚动到底部
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state?.logs.length]);

  const progress = state?.progress ?? 0;
  const phase = state?.phase ?? '待开始';

  return (
    <div className="space-y-4">
      <ExplainBlock title="训练过程是透明的">
        从数据准备到未来预测共 5 个阶段。每一步都在右边实时输出日志——参数怎么取、怎么切分、误差多少，全部看得见。
      </ExplainBlock>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">算法：</span>
              <span className="font-medium text-foreground">{algorithmName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">区域：</span>
              <span className="font-medium text-foreground">{zone}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {running ? (
                <Button variant="destructive" onClick={onCancel}>
                  <Square className="h-4 w-4" />
                  取消训练
                </Button>
              ) : (
                <Button onClick={onStart} disabled={!canTrain || (state !== null && !done && !error)}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {done ? '再次训练' : error ? '重新训练' : state === null ? '开始训练' : '继续'}
                </Button>
              )}
            </div>
          </div>

          {running ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在{PHASE_CN[phase] ?? phase}…
                </span>
                <span className="font-mono text-muted-foreground">{Math.round(progress)}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}

          {done ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              训练完成！结果已自动生成，正在进入结果评估页…
            </div>
          ) : null}
          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              <XCircle className="h-4 w-4" />
              训练失败：请检查参数设置后重试（例如输入长度需大于预测长度 + 3）。
            </div>
          ) : null}

          {/* 日志流 */}
          <div ref={logRef} className="h-64 overflow-y-auto rounded-lg border border-border bg-[#060B15] p-3 font-mono text-xs leading-relaxed">
            {state && state.logs.length > 0 ? (
              state.logs.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground/50">
                    {new Date(l.ts).toLocaleTimeString('zh-CN', { hour12: false })}
                  </span>
                  <span
                    className={
                      l.level === 'ok' ? 'text-emerald-400' : l.level === 'warn' ? 'text-amber-400' : 'text-slate-300'
                    }
                  >
                    {l.level === 'ok' ? '✓' : l.level === 'warn' ? '⚠' : '·'} {l.msg}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-muted-foreground/60">点击「开始训练」后，这里将实时输出每一步的过程与结果。</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" onClick={onBack} disabled={running}>
        <ArrowLeft className="h-4 w-4" />
        返回调整算法
      </Button>
    </div>
  );
}
