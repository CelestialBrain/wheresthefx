import { useState } from "react";
import { X, Heart, ExternalLink, Calendar, MapPin, DollarSign, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EventSidePanelProps {
  events: any[];
  onClose: () => void;
}

export function EventSidePanel({ events, onClose }: EventSidePanelProps) {
  const [savedEvents, setSavedEvents] = useState<Set<string>>(new Set());
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportingEventId, setReportingEventId] = useState<string | null>(null);
  const [reportType, setReportType] = useState<string>("outdated");
  const [reportDescription, setReportDescription] = useState("");

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

  const handleReport = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast.error("Please sign in to report issues");
      return;
    }

    const { error } = await supabase.from('event_reports').insert({
      instagram_post_id: reportingEventId,
      reporter_user_id: user.id,
      report_type: reportType,
      description: reportDescription,
    });

    if (error) {
      toast.error("Failed to submit report");
    } else {
      toast.success("Report submitted. Thank you!");
      setReportDialogOpen(false);
      setReportDescription("");
    }
  };

  return (
    <>
      <div className="fixed top-0 right-0 h-full w-full md:w-[400px] z-[2000] bg-card/95 backdrop-blur-md border-l border-border shadow-2xl animate-slide-in-right">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {events[0]?.location_name || "Event Location"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {events.length} {events.length === 1 ? "event" : "events"}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Event List */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {events.map((event) => (
                <Card key={event.id} className="p-4 space-y-3">
                  {event.image_url && (
                    <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                      <img
                        src={event.image_url}
                        alt={event.event_title || "Event"}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "/placeholder.svg";
                        }}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold flex-1">
                        {event.event_title || "Untitled Event"}
                      </h3>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSave(event.id)}
                      >
                        <Heart
                          className={`h-4 w-4 ${
                            savedEvents.has(event.id) ? "fill-accent text-accent" : ""
                          }`}
                        />
                      </Button>
                    </div>

                    <div className="space-y-1 text-sm text-muted-foreground">
                      {event.event_date && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {new Date(event.event_date).toLocaleDateString()}
                            {event.event_time && ` at ${event.event_time}`}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <DollarSign className="h-3 w-3" />
                        <span>
                          {event.is_free ? "Free" : event.price ? `₱${event.price}` : "TBA"}
                        </span>
                      </div>
                    </div>

                    {event.caption && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {event.caption}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" asChild className="flex-1">
                        <a href={event.post_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View Post
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setReportingEventId(event.id);
                          setReportDialogOpen(true);
                        }}
                      >
                        <Flag className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Report Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Issue</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="outdated">Event already happened</SelectItem>
                <SelectItem value="wrong_location">Wrong location</SelectItem>
                <SelectItem value="wrong_date">Wrong date/time</SelectItem>
                <SelectItem value="spam">Spam/Not an event</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Additional details (optional)"
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReport}>Submit Report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
