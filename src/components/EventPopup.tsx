import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InstagramPostCard, InstagramPost } from "./InstagramPostCard";
import { useSavedEvents } from "@/hooks/useSavedEvents";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EventPopupProps {
  events: any[];
  onClose: () => void;
}

export function EventPopup({ events, onClose }: EventPopupProps) {
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [reportType, setReportType] = useState<string>("outdated");
  const [reportDescription, setReportDescription] = useState("");
  const { data: savedEventsData = [] } = useSavedEvents();
  
  const savedEventIds = new Set(
    savedEventsData
      .map((saved: any) => saved.published_event_id)
      .filter(Boolean)
  );

  const handleReport = (postId: string) => {
    setReportingPostId(postId);
    setReportDialogOpen(true);
  };

  const handleConfirmReport = async () => {
    if (!reportingPostId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to report events");
      return;
    }

    const { error } = await supabase
      .from('event_reports')
      .insert({
        instagram_post_id: reportingPostId,
        reporter_user_id: user.id,
        report_type: reportType,
        description: reportDescription,
      });

    if (error) {
      toast.error("Failed to report event");
    } else {
      toast.success("Report submitted. Thank you!");
    }

    setReportDialogOpen(false);
    setReportingPostId(null);
    setReportDescription("");
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
            {events.map((event) => {
              // Transform published_events data to match InstagramPost interface
              const postData: InstagramPost = {
                id: event.id,
                post_id: event.post_id || event.id,
                caption: event.caption || event.description,
                post_url: event.post_url || event.instagram_post_url,
                image_url: event.image_url,
                stored_image_url: event.stored_image_url,
                posted_at: event.created_at,
                likes_count: event.likes_count || 0,
                comments_count: event.comments_count || 0,
                event_title: event.event_title,
                event_date: event.event_date,
                event_time: event.event_time,
                event_end_date: event.event_end_date,
                end_time: event.end_time,
                location_name: event.location_name,
                location_address: event.location_address,
                location_lat: event.location_lat,
                location_lng: event.location_lng,
                signup_url: event.signup_url,
                is_event: true,
                published_event_id: event.id,
                category: event.category,
                // New fields from published_events
                is_free: event.is_free,
                price: event.price,
                price_min: event.price_min,
                price_max: event.price_max,
                price_notes: event.price_notes,
                event_status: event.event_status,
                availability_status: event.availability_status,
                is_recurring: event.is_recurring,
                recurrence_pattern: event.recurrence_pattern,
                instagram_accounts: {
                  username: event.instagram_account_username || event.instagram_accounts?.username || 'unknown',
                  display_name: null,
                  follower_count: null,
                  is_verified: false,
                },
              };
              
              return <InstagramPostCard key={event.id} post={postData} variant="popup" onReport={handleReport} />;
            })}
          </div>
        </ScrollArea>
      </Card>

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
            <Button onClick={handleConfirmReport}>Submit Report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
