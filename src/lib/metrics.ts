// 预测评估指标计算
// EXPORTS: IMetricResult, calcMetrics, metricMetaList, METRIC_LABELS, fmtNum, fmtPct

export interface IMetricResult {
  /** 均方根误差 */
  rmse: number;
  /** 平均绝对误差 */
  mae: number;
  /** 平均绝对百分比误差（%） */
  mape: number;
  /** 对称平均绝对百分比误差（%） */
  smape: number;
  /** 决定系数 R² */
  r2: number;
  /** 平均绝对缩放误差（需要样本内朴素误差） */
  mase: number | null;
  /** 平均偏差（预测-真实，正=高估） */
  bias: number;
}

export interface IMetricDef {
  key: keyof IMetricResult;
  label: string;
  short: string;
  desc: string;
  better: 'low' | 'high';
  fmt: 'num' | 'pct';
}

export const metricMetaList: IMetricDef[] = [
  { key: 'rmse', label: '均方根误差 RMSE', short: 'RMSE', desc: '误差的“平均水平”，对特大误差更敏感。数值越小越好，单位与流量一致。', better: 'low', fmt: 'num' },
  { key: 'mae', label: '平均绝对误差 MAE', short: 'MAE', desc: '预测与真实值的平均差距，最直观、最容易理解。数值越小越好。', better: 'low', fmt: 'num' },
  { key: 'mape', label: '平均绝对百分比误差 MAPE', short: 'MAPE', desc: '平均每个预测值偏了多少百分比，方便跨区域比较。越小越好。', better: 'low', fmt: 'pct' },
  { key: 'smape', label: '对称MAPE', short: 'SMAPE', desc: 'MAPE 的对称版本，对“真实值为 0”更稳健。', better: 'low', fmt: 'pct' },
  { key: 'r2', label: '决定系数 R²', short: 'R²', desc: '模型解释了真实值波动的多少（1=完美，0=等同均值，可为负）。越接近 1 越好。', better: 'high', fmt: 'num' },
  { key: 'mase', label: '平均绝对缩放误差 MASE', short: 'MASE', desc: '和“无脑重复上一周期”的基准比，<1 说明比基准好。', better: 'low', fmt: 'num' },
  { key: 'bias', label: '平均偏差', short: 'Bias', desc: '整体高估还是低估（正=预测偏大）。', better: 'low', fmt: 'num' },
];

export function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 10000) return v.toExponential(2);
  if (Math.abs(v) >= 100) return v.toFixed(1);
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

export function fmtPct(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return `${v.toFixed(2)}%`;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/**
 * 计算一组预测评估指标。
 * naiveMAE: 样本内朴素基准（重复上一个观测）的 MAE，用于 MASE；
 *           若不提供则 MASE 为 null。
 */
export function calcMetrics(actual: number[], pred: number[], naiveMAE?: number): IMetricResult {
  const n = Math.min(actual.length, pred.length);
  if (n === 0) {
    return { rmse: NaN, mae: NaN, mape: NaN, smape: NaN, r2: NaN, mase: null, bias: NaN };
  }
  let se = 0;
  let ae = 0;
  let ape = 0;
  let sape = 0;
  let bias = 0;
  let apeCount = 0;
  let sapeCount = 0;
  const aMean = mean(actual);
  let sst = 0;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const a = actual[i];
    const p = pred[i];
    const e = a - p;
    se += e * e;
    ae += Math.abs(e);
    bias += e;
    if (Math.abs(a) > 1e-9) {
      ape += Math.abs(e / a);
      apeCount++;
    }
    const denom = (Math.abs(a) + Math.abs(p)) / 2;
    if (denom > 1e-9) {
      sape += Math.abs(e) / denom;
      sapeCount++;
    }
    sst += (a - aMean) ** 2;
    sse += e * e;
  }
  const rmse = Math.sqrt(se / n);
  const mae = ae / n;
  const mape = apeCount > 0 ? (ape / apeCount) * 100 : NaN;
  const smape = sapeCount > 0 ? (sape / sapeCount) * 100 : NaN;
  const r2 = sst > 1e-12 ? 1 - sse / sst : NaN;
  const mase = naiveMAE && naiveMAE > 1e-12 ? mae / naiveMAE : null;
  return { rmse, mae, mape, smape, r2, mase, bias: bias / n };
}
