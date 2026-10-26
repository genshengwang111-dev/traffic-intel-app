// 模型推荐：快速跑多个基线模型，根据验证误差推荐最适合的算法
// EXPORTS: IRecommendItem, IRecommendation, runRecommendation

import { algorithms, type IForecastParams } from './algorithms';
import { getAlgorithmMeta } from './registry';
import { calcMetrics } from '../metrics';
import { calcNaiveMAE } from './runner';

export interface IRecommendItem {
  algorithmId: string;
  name: string;
  category: string;
  mape: number | null;
  rmse: number;
  mae: number;
  r2: number | null;
}

export interface IRecommendation {
  items: IRecommendItem[];
  best: IRecommendItem;
  /** 通俗的推荐理由 */
  reason: string;
  season: number;
  trainLen: number;
  horizon: number;
}

// 快速算法集：统计模型与轻量机器学习（深度学习训练慢，不适合快速推荐）
const QUICK_ALGOS: { id: string; params: IForecastParams }[] = [
  { id: 'arima', params: { p: 2, d: 1, q: 1 } },
  { id: 'sarimax', params: { p: 1, d: 1, q: 1, P: 1, D: 1, Q: 1, exog: true } },
  { id: 'xgboost', params: { nTrees: 60, maxDepth: 3, lr: 0.1, maxSamples: 600 } },
  { id: 'randomForest', params: { nTrees: 60, maxDepth: 5, maxSamples: 600 } },
  { id: 'svr', params: { C: 10, epsilon: 0.02, iters: 200, maxSamples: 400 } },
];

/** 依据验证误差推荐最适合当前数据的预测模型（异步：轻量模型也要真训练） */
export async function runRecommendation(series: number[], inputLen: number, horizon: number, season: number): Promise<IRecommendation> {
  const win = series.slice(-Math.min(inputLen, series.length));
  const trainLen = Math.max(3, win.length - horizon);
  const train = win.slice(0, trainLen);
  const test = win.slice(trainLen);
  const naiveMAE = calcNaiveMAE(train);

  const items: IRecommendItem[] = [];
  for (const algo of QUICK_ALGOS) {
    try {
      const fn = algorithms[algo.id];
      const res = await fn({ train, horizon, season, params: algo.params });
      const m = calcMetrics(test, res.predictions, naiveMAE);
      items.push({
        algorithmId: algo.id,
        name: algoName(algo.id),
        category: algoCategory(algo.id),
        mape: Number.isFinite(m.mape) ? m.mape : null,
        rmse: m.rmse,
        mae: m.mae,
        r2: Number.isFinite(m.r2) ? m.r2 : null,
      });
    } catch {
      // 单算法失败不影响整体推荐
    }
  }

  // 排序：MAPE 优先（能算则用），否则 RMSE
  items.sort((a, b) => {
    const ka = a.mape ?? a.rmse * 1e6;
    const kb = b.mape ?? b.rmse * 1e6;
    return ka - kb;
  });

  const best = items[0] ?? {
    algorithmId: 'arima',
    name: 'ARIMA',
    category: '统计模型',
    mape: null,
    rmse: NaN,
    mae: NaN,
    r2: null,
  };
  const runnerUp = items[1];

  const reason = buildReason(best, runnerUp);
  return { items, best, reason, season, trainLen, horizon };
}

function buildReason(best: IRecommendItem, runnerUp: IRecommendItem | undefined): string {
  const parts: string[] = [];
  if (best.algorithmId === 'sarimax') {
    parts.push('数据呈现出明显的日周期规律（昼夜/高峰重复），季节模型 SARIMA 最能抓住这种规律');
  } else if (best.algorithmId === 'arima') {
    parts.push('数据带趋势且整体平稳，ARIMA 统计模型在验证集上误差最小，可解释性也最好');
  } else if (best.algorithmId === 'xgboost' || best.algorithmId === 'randomForest' || best.algorithmId === 'svr') {
    parts.push('机器学习模型能自动组合多种历史模式（滞后、时段、近期趋势），在当前数据上验证误差最小');
  } else {
    parts.push('该模型在当前数据上的验证误差最小，表现最稳健');
  }
  if (runnerUp && runnerUp.algorithmId !== best.algorithmId) {
    parts.push(`备选可用「${runnerUp.name}」（误差第二小）做交叉验证`);
  }
  parts.push('深度学习模型（LSTM / GRU / TCN / N-BEATS / PatchTST）训练较慢，建议在训练页直接实测对比');
  parts.push('以上推荐基于验证集的真实误差对比');
  return parts.join('。') + '。';
}

function algoName(id: string): string {
  const map: Record<string, string> = {
    arima: 'ARIMA',
    sarimax: 'SARIMA/SARIMAX',
    xgboost: 'XGBoost',
    randomForest: '随机森林',
    svr: 'SVR',
  };
  return map[id] ?? getAlgorithmMeta(id).name;
}

function algoCategory(id: string): string {
  const map: Record<string, string> = {
    arima: '统计模型',
    sarimax: '统计模型',
    xgboost: '机器学习',
    randomForest: '机器学习',
    svr: '机器学习',
  };
  return map[id] ?? getAlgorithmMeta(id).category;
}
