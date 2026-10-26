// 深度学习预测模型（TensorFlow.js，浏览器本地训练）
// LSTM / GRU / TCN / N-BEATS / Transformer(PatchTST)
// 均为“窗口 → 直接多步输出”，避免递归预测收敛；逐 epoch 回报 loss 供实时监控
// EXPORTS: deepForecast

import * as tf from '@tensorflow/tfjs';
import type { LayerVariable } from '@tensorflow/tfjs-layers';
import { checkAborted, tick, inverseScale, seasonalize, type IForecastParams } from './ml';

export type DeepKind = 'lstm' | 'gru' | 'tcn' | 'nbeats' | 'patchtst';

export async function deepForecast(opts: {
  kind: DeepKind;
  train: number[];
  horizon: number;
  season: number;
  params: IForecastParams;
  onProgress?: (stage: string, frac: number, msg: string) => void;
  signal?: AbortSignal;
}): Promise<{ predictions: number[]; fitted: number[]; extra: Record<string, string | number>; history?: { loss: number[] } }> {
  const { train, horizon, season, params, kind } = opts;
  const n = train.length;
  const windowLen = Math.max(8, Math.min(192, Math.round(numP(params, 'window', Math.min(48, Math.max(8, Math.floor(n / 4)))))));
  const epochs = Math.max(3, Math.min(200, Math.round(numP(params, 'epochs', kind === 'nbeats' || kind === 'patchtst' ? 30 : 25))));
  const units = Math.max(8, Math.min(128, Math.round(numP(params, 'units', 32))));
  const batch = 32;
  const lr = numP(params, 'lr', 0.001);

  if (n < windowLen + 4 || horizon < 1) {
    const last = train[train.length - 1] ?? 0;
    return { predictions: new Array(horizon).fill(last), fitted: train.map(() => last), extra: { '样本不足': n } };
  }

  opts.onProgress?.('模型训练', 0.01, `构造滑动窗口样本（窗口 ${windowLen}，目标 ${horizon} 步直接输出）…`);
  await tick();

  const { X, y } = windowMulti(train, windowLen, horizon);
  const ns = X.length;
  if (ns < 10) {
    const last = train[train.length - 1] ?? 0;
    return { predictions: new Array(horizon).fill(last), fitted: train.map(() => last), extra: { '样本不足': ns } };
  }
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const v of train) {
    if (v < tMin) tMin = v;
    if (v > tMax) tMax = v;
  }
  const mm = { min: tMin, max: tMax };
  const Xs = X.map((win) => win.map((v) => scaleV(v, mm)));
  const Ys = y.map((row) => row.map((v) => scaleV(v, mm)));

  const xTensor = tf.tensor3d(Xs.map((win) => win.map((v) => [v])), [ns, windowLen, 1]);
  const yTensor = tf.tensor2d(Ys, [ns, horizon]);

  let model: tf.LayersModel;
  try {
    model = buildModel(kind, windowLen, horizon, units);
  } catch (err) {
    xTensor.dispose();
    yTensor.dispose();
    throw new Error(`深度学习模型构建失败：${String(err)}`);
  }

  model.compile({ optimizer: tf.train.adam(lr), loss: 'meanSquaredError' });
  opts.onProgress?.('模型训练', 0.03, `模型已就绪，开始训练（epochs=${epochs}, batch=${batch}, 单元数=${units}）…`);

  const lossHist: number[] = [];
  let lastLoss = Infinity;
  try {
    for (let ep = 0; ep < epochs; ep++) {
      checkAborted(opts.signal);
      const h = await model.fit(xTensor, yTensor, {
        epochs: 1,
        batchSize: batch,
        shuffle: true,
        validationSplit: 0.1,
      });
      const loss = (h.history.loss[0] as number) ?? NaN;
      const valLoss = (h.history.val_loss?.[0] as number | undefined) ?? NaN;
      lossHist.push(loss);
      lastLoss = loss;
      // 早停：连续 10 轮训练损失无明显下降
      if (ep > 10 && lossHist[ep] > lossHist[ep - 10] * 0.995 && lossHist[ep] < lossHist[ep - 10] * 1.005) {
        opts.onProgress?.('模型训练', 0.5 + ((ep + 1) / epochs) * 0.45, `Epoch ${ep + 1}/${epochs} loss=${loss.toFixed(4)}（损失趋于平稳，提前结束）`);
        break;
      }
      opts.onProgress?.('模型训练', 0.5 + ((ep + 1) / epochs) * 0.45, `Epoch ${ep + 1}/${epochs} 训练损失=${loss.toFixed(4)}${Number.isFinite(valLoss) ? `，验证损失=${(valLoss as number).toFixed(4)}` : ''}`);
      await tf.nextFrame();
    }
  } catch (err) {
    xTensor.dispose();
    yTensor.dispose();
    model.dispose();
    throw err;
  }

  // 样本内一步拟合：每个窗口预测的第一项
  const fitted = new Array<number>(n).fill(NaN);
  for (let t = 0; t < windowLen && t < n; t++) fitted[t] = train[t];
  const predTensor = model.predict(xTensor) as tf.Tensor;
  const predArr = (await predTensor.array()) as number[][];
  predTensor.dispose();
  for (let i = 0; i < ns; i++) {
    const ti = i + windowLen;
    if (ti < n) fitted[ti] = inverseScale(predArr[i][0], mm);
  }

  // 未来预测：最后一个窗口
  const lastWin = Xs[Xs.length - 1] ?? new Array<number>(windowLen).fill(0);
  const inTensor = tf.tensor3d([lastWin.map((v) => [v])], [1, windowLen, 1]);
  const outTensor = model.predict(inTensor) as tf.Tensor;
  const outArr = (await outTensor.array()) as number[][];
  outTensor.dispose();
  inTensor.dispose();
  xTensor.dispose();
  yTensor.dispose();
  model.dispose();

  const raw = (outArr[0] ?? []).map((v) => inverseScale(v, mm));
  // 条件起点锚定：收敛不足时直接多步输出的第一点可能偏离（验证段起点断点）。
  // 仅当第一步预测偏离最后一个观测值过大（>15% 预测区间跨度）时，用最后观测固定起点；
  // 收敛良好、第一步预测本就贴近时保持模型原样。
  if (raw.length > 0) {
    let lo = Infinity, hi = -Infinity;
    for (const v of raw) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (Math.abs(raw[0] - train[train.length - 1]) > 0.15 * (hi - lo + 1e-9)) raw[0] = train[train.length - 1];
  }
  const { preds, applied } = seasonalize(raw, train, season);
  const extra: Record<string, string | number> = {
    网络: kind.toUpperCase(),
    窗口长度: windowLen,
    Epoch数: epochs,
    单元数: units,
    训练样本数: ns,
    最终损失: Math.round(lastLoss * 1e5) / 1e5,
    ...(applied ? { '已叠加': '日周期形状' } : {}),
  };
  return { predictions: preds, fitted, extra, history: { loss: lossHist } };
}

function buildModel(kind: DeepKind, windowLen: number, horizon: number, units: number): tf.LayersModel {
  const input = tf.input({ shape: [windowLen, 1] });
  if (kind === 'lstm') {
    const x = tf.layers.lstm({ units, returnSequences: true }).apply(input) as tf.SymbolicTensor;
    const y = tf.layers.lstm({ units: Math.max(8, Math.round(units / 2)) }).apply(x) as tf.SymbolicTensor;
    const out = tf.layers.dense({ units: horizon }).apply(y) as tf.SymbolicTensor;
    return tf.model({ inputs: input, outputs: out });
  }
  if (kind === 'gru') {
    const x = tf.layers.gru({ units, returnSequences: true }).apply(input) as tf.SymbolicTensor;
    const y = tf.layers.gru({ units: Math.max(8, Math.round(units / 2)) }).apply(x) as tf.SymbolicTensor;
    const out = tf.layers.dense({ units: horizon }).apply(y) as tf.SymbolicTensor;
    return tf.model({ inputs: input, outputs: out });
  }
  if (kind === 'tcn') {
    // 因果时序卷积（tfjs CPU 不支持 dilation 梯度与 causal padding，
    // 用左侧零填充 + dilation=1 多层卷积 + 残差实现，感受野 = 1 + 6*(5-1) = 25 步）
    let x = input as tf.SymbolicTensor;
    let carry: tf.SymbolicTensor | null = null;
    for (let l = 0; l < 6; l++) {
      const padOut = new CausalPad({ pad: 4 }).apply(x) as tf.SymbolicTensor;
      const conv = tf.layers
        .conv1d({ filters: units, kernelSize: 5, dilationRate: 1, padding: 'valid', activation: 'relu' })
        .apply(padOut) as tf.SymbolicTensor;
      x = l % 2 === 1 ? (tf.layers.add().apply([carry as tf.SymbolicTensor, conv]) as tf.SymbolicTensor) : conv;
      carry = conv;
    }
    const pooled = tf.layers.globalAveragePooling1d({}).apply(x) as tf.SymbolicTensor;
    const out = tf.layers.dense({ units: horizon }).apply(pooled) as tf.SymbolicTensor;
    return tf.model({ inputs: input, outputs: out });
  }
  if (kind === 'nbeats') {
    // 简化 N-BEATS：全连接基础块（多步直接输出，趋势由网络自行学习）
    const flat = tf.layers.flatten({}).apply(input) as tf.SymbolicTensor;
    const h1 = tf.layers.dense({ units, activation: 'relu' }).apply(flat) as tf.SymbolicTensor;
    const h2 = tf.layers.dense({ units, activation: 'relu' }).apply(h1) as tf.SymbolicTensor;
    const out = tf.layers.dense({ units: horizon }).apply(h2) as tf.SymbolicTensor;
    return tf.model({ inputs: input, outputs: out });
  }
  // patchtst：Patch 嵌入 + Transformer 编码器（自定义多头自注意力）+ 全局池化 + 预测头
  const patchLen = Math.max(2, Math.min(16, Math.round(windowLen / 6)));
  const dModel = Math.max(8, units);
  const embed = tf.layers
    .conv1d({ filters: dModel, kernelSize: patchLen, strides: patchLen, padding: 'valid', activation: 'linear' })
    .apply(input) as tf.SymbolicTensor; // (None, nPatches, dModel)
  let x = embed as tf.SymbolicTensor;
  const nHeads = Math.max(2, Math.min(4, Math.round(dModel / 8)));
  for (let layer = 0; layer < 2; layer++) {
    const attnOut = new SelfAttention({ heads: nHeads, dModel }).apply(x) as tf.SymbolicTensor;
    const add1 = tf.layers.add().apply([x, attnOut]) as tf.SymbolicTensor;
    const attnNorm = tf.layers.layerNormalization({}).apply(add1) as tf.SymbolicTensor;
    const ffn = tf.layers.dense({ units: dModel * 2, activation: 'relu' }).apply(attnNorm) as tf.SymbolicTensor;
    const ffnOut = tf.layers.dense({ units: dModel }).apply(ffn) as tf.SymbolicTensor;
    const add2 = tf.layers.add().apply([attnNorm, ffnOut]) as tf.SymbolicTensor;
    x = tf.layers.layerNormalization({}).apply(add2) as tf.SymbolicTensor;
  }
  const pooled = tf.layers.globalAveragePooling1d({}).apply(x) as tf.SymbolicTensor;
  const out = tf.layers.dense({ units: horizon }).apply(pooled) as tf.SymbolicTensor;
  return tf.model({ inputs: input, outputs: out });
}

// 简化多头自注意力（自定义层，tfjs 版本未内置该层）
class SelfAttention extends tf.layers.Layer {
  private readonly heads: number;
  private readonly dModel: number;
  private readonly headDim: number;
  private wq?: LayerVariable;
  private wk?: LayerVariable;
  private wv?: LayerVariable;
  private wo?: LayerVariable;

  constructor(cfg: { heads: number; dModel: number }) {
    super({});
    this.heads = cfg.heads;
    this.dModel = cfg.dModel;
    this.headDim = Math.max(4, Math.round(cfg.dModel / cfg.heads));
  }

  build(_inputShape: tf.Shape): void {
    this.wq = this.addWeight('wq', [this.dModel, this.dModel], 'float32', tf.initializers.glorotNormal({}), undefined, false);
    this.wk = this.addWeight('wk', [this.dModel, this.dModel], 'float32', tf.initializers.glorotNormal({}), undefined, false);
    this.wv = this.addWeight('wv', [this.dModel, this.dModel], 'float32', tf.initializers.glorotNormal({}), undefined, false);
    this.wo = this.addWeight('wo', [this.dModel, this.dModel], 'float32', tf.initializers.glorotNormal({}), undefined, false);
  }

  call(x: tf.Tensor | tf.Tensor[]): tf.Tensor {
    return tf.tidy(() => {
      const t = Array.isArray(x) ? (x[0] as tf.Tensor3D) : (x as tf.Tensor3D);
      const H = this.heads;
      const hd = this.headDim;
      const q = t.matMul(this.wq!.read() as tf.Tensor2D) as tf.Tensor3D;
      const k = t.matMul(this.wk!.read() as tf.Tensor2D) as tf.Tensor3D;
      const v = t.matMul(this.wv!.read() as tf.Tensor2D) as tf.Tensor3D;
      const L = q.shape[1];
      const qh = q.reshape([-1, L, H, hd]).transpose([0, 2, 1, 3]) as tf.Tensor4D;
      const kh = k.reshape([-1, L, H, hd]).transpose([0, 2, 1, 3]) as tf.Tensor4D;
      const vh = v.reshape([-1, L, H, hd]).transpose([0, 2, 1, 3]) as tf.Tensor4D;
      const scores = qh.matMul(kh.transpose([0, 1, 3, 2]) as tf.Tensor4D) as tf.Tensor4D;
      const attnW = scores.mul(tf.scalar(1 / Math.sqrt(hd))).softmax(-1);
      const ctx = attnW.matMul(vh) as tf.Tensor4D;
      const merged = ctx.transpose([0, 2, 1, 3]).reshape([-1, L, this.dModel]) as tf.Tensor3D;
      return merged.matMul(this.wo!.read() as tf.Tensor2D);
    });
  }

  computeOutputShape(inputShape: tf.Shape): tf.Shape {
    return inputShape;
  }

  getClassName(): string {
    return 'SelfAttention';
  }

  static get className(): string {
    return 'SelfAttention';
  }
}

// 因果零填充（左侧补零，配合 valid 卷积实现 causal 卷积）
class CausalPad extends tf.layers.Layer {
  private readonly pad: number;

  constructor(cfg: { pad: number }) {
    super({});
    this.pad = cfg.pad;
  }

  call(x: tf.Tensor | tf.Tensor[]): tf.Tensor {
    return tf.tidy(() => {
      const t = Array.isArray(x) ? (x[0] as tf.Tensor3D) : (x as tf.Tensor3D);
      const zeros = tf.zeros([t.shape[0], this.pad, t.shape[2]]);
      return tf.concat([zeros, t], 1);
    });
  }

  computeOutputShape(inputShape: tf.Shape): tf.Shape {
    return [inputShape[0], (inputShape[1] ?? 0) + this.pad, inputShape[2]];
  }

  getClassName(): string {
    return 'CausalPad';
  }

  static get className(): string {
    return 'CausalPad';
  }
}

function windowMulti(series: number[], w: number, horizon: number): { X: number[][]; y: number[][] } {
  const X: number[][] = [];
  const y: number[][] = [];
  for (let i = 0; i + w + horizon <= series.length; i++) {
    X.push(series.slice(i, i + w));
    y.push(series.slice(i + w, i + w + horizon));
  }
  return { X, y };
}

function scaleV(v: number, mm: { min: number; max: number }): number {
  if (mm.max - mm.min < 1e-12) return 0;
  return (v - mm.min) / (mm.max - mm.min);
}

function numP(params: IForecastParams, key: string, dft: number): number {
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : dft;
}
