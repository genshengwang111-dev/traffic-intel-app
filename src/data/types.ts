// EXPORTS: IZoneFeature, ITimeSeriesDataset, IBuiltinDatasetMeta

/** 一个区域的地理边界（可包含多个环，如带洞的多边形） */
export interface IZoneFeature {
  /** 与 CSV 列名匹配的键 */
  name: string;
  /** 展示用名称（可读） */
  label: string;
  /** 多边形环：每个环是 [lng, lat] 点序列 */
  rings: [number, number][][];
}

/** 统一的时间序列面板数据集：行=时间，列=区域 */
export interface ITimeSeriesDataset {
  /** 唯一标识 */
  id: string;
  /** 展示名 */
  name: string;
  /** 一句话说明 */
  desc: string;
  /** 数据来源：内置 or 用户导入 */
  source: 'builtin' | 'imported';
  /** 采样间隔（分钟） */
  freqMinutes: number;
  /** 时间点（ISO 字符串） */
  timePoints: string[];
  /** 区域名称列表（CSV 列名） */
  zones: string[];
  /** 数值矩阵 values[timeIdx][zoneIdx] */
  values: number[][];
  /** 地理边界（可为 null） */
  geo: IZoneFeature[] | null;
  /** 地图匹配率 0~1（区域数中能在地图上画出来的比例） */
  geoMatchRate: number;
  /** 导入时间戳（导入数据时用） */
  importedAt?: number;
}

/** 内置数据集注册信息 */
export interface IBuiltinDatasetMeta {
  id: string;
  name: string;
  desc: string;
  /** 数据文件相对路径（public/data 下） */
  csvPath: string;
  geojsonPath?: string;
  /** geojson 属性名，用于与 CSV 列名匹配 */
  geoKey: string;
  /** 采样间隔（分钟） */
  freqMinutes: number;
  badge: string;
}
