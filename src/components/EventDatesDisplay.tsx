import { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface EventDate {
  id: string;
  instagram_post_id: string | null;
  published_event_id: string | null;
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
  isPublishedEvent?: boolean; // True if eventId is a published_event_id
}

export function EventDatesDisplay({ 
  eventId, 
  primaryDate, 
  primaryTime,
  primaryVenue,
  isPublishedEvent = false
}: EventDatesDisplayProps) {
  const [additionalDates, setAdditionalDates] = useState<EventDate[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchEventDates() {
      // Query by the appropriate column based on event type
      const columnName = isPublishedEvent ? 'published_event_id' : 'instagram_post_id';
      
      const { data, error } = await supabase
        .from('event_dates')
        .select('*')
        .eq(columnName, eventId)
        .order('event_date', { ascending: true });

      if (error) {
        console.error('Failed to fetch event dates:', error);
      } else {
        setAdditionalDates(data || []);
      }
      setIsLoading(false);
    }

    fetchEventDates();
  }, [eventId, isPublishedEvent]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-PH', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateShort = (dateStr: string) => {
    const date = new Date(dateStr);
    const weekday = date.toLocaleDateString('en-PH', { weekday: 'short' });
    const day = date.getDate();
    return `${weekday} ${day}`;
  };

  const formatDateRange = (first: string, last: string) => {
    const f = new Date(first);
    const l = new Date(last);
    const fMonth = f.toLocaleDateString('en-PH', { month: 'short' });
    const lMonth = l.toLocaleDateString('en-PH', { month: 'short' });
    
    if (fMonth === lMonth) {
      return `${fMonth} ${f.getDate()}-${l.getDate()}`;
    }
    return `${fMonth} ${f.getDate()} - ${lMonth} ${l.getDate()}`;
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
      <div className="flex items-center gap-4 text-sm">
        {primaryDate && (
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-muted-foreground" />
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
  // Combine primary date with additional dates and deduplicate by date+time
  const allDatesWithDuplicates = [
    { event_date: primaryDate!, event_time: primaryTime, venue_name: primaryVenue },
    ...additionalDates
  ].filter(d => d.event_date);
  
  // Deduplicate by date + time combination
  const uniqueSlots = [...new Map(
    allDatesWithDuplicates.map(slot => [`${slot.event_date}-${slot.event_time}`, slot])
  ).values()];
  
  const allDates = uniqueSlots;

  const firstDate = allDates[0];
  const lastDate = allDates[allDates.length - 1];
  
  // Calculate actual day span (inclusive)
  const calculateDaySpan = (startDate: string, endDate: string): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const msPerDay = 1000 * 60 * 60 * 24;
    const diffInMs = end.getTime() - start.getTime();
    return Math.floor(diffInMs / msPerDay) + 1; // +1 because both days are inclusive
  };
  
  const daySpan = calculateDaySpan(firstDate.event_date, lastDate.event_date);

  return (
    <div className="space-y-2">
      {/* Summary row - clickable */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm w-full text-left hover:bg-muted/50 -mx-1 px-1 py-0.5 rounded transition-colors"
      >
        <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="font-medium">{formatDateRange(firstDate.event_date, lastDate.event_date)}</span>
        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium">
          {daySpan}d
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground ml-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded date list */}
      {isExpanded && (
        <div className="ml-5 space-y-1 text-sm">
          {allDates.map((date, index) => (
            <div 
              key={`${date.event_date}-${index}`}
              className="flex items-center gap-3 text-muted-foreground py-0.5"
            >
              <div className="w-1 h-1 rounded-full bg-muted-foreground/50 flex-shrink-0" />
              <span className="w-16">{formatDateShort(date.event_date)}</span>
              {date.event_time && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTime(date.event_time)}
                </span>
              )}
              {date.venue_name && date.venue_name !== primaryVenue && (
                <span className="flex items-center gap-1">
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
