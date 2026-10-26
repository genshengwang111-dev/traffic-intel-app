// KMeans 聚类与功能区识别
// EXPORTS: IKMeansResult, kmeans, elbowSse, silhouetteScore, buildDailyProfiles,
//          normalizeProfile, interpretCluster, clusterPalette

export interface IKMeansResult {
  centroids: number[][];
  labels: number[];
  sse: number;
  iters: number;
}

/** 标准 KMeans（Lloyd） */
export function kmeans(data: number[][], k: number, maxIter = 200, seed = 42): IKMeansResult {
  const n = data.length;
  const dim = data[0]?.length ?? 0;
  if (n === 0 || k <= 0) return { centroids: [], labels: [], sse: 0, iters: 0 };
  if (k >= n) k = n;
  // 随机选择初始中心（带种子，保证结果稳定）
  const rand = mulberry32(seed);
  const perm = [...Array(n).keys()].sort(() => rand() - 0.5);
  const centroids: number[][] = perm.slice(0, k).map((i) => [...data[i]]);
  const labels = new Array<number>(n).fill(0);
  let sse = Infinity;
  let iters = 0;
  for (let it = 0; it < maxIter; it++) {
    iters = it + 1;
    // 分配
    let changed = false;
    let curSse = 0;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist2(data[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        changed = true;
      }
      curSse += bestD;
    }
    sse = curSse;
    if (!changed) break;
    // 更新中心
    const sums = Array.from({ length: k }, () => new Array<number>(dim).fill(0));
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      counts[c]++;
      for (let d = 0; d < dim; d++) sums[c][d] += data[i][d];
    }
    for (let c = 0; c < k; c++) {
      for (let d = 0; d < dim; d++) {
        centroids[c][d] = counts[c] > 0 ? sums[c][d] / counts[c] : centroids[c][d];
      }
    }
  }
  return { centroids, labels, sse, iters };
}

/** 肘部法则：对 k=1..maxK 计算 SSE */
export function elbowSse(data: number[][], maxK = 10): { k: number; sse: number }[] {
  const out: { k: number; sse: number }[] = [];
  for (let k = 1; k <= maxK; k++) {
    const r = kmeans(data, k);
    out.push({ k, sse: r.sse });
  }
  return out;
}

/** 平均轮廓系数（衡量聚类分离度，越大越好，约 -1~1） */
export function silhouetteScore(data: number[][], labels: number[]): number {
  const n = data.length;
  if (n < 3) return 0;
  const k = Math.max(...labels) + 1;
  if (k >= n) return 0;
  let total = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    // a: 同类平均距离；b: 最近异类平均距离
    let a = 0;
    let aN = 0;
    let bBest = Infinity;
    for (let c = 0; c < k; c++) {
      let s = 0;
      let m = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        if (labels[j] === c) {
          s += Math.sqrt(dist2(data[i], data[j]));
          m++;
        }
      }
      if (m === 0) continue;
      const avg = s / m;
      if (c === labels[i]) {
        a = avg;
        aN = m;
      } else if (avg < bBest) {
        bBest = avg;
      }
    }
    if (aN === 0 || bBest === Infinity) continue;
    const s = (bBest - a) / Math.max(bBest, a);
    total += s;
    cnt++;
  }
  return cnt > 0 ? total / cnt : 0;
}

/** 构建区域日内曲线：按小时聚合的平均流量（24 维），并做 min-max 归一化 */
export function buildDailyProfiles(dates: Date[], series: number[][]): number[][] {
  const zones = series[0]?.length ?? 0;
  const profiles: number[][] = [];
  for (let z = 0; z < zones; z++) {
    const col = series.map((row) => row[z]);
    const hourSum = new Array<number>(24).fill(0);
    const hourN = new Array<number>(24).fill(0);
    for (let i = 0; i < col.length && i < dates.length; i++) {
      const h = dates[i].getHours();
      hourSum[h] += col[i];
      hourN[h]++;
    }
    const raw = hourSum.map((s, h) => (hourN[h] > 0 ? s / hourN[h] : 0));
    profiles.push(normalizeProfile(raw));
  }
  return profiles;
}

/** min-max 归一化到 [0,1] */
export function normalizeProfile(p: number[]): number[] {
  let mn = Infinity;
  let mx = -Infinity;
  for (const v of p) {
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (mx - mn < 1e-12) return p.map(() => 0.5);
  return p.map((v) => (v - mn) / (mx - mn));
}

export interface IClusterInterpretation {
  type: string;
  desc: string;
  emoji: string;
}

/** 依据日内曲线形态推断功能区类型（供非专业用户理解） */
export function interpretCluster(profile: number[]): IClusterInterpretation {
  // 计算几个关键量
  let total = 0;
  for (const v of profile) total += v;
  if (total < 1e-9) {
    return { type: '低活跃区', desc: '全天流量都很低，可能为郊区、工业仓储或非活跃区域。', emoji: '⚪' };
  }
  const mean = total / profile.length;
  const morning = mean3(profile, 7, 10); // 早高峰 7-10 点
  const evening = mean3(profile, 17, 20); // 晚高峰 17-20 点
  const day = mean3(profile, 10, 17); // 白天
  const night = mean3(profile, 22, 24) + mean3(profile, 0, 6); // 夜间 22-6
  const nightMean = night / 8;
  const isDoublePeak = morning > mean * 1.15 && evening > mean * 1.15 && Math.abs(morning - evening) < Math.max(morning, evening) * 0.4;
  const isDayActive = day > mean * 1.1 && nightMean < mean * 0.85;
  const isNightActive = nightMean > mean * 1.05 && day < mean * 0.95;
  const flat = (Math.max(...profile) - Math.min(...profile)) / mean < 0.35;

  if (isDoublePeak) {
    return { type: '通勤双峰区（混合功能区）', desc: '早晚各出现一个明显高峰，符合“白天去上班、晚上回家”的通勤模式，常见于住宅与办公混合地带。', emoji: '🌆' };
  }
  if (isDayActive) {
    return { type: '日间活跃区（商业/办公区）', desc: '白天流量高、夜间明显回落，常见于写字楼、商业中心、学校等白天活动的场所。', emoji: '🏢' };
  }
  if (isNightActive) {
    return { type: '夜间活跃区（居住/娱乐区）', desc: '夜间流量高于白天，常见于居住区、餐饮娱乐或夜生活聚集地。', emoji: '🌙' };
  }
  if (flat) {
    return { type: '平稳低波动区（居住/工业区）', desc: '全天流量变化不大，波动小，常见于稳定的居住区或工业区。', emoji: '🏠' };
  }
  return { type: '混合型区域', desc: '曲线形态介于几种典型类型之间，功能构成较复杂。', emoji: '🌐' };
}

/** 聚类调色板（与主题图表色一致，供地图/曲线使用） */
export const clusterPalette = [
  '#2DD4BF', '#F59E0B', '#60A5FA', '#F472B6', '#A78BFA',
  '#34D399', '#FBBF24', '#818CF8', '#F87171', '#22D3EE',
];

function mean3(p: number[], from: number, to: number): number {
  let s = 0;
  let c = 0;
  for (let h = from; h < to; h++) {
    s += p[h % 24];
    c++;
  }
  return c > 0 ? s / c : 0;
}

function dist2(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += (a[i] - b[i]) ** 2;
  return s;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
