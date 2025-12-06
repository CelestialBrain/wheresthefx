import { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface EventDate {
  id: string;
  instagram_post_id: string;
  event_date: string;
  event_time: string | null;
  venue_name: string | null;
  venue_address: string | null;
  created_at: string;
}

interface EventDatesDisplayProps {
  eventId: string;
  primaryDate: string | null;
  primaryTime: string | null;
  primaryVenue: string | null;
}

export function EventDatesDisplay({ 
  eventId, 
  primaryDate, 
  primaryTime,
  primaryVenue 
}: EventDatesDisplayProps) {
  const [additionalDates, setAdditionalDates] = useState<EventDate[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchEventDates() {
      const { data, error } = await supabase
        .from('event_dates')
        .select('*')
        .eq('instagram_post_id', eventId)
        .order('event_date', { ascending: true });

      if (error) {
        console.error('Failed to fetch event dates:', error);
      } else {
        setAdditionalDates(data || []);
      }
      setIsLoading(false);
    }

    fetchEventDates();
  }, [eventId]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-PH', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Single day event
  if (additionalDates.length === 0) {
    return (
      <div className="flex items-center gap-4">
        {primaryDate && (
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-primary" />
            <span>{formatDate(primaryDate)}</span>
          </div>
        )}
        {primaryTime && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{formatTime(primaryTime)}</span>
          </div>
        )}
      </div>
    );
  }

  // Multi-day event
  const allDates = [
    { event_date: primaryDate!, event_time: primaryTime, venue_name: primaryVenue },
    ...additionalDates
  ].filter(d => d.event_date);

  const firstDate = allDates[0];
  const lastDate = allDates[allDates.length - 1];

  return (
    <div className="space-y-2">
      {/* Summary row */}
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-primary" />
        <span className="font-medium">
          {formatDate(firstDate.event_date)} - {formatDate(lastDate.event_date)}
        </span>
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
          {allDates.length} days
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <>Hide details <ChevronUp className="h-3 w-3 ml-1" /></>
          ) : (
            <>Show all dates <ChevronDown className="h-3 w-3 ml-1" /></>
          )}
        </Button>
      </div>

      {/* Expanded date list */}
      {isExpanded && (
        <div className="ml-6 space-y-1.5 border-l-2 border-primary/20 pl-4">
          {allDates.map((date, index) => (
            <div 
              key={`${date.event_date}-${index}`}
              className="flex items-center gap-4 text-sm py-1"
            >
              <span className="font-medium min-w-[100px]">
                {formatDate(date.event_date)}
              </span>
              {date.event_time && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTime(date.event_time)}
                </span>
              )}
              {date.venue_name && date.venue_name !== primaryVenue && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {date.venue_name}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
