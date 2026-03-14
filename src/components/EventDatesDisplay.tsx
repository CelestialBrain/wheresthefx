import { useState } from 'react';
import { Calendar, Clock, ChevronDown } from 'lucide-react';

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
  primaryDate, 
  primaryEndDate,
  primaryTime,
  primaryEndTime,
  primaryVenue,
}: EventDatesDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isMultiDay = primaryEndDate && primaryDate && primaryEndDate !== primaryDate;

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
    return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  };

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

  // Multi-day event
  if (isMultiDay && primaryDate && primaryEndDate) {
    const daySpan = calculateDaySpan(primaryDate, primaryEndDate);
    const timeRangeStr = formatTimeRange(primaryTime, primaryEndTime);
    const displayDates = generateDateRange(primaryDate, primaryEndDate);

    return (
      <div className="space-y-2">
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

        {isExpanded && (
          <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2 space-y-1">
            {displayDates.map((dateStr, index) => (
              <div
                key={`${dateStr}-${index}`}
                className="flex items-center justify-between text-xs px-2 py-1"
              >
                <span className="text-foreground">{formatDate(dateStr)}</span>
                {timeRangeStr && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {timeRangeStr}
                  </span>
                )}
              </div>
            ))}
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
