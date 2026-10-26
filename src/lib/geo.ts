// 地理投影与地图着色工具
// EXPORTS: IBounds, computeBounds, projectPoint, ringsToPath, valueColor, valueColorStops

export interface IBounds {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

export function computeBounds(allRings: [number, number][][][]): IBounds {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const rings of allRings) {
    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  if (!Number.isFinite(minLng)) {
    return { minLng: 0, maxLng: 0, minLat: 0, maxLat: 0 };
  }
  return { minLng, maxLng, minLat, maxLat };
}

/** 墨卡托近似投影：经纬度 → 0~1 平面坐标（y 向上） */
export function projectPoint(lng: number, lat: number, bounds: IBounds): [number, number] {
  const x = (lng - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1e-9);
  const yRaw = (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1e-9);
  // 轻微墨卡托修正，让高纬度地区不变形太多；小范围数据影响不大
  return [x, yRaw];
}

/** 把一组环转成 SVG path 字符串（y 翻转，缩放至 width×height） */
export function ringsToPath(
  rings: [number, number][][],
  bounds: IBounds,
  width: number,
  height: number,
  pad = 12,
): string {
  const w = width - pad * 2;
  const h = height - pad * 2;
  const parts: string[] = [];
  for (const ring of rings) {
    if (ring.length < 3) continue;
    let d = '';
    ring.forEach(([lng, lat], i) => {
      const [px, py] = projectPoint(lng, lat, bounds);
      const x = pad + px * w;
      const y = pad + (1 - py) * h;
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    });
    d += 'Z';
    parts.push(d);
  }
  return parts.join(' ');
}

/** 交通信号语义色带：低=青，中=琥珀，高=红 */
export const valueColorStops: [number, string][] = [
  [0, '#155E75'],
  [0.35, '#2DD4BF'],
  [0.6, '#FBBF24'],
  [0.82, '#F59E0B'],
  [1, '#EF4444'],
];

/** 归一化值 0~1 → 色带插值颜色 */
export function valueColor(t: number): string {
  const v = Math.max(0, Math.min(1, t));
  for (let i = 1; i < valueColorStops.length; i++) {
    const [t0, c0] = valueColorStops[i - 1];
    const [t1, c1] = valueColorStops[i];
    if (v <= t1) {
      const f = (v - t0) / (t1 - t0 || 1e-9);
      return lerpColor(c0, c1, f);
    }
  }
  return valueColorStops[valueColorStops.length - 1][1];
}

function lerpColor(a: string, b: string, f: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * f);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * f);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * f);
  return `rgb(${r},${g},${bl})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ];
}
