import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeBounds, ringsToPath, valueColor, valueColorStops } from '@/lib/geo';

export interface IGeoMapEntry {
  name: string;
  label: string;
  rings: [number, number][][];
  value: number | null;
}

export interface GeoMapProps {
  entries: IGeoMapEntry[];
  height?: number;
  min?: number;
  max?: number;
  selectedName?: string | null;
  onSelect?: (name: string) => void;
  showLegend?: boolean;
  /** 有值区域为空时显示 */
  emptyLabel?: string;
  valueFormatter?: (v: number) => string;
  unit?: string;
  /** 自定义着色（如离散类别色）；缺省用连续色带 */
  colorFor?: (entry: IGeoMapEntry) => string;
}

const VB_W = 800;
const VB_H = 600;

export default function GeoMap({
  entries,
  height = 480,
  min,
  max,
  selectedName,
  onSelect,
  showLegend = true,
  emptyLabel,
  valueFormatter,
  unit,
  colorFor,
}: GeoMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [hover, setHover] = useState<{ name: string; label: string; value: number | null; x: number; y: number } | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; tx: number; ty: number } | null>(null);

  const bounds = useMemo(() => computeBounds(entries.map((e) => e.rings)), [entries]);

  const vMin = min ?? Math.min(...entries.filter((e) => e.value !== null).map((e) => e.value as number), 0);
  const vMax = max ?? Math.max(...entries.filter((e) => e.value !== null).map((e) => e.value as number), 1);
  const range = vMax - vMin > 1e-9 ? vMax - vMin : 1;

  const fillFor = useCallback(
    (v: number | null) => {
      if (v === null || !Number.isFinite(v)) return 'rgba(148,163,184,0.18)';
      return valueColor((v - vMin) / range);
    },
    [vMin, range],
  );

  // 滚轮缩放（阻止页面滚动）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * VB_W;
      const my = ((e.clientY - rect.top) / rect.height) * VB_H;
      setScale((s) => {
        const next = Math.min(12, Math.max(1, s * (1 - e.deltaY * 0.0012)));
        const k = next / s;
        setTx((t) => mx - (mx - t) * k);
        setTy((t) => my - (my - t) * k);
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { sx: e.clientX, sy: e.clientY, tx: tx, ty: ty };
  }, [tx, ty]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const drag = dragRef.current;
      if (drag) {
        const dx = (e.clientX - drag.sx) * (VB_W / (containerRef.current?.getBoundingClientRect().width || VB_W));
        const dy = (e.clientY - drag.sy) * (VB_H / (containerRef.current?.getBoundingClientRect().height || VB_H));
        setTx(drag.tx + dx);
        setTy(drag.ty + dy);
      }
    },
    [],
  );

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const onPathMove = useCallback(
    (e: React.MouseEvent, entry: IGeoMapEntry) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHover({
        name: entry.name,
        label: entry.label,
        value: entry.value,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [],
  );

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl border border-border bg-[#0A111F]"
        style={{ height }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          dragRef.current = null;
          setHover(null);
        }}
      >
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {emptyLabel ?? '暂无地理边界数据（GeoJSON 未匹配）'}
          </div>
        ) : (
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-full w-full select-none" preserveAspectRatio="xMidYMid meet">
            <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
              {entries.map((entry) => {
                const d = ringsToPath(entry.rings, bounds, VB_W, VB_H);
                const isSelected = selectedName != null && selectedName === entry.name;
                const fill = colorFor ? colorFor(entry) : fillFor(entry.value);
                return (
                  <path
                    key={entry.name}
                    d={d}
                    fill={fill}
                    stroke={isSelected ? '#F59E0B' : 'rgba(10,17,31,0.65)'}
                    strokeWidth={isSelected ? 2 : 0.8}
                    className="cursor-pointer transition-[fill] duration-150"
                    onMouseEnter={(e) => onPathMove(e, entry)}
                    onMouseMove={(e) => onPathMove(e, entry)}
                    onClick={() => onSelect?.(entry.name)}
                  />
                );
              })}
            </g>
          </svg>
        )}

        {/* 缩放提示 */}
        <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-1 text-[11px] text-white/80">
          滚轮缩放 · 拖拽平移
        </div>

        {/* Tooltip */}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-border bg-[#101A2E]/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
            style={{ left: Math.min(hover.x + 12, 320), top: Math.max(hover.y - 8, 8) }}
          >
            <div className="font-medium text-foreground">{hover.label}</div>
            {hover.value !== null && Number.isFinite(hover.value) && (
              <div className="mt-0.5 text-muted-foreground">
                值：<span className="font-mono text-foreground">{valueFormatter ? valueFormatter(hover.value) : hover.value.toLocaleString()}</span>
                {unit ? ` ${unit}` : ''}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 图例 */}
      {showLegend && entries.length > 0 && (
        <div className="mt-2 flex items-center gap-3 px-1 text-[11px] text-muted-foreground">
          <span>低</span>
          <div
            className="h-2 flex-1 rounded-full"
            style={{
              background: `linear-gradient(to right, ${valueColorStops.map(([, c]) => c).join(', ')})`,
            }}
          />
          <span>高</span>
          <span className="ml-2 font-mono">
            {valueFormatter ? valueFormatter(vMin) : vMin.toLocaleString()} ~ {valueFormatter ? valueFormatter(vMax) : vMax.toLocaleString()}
          </span>
          {unit ? <span>{unit}</span> : null}
        </div>
      )}
    </div>
  );
}
