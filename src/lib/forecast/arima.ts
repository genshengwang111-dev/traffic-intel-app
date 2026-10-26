// ARIMA / SARIMA / SARIMAX 统计模型
// 差分（普通 + 季节）→ 条件最小二乘估计 AR/MA/季节项/外生变量 → 递归多步预测 → 逐层反演还原
// EXPORTS: arimaForecast, sarimaxForecast

import { checkAborted, tick, seasonalize, phaseFeatures, type IForecastParams } from './ml';
import { solveOLS } from './ols';

export interface IArimaOpts {
  train: number[];
  horizon: number;
  season: number;
  params: IForecastParams;
  seasonal: boolean; // SARIMA/SARIMAX
  exog: boolean; // SARIMAX：加入时间相位外生变量
  onProgress?: (stage: string, frac: number, msg: string) => void;
  signal?: AbortSignal;
}

interface IDiffOp {
  step: number; // 1 = 普通差分；season = 季节差分
}

function differ(series: number[], step: number): number[] {
  const out: number[] = [];
  for (let i = step; i < series.length; i++) out.push(series[i] - series[i - step]);
  return out;
}

/** 对差分后序列的“第 h 步未来预测”反演回原始尺度 */
function invertOnce(known: number[], diffPred: number[], step: number): number[] {
  const m = known.length;
  const H = diffPred.length;
  const out: number[] = [];
  for (let h = 0; h < H; h++) {
    const prevIdx = m + h - step;
    const prev = prevIdx < m ? known[prevIdx] : out[prevIdx - m];
    out.push(prev + diffPred[h]);
  }
  return out;
}

export async function arimaForecast(opts: IArimaOpts): Promise<{ predictions: number[]; fitted: number[]; extra: Record<string, string | number> }> {
  const { train, horizon, season, params, seasonal, exog } = opts;
  const p = Math.max(0, Math.min(12, Math.round(numP(params, 'p', 2))));
  const d = Math.max(0, Math.min(2, Math.round(numP(params, 'd', 1))));
  const q = Math.max(0, Math.min(6, Math.round(numP(params, 'q', 1))));
  const P = seasonal ? Math.max(0, Math.min(2, Math.round(numP(params, 'P', 1)))) : 0;
  const D = seasonal ? Math.max(0, Math.min(1, Math.round(numP(params, 'D', 1)))) : 0;
  const Q = seasonal ? Math.max(0, Math.min(2, Math.round(numP(params, 'Q', 1)))) : 0;
  const s = Math.max(2, Math.floor(season));

  // 差分（普通 d 次 + 季节 D 次，顺序：先普通后季节或反之均可，统一先普通后季节）
  const layers: number[][] = [];
  const ops: IDiffOp[] = [];
  let cur = train;
  layers.push(cur);
  for (let i = 0; i < d; i++) {
    cur = differ(cur, 1);
    layers.push(cur);
    ops.push({ step: 1 });
  }
  for (let i = 0; i < D; i++) {
    cur = differ(cur, s);
    layers.push(cur);
    ops.push({ step: s });
  }
  const z = cur;
  const nz = z.length;
  const totalLag = d + D * s;

  const needLag = Math.max(p, q, P * s, Q * s);
  if (nz < needLag + 2 || train.length < 6) {
    const last = train[train.length - 1] ?? 0;
    return { predictions: new Array(horizon).fill(last), fitted: train.map(() => last), extra: { '样本不足': nz } };
  }

  // ---- 条件最小二乘迭代估计（3 轮，收敛残差） ----
  const start = Math.max(1, needLag);
  const e = new Array<number>(nz).fill(0);
  let beta: number[] = [];

  opts.onProgress?.('模型训练', 0.05, `差分 ${d + D} 次（含季节差分 ${D} 次，周期 ${s}），开始条件最小二乘估计…`);
  await tick();

  let prevRSS = Infinity;
  for (let iter = 0; iter < 4; iter++) {
    checkAborted(opts.signal);
    const X: number[][] = [];
    const y: number[] = [];
    for (let t = start; t < nz; t++) {
      const row: number[] = [1];
      for (let k = 1; k <= p; k++) row.push(t - k >= 0 ? z[t - k] : 0);
      for (let k = 1; k <= q; k++) row.push(t - k >= 0 ? e[t - k] : 0);
      for (let k = 1; k <= P; k++) row.push(t - k * s >= 0 ? z[t - k * s] : 0);
      for (let k = 1; k <= Q; k++) row.push(t - k * s >= 0 ? e[t - k * s] : 0);
      if (exog) {
        const [si, co] = phaseFeatures(t + totalLag, season);
        row.push(si, co);
        // 线性趋势项（归一化）
        row.push((t + totalLag) / Math.max(1, train.length));
      }
      X.push(row);
      y.push(z[t]);
    }
    // 岭正则稳定条件最小二乘（防止残差递推发散 / 近共线爆炸）
    beta = solveOLS(X, y, 1e-4);
    // 更新残差
    let rss = 0;
    for (let t = start; t < nz; t++) {
      const row: number[] = [1];
      for (let k = 1; k <= p; k++) row.push(t - k >= 0 ? z[t - k] : 0);
      for (let k = 1; k <= q; k++) row.push(t - k >= 0 ? e[t - k] : 0);
      for (let k = 1; k <= P; k++) row.push(t - k * s >= 0 ? z[t - k * s] : 0);
      for (let k = 1; k <= Q; k++) row.push(t - k * s >= 0 ? e[t - k * s] : 0);
      if (exog) {
        const [si, co] = phaseFeatures(t + totalLag, season);
        row.push(si, co, (t + totalLag) / Math.max(1, train.length));
      }
      let f = 0;
      for (let j = 0; j < row.length; j++) f += beta[j] * row[j];
      const resid = z[t] - f;
      rss += resid * resid;
      e[t] = resid;
    }
    opts.onProgress?.('模型训练', 0.1 + iter * 0.05, `条件最小二乘迭代 ${iter + 1}/4（残差平方和 ${rss.toExponential(2)}）`);
    await tick();
    // 残差不再明显下降则提前收敛，避免病态迭代
    if (rss > prevRSS * 0.999) break;
    prevRSS = rss;
  }

  const dim = beta.length;
  const exogCols = exog ? 3 : 0;

  // ---- 多步预测（递归；未来残差未知记 0，但已知残差 e[nz-1..] 必须参与 MA/Q 项） ----
  // 教科书式：h 步预测的滑动平均项 = [已知残差(前 q 个可用), 0, 0, ...]
  const ehist = [...e, ...new Array<number>(horizon).fill(0)];
  const zhist = [...z];
  const zdiffPred: number[] = [];
  for (let h = 0; h < horizon; h++) {
    checkAborted(opts.signal);
    const t = zhist.length; // 当前要预测的差分位置
    const row: number[] = [1];
    for (let k = 1; k <= p; k++) row.push(t - k >= 0 ? zhist[t - k] : 0);
    for (let k = 1; k <= q; k++) row.push(t - k >= 0 ? ehist[t - k] : 0); // 已知残差保留，未来残差为 0
    for (let k = 1; k <= P; k++) row.push(t - k * s >= 0 ? zhist[t - k * s] : 0);
    for (let k = 1; k <= Q; k++) row.push(t - k * s >= 0 ? ehist[t - k * s] : 0);
    if (exog) {
      const absT = t + totalLag + h;
      const [si, co] = phaseFeatures(absT, season);
      // 线性趋势特征外推超过训练范围会引发漂移，封顶在训练末端（1.0）
      row.push(si, co, Math.min(1, absT / Math.max(1, train.length)));
    }
    // 列数不足时补 0
    while (row.length < dim) row.push(0);
    let f = 0;
    for (let j = 0; j < dim; j++) f += beta[j] * row[j];
    zdiffPred.push(f);
    zhist.push(f);
  }

  // ---- 逐层反演（逆序） ----
  let predLayer = zdiffPred;
  for (let k = ops.length - 1; k >= 0; k--) {
    predLayer = invertOnce(layers[k], predLayer, ops[k].step);
  }
  // 条件起点锚定（仅 SARIMA/SARIMAX）：季节差分模型的“一步预测”误差偏大时，
  // 用最后一个观测值固定预测起点，消除验证段起点的视觉断点；普通 ARIMA 一步预测较准，不锚定。
  if (seasonal && predLayer.length > 0) {
    let lo = Infinity, hi = -Infinity;
    for (const v of predLayer) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (Math.abs(predLayer[0] - train[train.length - 1]) > 0.15 * (hi - lo + 1e-9)) predLayer[0] = train[train.length - 1];
  }

  // ---- 样本内一步拟合（原始尺度，滚动预测） ----
  const fitted = new Array<number>(train.length).fill(NaN);
  for (let t = 0; t < Math.min(totalLag, train.length); t++) fitted[t] = train[t];
  const predOf = (zKnown: number[], eKnown: number[], t: number): number => {
    const row: number[] = [1];
    for (let k = 1; k <= p; k++) row.push(t - k >= 0 ? zKnown[t - k] : 0);
    for (let k = 1; k <= q; k++) row.push(t - k >= 0 ? eKnown[t - k] : 0);
    for (let k = 1; k <= P; k++) row.push(t - k * s >= 0 ? zKnown[t - k * s] : 0);
    for (let k = 1; k <= Q; k++) row.push(t - k * s >= 0 ? eKnown[t - k * s] : 0);
    if (exog) {
      const [si, co] = phaseFeatures(t + totalLag, season);
      row.push(si, co, (t + totalLag) / Math.max(1, train.length));
    }
    while (row.length < dim) row.push(0);
    let f = 0;
    for (let j = 0; j < dim; j++) f += beta[j] * row[j];
    return f;
  };
  for (let t = totalLag; t < train.length; t++) {
    // 用真实前缀构造差分
    const prefix = train.slice(0, t);
    let curZ = prefix;
    for (let i = 0; i < d; i++) curZ = differ(curZ, 1);
    for (let i = 0; i < D; i++) curZ = differ(curZ, s);
    const nz2 = curZ.length;
    if (nz2 < needLag + 1) {
      fitted[t] = train[t];
      continue;
    }
    // 残差递推（对前缀）
    const eArr = new Array<number>(nz2).fill(0);
    for (let tt = start; tt < nz2; tt++) {
      const f = predOf(curZ, eArr, tt);
      eArr[tt] = curZ[tt] - f;
    }
    const dz = predOf(curZ, eArr, nz2);
    // 逐层反演一步
    let v = dz;
    for (let k = ops.length - 1; k >= 0; k--) {
      // 该层差分前的序列 = layers[k]（截取到 t 前缀长度）
      const mK = layers[k].length - (train.length - t) > 0 ? layers[k].length - (train.length - t) : layers[k].length;
      v = layers[k][mK - ops[k].step] + v;
    }
    fitted[t] = v;
  }

  // 平坦兜底：统计模型多步预测会收敛到水平/趋势，叠加日周期形状
  const { preds, applied } = seasonalize(predLayer, train, season);
  const extra: Record<string, string | number> = {
    '(p,d,q)': `${p},${d},${q}`,
    ...(seasonal ? { '季节阶数 (P,D,Q,s)': `${P},${D},${Q},${s}` } : {}),
    ...(exog ? { '外生变量': '时间相位+趋势' } : {}),
    '回归量维度': dim - exogCols,
    ...(applied ? { '已叠加': '日周期形状' } : {}),
  };
  return { predictions: preds, fitted, extra };
}

function numP(params: IForecastParams, key: string, dft: number): number {
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : dft;
}
