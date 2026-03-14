import { useState, useEffect, useRef } from "react";
import { InstagramPostCard, InstagramPost } from "./InstagramPostCard";
import { MapPin, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fetchEvents, EventData } from "@/api/client";
import { toast as sonnerToast } from "sonner";

const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

interface InstagramPostWithDistance extends InstagramPost {
  distance?: number;
}

const toInstagramPost = (e: EventData): InstagramPost => ({
  id: String(e.id),
  post_id: `event-${e.id}`,
  caption: e.description || null,
  post_url: e.signup_url || null,
  image_url: e.image_url || null,
  stored_image_url: null,
  posted_at: e.event_date,
  likes_count: null,
  comments_count: null,
  event_title: e.title,
  event_date: e.event_date,
  event_time: e.event_time || null,
  event_end_date: e.event_end_date || null,
  end_time: e.end_time || null,
  location_name: e.venue_name || null,
  location_address: e.venue_address || null,
  location_lat: e.venue_lat || null,
  location_lng: e.venue_lng || null,
  signup_url: e.signup_url || null,
  is_event: true,
  category: e.category,
  is_free: e.is_free,
  price: e.price || null,
  price_min: e.price_min || null,
  price_max: e.price_max || null,
  price_notes: e.price_notes || null,
  event_status: e.event_status,
  availability_status: e.availability_status || null,
  instagram_accounts: {
    username: e.source_username || "unknown",
    display_name: e.source_username || null,
    follower_count: null,
    is_verified: false,
  },
});

export const EventSidebar = () => {
  const [locationGranted, setLocationGranted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [instagramPosts, setInstagramPosts] = useState<InstagramPostWithDistance[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<InstagramPostWithDistance[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [displayLimit, setDisplayLimit] = useState(20);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    const loadMoreElement = loadMoreRef.current;
    if (!loadMoreElement || isLoadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && filteredPosts.length > displayLimit) {
            setIsLoadingMore(true);
            setTimeout(() => {
              setDisplayLimit((prev) => Math.min(prev + 20, filteredPosts.length));
              setIsLoadingMore(false);
            }, 100);
          }
        });
      },
      { rootMargin: "200px", threshold: 0.1 }
    );
    observer.observe(loadMoreElement);
    return () => observer.disconnect();
  }, [displayLimit, filteredPosts.length, isLoadingMore]);

  useEffect(() => {
    fetchEvents({ is_event: "true" })
      .then((res) => {
        const posts = (res.data || []).map(toInstagramPost);
        setInstagramPosts(posts);
        setFilteredPosts(posts);
      })
      .catch((err) => {
        console.error("Error fetching events:", err);
        sonnerToast.error("Failed to load events.");
      })
      .finally(() => setIsLoadingPosts(false));
  }, []);

  useEffect(() => {
    let filtered = instagramPosts;

    if (searchQuery) {
      filtered = filtered.filter(
        (post) =>
          post.caption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          post.event_title?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (userLocation) {
      filtered = filtered
        .map((post) => {
          if (!post.location_lat || !post.location_lng) return null;
          const distance = calculateDistance(
            userLocation.lat,
            userLocation.lng,
            Number(post.location_lat),
            Number(post.location_lng)
          );
          return { ...post, distance };
        })
        .filter((post): post is InstagramPostWithDistance & { distance: number } => post !== null)
        .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    } else {
      filtered = filtered.filter((post) => post.location_lat && post.location_lng);
    }

    setFilteredPosts(filtered);
  }, [searchQuery, instagramPosts, userLocation]);

  const requestLocation = () => {
    setIsLoading(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
          setUserLocation(coords);
          setLocationGranted(true);
          setIsLoading(false);
          setLastUpdate(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
          sonnerToast.success("Location enabled - showing events near you");

          const intervalId = setInterval(() => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setLastUpdate(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
              },
              (err) => console.log("Background location update failed:", err),
              { enableHighAccuracy: false, maximumAge: 300000 }
            );
          }, 300000);

          return () => clearInterval(intervalId);
        },
        () => {
          setIsLoading(false);
          sonnerToast.error("Location access denied - showing all QC events");
          setLocationGranted(true);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setIsLoading(false);
      sonnerToast.error("Geolocation not supported");
      setLocationGranted(true);
    }
  };

  return (
    <aside className="w-full lg:w-80 h-screen border-l border-border/50 bg-card overflow-y-auto">
      <div className="p-6 space-y-4 sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b border-border/50">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Functions Near You
          </h2>
          {!locationGranted && (
            <Button variant="ghost" size="sm" onClick={requestLocation} disabled={isLoading} className="text-xs">
              <MapPin className="h-3 w-3 mr-1" />
              Enable
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {locationGranted
            ? userLocation
              ? `Quezon City • Sorted by distance${lastUpdate ? ` • Updated ${lastUpdate}` : ""}`
              : "Quezon City • Location denied"
            : "Enable location to see events near you"}
        </p>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <div className="p-6 space-y-4">
        {!locationGranted ? (
          <div className="text-center py-12 space-y-3">
            <MapPin className="h-12 w-12 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Enable location to discover functions happening near you
            </p>
            <Button onClick={requestLocation} disabled={isLoading}>
              {isLoading ? "Requesting..." : "Enable Location"}
            </Button>
          </div>
        ) : isLoadingPosts ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Loading events...</div>
        ) : (
          <>
            {filteredPosts.slice(0, displayLimit).map((post) => (
              <InstagramPostCard key={post.id} post={post} />
            ))}

            {filteredPosts.length > displayLimit && (
              <div ref={loadMoreRef} className="py-4">
                <div className="text-center text-sm text-muted-foreground">
                  {isLoadingMore ? "Loading more..." : "Scroll for more"}
                </div>
              </div>
            )}

            {filteredPosts.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">No events found</div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
