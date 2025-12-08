import { useState, useEffect } from "react";
import { MapPin, Calendar, Heart, MessageCircle, Instagram, ExternalLink, Bookmark, Flag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ImageWithSkeleton } from "./ImageWithSkeleton";
import { formatDateRange, formatTimeRange } from "@/utils/dateUtils";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/constants/categoryColors";
import { EventStatusBadge, EventStatus } from "./EventStatusBadge";
import { AvailabilityBadge, AvailabilityStatus } from "./AvailabilityBadge";
import { PriceDisplay } from "./PriceDisplay";
import { RecurringEventBadge } from "./RecurringEventBadge";
import { EventDatesDisplay } from "./EventDatesDisplay";

export interface InstagramPost {
  id: string;
  post_id: string;
  caption: string | null;
  post_url: string;
  image_url: string | null;
  stored_image_url?: string | null;
  posted_at: string;
  likes_count: number;
  comments_count: number;
  event_title: string | null;
  event_date: string | null;
  event_time: string | null;
  event_end_date: string | null;
  end_time: string | null;
  location_name: string | null;
  location_address: string | null;
  signup_url: string | null;
  is_event: boolean;
  distance?: number;
  location_lat?: number | null;
  location_lng?: number | null;
  published_event_id?: string | null;
  category?: string | null;
  // Event lifecycle fields
  event_status?: string | null;
  availability_status?: string | null;
  // Price fields
  is_free?: boolean;
  price?: number | null;
  price_min?: number | null;
  price_max?: number | null;
  price_notes?: string | null;
  // Recurring event fields
  is_recurring?: boolean | null;
  recurrence_pattern?: string | null;
  instagram_accounts: {
    username: string;
    display_name: string | null;
    follower_count: number | null;
    is_verified: boolean;
  };
}

interface InstagramPostCardProps {
  post: InstagramPost;
  variant?: 'default' | 'popup';
  onReport?: (postId: string) => void;
  isSaved?: boolean;
}

export const InstagramPostCard = ({ post, variant = 'default', onReport, isSaved }: InstagramPostCardProps) => {
  const [savedEvents, setSavedEvents] = useState<Set<string>>(isSaved ? new Set([post.id]) : new Set());
  const queryClient = useQueryClient();
  const isCancelled = post.event_status === 'cancelled';

  // Initialize saved state from existing saved events
  useEffect(() => {
    if (isSaved !== undefined) return; // Skip if parent provided saved state
    
    const checkSavedStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check by published_event_id first, fallback to instagram_post_id
      const query = supabase
        .from('saved_events')
        .select('id')
        .eq('user_id', user.id);

      if (post.published_event_id) {
        query.eq('published_event_id', post.published_event_id);
      } else {
        query.eq('instagram_post_id', post.id);
      }

      const { data } = await query;

      if (data && data.length > 0) {
        setSavedEvents(prev => new Set(prev).add(post.id));
      }
    };

    checkSavedStatus();
  }, [post.id, post.published_event_id, isSaved]);

  const handleSave = async (eventId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast.error("Please sign in to save events");
      return;
    }

    const isSaved = savedEvents.has(eventId);
    
    // Optimistic update
    if (isSaved) {
      setSavedEvents(prev => {
        const newSet = new Set(prev);
        newSet.delete(eventId);
        return newSet;
      });
    } else {
      setSavedEvents(prev => new Set(prev).add(eventId));
    }

    // Perform database operation
    if (isSaved) {
      // Delete by published_event_id if available, otherwise by instagram_post_id
      const deleteQuery = supabase
        .from('saved_events')
        .delete()
        .eq('user_id', user.id);

      if (post.published_event_id) {
        deleteQuery.eq('published_event_id', post.published_event_id);
      } else {
        deleteQuery.eq('instagram_post_id', eventId);
      }

      const { error } = await deleteQuery;

      if (error) {
        // Revert optimistic update
        setSavedEvents(prev => new Set(prev).add(eventId));
        toast.error("Failed to remove event");
      } else {
        // Invalidate saved events query for instant sync
        queryClient.invalidateQueries({ queryKey: ['saved-events'] });
        queryClient.invalidateQueries({ queryKey: ['saved-events-count'] });
        toast.success("Event removed from saved");
      }
    } else {
      // Save with published_event_id if available, otherwise use instagram_post_id
      const insertData: any = { user_id: user.id };
      
      if (post.published_event_id) {
        insertData.published_event_id = post.published_event_id;
      } else {
        insertData.instagram_post_id = eventId;
      }

      const { error } = await supabase
        .from('saved_events')
        .insert(insertData);

      if (error) {
        // Revert optimistic update
        setSavedEvents(prev => {
          const newSet = new Set(prev);
          newSet.delete(eventId);
          return newSet;
        });
        toast.error("Failed to save event");
      } else {
        // Invalidate saved events query for instant sync
        queryClient.invalidateQueries({ queryKey: ['saved-events'] });
        queryClient.invalidateQueries({ queryKey: ['saved-events-count'] });
        toast.success("Event saved!");
      }
    }
  };

  const formatDate = (dateStr: string, endDateStr?: string | null) => {
    if (!endDateStr) {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return formatDateRange(dateStr, endDateStr);
  };

  const formatTime = (timeStr: string | null, endTimeStr?: string | null): string => {
    return formatTimeRange(timeStr, endTimeStr);
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
    <Card 
      className={`p-3 hover:shadow-md transition-shadow cursor-pointer border-border/50 ${isCancelled ? 'opacity-60 grayscale' : ''}`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 200px" }}
    >
      {/* Top Row: Image + Username/Title */}
      <div className="flex gap-3 mb-2">
        {/* Image */}
        {(post.stored_image_url || post.image_url) && (
          variant === 'popup' ? (
            <div className="w-20 flex-shrink-0">
              <AspectRatio ratio={1 / 1}>
                <ImageWithSkeleton
                  src={post.stored_image_url || post.image_url}
                  alt={post.event_title || "Event"}
                  className="w-full h-full rounded-md object-cover bg-muted"
                />
              </AspectRatio>
            </div>
          ) : (
            <ImageWithSkeleton
              src={post.stored_image_url || post.image_url}
              alt={post.event_title || "Event"}
              className="w-20 h-20 rounded-md flex-shrink-0 bg-muted"
            />
          )
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
          
          <h3 className={`font-semibold text-sm leading-tight line-clamp-2 ${isCancelled ? 'line-through' : ''}`}>
            {post.event_title || post.caption?.split('\n')[0] || 'Instagram Post'}
          </h3>
          
          {/* Status badges */}
          {post.is_event && (post.event_status !== 'confirmed' || post.availability_status !== 'available' || post.is_recurring) && (
            <div className="flex flex-wrap gap-1 mt-1">
              <EventStatusBadge status={post.event_status as EventStatus} size="sm" />
              <AvailabilityBadge status={post.availability_status as AvailabilityStatus} />
              <RecurringEventBadge isRecurring={post.is_recurring} pattern={post.recurrence_pattern} size="sm" />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section: Details (full width below image) */}
      <div className="space-y-1.5">
        {/* Date & Time - use EventDatesDisplay for multi-day support */}
        {post.is_event && post.event_date && (
          <EventDatesDisplay
            eventId={post.published_event_id || post.id}
            primaryDate={post.event_date}
            primaryEndDate={post.event_end_date}
            primaryTime={post.event_time}
            primaryEndTime={post.end_time}
            primaryVenue={post.location_name}
            isPublishedEvent={!!post.published_event_id}
          />
        )}

        {/* Location + Distance */}
        {post.is_event && post.location_name && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span className="truncate flex-1">{post.location_name}</span>
            {post.distance !== undefined && (
              <span className="text-primary text-xs font-medium whitespace-nowrap ml-1">
                {formatDistance(post.distance)}
              </span>
            )}
          </div>
        )}

        {/* Price */}
        {post.is_event && (
          <PriceDisplay
            isFree={post.is_free ?? false}
            price={post.price}
            priceMin={post.price_min}
            priceMax={post.price_max}
            priceNotes={post.price_notes}
            size="sm"
          />
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

          {/* Right: Report + Save Button + Link Button + Event Badge */}
          <div className="flex items-center gap-2">
            {post.is_event && onReport && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => onReport(post.id)}
              >
                <Flag className="h-3.5 w-3.5" />
              </Button>
            )}
            {post.is_event && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleSave(post.published_event_id || post.id)}
              >
                <Bookmark
                  className={`h-3.5 w-3.5 ${
                    savedEvents.has(post.published_event_id || post.id) ? "fill-accent text-accent" : ""
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
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            {post.is_event && post.category && CATEGORY_LABELS[post.category] && (
              <Badge 
                className="text-[10px] px-1.5 py-1 leading-none rounded-sm text-white"
                style={{ backgroundColor: CATEGORY_COLORS[post.category] || '#9E9E9E' }}
              >
                {CATEGORY_LABELS[post.category]}
              </Badge>
            )}
            {post.is_event && !post.category && (
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
