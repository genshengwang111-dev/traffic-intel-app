// 数据集全局状态（Context 定义 + hook）
// EXPORTS: IDatasetStoreState, DatasetStoreContext, useDatasetStore

import { createContext, useContext } from 'react';
import type { ITimeSeriesDataset } from './types';

export interface IDatasetStoreState {
  /** 当前激活的数据集 */
  current: ITimeSeriesDataset | null;
  /** 已加载的内置数据集缓存 */
  loadedBuiltins: ITimeSeriesDataset[];
  /** 用户导入的数据集 */
  imported: ITimeSeriesDataset[];
  /** 是否正在加载内置数据集 */
  loading: boolean;
  /** 正在加载的数据集 id */
  loadingId: string | null;
  /** 错误信息 */
  error: string | null;
  /** 加载内置数据集 */
  loadBuiltin: (id: string) => Promise<void>;
  /** 从文本导入新数据集（csv 必填，geojson 可选） */
  importFiles: (csvText: string, geoJsonText: string | null, name?: string) => Promise<ITimeSeriesDataset>;
  /** 切换到指定数据集 */
  setCurrent: (ds: ITimeSeriesDataset) => void;
  /** 删除导入的数据集 */
  removeImported: (id: string) => void;
}

export const DatasetStoreContext = createContext<IDatasetStoreState | null>(null);

export function useDatasetStore(): IDatasetStoreState {
  const ctx = useContext(DatasetStoreContext);
  if (!ctx) throw new Error('useDatasetStore 必须在 DatasetProvider 内使用');
  return ctx;
}
