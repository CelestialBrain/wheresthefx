import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InstagramPostCard, InstagramPost } from "./InstagramPostCard";
import { useSavedEvents } from "@/hooks/useSavedEvents";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EventPopupProps {
  events: any[];
  onClose: () => void;
}

export function EventPopup({ events, onClose }: EventPopupProps) {
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
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
        report_type: 'inappropriate',
        description: 'Reported from map popup',
      });

    if (error) {
      toast.error("Failed to report event");
    } else {
      toast.success("Event reported successfully");
    }

    setReportDialogOpen(false);
    setReportingPostId(null);
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

      <AlertDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Report Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to report this event? This action will notify moderators.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReport} className="bg-red-500 hover:bg-red-600">
              Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </>
  );
}
