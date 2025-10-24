import { MapPin, Calendar, Heart, MessageCircle, Instagram } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
    
    return `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
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
    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer border-border/50">
      <div className="space-y-3">
        {/* Event Image */}
        {post.image_url && (
          <div className="w-full h-40 rounded-lg overflow-hidden bg-muted mb-3">
            <img
              src={post.image_url}
              alt={post.event_title || "Event"}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = "/placeholder.svg";
              }}
            />
          </div>
        )}
        
        {/* Header with account info */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Instagram className="h-4 w-4 text-accent flex-shrink-0" />
            <a
              href={`https://instagram.com/${post.instagram_accounts.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-sm hover:underline truncate"
            >
              @{post.instagram_accounts.username}
            </a>
            {post.instagram_accounts.is_verified && (
              <Badge variant="secondary" className="text-xs px-1 py-0">✓</Badge>
            )}
          </div>
          {post.instagram_accounts.follower_count && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatEngagement(post.instagram_accounts.follower_count)} followers
            </span>
          )}
        </div>

        {/* Event title or caption preview */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight line-clamp-2">
            {post.event_title || post.caption?.split('\n')[0] || 'Instagram Post'}
          </h3>
          {post.is_event && (
            <Badge variant="default" className="text-xs whitespace-nowrap">
              Event
            </Badge>
          )}
        </div>

        {/* Event details */}
        {post.is_event && (
          <div className="space-y-2 text-xs text-muted-foreground">
            {(post.event_date || post.event_time) && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                <span>
                  {post.event_date && formatDate(post.event_date)}
                  {post.event_date && post.event_time && ' • '}
                  {formatTime(post.event_time)}
                </span>
              </div>
            )}

            {post.location_name && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{post.location_name}</span>
                {post.distance !== undefined && (
                  <span className="ml-auto text-primary text-xs font-medium whitespace-nowrap">
                    {formatDistance(post.distance)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Engagement stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
          <div className="flex items-center gap-1.5">
            <Heart className="h-3 w-3" />
            <span>{formatEngagement(post.likes_count)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageCircle className="h-3 w-3" />
            <span>{formatEngagement(post.comments_count)}</span>
          </div>
          <a
            href={post.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-accent hover:underline"
          >
            View on IG
          </a>
        </div>
      </div>
    </Card>
  );
};
