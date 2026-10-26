// 通俗解释组件：带图标的悬停解释 / 解释块
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, Lightbulb } from 'lucide-react';

export interface ExplainTipProps {
  text: string;
  className?: string;
}

/** 小问号图标，悬停显示通俗解释 */
export function ExplainTip({ text, className }: ExplainTipProps) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex cursor-help items-center text-muted-foreground ${className ?? ''}`}>
            <Info className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export interface ExplainBlockProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/** 一段带小灯泡图标的通俗解释 */
export function ExplainBlock({ title, children, className }: ExplainBlockProps) {
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground ${className ?? ''}`}>
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div>
        {title ? <div className="mb-0.5 font-medium text-foreground">{title}</div> : null}
        {children}
      </div>
    </div>
  );
}
