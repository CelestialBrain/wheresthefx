import { useState, useEffect, useCallback, useRef } from "react";
import { EventCard, Event } from "./EventCard";
import { InstagramPostCard, InstagramPost } from "./InstagramPostCard";
import { MapPin, Search, Filter, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";

// Calculate distance between two coordinates using Haversine formula
const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
};

// Format distance for display
const formatDistance = (distanceKm: number): string => {
  if (distanceKm < 1.0) {
    return `${Math.round(distanceKm * 1000)}m`;
  }
  return `${distanceKm.toFixed(1)} km`;
};

interface InstagramPostWithDistance extends InstagramPost {
  distance?: number;
}

export const EventSidebar = () => {
  const { toast } = useToast();
  const [locationGranted, setLocationGranted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [instagramPosts, setInstagramPosts] = useState<InstagramPostWithDistance[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<InstagramPostWithDistance[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [displayLimit, setDisplayLimit] = useState(20);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const loadMoreElement = loadMoreRef.current;
    if (!loadMoreElement || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && filteredPosts.length > displayLimit) {
            setIsLoadingMore(true);
            // Simulate slight delay for smooth UX
            setTimeout(() => {
              setDisplayLimit(prev => Math.min(prev + 20, filteredPosts.length));
              setIsLoadingMore(false);
            }, 100);
          }
        });
      },
      {
        rootMargin: "200px",
        threshold: 0.1,
      }
    );

    observer.observe(loadMoreElement);

    return () => {
      observer.disconnect();
    };
  }, [displayLimit, filteredPosts.length, isLoadingMore]);

  // Fetch Instagram posts on mount
  useEffect(() => {
    fetchInstagramPosts();
  }, []);

  // Apply filters
  useEffect(() => {
    let filtered = instagramPosts;

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(
        (post) =>
          post.caption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          post.event_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          post.instagram_accounts.username.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by selected accounts
    if (selectedAccounts.length > 0) {
      filtered = filtered.filter((post) =>
        selectedAccounts.includes(post.instagram_accounts.username)
      );
    }

    // Calculate distances if user location is available
    if (userLocation) {
      filtered = filtered
        .map((post) => {
          // Use location_lat and location_lng from the post
          const effectiveLat = post.location_lat;
          const effectiveLng = post.location_lng;

          // Filter out events without location data
          if (!effectiveLat || !effectiveLng) {
            return null;
          }

          const distance = calculateDistance(
            userLocation.lat,
            userLocation.lng,
            Number(effectiveLat),
            Number(effectiveLng)
          );

          return {
            ...post,
            distance
          };
        })
        .filter((post): post is InstagramPostWithDistance & { distance: number } => post !== null)
        .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    } else {
      // Filter out events without location when location not granted
      filtered = filtered.filter(
        (post) => {
          return post.location_lat && post.location_lng;
        }
      );
    }

    setFilteredPosts(filtered);
  }, [searchQuery, selectedAccounts, instagramPosts, userLocation]);

  const fetchInstagramPosts = async () => {
    try {
      setIsLoadingPosts(true);
      const { data, error } = await supabase
        .from("instagram_posts")
        .select(`
          *,
          instagram_accounts (
            username,
            display_name,
            follower_count,
            is_verified
          )
        `)
        .eq("is_event", true)
        .order("posted_at", { ascending: false });

      if (error) throw error;

      setInstagramPosts(data as any || []);
      setFilteredPosts(data as any || []);

      // Extract unique accounts
      const uniqueAccounts = Array.from(
        new Set(data?.map((post) => post.instagram_accounts.username) || [])
      );
      setAccounts(uniqueAccounts);
    } catch (error: any) {
      console.error("Error fetching Instagram posts:", error);
      toast({
        title: "Error loading posts",
        description: "Failed to load Instagram posts.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPosts(false);
    }
  };

  const toggleAccountFilter = (username: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(username)
        ? prev.filter((u) => u !== username)
        : [...prev, username]
    );
  };

  const requestLocation = () => {
    setIsLoading(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(coords);
          setLocationGranted(true);
          setIsLoading(false);
          setLastUpdate(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
          sonnerToast.success("Location enabled - showing events near you");
          
          // Set up background refresh every 5 minutes
          const intervalId = setInterval(() => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setUserLocation({
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude
                });
                setLastUpdate(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
              },
              (err) => console.log("Background location update failed:", err),
              { enableHighAccuracy: false, maximumAge: 300000 }
            );
          }, 300000);

          // Cleanup on unmount
          return () => clearInterval(intervalId);
        },
        (error) => {
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
            <Button
              variant="ghost"
              size="sm"
              onClick={requestLocation}
              disabled={isLoading}
              className="text-xs"
            >
              <MapPin className="h-3 w-3 mr-1" />
              Enable
            </Button>
          )}
        </div>
        
        <p className="text-xs text-muted-foreground">
          {locationGranted 
            ? userLocation 
              ? `Quezon City • Sorted by distance${lastUpdate ? ` • Updated ${lastUpdate}` : ''}`
              : "Quezon City • Location denied"
            : "Enable location to see events near you"}
        </p>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Filter Toggle */}
        {accounts.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="w-full"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filter by Account
            {selectedAccounts.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {selectedAccounts.length}
              </Badge>
            )}
          </Button>
        )}

        {/* Account Filters */}
        {showFilters && accounts.length > 0 && (
          <div className="space-y-2 max-h-40 overflow-y-auto p-2 border border-border rounded-md">
            {accounts.map((username) => (
              <label
                key={username}
                className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded"
              >
                <input
                  type="checkbox"
                  checked={selectedAccounts.includes(username)}
                  onChange={() => toggleAccountFilter(username)}
                  className="rounded"
                />
                <Instagram className="h-3 w-3" />
                <span className="text-sm">@{username}</span>
              </label>
            ))}
          </div>
        )}
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
          <div className="text-center py-8 text-sm text-muted-foreground">
            Loading events...
          </div>
        ) : (
          <>
            {/* Instagram Posts */}
            {filteredPosts.slice(0, displayLimit).map((post) => (
              <InstagramPostCard key={post.id} post={post} />
            ))}

            {/* Infinite Scroll Trigger */}
            {filteredPosts.length > displayLimit && (
              <div ref={loadMoreRef} className="py-4">
                <div className="text-center text-sm text-muted-foreground">
                  {isLoadingMore ? "Loading more..." : "Scroll for more"}
                </div>
              </div>
            )}

            {filteredPosts.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No events found
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
