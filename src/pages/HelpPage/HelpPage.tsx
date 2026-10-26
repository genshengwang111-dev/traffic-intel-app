import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ALGORITHMS } from '@/lib/forecast/registry';
import { metricMetaList } from '@/lib/metrics';
import { Badge } from '@/components/ui/badge';
import { ExplainBlock } from '@/components/Explain';

const CONCEPTS = [
  {
    title: '什么是时间序列数据？',
    body: '就是"按固定时间间隔记录下来的数值序列"。本工具里的交通流量数据就是这样的：每隔 10 分钟（或 15 分钟）记录一次每个区域的流量，于是每个区域都有一条随时间变化的曲线。',
  },
  {
    title: '什么是周期 / 季节性？',
    body: '流量会按天规律性地起伏：白天高、深夜低、早晚高峰明显，周末和工作日也不同。这种"以一天为周期反复出现"的规律就叫周期（季节）性。很多预测方法正是利用这种规律来预报未来的。',
  },
  {
    title: '什么是趋势？',
    body: '指数据在较长时期内整体上升或下降的方向。比如一个区域流量整体在增长，就是有上升趋势。趋势和周期性是时间序列最核心的两个结构。',
  },
  {
    title: '什么是聚类？有什么用？',
    body: '聚类是把"行为相似"的区域自动归为一类，无需人工预设标签。比如有些区域"白天人多晚上人少"，另一些"晚上特别活跃"，聚类会把它们分别找出来。通过聚类可以发现城市的功能区（商业区、居住区、混合区等）。',
  },
  {
    title: '什么是预测模型的训练与验证？',
    body: '把历史数据切成两段：前一段给模型"学习"（训练），后一段先藏起来（验证集）。模型学完后，让它预测后一段，再拿真实值和预测值对比，算出误差。误差小的模型就是好模型。本工具还会把最后一段作为"未来"继续外推。',
  },
  {
    title: '为什么需要"输入长度"和"预测长度"？',
    body: '输入长度是喂给模型的最近多少条历史数据；预测长度是你想往未来预测多少步（同时也是验证时"藏起来"的长度）。预测长度越长，难度越大、误差通常也越大。',
  },
];

const FAQS = [
  {
    q: '如何导入自己的数据？',
    a: '进入"概览"页，点击"导入数据"，选择一份 CSV 文件（第一列为时间，其余列是各区域），可再选一份 GeoJSON（可选，用于地图展示）。系统会自动识别时间列和区域列，并尝试把区域名与地图匹配起来。',
  },
  {
    q: '我的数据是别的城市/别的指标，能直接用吗？',
    a: '可以。只要满足"第一列是时间、其余列是数值"的面板结构就能分析。时间格式如 2024-01-01 00:00 或 2024-01-01T00:00 均可。采样间隔（10/15/60 分钟等）会被自动识别，一天的数据步数会自动作为季节周期。',
  },
  {
    q: '地图上有些区域是灰色？',
    a: '灰色表示该区域没有匹配到 GeoJSON 里的多边形边界（可能是名称不一致或没有地理文件）。这不影响时间曲线分析和预测，只影响地图着色。',
  },
  {
    q: '预测误差多少算好？',
    a: '要看单位。更通用的标准是 MAPE（百分比误差）：一般低于 10% 算很好，10%~20% 不错，20%~30% 可接受。也可以看 MASE：小于 1 说明比"无脑重复上一天"更好。',
  },
  {
    q: '为什么不同算法预测结果差很多？',
    a: '每种算法对数据规律的理解不同：有的擅长抓周期，有的擅长抓趋势，有的擅长抓短期惯性。这正是本工具提供"模型推荐"和"多模型对比"的原因——用验证误差说话，而不是靠感觉。',
  },
  {
    q: '数据存在哪里？会不会上传？',
    a: '所有数据都在你自己的浏览器里处理：内置数据来自本应用自带文件，导入的数据只保存在当前浏览器（localStorage）。换设备或清理浏览器数据后，导入的数据会丢失，内置数据随时可重新加载。',
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  统计模型: 'bg-primary/15 text-primary border-primary/30',
  机器学习: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  深度学习: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
};

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">帮助中心</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          从零讲起：数据、概念、算法与指标，让非专业用户也能看懂每一次分析。
        </p>
      </div>

      <ExplainBlock title="一句话理解这个工具">
        这是一座城市的"流量体检中心"：先看数据长什么样（探索分析），再发现城市的功能分区（聚类），
        然后像天气预报一样预测未来流量（预测建模），全程用大白话解释每一步在做什么。
      </ExplainBlock>

      {/* 数据格式 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">支持的数据格式</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <div className="mb-1 font-medium text-foreground">CSV 面板数据（必需）</div>
            <div className="text-sm leading-relaxed text-muted-foreground">
              第一列是时间（如 <code className="rounded bg-muted px-1">2024-01-01 00:00</code>），
              其余每列是一个区域，单元格是该时刻该区域的流量值。
            </div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
{`时间,区域A,区域B,区域C
2024-01-01 00:00,100,80,50
2024-01-01 00:10,120,90,55`}
            </pre>
          </div>
          <div className="rounded-lg border border-border p-4">
            <div className="mb-1 font-medium text-foreground">GeoJSON 边界（可选）</div>
            <div className="text-sm leading-relaxed text-muted-foreground">
              每个区域的多边形边界，用于在地图上着色。系统会自动尝试用 name / NAME_3 / NIL / unique_id 等常见字段与 CSV 列名匹配。
            </div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
{`{ "type":"FeatureCollection",
  "features":[ { "type":"Feature",
    "properties":{ "name":"区域A" },
    "geometry":{ "type":"Polygon",
      "coordinates":[[[117,36],[117,36.1],...]] } } ] }`}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* 核心概念 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">核心概念（大白话版）</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {CONCEPTS.map((c, i) => (
              <AccordionItem key={c.title} value={`c${i}`}>
                <AccordionTrigger className="text-sm">{c.title}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{c.body}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* 预测算法 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">10 种预测算法简介</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {ALGORITHMS.map((a) => (
              <div key={a.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-foreground">{a.name}</div>
                  <Badge variant="outline" className={`${CATEGORY_COLORS[a.category] ?? ''}`}>
                    {a.category}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{a.tagline}</div>
                <div className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{a.detail}</div>
                {a.params.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.params.map((p) => (
                      <span key={p.key} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {p.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-[11px] text-muted-foreground/70">无需调参，开箱即用</div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 评估指标 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">评估指标怎么读</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {metricMetaList.map((m) => (
              <div key={m.key} className="rounded-lg border border-border p-4">
                <div className="font-medium text-foreground">{m.label}</div>
                <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.desc}</div>
                <div className="mt-1.5 text-[11px] text-primary">
                  {m.better === 'low' ? '越小越好' : '越大越好'}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">常见问题</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={`f${i}`}>
                <AccordionTrigger className="text-sm">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
