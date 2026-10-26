// CSV / GeoJSON 解析与数据集构建
// EXPORTS: BASE, parseCsvText, parseGeoJsonText, buildDatasetFromText,
//          loadBuiltinDataset, inferFreqMinutes, geoMatchRate

import Papa from 'papaparse';
import type { IBuiltinDatasetMeta, ITimeSeriesDataset, IZoneFeature } from '@/data/types';

/** 应用根路径前缀（发布后为 /app/app_xxx；本地为 /） */
export const BASE = (import.meta.env.MIAODA_CLIENT_BASE_PATH || '').replace(/\/$/, '') + '/';

/** 解析 CSV 文本 → 行数组（string[][]） */
export function parseCsvText(text: string): string[][] {
  const res = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  });
  if (res.errors && res.errors.length > 0) {
    const fatal = res.errors.filter((e) => e.type === 'Delimiter' || e.type === 'FieldMismatch');
    if (fatal.length > 0) {
      throw new Error(`CSV 解析出错：${fatal[0].message}`);
    }
  }
  return res.data;
}

/** 解析 GeoJSON 文本 → 区域边界列表 */
export function parseGeoJsonText(text: string, geoKey: string): IZoneFeature[] {
  const obj = JSON.parse(text) as {
    features?: { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } }[];
  };
  const out: IZoneFeature[] = [];
  for (const f of obj.features ?? []) {
    const rawName = f.properties?.[geoKey];
    if (rawName === undefined || rawName === null) continue;
    const name = String(rawName).trim();
    const geom = f.geometry;
    if (!geom || !geom.coordinates) continue;
    const rings = extractRings(geom.type ?? '', geom.coordinates);
    if (rings.length === 0) continue;
    out.push({ name, label: name, rings });
  }
  return out;
}

/** 从 geometry 提取多边形环（支持 Polygon 与 MultiPolygon） */
function extractRings(type: string, coords: unknown): [number, number][][] {
  const rings: [number, number][][] = [];
  if (type === 'Polygon' && Array.isArray(coords)) {
    for (const ring of coords as unknown[][]) {
      const r = ringToPoints(ring);
      if (r.length > 0) rings.push(r);
    }
  } else if (type === 'MultiPolygon' && Array.isArray(coords)) {
    for (const poly of coords as unknown[][][]) {
      for (const ring of poly) {
        const r = ringToPoints(ring);
        if (r.length > 0) rings.push(r);
      }
    }
  }
  return rings;
}

function ringToPoints(ring: unknown): [number, number][] {
  if (!Array.isArray(ring)) return [];
  const out: [number, number][] = [];
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) out.push([lng, lat]);
  }
  return out;
}

/** 从 CSV 行与 GeoJSON 构建数据集 */
export function buildDatasetFromText(
  id: string,
  name: string,
  desc: string,
  csvText: string,
  geoJsonText?: string,
  geoKey?: string,
): ITimeSeriesDataset {
  const rows = parseCsvText(csvText);
  if (rows.length < 2) throw new Error('CSV 至少需要一行表头和一行业务数据。');
  const header = rows[0];
  // 识别时间列：默认第一列；若第一列不可解析则扫描
  let timeIdx = 0;
  let timePoints: string[] = [];
  let values: number[][] = [];
  const zones: string[] = [];

  for (let c = 0; c < header.length; c++) {
    if (c === timeIdx) continue;
    const zname = header[c].trim();
    if (zname === '') continue;
    zones.push(zname);
  }

  // 尝试解析时间列
  const tryTime = (idx: number): boolean => {
    let ok = 0;
    const pts: string[] = [];
    for (let r = 1; r < Math.min(rows.length, 30); r++) {
      const v = rows[r][idx];
      if (v === undefined || v.trim() === '') continue;
      const d = new Date(v.replace(' ', 'T'));
      if (!Number.isNaN(d.getTime())) ok++;
      pts.push(v.trim());
    }
    return ok >= Math.max(2, pts.length * 0.6);
  };
  if (!tryTime(0)) {
    // 扫描其他列
    let found = -1;
    for (let c = 1; c < Math.min(header.length, 6); c++) {
      if (tryTime(c)) {
        found = c;
        break;
      }
    }
    if (found === -1) throw new Error('未找到可识别的时间列（请确保第一列或前几列是时间，如 2024-01-01 00:00）。');
    timeIdx = found;
  }

  // 正式读取
  const seen = new Set<string>();
  for (let r = 1; r < rows.length; r++) {
    const raw = rows[r];
    const tv = raw[timeIdx];
    if (tv === undefined || tv.trim() === '') continue;
    const iso = tv.includes('T') ? tv : tv.replace(' ', 'T');
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const key = d.toISOString();
    if (seen.has(key)) continue; // 去重
    seen.add(key);
    timePoints.push(iso);
    const rowVals: number[] = [];
    for (let c = 0; c < header.length; c++) {
      if (c === timeIdx) continue;
      const zname = header[c].trim();
      if (zname === '') continue;
      const v = Number.parseFloat(raw[c]);
      rowVals.push(Number.isFinite(v) ? v : NaN);
    }
    values.push(rowVals);
  }
  if (timePoints.length < 2) throw new Error('未能解析出足够的时间点（至少需要 2 行）。');
  // 按时间排序
  const idxs = timePoints.map((_, i) => i).sort((a, b) => new Date(timePoints[a]).getTime() - new Date(timePoints[b]).getTime());
  timePoints = idxs.map((i) => timePoints[i]);
  values = idxs.map((i) => values[i]);

  const freq = inferFreqMinutes(timePoints);
  let geo: IZoneFeature[] | null = null;
  if (geoJsonText && geoKey) {
    const feats = parseGeoJsonText(geoJsonText, geoKey);
    if (feats.length > 0) geo = feats;
  }

  const ds: ITimeSeriesDataset = {
    id,
    name,
    desc,
    source: 'imported',
    freqMinutes: freq,
    timePoints,
    zones,
    values,
    geo,
    geoMatchRate: geo ? geoMatchRate(zones, geo) : 0,
    importedAt: Date.now(),
  };
  return ds;
}

/** 内置数据集：从 public/data 读取（.csv.gz 自动解压，适配部署平台的小文件限制） */
export async function loadBuiltinDataset(meta: IBuiltinDatasetMeta): Promise<ITimeSeriesDataset> {
  const csvPath = `${BASE}data/${meta.csvPath}`;
  let csvText: string;
  if (meta.csvPath.endsWith('.gz')) {
    const buf = await (await fetch(csvPath)).arrayBuffer();
    const ds = new DecompressionStream('gzip');
    const stream = new Response(new Blob([buf]).stream().pipeThrough(ds));
    csvText = await stream.text();
  } else {
    csvText = await (await fetch(csvPath)).text();
  }
  let geoText: string | undefined;
  if (meta.geojsonPath) {
    geoText = await (await fetch(`${BASE}data/${meta.geojsonPath}`)).text();
  }
  const ds = buildDatasetFromText(meta.id, meta.name, meta.desc, csvText, geoText, meta.geoKey);
  ds.source = 'builtin';
  ds.geoMatchRate = ds.geo ? geoMatchRate(ds.zones, ds.geo) : 0;
  return ds;
}

/** 推断采样间隔（分钟）：取相邻时间差众数 */
export function inferFreqMinutes(timePoints: string[]): number {
  if (timePoints.length < 2) return 0;
  const counts = new Map<number, number>();
  for (let i = 1; i < Math.min(timePoints.length, 3000); i++) {
    const d = (new Date(timePoints[i]).getTime() - new Date(timePoints[i - 1]).getTime()) / 60000;
    if (d > 0) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best = 0;
  let bestN = 0;
  for (const [k, v] of counts) {
    if (v > bestN) {
      bestN = v;
      best = k;
    }
  }
  return Math.round(best);
}

/** 计算 CSV 区域与地理边界名称的匹配率 */
export function geoMatchRate(zones: string[], geo: IZoneFeature[]): number {
  if (zones.length === 0) return 0;
  const geoSet = new Set(geo.map((g) => g.name.trim().toLowerCase()));
  let hit = 0;
  for (const z of zones) {
    if (geoSet.has(z.trim().toLowerCase())) hit++;
  }
  return hit / zones.length;
}

/** 区域的地理边界查找（大小写不敏感） */
export function findGeoByName(geo: IZoneFeature[] | null, zoneName: string): IZoneFeature | null {
  if (!geo) return null;
  const key = zoneName.trim().toLowerCase();
  return geo.find((g) => g.name.trim().toLowerCase() === key) ?? null;
}
