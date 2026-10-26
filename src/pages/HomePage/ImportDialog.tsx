import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { FileUp, FileJson, Loader2 } from 'lucide-react';
import { useDatasetStore } from '@/data/store-context';

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const { importFiles } = useDatasetStore();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [geoFile, setGeoFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const csvRef = useRef<HTMLInputElement | null>(null);
  const geoRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setCsvFile(null);
    setGeoFile(null);
    setName('');
    if (csvRef.current) csvRef.current.value = '';
    if (geoRef.current) geoRef.current.value = '';
  };

  const handleImport = async () => {
    if (!csvFile) {
      toast.error('请先选择 CSV 数据文件');
      return;
    }
    setBusy(true);
    try {
      const csvText = await csvFile.text();
      const geoText = geoFile ? await geoFile.text() : null;
      const ds = await importFiles(csvText, geoText, name.trim() || csvFile.name.replace(/\.csv$/i, ''));
      toast.success(`导入成功：${ds.name}（${ds.zones.length} 个区域，${ds.timePoints.length.toLocaleString()} 个时间点）`);
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(`导入失败：${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>导入自己的流量数据</DialogTitle>
          <DialogDescription>
            选择一份 CSV 面板数据（第一列为时间，其余列为各区域），可选配 GeoJSON 边界用于地图展示。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="csv">CSV 数据文件（必需）</Label>
            <label
              htmlFor="csv"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary"
            >
              <FileUp className="h-4 w-4" />
              {csvFile ? csvFile.name : '点击选择 CSV 文件（.csv）'}
            </label>
            <input
              id="csv"
              ref={csvRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="geo">GeoJSON 边界文件（可选）</Label>
            <label
              htmlFor="geo"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary"
            >
              <FileJson className="h-4 w-4" />
              {geoFile ? geoFile.name : '点击选择 GeoJSON 文件（用于地图）'}
            </label>
            <input
              id="geo"
              ref={geoRef}
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              className="hidden"
              onChange={(e) => setGeoFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dsname">数据集名称（可选）</Label>
            <Input
              id="dsname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="默认使用文件名"
            />
          </div>
          <div className="text-[11px] leading-relaxed text-muted-foreground">
            提示：时间格式支持 2024-01-01 00:00 或 2024-01-01T00:00；采样间隔会自动识别；
            区域名称会与 GeoJSON 的 name / NAME_3 / NIL / unique_id 等常见字段自动匹配。
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={handleImport} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            导入并切换到该数据集
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
