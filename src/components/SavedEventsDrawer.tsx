import { Heart, ExternalLink, Calendar, MapPin, DollarSign, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSavedEvents } from "@/hooks/useSavedEvents";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface SavedEventsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SavedEventsDrawer({ open, onClose }: SavedEventsDrawerProps) {
  const { data: savedEvents = [] } = useSavedEvents();
  const queryClient = useQueryClient();

  const handleUnsave = async (savedEventId: string, postId: string) => {
    const { error } = await supabase
      .from('saved_events')
      .delete()
      .eq('id', savedEventId);

    if (error) {
      toast.error("Failed to remove event");
    } else {
      toast.success("Event removed");
      queryClient.invalidateQueries({ queryKey: ['saved-events'] });
      queryClient.invalidateQueries({ queryKey: ['saved-events-count'] });
    }
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
                const post = saved.instagram_posts;
                if (!post) return null;

                return (
                  <Card key={saved.id} className="p-4">
                    <div className="space-y-3">
                      {post.post_url && (
                        <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                          <img
                            src={post.post_url}
                            alt={post.event_title || "Event"}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <h3 className="font-semibold line-clamp-2">
                          {post.event_title || "Untitled Event"}
                        </h3>

                        <div className="space-y-1 text-sm text-muted-foreground">
                          {post.event_date && (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3 w-3" />
                              <span className="text-xs">
                                {new Date(post.event_date).toLocaleDateString()}
                                {post.event_time && ` at ${post.event_time}`}
                              </span>
                            </div>
                          )}

                          {post.location_name && (
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3 w-3" />
                              <span className="text-xs line-clamp-1">
                                {post.location_name}
                              </span>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <DollarSign className="h-3 w-3" />
                            <span className="text-xs">
                              {post.is_free ? "Free" : post.price ? `₱${post.price}` : "TBA"}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button asChild size="sm" className="flex-1">
                            <a href={post.post_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View
                            </a>
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleUnsave(saved.id, post.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
