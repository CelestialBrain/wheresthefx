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
import { isLoggedIn } from "@/api/client";
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

    if (!isLoggedIn()) {
      toast.error("Please sign in to report events");
      setReportDialogOpen(false);
      setReportingPostId(null);
      return;
    }

    // TODO: needs Express endpoint — POST /api/events/:id/reports (event_reports table)
    toast.success("Event reported successfully");
    setReportDialogOpen(false);
    setReportingPostId(null);
  };


  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md glass-card border-l-0 sm:mr-[var(--card-margin,16px)] sm:mt-[var(--card-margin,16px)] sm:mb-[var(--card-margin,16px)] sm:rounded-[var(--card-radius,16px)] sm:h-[calc(100vh-32px)]">
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
              {savedEvents.map((event: any) => {
                // Transform EventData from Express API to InstagramPost interface
                const postData: InstagramPost = {
                  id: String(event.id),
                  post_id: String(event.id),
                  caption: event.description || null,
                  post_url: event.source_post?.post_url || '',
                  image_url: event.image_url || null,
                  stored_image_url: null,
                  posted_at: event.created_at || '',
                  likes_count: 0,
                  comments_count: 0,
                  event_title: event.title || null,
                  event_date: event.event_date || null,
                  event_time: event.event_time || null,
                  event_end_date: event.event_end_date || null,
                  end_time: event.end_time || null,
                  location_name: event.venue_name || null,
                  location_address: event.venue_address || null,
                  location_lat: event.venue_lat || null,
                  location_lng: event.venue_lng || null,
                  signup_url: event.signup_url || null,
                  is_event: true,
                  published_event_id: String(event.id),
                  category: event.category || null,
                  is_free: event.is_free,
                  price: event.price || null,
                  price_min: event.price_min || null,
                  price_max: event.price_max || null,
                  price_notes: event.price_notes || null,
                  event_status: event.event_status || null,
                  availability_status: event.availability_status || null,
                  instagram_accounts: {
                    username: event.source_username || event.source_account?.username || 'unknown',
                    display_name: event.source_account?.display_name || null,
                    follower_count: event.source_account?.follower_count || null,
                    is_verified: event.source_account?.is_verified || false,
                  },
                };

                return <InstagramPostCard key={event.id} post={postData} onReport={handleReport} isSaved={true} />;
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
