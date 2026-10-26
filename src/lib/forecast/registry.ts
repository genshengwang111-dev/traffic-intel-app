// 预测算法注册表：元信息、参数定义、通俗解释
// EXPORTS: IParamDef, IAlgorithmMeta, ALGORITHMS, getAlgorithmMeta

import type { IForecastParams } from './algorithms';

export interface IParamDef {
  key: string;
  label: string;
  type: 'number' | 'select' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  default: number | string | boolean;
  options?: { value: string; label: string }[];
  /** 通俗解释 */
  desc: string;
}

export interface IAlgorithmMeta {
  id: string;
  name: string;
  category: '统计模型' | '机器学习' | '深度学习';
  tagline: string;
  detail: string;
  params: IParamDef[];
  defaultParams: IForecastParams;
  /** 是否需要季节周期（自动取数据的一天步数） */
  needsSeason?: boolean;
}

export const ALGORITHMS: IAlgorithmMeta[] = [
  {
    id: 'arima',
    name: 'ARIMA',
    category: '统计模型',
    tagline: '自回归 + 差分 + 滑动平均的经典时序模型',
    detail: '时间序列领域的经典模型。它先对数据做差分（把变化量而非绝对值当作学习对象，用来去掉趋势），再用“过去的自己”和“过去的误差”来解释未来。适合有明显趋势、周期性不强的数据，训练快、可解释性强。',
    params: [
      { key: 'p', label: '自回归阶数 p', type: 'number', min: 0, max: 12, step: 1, default: 2, desc: '用过去多少个时刻的数值来解释当前值。越大越能捕捉近期依赖。' },
      { key: 'd', label: '差分阶数 d', type: 'number', min: 0, max: 2, step: 1, default: 1, desc: '0=不差分；1=看相邻变化（去掉线性趋势）；2=看变化的变化（去掉二次趋势）。' },
      { key: 'q', label: '滑动平均阶数 q', type: 'number', min: 0, max: 6, step: 1, default: 1, desc: '用过去多少个“预测误差”来修正预测。越小越简单。' },
    ],
    defaultParams: { p: 2, d: 1, q: 1 },
  },
  {
    id: 'sarimax',
    name: 'SARIMA / SARIMAX',
    category: '统计模型',
    tagline: 'ARIMA 的季节版，还能吃进外生变量',
    detail: '在 ARIMA 基础上加入“季节项”：除了看过去的几步，还看“昨天同一时刻”“上周同一时刻”。特别适合交通流量这类昼夜/周度规律极强的数据。开启外生变量后，还会把“一天中的时段”作为额外线索喂给模型。',
    params: [
      { key: 'p', label: '自回归阶数 p', type: 'number', min: 0, max: 6, step: 1, default: 1, desc: '普通自回归阶数。' },
      { key: 'd', label: '差分阶数 d', type: 'number', min: 0, max: 2, step: 1, default: 1, desc: '普通差分阶数。' },
      { key: 'q', label: '滑动平均阶数 q', type: 'number', min: 0, max: 4, step: 1, default: 1, desc: '普通滑动平均阶数。' },
      { key: 'P', label: '季节自回归 P', type: 'number', min: 0, max: 2, step: 1, default: 1, desc: '参考“昨天/上周同一时刻”的阶数。' },
      { key: 'D', label: '季节差分 D', type: 'number', min: 0, max: 1, step: 1, default: 1, desc: '是否对“与一天前之差”再做一次差分（去日趋势）。' },
      { key: 'Q', label: '季节滑动平均 Q', type: 'number', min: 0, max: 2, step: 1, default: 1, desc: '用过去的“周期误差”修正预测。' },
      { key: 'exog', label: '外生变量', type: 'boolean', default: true, desc: '开启后把“一天中的时段（早晚高峰等）”作为额外特征喂给模型，帮助捕捉周期性。' },
    ],
    defaultParams: { p: 1, d: 1, q: 1, P: 1, D: 1, Q: 1, exog: true },
    needsSeason: true,
  },
  {
    id: 'xgboost',
    name: 'XGBoost',
    category: '机器学习',
    tagline: '梯度提升树：把很多棵“笨树”一步步修成高手',
    detail: 'XGBoost 是机器学习竞赛里的常胜将军。它训练许多棵小决策树，每一棵都专门去弥补前面所有树犯过的错（拟合残差），最后加权合在一起。能自动发现“过去的哪些时刻、哪些时段特征最重要”，稳健且强大。',
    params: [
      { key: 'nTrees', label: '树数量', type: 'number', min: 20, max: 400, step: 10, default: 100, desc: '树的棵数。越多越强，但训练越慢、也越容易过拟合。' },
      { key: 'maxDepth', label: '树深度', type: 'number', min: 2, max: 10, step: 1, default: 4, desc: '每棵树能看多深。越深越精细，但容易记住噪声。' },
      { key: 'lr', label: '学习率', type: 'number', min: 0.01, max: 0.5, step: 0.05, default: 0.1, desc: '每棵树贡献的权重。越小越稳，但需要更多树。' },
      { key: 'maxSamples', label: '最大训练样本', type: 'number', min: 100, max: 2000, step: 100, default: 1000, desc: '训练用多少条历史片段。越大越准但越慢。' },
    ],
    defaultParams: { nTrees: 100, maxDepth: 4, lr: 0.1, maxSamples: 1000 },
  },
  {
    id: 'randomForest',
    name: 'Random Forest 随机森林',
    category: '机器学习',
    tagline: '许多棵随机决策树投票，稳健不跑偏',
    detail: '随机森林同时训练一大批决策树，每棵树只看随机抽样的数据和随机抽样的特征，最后取所有树的平均。因为每棵树“看问题的角度”都不同，合在一起既强又稳，几乎不会过拟合，是非常可靠的模型。',
    params: [
      { key: 'nTrees', label: '树数量', type: 'number', min: 20, max: 400, step: 10, default: 100, desc: '树的棵数。越多越稳，但训练越慢。' },
      { key: 'maxDepth', label: '树深度', type: 'number', min: 2, max: 12, step: 1, default: 6, desc: '每棵树的深度上限。' },
      { key: 'maxSamples', label: '最大训练样本', type: 'number', min: 100, max: 2000, step: 100, default: 1000, desc: '训练用多少条历史片段。' },
    ],
    defaultParams: { nTrees: 100, maxDepth: 6, maxSamples: 1000 },
  },
  {
    id: 'svr',
    name: 'SVR 支持向量回归',
    category: '机器学习',
    tagline: '找一个“管道”包住大部分数据，管道外的才计算误差',
    detail: '支持向量回归的思想：在数据周围画一根“误差管道”（ε 管），只要预测落在管道内就算“可以接受”，只对管道外的偏差进行惩罚。配合 RBF 核函数还能捕捉非线性关系，在小样本上通常表现稳定。',
    params: [
      { key: 'C', label: '惩罚系数 C', type: 'number', min: 0.1, max: 1000, step: 10, default: 10, desc: '对管道外偏差的重视程度。越大越严格拟合训练数据，但可能过拟合。' },
      { key: 'epsilon', label: '管宽 ε', type: 'number', min: 0.001, max: 0.5, step: 0.01, default: 0.02, desc: '允许的误差范围（相对幅度）。越大预测越平滑。' },
      { key: 'iters', label: '迭代次数', type: 'number', min: 50, max: 2000, step: 50, default: 300, desc: '求解迭代轮数。越多收敛越彻底，但越慢。' },
      { key: 'maxSamples', label: '最大训练样本', type: 'number', min: 100, max: 2000, step: 100, default: 300, desc: '训练用多少条历史片段。越多越慢。' },
    ],
    defaultParams: { C: 10, epsilon: 0.02, iters: 300, maxSamples: 300 },
  },
  {
    id: 'lstm',
    name: 'LSTM 长短期记忆网络',
    category: '深度学习',
    tagline: '自带“记忆单元”的循环神经网络',
    detail: 'LSTM 是深度学习处理时序数据的代表作：网络内部有一个“记忆细胞”，能决定哪些历史信息该记住、哪些该忘掉，从而学会长距离依赖——比如记住几小时前的状态来预测现在的流量。需要较多数据，训练比统计模型慢，但拟合复杂规律的能力更强。',
    params: [
      { key: 'window', label: '输入窗口', type: 'number', min: 8, max: 192, step: 8, default: 48, desc: '看多长的一段历史来做预测。越长信息越多，但训练越慢。' },
      { key: 'epochs', label: '训练轮数', type: 'number', min: 3, max: 200, step: 1, default: 25, desc: '把数据反复学习多少遍。越多拟合越充分，但过多会过拟合。' },
      { key: 'units', label: '隐藏单元数', type: 'number', min: 8, max: 128, step: 8, default: 32, desc: '记忆单元的容量。越大越强但越慢。' },
    ],
    defaultParams: { window: 48, epochs: 25, units: 32 },
  },
  {
    id: 'gru',
    name: 'GRU 门控循环单元',
    category: '深度学习',
    tagline: 'LSTM 的轻量版，训练更快',
    detail: 'GRU 和 LSTM 同属循环神经网络家族，但结构更精简（少一个“门”），训练更快、更省内存，在数据量不特别大时往往和 LSTM 效果相当，是个性价比很高的深度模型。',
    params: [
      { key: 'window', label: '输入窗口', type: 'number', min: 8, max: 192, step: 8, default: 48, desc: '看多长的一段历史来做预测。' },
      { key: 'epochs', label: '训练轮数', type: 'number', min: 3, max: 200, step: 1, default: 25, desc: '把数据反复学习多少遍。' },
      { key: 'units', label: '隐藏单元数', type: 'number', min: 8, max: 128, step: 8, default: 32, desc: '单元的容量。越大越强但越慢。' },
    ],
    defaultParams: { window: 48, epochs: 25, units: 32 },
  },
  {
    id: 'tcn',
    name: 'TCN 时序卷积网络',
    category: '深度学习',
    tagline: '用“卷积”感受野覆盖历史，可并行训练',
    detail: 'TCN 用一连串“因果膨胀卷积”构建感受野：每个卷积只看过去的信息（因果），膨胀系数逐层翻倍，让视野指数级扩大。相比循环网络，它能并行计算、训练稳定，对长序列很友好。',
    params: [
      { key: 'window', label: '输入窗口', type: 'number', min: 8, max: 192, step: 8, default: 48, desc: '看多长的一段历史来做预测。' },
      { key: 'epochs', label: '训练轮数', type: 'number', min: 3, max: 200, step: 1, default: 25, desc: '把数据反复学习多少遍。' },
      { key: 'units', label: '卷积核数', type: 'number', min: 8, max: 128, step: 8, default: 32, desc: '每层卷积提取多少种特征。越大越强但越慢。' },
    ],
    defaultParams: { window: 48, epochs: 25, units: 32 },
  },
  {
    id: 'nbeats',
    name: 'N-BEATS',
    category: '深度学习',
    tagline: '纯全连接的可解释预测器',
    detail: 'N-BEATS 是近年提出的纯全连接网络：没有循环也没有卷积，只用多层“基础块”逐层剥离趋势与周期，最后输出预测。结构简单、训练稳定，在多个预测竞赛中表现优异。',
    params: [
      { key: 'window', label: '输入窗口', type: 'number', min: 8, max: 192, step: 8, default: 48, desc: '看多长的一段历史来做预测。' },
      { key: 'epochs', label: '训练轮数', type: 'number', min: 3, max: 200, step: 1, default: 30, desc: '把数据反复学习多少遍。' },
      { key: 'units', label: '隐藏单元数', type: 'number', min: 8, max: 128, step: 8, default: 32, desc: '每层的容量。越大越强但越慢。' },
    ],
    defaultParams: { window: 48, epochs: 30, units: 32 },
  },
  {
    id: 'patchtst',
    name: 'Transformer / PatchTST',
    category: '深度学习',
    tagline: '把时间序列切成“补丁”，用注意力建模全局依赖',
    detail: 'PatchTST 把 Transformer 思想用于时间序列：先把历史切成一小段一小段的“补丁”（patch），嵌入向量后用多头注意力机制让每个补丁都能“看见”其他补丁，从而捕捉全局依赖关系。是当前时序深度学习的前沿结构，擅长发现长距离规律。',
    params: [
      { key: 'window', label: '输入窗口', type: 'number', min: 8, max: 192, step: 8, default: 48, desc: '看多长的一段历史来做预测。' },
      { key: 'epochs', label: '训练轮数', type: 'number', min: 3, max: 200, step: 1, default: 30, desc: '把数据反复学习多少遍。' },
      { key: 'units', label: '模型宽度', type: 'number', min: 8, max: 128, step: 8, default: 32, desc: '注意力表示的维度。越大越强但越慢。' },
    ],
    defaultParams: { window: 48, epochs: 30, units: 32 },
  },
];

export function getAlgorithmMeta(id: string): IAlgorithmMeta {
  return ALGORITHMS.find((a) => a.id === id) ?? ALGORITHMS[0];
}
