import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface RecurringEventBadgeProps {
  isRecurring?: boolean | null;
  pattern?: string | null;
  size?: 'sm' | 'default';
}

const PATTERN_LABELS: Record<string, string> = {
  'weekly:monday': 'Every Monday',
  'weekly:tuesday': 'Every Tuesday',
  'weekly:wednesday': 'Every Wednesday',
  'weekly:thursday': 'Every Thursday',
  'weekly:friday': 'Every Friday',
  'weekly:saturday': 'Every Saturday',
  'weekly:sunday': 'Every Sunday',
  'monthly:first-saturday': '1st Saturday monthly',
  'monthly:last-friday': 'Last Friday monthly',
  'daily': 'Daily',
  'biweekly': 'Every 2 weeks',
};

function parsePattern(pattern: string | null | undefined): string {
  if (!pattern) return 'Recurring';
  
  // Check exact match first
  if (PATTERN_LABELS[pattern.toLowerCase()]) {
    return PATTERN_LABELS[pattern.toLowerCase()];
  }
  
  // Parse weekly:day format
  const weeklyMatch = pattern.match(/^weekly:(\w+)$/i);
  if (weeklyMatch) {
    const day = weeklyMatch[1].charAt(0).toUpperCase() + weeklyMatch[1].slice(1).toLowerCase();
    return `Every ${day}`;
  }
  
  // Parse monthly:nth-day format
  const monthlyMatch = pattern.match(/^monthly:(\w+)-(\w+)$/i);
  if (monthlyMatch) {
    const nth = monthlyMatch[1];
    const day = monthlyMatch[2].charAt(0).toUpperCase() + monthlyMatch[2].slice(1).toLowerCase();
    return `${nth} ${day} monthly`;
  }
  
  return pattern;
}

export function RecurringEventBadge({ isRecurring, pattern, size = 'default' }: RecurringEventBadgeProps) {
  if (!isRecurring) return null;
  
  const label = parsePattern(pattern);
  const isSmall = size === 'sm';
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`bg-primary/10 text-primary border-primary/20 ${isSmall ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'}`}
          >
            <RefreshCw className={`${isSmall ? 'h-2.5 w-2.5' : 'h-3 w-3'} mr-1`} />
            {isSmall ? '🔄' : label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
