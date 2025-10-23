import { MapPin, Calendar, Users } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface Event {
  id: string;
  title: string;
  type: "party" | "thrift" | "market" | "concert" | "other";
  location: string;
  date: string;
  time: string;
  attendees?: number;
  distance?: string;
}

interface EventCardProps {
  event: Event;
}

export const EventCard = ({ event }: EventCardProps) => {
  const getTypeColor = (type: Event["type"]) => {
    const colors = {
      party: "bg-accent/10 text-accent",
      thrift: "bg-primary/10 text-primary",
      market: "bg-muted-foreground/10 text-muted-foreground",
      concert: "bg-accent/10 text-accent",
      other: "bg-muted/10 text-foreground",
    };
    return colors[type];
  };

  return (
    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer border-border/50">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight">{event.title}</h3>
          <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${getTypeColor(event.type)}`}>
            {event.type}
          </span>
        </div>
        
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{event.location}</span>
            {event.distance && (
              <span className="text-accent ml-auto whitespace-nowrap">• {event.distance}</span>
            )}
          </div>
          
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            <span>{event.date} • {event.time}</span>
          </div>
          
          {event.attendees && (
            <div className="flex items-center gap-1.5">
              <Users className="h-3 w-3" />
              <span>{event.attendees} interested</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
