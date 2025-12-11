import { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface EventDate {
  id: string;
  instagram_post_id: string | null;
  published_event_id: string | null;
  event_date: string;
  event_time: string | null;
  end_time: string | null;  // End time per day
  venue_name: string | null;
  venue_address: string | null;
  created_at: string;
}

interface EventDatesDisplayProps {
  eventId: string;
  primaryDate: string | null;
  primaryEndDate?: string | null;
  primaryTime: string | null;
  primaryEndTime?: string | null;
  primaryVenue: string | null;
  isPublishedEvent?: boolean;
}

export function EventDatesDisplay({ 
  eventId, 
  primaryDate, 
  primaryEndDate,
  primaryTime,
  primaryEndTime,
  primaryVenue,
  isPublishedEvent = false
}: EventDatesDisplayProps) {
  const [additionalDates, setAdditionalDates] = useState<EventDate[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Detect multi-day immediately from props (no async needed)
  const isMultiDay = primaryEndDate && primaryDate && primaryEndDate !== primaryDate;

  useEffect(() => {
    async function fetchEventDates() {
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

  const formatTimeRange = (startTime: string | null, endTime: string | null) => {
    const start = formatTime(startTime);
    if (!start) return null;
    const end = formatTime(endTime);
    if (!end) return start;
    return `${start} - ${end}`;
  };

  const calculateDaySpan = (startDate: string, endDate: string): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const msPerDay = 1000 * 60 * 60 * 24;
    const diffInMs = end.getTime() - start.getTime();
    return Math.floor(diffInMs / msPerDay) + 1;
  };

  // Generate dates between start and end for display
  const generateDateRange = (start: string, end: string): string[] => {
    const dates: string[] = [];
    const current = new Date(start);
    const endDate = new Date(end);
    
    while (current <= endDate) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  // Show loading skeleton only briefly, but immediately show multi-day summary if we know it's multi-day
  if (isLoading && !isMultiDay) {
    // Single day or unknown - show minimal skeleton
    return (
      <div className="flex items-center gap-4 text-xs">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
    );
  }

  // Multi-day event (detected from props immediately, no loading needed for summary)
  if (isMultiDay && primaryDate && primaryEndDate) {
    const daySpan = calculateDaySpan(primaryDate, primaryEndDate);
    const timeRangeStr = formatTimeRange(primaryTime, primaryEndTime);
    
    // Use generated date range if no additional dates from DB yet
    const displayDates = additionalDates.length > 0 
      ? additionalDates.map(d => d.event_date)
      : generateDateRange(primaryDate, primaryEndDate);

    return (
      <div className="space-y-2">
        {/* Summary row - clickable */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-xs w-full text-left hover:bg-muted/50 -mx-1 px-1 py-0.5 rounded transition-colors"
        >
          <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="font-medium">{formatDateRange(primaryDate, primaryEndDate)}</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium">
            {daySpan}d
          </span>
          {timeRangeStr && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              {timeRangeStr}
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground ml-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>

        {/* Expanded date list */}
        {isExpanded && (
          <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2 space-y-1">
            {displayDates.map((dateStr, index) => {
              // Check if we have per-day time data from additionalDates
              const dateRecord = additionalDates.find(d => d.event_date === dateStr);
              const dayTimeRange = dateRecord 
                ? formatTimeRange(dateRecord.event_time, dateRecord.end_time)
                : timeRangeStr;
              
              return (
                <div 
                  key={`${dateStr}-${index}`}
                  className="flex items-center justify-between text-xs px-2 py-1"
                >
                  <span className="text-foreground">
                    {formatDate(dateStr)}
                  </span>
                  {dayTimeRange && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {dayTimeRange}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Check for additional dates from DB (legacy multi-day without primaryEndDate)
  if (additionalDates.length > 0 && primaryDate) {
    const allDatesWithDuplicates = [
      { event_date: primaryDate, event_time: primaryTime, venue_name: primaryVenue },
      ...additionalDates
    ].filter(d => d.event_date);
    
    const uniqueSlots = [...new Map(
      allDatesWithDuplicates.map(slot => [`${slot.event_date}-${slot.event_time}`, slot])
    ).values()];
    
    const allDates = uniqueSlots;
    const firstDate = allDates[0];
    const lastDate = allDates[allDates.length - 1];
    const daySpan = calculateDaySpan(firstDate.event_date, lastDate.event_date);
    const timeRangeStr = formatTimeRange(primaryTime, primaryEndTime);

    return (
      <div className="space-y-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-xs w-full text-left hover:bg-muted/50 -mx-1 px-1 py-0.5 rounded transition-colors"
        >
          <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="font-medium">{formatDateRange(firstDate.event_date, lastDate.event_date)}</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium">
            {daySpan}d
          </span>
          {timeRangeStr && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              {timeRangeStr}
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground ml-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>

        {isExpanded && (
          <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2 space-y-1">
            {allDates.map((date, index) => {
              // Use per-day time range if available from DB, otherwise fall back to primary
              const dayTimeRange = 'end_time' in date 
                ? formatTimeRange(date.event_time, (date as EventDate).end_time)
                : timeRangeStr;
              
              return (
                <div 
                  key={`${date.event_date}-${index}`}
                  className="flex items-center justify-between text-xs px-2 py-1"
                >
                  <span className="text-foreground">
                    {formatDate(date.event_date)}
                  </span>
                  {dayTimeRange && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {dayTimeRange}
                    </span>
                  )}
                  {date.venue_name && date.venue_name !== primaryVenue && (
                    <span className="flex items-center gap-1 text-muted-foreground ml-2">
                      <MapPin className="h-3 w-3" />
                      {date.venue_name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Single day event
  const timeRangeStr = formatTimeRange(primaryTime, primaryEndTime);
  
  return (
    <div className="flex items-center gap-4 text-xs">
      {primaryDate && (
        <div className="flex items-center gap-1.5">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{formatDate(primaryDate)}</span>
        </div>
      )}
      {timeRangeStr && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>{timeRangeStr}</span>
        </div>
      )}
    </div>
  );
}
