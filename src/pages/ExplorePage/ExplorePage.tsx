import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { useDatasetStore } from '@/data/store-context';
import TemporalSection from './TemporalSection';
import SpatialSection from './SpatialSection';

export default function ExplorePage() {
  const { current, loading } = useDatasetStore();
  const [zone, setZone] = useState<string>('');
  const [tab, setTab] = useState<string>('temporal');

  if (!current || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {loading ? '正在加载数据…' : '请先在「概览」页选择一个数据集。'}
      </div>
    );
  }

  const activeZone = current.zones.includes(zone) ? zone : current.zones[0];

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">探索分析</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            从时间与空间两个维度读懂「{current.name}」：什么时候忙、哪里忙、谁在带动整座城市的节奏。
          </p>
        </div>
        <div className="w-72 space-y-1.5">
          <Label>当前分析区域</Label>
          <Select value={activeZone} onValueChange={setZone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {current.zones.map((z) => (
                <SelectItem key={z} value={z}>
                  {z}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="temporal">时间动态</TabsTrigger>
          <TabsTrigger value="spatial">空间动态</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'temporal' ? (
        <TemporalSection key={activeZone} dataset={current} zone={activeZone} />
      ) : (
        <SpatialSection
          dataset={current}
          onSelectZone={(z) => {
            setZone(z);
            setTab('temporal');
          }}
        />
      )}
    </div>
  );
}
