// 训练运行器：分阶段执行预测流程并产生实时监控日志
// 支持异步算法（深度学习逐 epoch 回报），支持取消
// EXPORTS: ITrainLogEntry, ITrainingResult, ITrainingState, runTraining, sleep, calcNaiveMAE

import { algorithms, type IForecastParams } from './algorithms';
import { getAlgorithmMeta } from './registry';
import { calcMetrics, type IMetricResult } from '../metrics';
import { checkAborted } from './ml';

export interface ITrainLogEntry {
  ts: number;
  level: 'info' | 'ok' | 'warn';
  msg: string;
}

export interface ITrainingResult {
  algorithmId: string;
  algorithmName: string;
  zone: string;
  inputLen: number;
  horizon: number;
  params: IForecastParams;
  /** 输入窗口完整序列（画图用） */
  series: number[];
  /** 训练段长度 */
  trainLen: number;
  actualTest: number[];
  predTest: number[];
  /** 用完整窗口再训练得到的未来预测 */
  forecast: number[];
  /** 样本内拟合 */
  fitted: number[];
  metrics: IMetricResult;
  /** 样本内朴素基准 MAE（用于 MASE） */
  naiveMAE: number;
  trainLog: ITrainLogEntry[];
  elapsedMs: number;
  ts: number;
  extra?: Record<string, string | number>;
  history?: { loss: number[] };
}

export interface ITrainingState {
  phase: string;
  progress: number;
  logs: ITrainLogEntry[];
  status: 'running' | 'done' | 'error';
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface IRunOptions {
  series: number[];
  zone: string;
  inputLen: number;
  horizon: number;
  algorithmId: string;
  params: IForecastParams;
  season: number;
  signal?: AbortSignal;
}

function buildLogs(state: ITrainingState, level: ITrainLogEntry['level'], msg: string) {
  state.logs = [...state.logs, { ts: Date.now(), level, msg }];
}

/** 运行一次完整的训练-验证-预测流程 */
export async function runTraining(
  opts: IRunOptions,
  onState: (s: ITrainingState) => void,
): Promise<ITrainingResult> {
  const startAt = Date.now();
  const meta = getAlgorithmMeta(opts.algorithmId);
  const state: ITrainingState = { phase: '数据准备', progress: 0, logs: [], status: 'running' };
  const push = (level: ITrainLogEntry['level'], msg: string) => {
    buildLogs(state, level, msg);
    onState({ ...state });
  };
  // 算法进度回调 → 转发为进度条 + 日志
  const makeProgress = (base: number, span: number) => (stage: string, fraction: number, message: string) => {
    state.phase = stage || '模型训练';
    state.progress = Math.min(99, base + span * Math.max(0, Math.min(1, fraction)));
    if (message) push('info', message);
    onState({ ...state });
  };

  try {
    // ---- 阶段 1：数据准备 ----
    push('info', `开始处理区域「${opts.zone}」的流量序列…`);
    const total = opts.series.length;
    if (total < opts.inputLen) {
      push('warn', `序列长度 ${total} 小于设定的输入长度 ${opts.inputLen}，自动使用全部数据。`);
    }
    const win = opts.series.slice(-Math.min(opts.inputLen, total));
    if (win.length < 3) throw new Error('历史数据太少，无法训练（至少需要 3 个点）。');
    state.progress = 8;
    push('ok', `提取最近 ${win.length} 个时间步作为输入窗口（${opts.zone}）。`);
    state.phase = '数据切分';
    onState({ ...state });
    await sleep(120);

    // ---- 阶段 2：切分训练 / 验证 ----
    const trainLen = Math.max(2, win.length - opts.horizon);
    if (trainLen < 3) throw new Error('输入长度必须大于预测长度 + 3，请调大输入长度。');
    const train = win.slice(0, trainLen);
    const test = win.slice(trainLen);
    push('info', `按“输入长度 ${opts.inputLen}、预测 ${opts.horizon} 步”切分：训练 ${train.length} 步，验证 ${test.length} 步。`);
    state.progress = 18;
    state.phase = '参数配置';
    onState({ ...state });

    // ---- 阶段 3：训练（验证段模型） ----
    const paramDesc = Object.entries(opts.params)
      .map(([k, v]) => `${k}=${typeof v === 'boolean' ? (v ? '开' : '关') : v}`)
      .join('，');
    push('info', `开始训练「${meta.name}」${paramDesc ? `，参数：${paramDesc}` : ''}…`);
    state.phase = '模型训练';
    state.progress = 22;
    onState({ ...state });
    const fn = algorithms[opts.algorithmId];
    checkAborted(opts.signal);
    const res = await fn({ train, horizon: opts.horizon, season: opts.season, params: opts.params, onProgress: makeProgress(22, 28), signal: opts.signal });
    checkAborted(opts.signal);
    state.progress = 52;
    push('ok', '验证模型训练完成。');
    if (res.extra) {
      const extraDesc = Object.entries(res.extra)
        .map(([k, v]) => `${k}=${v}`)
        .join('，');
      push('info', `模型信息：${extraDesc}。`);
    }
    state.phase = '验证评估';
    state.progress = 56;
    onState({ ...state });

    // ---- 阶段 4：验证评估 ----
    const naiveMAE = calcNaiveMAE(train);
    const metrics = calcMetrics(test, res.predictions, naiveMAE);
    push('info', `在验证集（真实值 vs 预测值）上计算评估指标…`);
    await sleep(80);
    push('ok', `验证集 RMSE=${fmt(metrics.rmse)}，MAE=${fmt(metrics.mae)}，MAPE=${fmtPct(metrics.mape)}。`);
    state.phase = '未来预测';
    state.progress = 62;
    onState({ ...state });

    // ---- 阶段 5：用全部窗口再训练，预测未来 ----
    push('info', '用完整输入窗口重新训练，生成未来预测…');
    state.progress = 68;
    onState({ ...state });
    checkAborted(opts.signal);
    const fullRes = await fn({ train: win, horizon: opts.horizon, season: opts.season, params: opts.params, onProgress: makeProgress(68, 27), signal: opts.signal });
    checkAborted(opts.signal);
    state.progress = 98;
    push('ok', '未来预测完成。');

    const elapsedMs = Date.now() - startAt;
    const result: ITrainingResult = {
      algorithmId: opts.algorithmId,
      algorithmName: meta.name,
      zone: opts.zone,
      inputLen: opts.inputLen,
      horizon: opts.horizon,
      params: opts.params,
      series: win,
      trainLen,
      actualTest: test,
      predTest: res.predictions,
      forecast: fullRes.predictions,
      fitted: fullRes.fitted,
      metrics,
      naiveMAE,
      trainLog: state.logs,
      elapsedMs,
      ts: Date.now(),
      extra: res.extra,
      history: res.history,
    };
    state.status = 'done';
    state.progress = 100;
    onState({ ...state });
    return result;
  } catch (e) {
    state.status = 'error';
    push('warn', `训练失败：${String(e)}`);
    onState({ ...state });
    throw e;
  }
}

/** 样本内朴素基准：用“上一个观测值”预测当前值，取 MAE */
export function calcNaiveMAE(train: number[]): number {
  if (train.length < 2) return NaN;
  let s = 0;
  for (let i = 1; i < train.length; i++) s += Math.abs(train[i] - train[i - 1]);
  return s / (train.length - 1);
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 100) return v.toFixed(1);
  return v.toFixed(3);
}

function fmtPct(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return `${v.toFixed(2)}%`;
}
