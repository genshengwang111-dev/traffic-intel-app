// 预测算法库（浏览器端运行）
// 10 种现代算法：ARIMA / SARIMA/SARIMAX / XGBoost / Random Forest / SVR /
//               LSTM / GRU / TCN / N-BEATS / Transformer(PatchTST)
// 深度学习基于 TensorFlow.js 本地训练；所有算法支持逐步进度回报与取消
// EXPORTS: IForecastParams, IForecastInput, IForecastOutput, AlgorithmFn, algorithms

import { arimaForecast } from './arima';
import { treeForecast } from './trees';
import { svrForecast } from './svr';
import { deepForecast } from './deep';
import { PBOOL } from './ml';

export type IForecastParams = Record<string, number | string | boolean>;

export interface IForecastInput {
  /** 训练序列 */
  train: number[];
  /** 预测步数 */
  horizon: number;
  /** 季节周期（如一天的数据步数） */
  season: number;
  /** 算法参数 */
  params: IForecastParams;
  /** 训练进度回报（阶段名、0~1 进度、消息） */
  onProgress?: (stage: string, fraction: number, message: string) => void;
  /** 取消信号 */
  signal?: AbortSignal;
}

export interface IForecastOutput {
  /** 未来预测 */
  predictions: number[];
  /** 样本内一步拟合（长度 ≤ train.length） */
  fitted: number[];
  /** 附加信息（优化出的参数等） */
  extra?: Record<string, string | number>;
  /** 训练过程数据（如每轮损失） */
  history?: { loss: number[] };
}

export type AlgorithmFn = (input: IForecastInput) => IForecastOutput | Promise<IForecastOutput>;

export const algorithms: Record<string, AlgorithmFn> = {
  /** ARIMA：差分 + 自回归 + 滑动平均 */
  arima: (input) => arimaForecast({ ...input, seasonal: false, exog: false }),

  /** SARIMA/SARIMAX：ARIMA + 季节项 + 可选外生变量（时间相位） */
  sarimax: (input) => arimaForecast({ ...input, seasonal: true, exog: PBOOL(input.params, 'exog', true) }),

  /** XGBoost：梯度提升回归树（GBDT，XGBoost 核心等价实现） */
  xgboost: (input) => treeForecast({ ...input, kind: 'gbt' }),

  /** Random Forest：随机森林回归 */
  randomForest: (input) => treeForecast({ ...input, kind: 'rf' }),

  /** SVR：支持向量回归（RBF 核，ε-insensitive） */
  svr: (input) => svrForecast(input),

  /** LSTM：长短期记忆网络 */
  lstm: (input) => deepForecast({ ...input, kind: 'lstm' }),

  /** GRU：门控循环单元 */
  gru: (input) => deepForecast({ ...input, kind: 'gru' }),

  /** TCN：时序卷积网络（因果膨胀卷积） */
  tcn: (input) => deepForecast({ ...input, kind: 'tcn' }),

  /** N-BEATS：纯全连接可解释时序预测 */
  nbeats: (input) => deepForecast({ ...input, kind: 'nbeats' }),

  /** Transformer(PatchTST)：Patch 嵌入 + 多头注意力编码器 */
  patchtst: (input) => deepForecast({ ...input, kind: 'patchtst' }),
};

export const algorithmIds: string[] = Object.keys(algorithms);
