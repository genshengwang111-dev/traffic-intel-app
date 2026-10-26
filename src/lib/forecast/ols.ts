// 最小二乘线性代数工具
// EXPORTS: solveOLS, predictPoly, linspace

/** 高斯消元（带部分主元）解线性方程组 Ax = b */
function gaussSolve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // 找主元
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-14) continue;
    if (piv !== col) {
      const tmp = M[col];
      M[col] = M[piv];
      M[piv] = tmp;
    }
    const pv = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (Math.abs(f) < 1e-15) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

/**
 * 普通最小二乘（可选岭正则）：y ≈ X * beta
 * xRows: 每行是样本的特征向量（含常数项请自行加 1）
 * ridge: 岭正则强度（加在对角），用于稳定病态/近共线设计矩阵
 */
export function solveOLS(xRows: number[][], y: number[], ridge = 0): number[] {
  const p = xRows[0]?.length ?? 0;
  if (p === 0 || y.length === 0) return [];
  const A: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const b = new Array<number>(p).fill(0);
  for (let i = 0; i < y.length; i++) {
    const row = xRows[i];
    for (let r = 0; r < p; r++) {
      b[r] += row[r] * y[i];
      for (let c = 0; c < p; c++) A[r][c] += row[r] * row[c];
    }
  }
  if (ridge > 0) {
    // 岭正则：以对角线平均幅度为基准加少量扰动，避免破坏量纲
    let diagAvg = 0;
    for (let r = 0; r < p; r++) diagAvg += A[r][r];
    diagAvg /= Math.max(1, p);
    const lam = ridge * Math.max(diagAvg, 1e-12);
    for (let r = 0; r < p; r++) A[r][r] += lam;
  }
  return gaussSolve(A, b);
}

/** 多项式拟合预测：给定 [1, t, t², ..., t^d] 的特征构造 */
export function polyFeatures(t: number, degree: number): number[] {
  const out: number[] = [];
  let v = 1;
  for (let d = 0; d <= degree; d++) {
    out.push(v);
    v *= t;
  }
  return out;
}

export function predictPoly(beta: number[], t: number): number {
  let s = 0;
  for (let d = 0; d < beta.length; d++) s += beta[d] * t ** d;
  return s;
}

export function linspace(a: number, b: number, n: number): number[] {
  const out: number[] = [];
  if (n === 1) return [a];
  for (let i = 0; i < n; i++) out.push(a + ((b - a) * i) / (n - 1));
  return out;
}
