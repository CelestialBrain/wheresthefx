import { useState } from "react";
import { MapPin, Calendar, Heart, MessageCircle, Instagram, ExternalLink, Bookmark } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageWithSkeleton } from "./ImageWithSkeleton";

export interface InstagramPost {
  id: string;
  post_id: string;
  caption: string | null;
  post_url: string;
  image_url: string | null;
  posted_at: string;
  likes_count: number;
  comments_count: number;
  event_title: string | null;
  event_date: string | null;
  event_time: string | null;
  location_name: string | null;
  location_address: string | null;
  signup_url: string | null;
  is_event: boolean;
  distance?: number;
  location_lat?: number | null;
  location_lng?: number | null;
  instagram_accounts: {
    username: string;
    display_name: string | null;
    follower_count: number | null;
    is_verified: boolean;
  };
}

interface InstagramPostCardProps {
  post: InstagramPost;
}

export const InstagramPostCard = ({ post }: InstagramPostCardProps) => {
  const [savedEvents, setSavedEvents] = useState<Set<string>>(new Set());

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr: string | null): string => {
    if (!timeStr) return "Time TBA";
    
    // Handle HH:MM:SS format
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12; // Convert 0 to 12 for midnight
    
    return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
  };

  const formatEngagement = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  const formatDistance = (distanceKm: number | undefined): string | null => {
    if (distanceKm === undefined) return null;
    
    if (distanceKm < 1.0) {
      return `${Math.round(distanceKm * 1000)}m`;
    }
    return `${distanceKm.toFixed(1)} km`;
  };

  return (
    <Card className="p-3 hover:shadow-md transition-shadow cursor-pointer border-border/50">
      {/* Top Row: Image + Username/Title */}
      <div className="flex gap-3 mb-2">
        {/* Image */}
        {post.image_url && (
          <ImageWithSkeleton
            src={post.image_url}
            alt={post.event_title || "Event"}
            className="w-20 h-20 rounded-md flex-shrink-0 bg-muted"
          />
        )}

        {/* Username + Title (right of image) */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1">
            <Instagram className="h-3.5 w-3.5 text-accent flex-shrink-0" />
            <a
              href={`https://instagram.com/${post.instagram_accounts.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-xs hover:underline truncate"
            >
              @{post.instagram_accounts.username}
            </a>
            {post.instagram_accounts.is_verified && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0 leading-none">
                ✓
              </Badge>
            )}
          </div>
          
          <h3 className="font-semibold text-sm leading-tight line-clamp-2">
            {post.event_title || post.caption?.split('\n')[0] || 'Instagram Post'}
          </h3>
        </div>
      </div>

      {/* Bottom Section: Details (full width below image) */}
      <div className="space-y-1.5">
        {/* Date & Time */}
        {post.is_event && (post.event_date || post.event_time) && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">
              {post.event_date && formatDate(post.event_date)}
              {post.event_date && post.event_time && ' • '}
              {formatTime(post.event_time)}
            </span>
          </div>
        )}

        {/* Location + Distance */}
        {post.is_event && post.location_name && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate flex-1">{post.location_name}</span>
            {post.distance !== undefined && (
              <span className="text-primary text-xs font-medium whitespace-nowrap ml-1">
                {formatDistance(post.distance)}
              </span>
            )}
          </div>
        )}

        {/* Bottom Row: Engagement + Link/Event Badge + Save */}
        <div className="flex items-center justify-between pt-1">
          {/* Left: Engagement Stats */}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <Heart className="h-3 w-3" />
              <span>{formatEngagement(post.likes_count)}</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              <span>{formatEngagement(post.comments_count)}</span>
            </div>
          </div>

          {/* Right: Save Button + Link Button + Event Badge */}
          <div className="flex items-center gap-2">
            {post.is_event && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleSave(post.id)}
              >
                <Bookmark
                  className={`h-3 w-3 ${
                    savedEvents.has(post.id) ? "fill-accent text-accent" : ""
                  }`}
                />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => window.open(post.post_url, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
            {post.is_event && (
              <Badge variant="default" className="text-[10px] px-1.5 py-1 leading-none rounded-sm">
                Event
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};
