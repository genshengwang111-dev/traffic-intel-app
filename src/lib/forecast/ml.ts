// 机器学习通用工具：滞后特征、时间相位、窗口化、归一化、周期形状外推
// EXPORTS: LAG_LIST, makeRegressionData, makePhaseFeatures, minMaxScale, windowSeries,
//          seasonalize, meanStd, checkAborted, tick, IForecastParams

import type { IForecastParams } from './algorithms';

export type { IForecastParams };

/** 递归特征用的滞后阶数（覆盖短期到日周期） */
export const LAG_LIST = [1, 2, 3, 4, 5, 6, 9, 12, 18, 24, 36, 48, 72, 96];

export const P = (params: IForecastParams, key: string, dft: number): number => {
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : dft;
};

export const PBOOL = (params: IForecastParams, key: string, dft: boolean): boolean =>
  typeof params[key] === 'boolean' ? (params[key] as boolean) : dft;

export function meanStd(xs: number[]): { mean: number; std: number } {
  const n = xs.length;
  if (n === 0) return { mean: 0, std: 0 };
  const mean = xs.reduce((s, v) => s + v, 0) / n;
  const v = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(v) };
}

/**
 * 时间相位特征：把“序列内位置”映射到周期相位（正弦/余弦各一维）。
 * 让模型知道当前处于一天中的哪个时段（深夜/早高峰/晚高峰…）。
 */
export function phaseFeatures(i: number, season: number): [number, number] {
  const ph = (2 * Math.PI * i) / Math.max(2, season);
  return [Math.sin(ph), Math.cos(ph)];
}

export interface IRegSample {
  x: number[];
  y: number;
}

/**
 * 构造回归样本：滞后特征 + 周期相位 + 近期统计量。
 * 样本 i 的特征 = [1, lag(1..), lag(season), sin, cos, 近期均值, 近期标准差]
 */
export function makeRegressionData(
  series: number[],
  season: number,
  extraLags: number[] = [],
  statWin = 24,
): { X: number[][]; y: number[]; lags: number[] } {
  const maxLag = Math.min(series.length - 1, Math.max(...LAG_LIST, ...extraLags, season || 1));
  const lags = Array.from(new Set([1, ...LAG_LIST.filter((l) => l <= maxLag), ...extraLags.filter((l) => l <= maxLag)])).sort((a, b) => a - b);
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = lags[lags.length - 1]; i < series.length - 0; i++) {
    const x: number[] = [1];
    for (const l of lags) x.push(series[i - l]);
    const [si, co] = phaseFeatures(i, season);
    x.push(si, co);
    const win = series.slice(Math.max(0, i - statWin), i);
    if (win.length > 0) {
      const { mean, std } = meanStd(win);
      x.push(mean, std);
    } else {
      x.push(0, 0);
    }
    X.push(x);
    y.push(series[i]);
  }
  return { X, y, lags };
}

/** 由递归预测构建下一步特征（用已预测值填充滞后，绝对位置推进相位） */
export function buildNextRegFeature(
  history: number[],
  nextIndex: number,
  season: number,
  lags: number[],
  statWin = 24,
): number[] {
  const x: number[] = [1];
  for (const l of lags) x.push(history[history.length - l]);
  const [si, co] = phaseFeatures(nextIndex, season);
  x.push(si, co);
  const win = history.slice(-statWin);
  const { mean, std } = meanStd(win);
  x.push(mean, std);
  return x;
}

export interface IMinMax {
  min: number;
  max: number;
}

/** 滑动窗口化：X[i] = series[i..i+w]，y = series[i+w]（一步） */
export function windowSeries(series: number[], w: number): { X: number[][]; y: number[] } {
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i + w < series.length; i++) {
    X.push(series.slice(i, i + w));
    y.push(series[i + w]);
  }
  return { X, y };
}

/** 直接多步窗口化：输入窗口 w，输出接下来 horizon 个值 */
export function windowSeriesMulti(series: number[], w: number, horizon: number): { X: number[][]; y: number[][] } {
  const X: number[][] = [];
  const y: number[][] = [];
  for (let i = 0; i + w + horizon <= series.length; i++) {
    X.push(series.slice(i, i + w));
    y.push(series.slice(i + w, i + w + horizon));
  }
  return { X, y };
}

export function minMaxScale(xs: number[]): { data: number[]; mm: IMinMax } {
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  if (max - min < 1e-12) return { data: xs.map(() => 0), mm: { min, max } };
  return { data: xs.map((v) => (v - min) / (max - min)), mm: { min, max } };
}

export function inverseScale(v: number, mm: IMinMax): number {
  if (mm.max - mm.min < 1e-12) return mm.min;
  return v * (mm.max - mm.min) + mm.min;
}

/**
 * 周期感知外推：当模型输出的多步预测接近常数（水平线/近水平线）时，
 * 自动叠加训练数据最后一个周期的中心化形状，使预测呈现周期性形态。
 * 等价于“水平平滑 + 加性季节”的经典组合，预测水平保持不变。
 */
export function seasonalize(
  preds: number[],
  train: number[],
  season: number,
  force = false,
): { preds: number[]; applied: boolean } {
  if (season < 2 || preds.length === 0 || train.length < season * 2) {
    return { preds, applied: false };
  }
  const lo = Math.min(...preds);
  const hi = Math.max(...preds);
  const tMin = Math.min(...train);
  const tMax = Math.max(...train);
  const scale = Math.max(1e-9, tMax - tMin, Math.abs(hi), Math.abs(lo));
  // 非强制时只在预测近乎平坦（可能是退化/收敛不足的“直线”）才叠加日周期形状；
  // force=true 时无条件叠加（用于已判定退化的模型，如 SVR 全支持向量解）
  if (!force && (hi - lo) / scale > 0.02) return { preds, applied: false };
  const cyc = train.slice(-season * 2);
  const m = cyc.reduce((s, v) => s + v, 0) / cyc.length;
  const shape = new Array<number>(season).fill(0);
  const cnt = new Array<number>(season).fill(0);
  for (let i = 0; i < cyc.length; i++) {
    shape[i % season] += cyc[i] - m;
    cnt[i % season]++;
  }
  for (let t = 0; t < season; t++) shape[t] = cnt[t] > 0 ? shape[t] / cnt[t] : 0;
  const sm = shape.reduce((s, v) => s + v, 0) / season;
  for (let t = 0; t < season; t++) shape[t] -= sm;
  const out = preds.map((p, h) => p + shape[h % season]);
  return { preds: out, applied: true };
}

/** 若已中止则抛出（供训练循环内调用） */
export function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error('训练已取消');
    err.name = 'AbortError';
    throw err;
  }
}

/** 让出主线程一帧，保证训练进度能渲染到界面 */
export async function tick(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}
