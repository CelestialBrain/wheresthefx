import { useState, useEffect } from "react";
import { EventCard, Event } from "./EventCard";
import { InstagramPostCard, InstagramPost } from "./InstagramPostCard";
import { MapPin, Search, Filter, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";

// Mock data for Quezon City events
const mockEvents: Event[] = [
  {
    id: "1",
    title: "Underground House Party at Tomas Morato",
    type: "party",
    location: "Tomas Morato, QC",
    date: "Oct 25",
    time: "10:00 PM",
    attendees: 47,
    distance: "1.2 km",
  },
  {
    id: "2",
    title: "Vintage Thrift Market - UP Town Center",
    type: "thrift",
    location: "UP Town Center",
    date: "Oct 26",
    time: "2:00 PM",
    attendees: 89,
    distance: "2.5 km",
  },
  {
    id: "3",
    title: "Indie Gig Night at 70's Bistro",
    type: "concert",
    location: "Anonas, QC",
    date: "Oct 27",
    time: "8:00 PM",
    attendees: 34,
    distance: "3.1 km",
  },
  {
    id: "4",
    title: "Saturday Night Market - Maginhawa",
    type: "market",
    location: "Maginhawa Street",
    date: "Oct 27",
    time: "6:00 PM",
    attendees: 120,
    distance: "1.8 km",
  },
  {
    id: "5",
    title: "Rooftop Chill Session - Eastwood",
    type: "party",
    location: "Eastwood City",
    date: "Oct 28",
    time: "7:00 PM",
    attendees: 25,
    distance: "4.2 km",
  },
  {
    id: "6",
    title: "Art & Craft Fair - Cubao Expo",
    type: "market",
    location: "Cubao Expo",
    date: "Oct 28",
    time: "3:00 PM",
    attendees: 67,
    distance: "2.9 km",
  },
];

export const EventSidebar = () => {
  const { toast } = useToast();
  const [locationGranted, setLocationGranted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [instagramPosts, setInstagramPosts] = useState<InstagramPost[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<InstagramPost[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);

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

    setFilteredPosts(filtered);
  }, [searchQuery, selectedAccounts, instagramPosts]);

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
        .order("posted_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      setInstagramPosts(data || []);
      setFilteredPosts(data || []);

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
          setLocationGranted(true);
          setIsLoading(false);
          sonnerToast.success("Location enabled - showing events near you");
        },
        (error) => {
          setIsLoading(false);
          sonnerToast.error("Location access denied - showing all QC events");
          setLocationGranted(true);
        }
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
            ? "Quezon City • Updated 5 min ago" 
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
            {filteredPosts.map((post) => (
              <InstagramPostCard key={post.id} post={post} />
            ))}

            {/* Regular Events */}
            {mockEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}

            {filteredPosts.length === 0 && mockEvents.length === 0 && (
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
