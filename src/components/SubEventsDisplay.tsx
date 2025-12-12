import { Calendar, Clock, User, Music } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Json } from "@/integrations/supabase/types";

interface SubEvent {
  date?: string;
  time?: string;
  endTime?: string;
  title?: string;
  artist?: string;
  activity?: string;
  description?: string;
}

interface SubEventsDisplayProps {
  subEvents: Json | null;
  className?: string;
}

export const SubEventsDisplay = ({ subEvents, className = "" }: SubEventsDisplayProps) => {
  if (!subEvents || (Array.isArray(subEvents) && subEvents.length === 0)) {
    return null;
  }

  // Parse subEvents - handle both array and object formats
  let events: SubEvent[] = [];
  
  if (Array.isArray(subEvents)) {
    events = subEvents as SubEvent[];
  } else if (typeof subEvents === 'object' && subEvents !== null) {
    events = [subEvents as SubEvent];
  }

  // Filter to only scheduled events (with dates) - performers are displayed separately
  const scheduledEvents = events.filter(e => e.date && e.description !== 'performer');

  if (scheduledEvents.length === 0) {
    return null;
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Music className="h-3.5 w-3.5" />
        <span>Schedule ({scheduledEvents.length} events)</span>
      </div>
      
      <div className="space-y-1.5 pl-2 border-l-2 border-accent/30">
        {scheduledEvents.map((event, index) => (
          <div 
            key={index} 
            className="bg-muted/50 rounded-md px-2 py-1.5 text-xs space-y-0.5"
          >
            {/* Event Title/Artist/Activity */}
            <div className="flex items-center gap-2">
              {event.artist && (
                <div className="flex items-center gap-1 font-medium">
                  <User className="h-3 w-3 text-accent" />
                  <span>{event.artist}</span>
                </div>
              )}
              {event.title && !event.artist && (
                <span className="font-medium">{event.title}</span>
              )}
              {event.activity && (
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  {event.activity}
                </Badge>
              )}
            </div>
            
            {/* Date & Time */}
            <div className="flex items-center gap-3 text-muted-foreground">
              {event.date && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(event.date)}</span>
                </div>
              )}
              {event.time && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>
                    {formatTime(event.time)}
                    {event.endTime && ` - ${formatTime(event.endTime)}`}
                  </span>
                </div>
              )}
            </div>
            
            {/* Description */}
            {event.description && event.description !== 'performer' && (
              <p className="text-muted-foreground text-[11px] line-clamp-2">
                {event.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
