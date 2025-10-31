import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InstagramPostCard, InstagramPost } from "./InstagramPostCard";

interface EventPopupProps {
  events: any[];
  onClose: () => void;
}

export function EventPopup({ events, onClose }: EventPopupProps) {
  return (
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
                id: event.source_post_id || event.post_id,
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
                instagram_accounts: {
                  username: event.instagram_account_username || event.instagram_accounts?.username || 'unknown',
                  display_name: null,
                  follower_count: null,
                  is_verified: false,
                },
              };
              
              return <InstagramPostCard key={event.id} post={postData} variant="popup" />;
            })}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
