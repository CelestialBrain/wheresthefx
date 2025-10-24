import { useState, useEffect } from "react";
import { X, Bookmark, ExternalLink, Calendar, MapPin, DollarSign, Flag, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

interface EventPopupProps {
  events: any[];
  onClose: () => void;
}

export function EventPopup({ events, onClose }: EventPopupProps) {
  const [savedEvents, setSavedEvents] = useState<Set<string>>(new Set());
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportingEventId, setReportingEventId] = useState<string | null>(null);
  const [reportType, setReportType] = useState<string>("outdated");
  const [reportDescription, setReportDescription] = useState("");

  useEffect(() => {
    const loadSavedEvents = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('saved_events')
        .select('instagram_post_id')
        .eq('user_id', user.id);

      if (data) {
        setSavedEvents(new Set(data.map(d => d.instagram_post_id)));
      }
    };
    loadSavedEvents();
  }, []);

  const handleSave = async (event: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast.error("Please sign in to save events");
      return;
    }

    const eventId = event.post_id;

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
      <div className="fixed inset-0 z-[2000] flex items-end md:items-center md:justify-center bg-black/80 backdrop-blur-sm">
        <Card className="relative w-full md:max-w-md max-h-[90vh] flex flex-col bg-card border-border rounded-t-2xl md:rounded-lg">
          <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
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
                    {event.instagram_accounts?.username && (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Instagram className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            @{event.instagram_accounts.username}
                          </span>
                        </div>
                        <Bookmark
                          className={`h-4 w-4 cursor-pointer transition-colors ${
                            savedEvents.has(event.post_id) 
                              ? "fill-purple-500 text-purple-500" 
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          onClick={() => handleSave(event)}
                        />
                      </div>
                    )}
                    <h3 className="font-semibold">
                      {event.event_title || "Untitled Event"}
                    </h3>

                    <div className="space-y-1 text-sm text-muted-foreground">
                      {event.event_date && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {format(new Date(event.event_date), 'MMMM d')}
                            {event.event_time && ` at ${format(new Date(`2000-01-01T${event.event_time}`), 'h:mm a')}`}
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
                          setReportingEventId(event.post_id);
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
        </Card>
      </div>

      {/* Report Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Issue</DialogTitle>
            <DialogDescription>
              Help us improve by reporting issues with this event
            </DialogDescription>
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
