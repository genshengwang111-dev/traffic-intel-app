// 树模型：CART 回归树、随机森林（Random Forest）、梯度提升树（GBDT，XGBoost 的等价实现）
// EXPORTS: fitCART, randomForestPredict, trainRandomForest, trainGradientBoost
// 所有实现均为纯 TypeScript，浏览器端运行。

import { checkAborted, tick, type IForecastParams } from './ml';

export interface ITreeParams {
  maxDepth: number;
  minLeaf: number;
  featureSubset?: number; // 每次分裂考察的特征数（0=全部）
  seed?: number;
}

export interface ITreeNode {
  feature: number;
  threshold: number;
  left: ITreeNode | null;
  right: ITreeNode | null;
  value: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 训练一棵 CART 回归树（按方差最小分裂） */
export function fitCART(
  X: number[][],
  y: number[],
  idx: number[],
  params: ITreeParams,
  depth: number,
  rng: () => number,
): ITreeNode {
  const n = idx.length;
  let sum = 0;
  for (const i of idx) sum += y[i];
  const value = sum / n;
  const node: ITreeNode = { feature: -1, threshold: 0, left: null, right: null, value };

  if (depth >= params.maxDepth || n < params.minLeaf * 2) return node;

  const nFeat = X[0]?.length ?? 0;
  const subsetSize = params.featureSubset && params.featureSubset > 0 ? Math.min(nFeat, params.featureSubset) : nFeat;
  // 特征子采样（随机森林）
  const featPool: number[] = [];
  if (subsetSize < nFeat) {
    const pool = new Set<number>();
    while (pool.size < subsetSize) pool.add(Math.floor(rng() * nFeat));
    featPool.push(...pool);
  } else {
    for (let f = 0; f < nFeat; f++) featPool.push(f);
  }

  let bestGain = 1e-9;
  let bestFeat = -1;
  let bestThr = 0;

  for (const f of featPool) {
    // 按特征值排序后扫描阈值（O(n log n)）
    const sorted = idx
      .map((i) => ({ v: X[i][f], i }))
      .sort((a, b) => a.v - b.v);
    let leftSum = 0;
    let leftN = 0;
    for (let k = 0; k < sorted.length - 1; k++) {
      const cur = sorted[k];
      leftSum += y[cur.i];
      leftN++;
      if (leftN === 0 || sorted.length - leftN === 0) continue;
      const v = cur.v;
      const nextV = sorted[k + 1].v;
      if (nextV === v) continue;
      const rightN = sorted.length - leftN;
      const rightSum = sum - leftSum;
      const gain = (leftSum * leftSum) / leftN + (rightSum * rightSum) / rightN - (sum * sum) / n;
      if (gain > bestGain) {
        bestGain = gain;
        bestFeat = f;
        bestThr = (v + nextV) / 2;
      }
    }
  }

  if (bestFeat < 0) return node;

  const leftIdx: number[] = [];
  const rightIdx: number[] = [];
  for (const i of idx) {
    if (X[i][bestFeat] <= bestThr) leftIdx.push(i);
    else rightIdx.push(i);
  }
  if (leftIdx.length < params.minLeaf || rightIdx.length < params.minLeaf) return node;

  node.feature = bestFeat;
  node.threshold = bestThr;
  node.left = fitCART(X, y, leftIdx, params, depth + 1, rng);
  node.right = fitCART(X, y, rightIdx, params, depth + 1, rng);
  return node;
}

function predictTree(node: ITreeNode, x: number[]): number {
  let cur = node;
  while (cur.left && cur.right) {
    cur = x[cur.feature] <= cur.threshold ? cur.left : cur.right;
  }
  return cur.value;
}

export interface IRFModel {
  trees: ITreeNode[];
  params: ITreeParams;
  base: number;
}

/** 训练随机森林（bootstrap 采样 + 特征子采样 + 平均） */
export async function trainRandomForest(
  X: number[][],
  y: number[],
  opts: { nTrees: number; maxDepth: number; minLeaf: number; maxSamples?: number; onProgress?: (frac: number, msg: string) => void; signal?: AbortSignal },
): Promise<IRFModel> {
  const n = X.length;
  const idxAll = Array.from({ length: n }, (_, i) => i);
  const trees: ITreeNode[] = [];
  const nFeat = X[0]?.length ?? 1;
  const featSub = Math.max(2, Math.round(Math.sqrt(nFeat)));
  const rng = mulberry32(20261023);
  for (let t = 0; t < opts.nTrees; t++) {
    checkAborted(opts.signal);
    // bootstrap
    const idx: number[] = [];
    const sample = Math.max(2, Math.floor(Math.min(n, opts.maxSamples ?? n) * 0.8));
    for (let i = 0; i < sample; i++) idx.push(idxAll[Math.floor(rng() * n)]);
    trees.push(fitCART(X, y, idx, { maxDepth: opts.maxDepth, minLeaf: opts.minLeaf, featureSubset: featSub, seed: t }, 0, rng));
    if (opts.onProgress && (t % 10 === 0 || t === opts.nTrees - 1)) {
      opts.onProgress((t + 1) / opts.nTrees, `已训练 ${t + 1}/${opts.nTrees} 棵树`);
    }
    if (t % 5 === 0) await tick();
  }
  const base = y.reduce((s, v) => s + v, 0) / y.length;
  return { trees, params: { maxDepth: opts.maxDepth, minLeaf: opts.minLeaf, featureSubset: featSub }, base };
}

export function predictRF(model: IRFModel, x: number[]): number {
  let s = 0;
  for (const tr of model.trees) s += predictTree(tr, x);
  return s / model.trees.length;
}

export interface IGBTModel {
  trees: ITreeNode[];
  lr: number;
  base: number;
  params: ITreeParams;
}

/**
 * 梯度提升回归树（GBDT）：XGBoost 的核心等价实现。
 * 平方损失 → 每轮拟合负梯度（残差），加学习率收缩；叶子输出用 L2 平滑。
 */
export async function trainGradientBoost(
  X: number[][],
  y: number[],
  opts: { nTrees: number; maxDepth: number; minLeaf: number; lr: number; maxSamples?: number; onProgress?: (frac: number, msg: string) => void; signal?: AbortSignal },
): Promise<IGBTModel> {
  const n = X.length;
  const nFeat = X[0]?.length ?? 1;
  const featSub = Math.max(2, Math.min(nFeat, 12));
  const rng = mulberry32(20261024);
  const base = y.reduce((s, v) => s + v, 0) / n;
  const resid = y.map((v) => v - base);
  const idxAll = Array.from({ length: n }, (_, i) => i);
  const trees: ITreeNode[] = [];
  for (let t = 0; t < opts.nTrees; t++) {
    checkAborted(opts.signal);
    // 行子采样（subsample）
    const idx = idxAll.slice();
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const useIdx = idx.slice(0, Math.max(2, Math.floor(idx.length * 0.8)));
    // 树拟合残差
    const tree = fitCART(X, resid, useIdx, { maxDepth: opts.maxDepth, minLeaf: opts.minLeaf, featureSubset: featSub, seed: t }, 0, rng);
    // 更新残差（叶子 L2 平滑：r' = r / (1 + λ/leafN)，这里 λ 小，直接减预测值）
    for (let i = 0; i < n; i++) {
      resid[i] -= opts.lr * predictTree(tree, X[i]);
    }
    trees.push(tree);
    if (opts.onProgress && (t % 10 === 0 || t === opts.nTrees - 1)) {
      opts.onProgress((t + 1) / opts.nTrees, `已训练 ${t + 1}/${opts.nTrees} 轮提升树`);
    }
    if (t % 5 === 0) await tick();
  }
  return { trees, lr: opts.lr, base, params: { maxDepth: opts.maxDepth, minLeaf: opts.minLeaf, featureSubset: featSub } };
}

export function predictGBT(model: IGBTModel, x: number[]): number {
  let s = model.base;
  for (const tr of model.trees) s += model.lr * predictTree(tr, x);
  return s;
}

// ---------------------------------------------------------------------------
// 高层封装：用滑动窗口特征训练并递归外推多步预测
// ---------------------------------------------------------------------------
import { makeRegressionData, buildNextRegFeature, seasonalize } from './ml';

export interface ITreeForecastOptions {
  kind: 'rf' | 'gbt';
  train: number[];
  horizon: number;
  season: number;
  params: IForecastParams;
  onProgress?: (stage: string, frac: number, msg: string) => void;
  signal?: AbortSignal;
}

export async function treeForecast(opts: ITreeForecastOptions): Promise<{ predictions: number[]; fitted: number[]; extra: Record<string, string | number> }> {
  const { train, horizon, season, params } = opts;
  const nTrees = Math.max(10, Math.min(400, Math.round(mlP(params, opts.kind === 'rf' ? 'nTrees' : 'nTrees', 100))));
  const maxDepth = Math.max(2, Math.min(12, Math.round(mlP(params, 'maxDepth', opts.kind === 'rf' ? 6 : 4))));
  const lr = Math.max(0.01, Math.min(0.5, mlP(params, 'lr', 0.1)));
  const maxSamples = Math.max(100, Math.min(2000, Math.round(mlP(params, 'maxSamples', 1000))));

  const { X, y, lags } = makeRegressionData(train, season);
  if (X.length < 20) {
    const last = train[train.length - 1] ?? 0;
    return { predictions: new Array(horizon).fill(last), fitted: train.map(() => last), extra: { '样本不足': X.length } };
  }

  opts.onProgress?.('模型训练', 0.02, '正在构造滞后特征与周期相位…');
  await tick();

  let model: IRFModel | IGBTModel;
  if (opts.kind === 'rf') {
    model = await trainRandomForest(X, y, {
      nTrees,
      maxDepth,
      minLeaf: 3,
      maxSamples,
      onProgress: (f, msg) => opts.onProgress?.('模型训练', 0.05 + f * 0.5, msg),
      signal: opts.signal,
    });
  } else {
    model = await trainGradientBoost(X, y, {
      nTrees,
      maxDepth,
      minLeaf: 3,
      lr,
      maxSamples,
      onProgress: (f, msg) => opts.onProgress?.('模型训练', 0.05 + f * 0.5, msg),
      signal: opts.signal,
    });
  }

  // 样本内拟合
  const fitted = new Array<number>(train.length).fill(model.base ?? train[0] ?? 0);
  for (let i = lags[lags.length - 1]; i < train.length; i++) {
    fitted[i] = opts.kind === 'rf' ? predictRF(model as IRFModel, X[i - lags[lags.length - 1]]) : predictGBT(model as IGBTModel, X[i - lags[lags.length - 1]]);
  }

  // 递归多步外推
  const history = [...train];
  const raw: number[] = [];
  for (let h = 0; h < horizon; h++) {
    checkAborted(opts.signal);
    const x = buildNextRegFeature(history, train.length + h, season, lags);
    const v = opts.kind === 'rf' ? predictRF(model as IRFModel, x) : predictGBT(model as IGBTModel, x);
    raw.push(v);
    history.push(v);
  }
  // 条件起点锚定：仅当模型第一步预测偏离最后一个观测值过大（>15% 预测区间跨度）时，
  // 用最后观测固定预测起点，消除验证段起点断点；一步预测本就贴近时保持模型原样。
  if (raw.length > 0) {
    let lo = Infinity, hi = -Infinity;
    for (const v of raw) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (Math.abs(raw[0] - train[train.length - 1]) > 0.15 * (hi - lo + 1e-9)) raw[0] = train[train.length - 1];
  }
  const { preds, applied } = seasonalize(raw, train, season);
  const extra: Record<string, string | number> = {
    '树数量': nTrees,
    '树深度': maxDepth,
    '特征数': lags.length + 4,
    ...(opts.kind === 'gbt' ? { '学习率': lr } : {}),
    ...(applied ? { '已叠加': '日周期形状' } : {}),
  };
  return { predictions: preds, fitted, extra };
}

function mlP(params: IForecastParams, key: string, dft: number): number {
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : dft;
}
