import { User, Music } from "lucide-react";
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

interface PerformersDisplayProps {
  subEvents: Json | null;
  className?: string;
}

export const PerformersDisplay = ({ subEvents, className = "" }: PerformersDisplayProps) => {
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

  // Filter to performers: either explicitly marked, or entries that look like performer names
  const performerDescriptions = ['performer', 'dj set', 'dj', 'b2b', 'live set', 'headliner', 'opening act'];
  
  const performers = events.filter(e => {
    // Explicitly marked as performer type
    if (e.description && performerDescriptions.includes(e.description.toLowerCase())) return true;
    if (e.description === 'performer' && !e.date) return true;
    if (e.artist) return true;
    
    // Check if description contains performer-like keywords
    if (e.description && /\b(b2b|dj|set|live)\b/i.test(e.description)) return true;
    
    // If multiple sub-events exist with same date and short titles (likely performers)
    if (e.title && e.title.length < 30) {
      const sameDate = events.filter(ev => ev.date === e.date);
      if (sameDate.length >= 3 && !e.title.toLowerCase().includes('event') && 
          !e.title.toLowerCase().includes('session') && !e.title.toLowerCase().includes('night')) {
        return true;
      }
    }
    
    return false;
  });

  if (performers.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Music className="h-3.5 w-3.5" />
        <span>Featuring</span>
      </div>
      
      <div className="flex flex-wrap gap-1.5">
        {performers.map((performer, index) => (
          <Badge 
            key={index} 
            variant="secondary"
            className="text-xs px-2 py-0.5 flex items-center gap-1"
          >
            <User className="h-3 w-3" />
            {performer.artist || performer.title || 'Artist'}
          </Badge>
        ))}
      </div>
    </div>
  );
};
