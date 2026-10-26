import { useCallback, useEffect, useRef, useState } from 'react';
import { DatasetStoreContext, type IDatasetStoreState } from './store-context';
import { BUILTIN_DATASETS } from './datasets';
import type { ITimeSeriesDataset } from './types';
import { buildDatasetFromText, loadBuiltinDataset, parseGeoJsonText, geoMatchRate } from '@/lib/csv';

const NS = 'traffic-intel-app';

/** 尝试的 GeoJSON 属性名（按优先级） */
const GEO_KEYS = ['name', 'NAME', 'NAME_3', 'NIL', 'unique_id', 'id', 'ID', 'zone', 'zone_id', 'NAME_2', 'NAME_1', 'Name'];

function loadImportedCache(): ITimeSeriesDataset[] {
  try {
    const raw = localStorage.getItem(`${NS}:imported`);
    return raw ? (JSON.parse(raw) as ITimeSeriesDataset[]) : [];
  } catch {
    return [];
  }
}

function saveImported(dsList: ITimeSeriesDataset[]) {
  try {
    localStorage.setItem(`${NS}:imported`, JSON.stringify(dsList));
  } catch {
    // 隐私模式静默降级
  }
}

export default function DatasetProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrentState] = useState<ITimeSeriesDataset | null>(null);
  const [loadedBuiltins, setLoadedBuiltins] = useState<ITimeSeriesDataset[]>([]);
  const [imported, setImported] = useState<ITimeSeriesDataset[]>(loadImportedCache);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  const loadBuiltin = useCallback(async (id: string) => {
    const meta = BUILTIN_DATASETS.find((d) => d.id === id);
    if (!meta) return;
    setLoading(true);
    setLoadingId(id);
    setError(null);
    try {
      const cached = loadedBuiltins.find((d) => d.id === id);
      const ds = cached ?? (await loadBuiltinDataset(meta));
      if (!cached) {
        setLoadedBuiltins((prev) => (prev.some((d) => d.id === id) ? prev : [...prev, ds]));
      }
      setCurrentState(ds);
    } catch (e) {
      setError(`加载「${meta.name}」失败：${String(e)}`);
    } finally {
      setLoading(false);
      setLoadingId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 启动时自动加载第一个内置数据集（米兰）
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    void loadBuiltin(BUILTIN_DATASETS[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importFiles = useCallback(
    async (csvText: string, geoJsonText: string | null, name?: string): Promise<ITimeSeriesDataset> => {
      const id = `imported-${Date.now()}`;
      let geoKey: string | undefined;
      if (geoJsonText) {
        // 自动探测 geoKey：尝试常见属性名，选择匹配率最高的
        let bestKey: string | undefined;
        let bestRate = 0;
        for (const k of GEO_KEYS) {
          try {
            const feats = parseGeoJsonText(geoJsonText, k);
            if (feats.length === 0) continue;
            const rate = feats.length > 0 ? 1 : 0;
            if (rate > bestRate) {
              bestRate = rate;
              bestKey = k;
            }
          } catch {
            // 跳过
          }
        }
        geoKey = bestKey;
      }
      const ds = buildDatasetFromText(id, name ?? '导入数据集', '用户导入的流量面板数据', csvText, geoJsonText ?? undefined, geoKey);
      if (ds.geo) {
        ds.geoMatchRate = geoMatchRate(ds.zones, ds.geo);
      }
      setImported((prev) => {
        const next = [...prev, ds].slice(-5);
        saveImported(next);
        return next;
      });
      setCurrentState(ds);
      return ds;
    },
    [],
  );

  const setCurrent = useCallback((ds: ITimeSeriesDataset) => {
    setCurrentState(ds);
    setError(null);
  }, []);

  const removeImported = useCallback((id: string) => {
    setImported((prev) => {
      const next = prev.filter((d) => d.id !== id);
      saveImported(next);
      return next;
    });
    setCurrentState((cur) => (cur && cur.id === id ? null : cur));
  }, []);

  const value: IDatasetStoreState = {
    current,
    loadedBuiltins,
    imported,
    loading,
    loadingId,
    error,
    loadBuiltin,
    importFiles,
    setCurrent,
    removeImported,
  };

  return <DatasetStoreContext.Provider value={value}>{children}</DatasetStoreContext.Provider>;
}
