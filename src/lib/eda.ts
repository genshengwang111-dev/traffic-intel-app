// 探索性数据分析：时间聚合 / 统计
// EXPORTS: IBasicStats, IHourlyProfile, basicStats, hourlyProfile, dowProfile,
//          dowHourHeatmap, rollingMean, seasonalDecompose, parseTimePoints

export interface IBasicStats {
  mean: number;
  max: number;
  min: number;
  std: number;
  cv: number;
  p95: number;
  sum: number;
}

export interface IHourlyProfile {
  hour: number;
  mean: number;
}

export interface IDecomposed {
  trend: number[];
  seasonal: number[];
  residual: number[];
}

/** 解析时间点（兼容多种格式） */
export function parseTimePoints(timePoints: string[]): Date[] {
  return timePoints.map((t) => new Date(t.replace(' ', 'T')));
}

export function basicStats(series: number[]): IBasicStats {
  if (series.length === 0) {
    return { mean: 0, max: 0, min: 0, std: 0, cv: 0, p95: 0, sum: 0 };
  }
  const sorted = [...series].sort((a, b) => a - b);
  const mean = series.reduce((s, v) => s + v, 0) / series.length;
  const std = Math.sqrt(series.reduce((s, v) => s + (v - mean) ** 2, 0) / series.length);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return {
    mean,
    max: sorted[sorted.length - 1],
    min: sorted[0],
    std,
    cv: mean !== 0 ? std / mean : 0,
    p95,
    sum: series.reduce((s, v) => s + v, 0),
  };
}

/** 每小时平均曲线（按一天 24 小时聚合，跨所有天平均） */
export function hourlyProfile(dates: Date[], series: number[]): IHourlyProfile[] {
  const acc = new Array<{ s: number; n: number }>(24).fill(null).map(() => ({ s: 0, n: 0 }));
  for (let i = 0; i < series.length && i < dates.length; i++) {
    const h = dates[i].getHours();
    acc[h].s += series[i];
    acc[h].n += 1;
  }
  return acc.map((a, hour) => ({ hour, mean: a.n > 0 ? a.s / a.n : 0 }));
}

/** 星期几平均曲线（0=周日，符合 ECharts 习惯可再映射） */
export function dowProfile(dates: Date[], series: number[]): { dow: number; mean: number }[] {
  const acc = new Array<{ s: number; n: number }>(7).fill(null).map(() => ({ s: 0, n: 0 }));
  for (let i = 0; i < series.length && i < dates.length; i++) {
    const d = dates[i].getDay();
    acc[d].s += series[i];
    acc[d].n += 1;
  }
  return acc.map((a, dow) => ({ dow, mean: a.n > 0 ? a.s / a.n : 0 }));
}

/** 星期 × 小时 平均热力图矩阵（7 行 × 24 列） */
export function dowHourHeatmap(dates: Date[], series: number[]): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<{ s: number; n: number }>(24).fill(null).map(() => ({ s: 0, n: 0 })));
  for (let i = 0; i < series.length && i < dates.length; i++) {
    const d = dates[i].getDay();
    const h = dates[i].getHours();
    grid[d][h].s += series[i];
    grid[d][h].n += 1;
  }
  return grid.map((row) => row.map((a) => (a.n > 0 ? a.s / a.n : 0)));
}

/** 简单滑动平均（用于看趋势） */
export function rollingMean(series: number[], window: number): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < series.length; i++) {
    acc += series[i];
    if (i >= window) acc -= series[i - window];
    if (i >= window - 1) out.push(acc / window);
    else out.push(series[i]);
  }
  return out;
}

/** 加法季节分解：趋势=周期滑动平均，季节=去趋势后的周期均值，残差=余项 */
export function seasonalDecompose(series: number[], period: number): IDecomposed {
  const n = series.length;
  const trend: number[] = [];
  for (let i = 0; i < n; i++) {
    const half = Math.floor(period / 2);
    let lo = i - half;
    let hi = i + (period - half) - 1;
    lo = Math.max(0, lo);
    hi = Math.min(n - 1, hi);
    let s = 0;
    let c = 0;
    for (let j = lo; j <= hi; j++) {
      s += series[j];
      c++;
    }
    trend.push(s / c);
  }
  const detrend = series.map((v, i) => v - trend[i]);
  const season = new Array<number>(period).fill(0);
  const seasonCount = new Array<number>(period).fill(0);
  for (let i = 0; i < n; i++) {
    const k = i % period;
    season[k] += detrend[i];
    seasonCount[k]++;
  }
  for (let k = 0; k < period; k++) season[k] = seasonCount[k] > 0 ? season[k] / seasonCount[k] : 0;
  const residual = series.map((v, i) => v - trend[i] - season[i % period]);
  return { trend, seasonal: season, residual };
}
