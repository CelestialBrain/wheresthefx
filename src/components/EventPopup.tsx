import { useState } from "react";
import { X, Heart, ExternalLink, Calendar, MapPin, DollarSign, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EventPopupProps {
  events: any[];
  onClose: () => void;
}

export function EventPopup({ events, onClose }: EventPopupProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [savedEvents, setSavedEvents] = useState<Set<string>>(new Set());

  const currentEvent = events[currentIndex];

  const handleSave = async (eventId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast.error("Please sign in to save events");
      return;
    }

    if (savedEvents.has(eventId)) {
      const { error } = await supabase
        .from('saved_events')
        .delete()
        .eq('user_id', user.id)
        .eq('instagram_post_id', eventId);

      if (error) {
        toast.error("Failed to remove event");
      } else {
        setSavedEvents(prev => {
          const newSet = new Set(prev);
          newSet.delete(eventId);
          return newSet;
        });
        toast.success("Event removed from saved");
      }
    } else {
      const { error } = await supabase
        .from('saved_events')
        .insert({ user_id: user.id, instagram_post_id: eventId });

      if (error) {
        toast.error("Failed to save event");
      } else {
        setSavedEvents(prev => new Set(prev).add(eventId));
        toast.success("Event saved!");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <Card className="relative w-full max-w-md max-h-[90vh] overflow-auto bg-card border-border">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-10"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="p-4 space-y-4">
          {/* Event Image */}
          {currentEvent.post_url && (
            <div className="aspect-square rounded-lg overflow-hidden bg-muted">
              <img
                src={currentEvent.post_url}
                alt={currentEvent.event_title || "Event"}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Event Details */}
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold flex-1">
                {currentEvent.event_title || "Untitled Event"}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleSave(currentEvent.id)}
              >
                <Heart
                  className={`h-5 w-5 ${
                    savedEvents.has(currentEvent.id) ? "fill-accent text-accent" : ""
                  }`}
                />
              </Button>
            </div>

            <div className="space-y-2 text-sm">
              {currentEvent.event_date && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {new Date(currentEvent.event_date).toLocaleDateString()} 
                    {currentEvent.event_time && ` at ${currentEvent.event_time}`}
                  </span>
                </div>
              )}

              {currentEvent.location_name && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{currentEvent.location_name}</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                <span>
                  {currentEvent.is_free ? "Free" : currentEvent.price ? `₱${currentEvent.price}` : "TBA"}
                </span>
              </div>
            </div>

            {currentEvent.caption && (
              <p className="text-sm text-muted-foreground line-clamp-3">
                {currentEvent.caption}
              </p>
            )}

            <div className="flex gap-2">
              <Button asChild className="flex-1">
                <a href={currentEvent.post_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Post
                </a>
              </Button>
            </div>
          </div>

          {/* Navigation Dots */}
          {events.length > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              {events.map((_, index) => (
                <button
                  key={index}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === currentIndex ? "bg-accent" : "bg-muted"
                  }`}
                  onClick={() => setCurrentIndex(index)}
                />
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
