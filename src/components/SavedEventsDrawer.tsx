import { useEffect } from "react";
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
import { useQueryClient } from "@tanstack/react-query";

interface SavedEventsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SavedEventsDrawer({ open, onClose }: SavedEventsDrawerProps) {
  const { data: savedEvents = [] } = useSavedEvents();
  const queryClient = useQueryClient();

  // Realtime subscription for instant sync
  useEffect(() => {
    const channel = supabase
      .channel('saved-events-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'saved_events'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['saved-events'] });
          queryClient.invalidateQueries({ queryKey: ['saved-events-count'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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
                const post = saved.instagram_posts;
                if (!post) return null;

                // Transform to InstagramPost interface
                const postData: InstagramPost = {
                  id: post.id,
                  post_id: post.post_id || post.id,
                  caption: post.caption,
                  post_url: post.post_url,
                  image_url: post.image_url,
                  stored_image_url: post.stored_image_url,
                  posted_at: post.posted_at || saved.created_at,
                  likes_count: post.likes_count || 0,
                  comments_count: post.comments_count || 0,
                  event_title: post.event_title,
                  event_date: post.event_date,
                  event_time: post.event_time,
                  event_end_date: post.event_end_date,
                  end_time: post.end_time,
                  location_name: post.location_name,
                  location_address: post.location_address,
                  location_lat: post.location_lat,
                  location_lng: post.location_lng,
                  signup_url: post.signup_url,
                  is_event: true,
                  instagram_accounts: {
                    username: post.instagram_accounts?.username || 'unknown',
                    display_name: post.instagram_accounts?.display_name || null,
                    follower_count: post.instagram_accounts?.follower_count || null,
                    is_verified: post.instagram_accounts?.is_verified || false,
                  },
                };

                return <InstagramPostCard key={saved.id} post={postData} />;
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
