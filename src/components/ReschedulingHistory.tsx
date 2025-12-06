import { useState, useEffect } from 'react';
import { History, Calendar, MapPin, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type UpdateType = 'reschedule' | 'cancel' | 'venue_change' | 'time_change' | 'info_update';

interface EventUpdate {
  id: string;
  original_post_id: string;
  update_post_id: string | null;
  update_type: UpdateType;
  old_date: string | null;
  new_date: string | null;
  reason: string | null;
  detected_at: string;
}

interface ReschedulingHistoryProps {
  postId: string;
}

export function ReschedulingHistory({ postId }: ReschedulingHistoryProps) {
  const [updates, setUpdates] = useState<EventUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchUpdates() {
      const { data, error } = await supabase
        .from('event_updates')
        .select('*')
        .eq('original_post_id', postId)
        .order('detected_at', { ascending: false });

      if (!error && data) {
        setUpdates(data as EventUpdate[]);
      }
      setIsLoading(false);
    }

    fetchUpdates();
  }, [postId]);

  if (isLoading || updates.length === 0) return null;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getUpdateIcon = (type: string) => {
    switch (type) {
      case 'reschedule': return Calendar;
      case 'cancel': return AlertTriangle;
      case 'venue_change': return MapPin;
      case 'time_change': return Clock;
      default: return History;
    }
  };

  const getUpdateLabel = (type: string) => {
    switch (type) {
      case 'reschedule': return 'Rescheduled';
      case 'cancel': return 'Cancelled';
      case 'venue_change': return 'Venue Changed';
      case 'time_change': return 'Time Changed';
      default: return 'Updated';
    }
  };

  return (
    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
        <History className="h-4 w-4" />
        <span className="font-medium text-sm">Event Update History</span>
      </div>
      
      <div className="space-y-2">
        {updates.map((update) => {
          const Icon = getUpdateIcon(update.update_type);
          return (
            <div 
              key={update.id}
              className="flex items-start gap-2 text-sm"
            >
              <Icon className="h-4 w-4 mt-0.5 text-amber-600" />
              <div>
                <span className="font-medium">{getUpdateLabel(update.update_type)}</span>
                {update.old_date && update.new_date && (
                  <span className="text-muted-foreground">
                    : {formatDate(update.old_date)} → {formatDate(update.new_date)}
                  </span>
                )}
                {update.reason && (
                  <span className="text-muted-foreground italic ml-1">
                    ({update.reason})
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
