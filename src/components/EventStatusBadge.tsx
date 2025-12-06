import { Badge } from '@/components/ui/badge';
import { AlertCircle, Calendar, Clock, HelpCircle, CheckCircle } from 'lucide-react';

export type EventStatus = 'confirmed' | 'rescheduled' | 'cancelled' | 'postponed' | 'tentative';

interface EventStatusBadgeProps {
  status: EventStatus | null | undefined;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig: Record<EventStatus, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}> = {
  confirmed: {
    label: 'Confirmed',
    icon: CheckCircle,
    className: 'bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20'
  },
  rescheduled: {
    label: 'Rescheduled',
    icon: Calendar,
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20'
  },
  cancelled: {
    label: 'Cancelled',
    icon: AlertCircle,
    className: 'bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20 line-through'
  },
  postponed: {
    label: 'Postponed',
    icon: Clock,
    className: 'bg-orange-500/10 text-orange-600 border-orange-500/20 hover:bg-orange-500/20'
  },
  tentative: {
    label: 'Tentative',
    icon: HelpCircle,
    className: 'bg-gray-500/10 text-gray-600 border-gray-500/20 hover:bg-gray-500/20'
  }
};

export function EventStatusBadge({ status, showIcon = true, size = 'md' }: EventStatusBadgeProps) {
  const safeStatus = status ?? 'confirmed';
  const config = statusConfig[safeStatus];
  
  // Don't show badge for confirmed events (default state)
  if (safeStatus === 'confirmed') {
    return null;
  }

  const Icon = config.icon;
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5'
  };

  return (
    <Badge 
      variant="outline"
      className={`${config.className} ${sizeClasses[size]} flex items-center gap-1`}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
}
