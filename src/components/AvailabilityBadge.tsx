import { Badge } from '@/components/ui/badge';
import { Ticket, AlertTriangle, Clock, Users } from 'lucide-react';

export type AvailabilityStatus = 'available' | 'sold_out' | 'waitlist' | 'limited' | 'few_left';

interface AvailabilityBadgeProps {
  status: AvailabilityStatus | null | undefined;
  showIcon?: boolean;
}

const availabilityConfig: Record<AvailabilityStatus, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}> = {
  available: {
    label: 'Available',
    icon: Ticket,
    className: 'bg-green-500/10 text-green-600 border-green-500/20'
  },
  sold_out: {
    label: 'SOLD OUT',
    icon: AlertTriangle,
    className: 'bg-red-600 text-white border-red-700 font-bold'
  },
  waitlist: {
    label: 'Waitlist Only',
    icon: Clock,
    className: 'bg-purple-500/10 text-purple-600 border-purple-500/20'
  },
  limited: {
    label: 'Limited Slots',
    icon: Users,
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20'
  },
  few_left: {
    label: '🔥 Few Left!',
    icon: AlertTriangle,
    className: 'bg-orange-500 text-white border-orange-600 animate-pulse font-semibold'
  }
};

export function AvailabilityBadge({ status, showIcon = true }: AvailabilityBadgeProps) {
  const safeStatus = status ?? 'available';
  const config = availabilityConfig[safeStatus];
  
  // Don't show badge for available (default state)
  if (safeStatus === 'available') return null;

  const Icon = config.icon;

  return (
    <Badge 
      variant="outline"
      className={`${config.className} flex items-center gap-1`}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
}
