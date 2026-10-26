import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Database, Trash2, Check } from 'lucide-react';
import { useDatasetStore } from '@/data/store-context';
import { BUILTIN_DATASETS } from '@/data/datasets';
import type { ITimeSeriesDataset } from '@/data/types';

export interface DatasetSectionProps {
  onImportClick: () => void;
}

function StatsPills({ ds }: { ds: ITimeSeriesDataset }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
      <span className="rounded bg-muted px-1.5 py-0.5">{ds.zones.length} 区域</span>
      <span className="rounded bg-muted px-1.5 py-0.5">{ds.timePoints.length.toLocaleString()} 时间点</span>
      {ds.freqMinutes > 0 ? <span className="rounded bg-muted px-1.5 py-0.5">每 {ds.freqMinutes} 分钟</span> : null}
      {ds.geoMatchRate > 0 ? (
        <span className="rounded bg-muted px-1.5 py-0.5">地图匹配 {Math.round(ds.geoMatchRate * 100)}%</span>
      ) : null}
    </div>
  );
}

function DatasetCard({
  ds,
  statsDs,
  badge,
  active,
  loading,
  onLoad,
  onDelete,
}: {
  ds: { id: string; name: string; desc: string };
  statsDs?: ITimeSeriesDataset | null;
  badge?: string;
  active: boolean;
  loading: boolean;
  onLoad: () => void;
  onDelete?: () => void;
}) {
  return (
    <Card className={`relative transition-colors ${active ? 'border-primary/60 bg-primary/5' : 'bg-card/60 hover:border-border'}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 shrink-0 text-primary" />
              <div className="truncate font-medium text-foreground">{ds.name}</div>
              {active ? <Badge className="shrink-0 bg-primary/15 text-primary">使用中</Badge> : null}
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{ds.desc}</p>
          </div>
          {onDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-400"
              onClick={onDelete}
              aria-label="删除导入的数据集"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          {statsDs && statsDs.zones.length > 0 ? (
            <StatsPills ds={statsDs} />
          ) : badge ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{badge}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          )}
          {active ? (
            <Check className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Button size="sm" variant="outline" onClick={onLoad} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              加载
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DatasetSection({ onImportClick }: DatasetSectionProps) {
  const { current, loadedBuiltins, imported, loading, loadingId, loadBuiltin, setCurrent, removeImported } =
    useDatasetStore();

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">选择或导入数据集</h2>
        <Button onClick={onImportClick}>
          <Plus className="h-4 w-4" />
          导入我的数据
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {BUILTIN_DATASETS.map((meta) => {
          const loaded = loadedBuiltins.find((d) => d.id === meta.id);
          return (
            <DatasetCard
              key={meta.id}
              ds={meta}
              statsDs={loaded ?? null}
              badge={meta.badge}
              active={current?.id === meta.id}
              loading={loading && loadingId === meta.id}
              onLoad={() => void loadBuiltin(meta.id)}
            />
          );
        })}
        {imported.map((ds) => (
          <DatasetCard
            key={ds.id}
            ds={ds}
            statsDs={ds}
            active={current?.id === ds.id}
            loading={false}
            onLoad={() => setCurrent(ds)}
            onDelete={() => removeImported(ds.id)}
          />
        ))}
      </div>
      <div className="text-[11px] text-muted-foreground">
        提示：导入的数据保存在当前浏览器中（换设备不共享）；内置数据来自应用自带文件，可随时重新加载。
      </div>
    </section>
  );
}
