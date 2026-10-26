import { NavLink, Outlet } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { LayoutDashboard, LineChart, Boxes, BrainCircuit, BookOpen, Activity } from 'lucide-react';
import { useDatasetStore } from '@/data/store-context';

const NAV = [
  { path: '/', label: '概览', icon: LayoutDashboard, end: true },
  { path: '/explore', label: '探索分析', icon: LineChart },
  { path: '/cluster', label: '功能区聚类', icon: Boxes },
  { path: '/forecast', label: '预测建模', icon: BrainCircuit },
  { path: '/help', label: '帮助中心', icon: BookOpen },
];

export const Layout = () => {
  const { current, loading } = useDatasetStore();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Activity className="h-5 w-5" />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold text-foreground">智能流量分析</div>
              <div className="truncate text-[11px] text-muted-foreground">城市脉搏 · TrafficInsight</div>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>分析工作台</SidebarGroupLabel>
            <SidebarMenu>
              {NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild tooltip={item.label}>
                      <NavLink
                        to={item.path}
                        end={item.end}
                        className={({ isActive }) => (isActive ? 'text-primary' : '')}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">当前数据</div>
            <div className="truncate">{loading ? '加载中…' : current ? current.name : '未加载'}</div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-3 border-b border-border px-4">
          <SidebarTrigger />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">当前数据集：</span>
            <span className="font-medium text-foreground">
              {loading ? '加载中…' : current ? current.name : '未加载'}
            </span>
            {current ? (
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                {current.zones.length} 个区域 · {current.timePoints.length.toLocaleString()} 个时间点
              </span>
            ) : null}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};
