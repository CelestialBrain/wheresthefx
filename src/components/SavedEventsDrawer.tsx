import { useState } from "react";
import { Heart } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSavedEvents } from "@/hooks/useSavedEvents";
import { InstagramPostCard, InstagramPost } from "./InstagramPostCard";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "sonner";

interface SavedEventsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SavedEventsDrawer({ open, onClose }: SavedEventsDrawerProps) {
  const { data: savedEvents = [] } = useSavedEvents();
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);

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
        description: 'Reported from saved events',
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
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 fill-accent text-accent" />
            Saved Events ({savedEvents.length})
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-100px)] mt-6">
          {savedEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Heart className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No saved events yet</p>
              <p className="text-sm text-muted-foreground mt-2">
                Save events to view them here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {savedEvents.map((saved: any) => {
                const event = saved.published_events;
                if (!event) return null;

                // Transform to InstagramPost interface
                const postData: InstagramPost = {
                  id: event.id,
                  post_id: event.id,
                  caption: event.caption || event.description,
                  post_url: event.instagram_post_url || '',
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
                  instagram_accounts: {
                    username: event.instagram_account_username || 'unknown',
                    display_name: null,
                    follower_count: null,
                    is_verified: false,
                  },
                };

                return <InstagramPostCard key={saved.id} post={postData} onReport={handleReport} isSaved={true} />;
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>

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
    </Sheet>
  );
}
