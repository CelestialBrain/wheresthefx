import { useState, useEffect } from "react";
import { X, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InstagramPostCard, InstagramPost } from "./InstagramPostCard";
import { useQueryClient } from "@tanstack/react-query";

interface EventSidePanelProps {
  events: any[];
  onClose: () => void;
}

export function EventSidePanel({ events, onClose }: EventSidePanelProps) {
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportingEventId, setReportingEventId] = useState<string | null>(null);
  const [reportType, setReportType] = useState<string>("outdated");
  const [reportDescription, setReportDescription] = useState("");
  const queryClient = useQueryClient();


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
              {events.map((event) => {
                const postData: InstagramPost = {
                  id: event.source_post_id || event.post_id,
                  post_id: event.post_id || event.id,
                  caption: event.caption,
                  post_url: event.post_url,
                  image_url: event.image_url,
                  stored_image_url: event.stored_image_url,
                  posted_at: event.posted_at,
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
                  instagram_accounts: {
                    username: event.instagram_accounts?.username || 'unknown',
                    display_name: event.instagram_accounts?.display_name || null,
                    follower_count: event.instagram_accounts?.follower_count || null,
                    is_verified: event.instagram_accounts?.is_verified || false,
                  },
                };

                return (
                  <div key={event.id} className="relative">
                    <InstagramPostCard post={postData} variant="popup" />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 h-7 w-7 p-0"
                      onClick={() => {
                        setReportingEventId(event.post_id);
                        setReportDialogOpen(true);
                      }}
                    >
                      <Flag className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
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
