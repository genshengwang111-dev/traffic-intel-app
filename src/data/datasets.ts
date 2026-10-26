// 内置数据集注册表
// EXPORTS: BUILTIN_DATASETS

import type { IBuiltinDatasetMeta } from './types';

export const BUILTIN_DATASETS: IBuiltinDatasetMeta[] = [
  {
    id: 'milano',
    name: '米兰交通流量',
    desc: '2013 年 11 月起，米兰 88 个城市街区每 10 分钟的机动车流量（估计车辆数）。',
    csvPath: 'milano_traffic_nid.csv',
    geojsonPath: 'milano.geojson',
    geoKey: 'NIL',
    freqMinutes: 10,
    badge: '10 分钟 · 车辆数',
  },
  {
    id: 'trentino',
    name: '特伦蒂诺交通流量',
    desc: '特伦蒂诺省约 180 个市镇每 10 分钟的交通流量（估计车辆数）。',
    csvPath: 'trentino_traffic_nid.csv.gz',
    geojsonPath: 'trento.geojson',
    geoKey: 'NAME_3',
    freqMinutes: 10,
    badge: '10 分钟 · 车辆数',
  },
  {
    id: 'zte',
    name: '济南 4G 下行流量',
    desc: '济南市约 130 个街道/小区每 15 分钟的 4G 下行数据流量（字节）。',
    csvPath: 'zte_4g_down.region.csv',
    geojsonPath: 'zte_4g_down.traffic.geojson',
    geoKey: 'unique_id',
    freqMinutes: 15,
    badge: '15 分钟 · 字节',
  },
];
