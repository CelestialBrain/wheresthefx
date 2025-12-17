import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { MapPinOff, Plus, Download, Search, ExternalLink, Code } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface UnmatchedVenue {
  location_name: string;
  post_count: number;
  last_seen: string;
  sample_post_id: string;
}

export const UnmatchedVenuesViewer = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVenue, setSelectedVenue] = useState<UnmatchedVenue | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    aliases: "",
    address: "",
    city: "",
    lat: "",
    lng: "",
  });
  const [jsonViewOpen, setJsonViewOpen] = useState(false);

  // Scroll position preservation
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollPosition = useRef<number>(0);

  const saveScrollPosition = useCallback(() => {
    if (tableContainerRef.current) {
      savedScrollPosition.current = tableContainerRef.current.scrollTop;
    }
  }, []);

  const restoreScrollPosition = useCallback(() => {
    if (tableContainerRef.current) {
      setTimeout(() => {
        tableContainerRef.current?.scrollTo(0, savedScrollPosition.current);
      }, 50);
    }
  }, []);

  // Fetch unmatched venues - those with location_name but no coordinates
  const { data: unmatchedVenues, isLoading } = useQuery({
    queryKey: ["unmatched-venues"],
    queryFn: async () => {
      // Get all location names without coordinates
      const { data: posts, error } = await supabase
        .from("instagram_posts")
        .select("location_name, id, created_at")
        .not("location_name", "is", null)
        .is("location_lat", null)
        .neq("location_name", "")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get known venues for filtering
      const { data: knownVenues } = await supabase
        .from("known_venues")
        .select("name, aliases");

      const knownNames = new Set<string>();
      knownVenues?.forEach(v => {
        knownNames.add(v.name.toLowerCase().trim());
        v.aliases?.forEach(a => knownNames.add(a.toLowerCase().trim()));
      });

      // Aggregate by location_name
      const venueMap = new Map<string, UnmatchedVenue>();
      posts?.forEach(post => {
        const name = post.location_name?.trim();
        if (!name) return;

        // Skip if already known
        if (knownNames.has(name.toLowerCase())) return;

        if (venueMap.has(name)) {
          const existing = venueMap.get(name)!;
          existing.post_count++;
          if (new Date(post.created_at) > new Date(existing.last_seen)) {
            existing.last_seen = post.created_at;
            existing.sample_post_id = post.id;
          }
        } else {
          venueMap.set(name, {
            location_name: name,
            post_count: 1,
            last_seen: post.created_at,
            sample_post_id: post.id,
          });
        }
      });

      // Sort by post count descending
      return Array.from(venueMap.values()).sort((a, b) => b.post_count - a.post_count);
    },
  });

  // Add venue mutation
  const addVenueMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("known_venues").insert({
        name: data.name,
        aliases: data.aliases ? data.aliases.split(",").map(a => a.trim()).filter(Boolean) : [],
        address: data.address || null,
        city: data.city || null,
        lat: data.lat ? parseFloat(data.lat) : null,
        lng: data.lng ? parseFloat(data.lng) : null,
      });
      if (error) throw error;

      // Re-geocode affected posts if coordinates provided
      if (data.lat && data.lng) {
        const { error: updateError } = await supabase
          .from("instagram_posts")
          .update({
            location_lat: parseFloat(data.lat),
            location_lng: parseFloat(data.lng),
            location_status: "confirmed",
          })
          .ilike("location_name", `%${data.name}%`);

        if (updateError) console.error("Re-geocode error:", updateError);
      }
    },
    onSuccess: async () => {
      saveScrollPosition();
      await queryClient.invalidateQueries({ queryKey: ["unmatched-venues"] });
      await queryClient.invalidateQueries({ queryKey: ["known-venues"] });
      restoreScrollPosition();
      toast({ title: "Venue added and posts re-geocoded" });
      setSelectedVenue(null);
      setFormData({ name: "", aliases: "", address: "", city: "", lat: "", lng: "" });
    },
    onError: (error: any) => {
      toast({ title: "Error adding venue", description: error.message, variant: "destructive" });
    },
  });

  const handleAddVenue = (venue: UnmatchedVenue) => {
    setSelectedVenue(venue);
    setFormData({
      name: venue.location_name,
      aliases: "",
      address: "",
      city: "",
      lat: "",
      lng: "",
    });
  };

  const handleExport = () => {
    if (!unmatchedVenues) return;
    const dataStr = JSON.stringify(unmatchedVenues, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "unmatched_venues.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredVenues = unmatchedVenues?.filter(v =>
    v.location_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading unmatched venues...</div>;
  }

  return (
    <Card>
      <CardHeader className="p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPinOff className="h-5 w-5 text-orange-500" />
              Unmatched Venues ({unmatchedVenues?.length || 0})
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              AI-extracted venues that failed to match known_venues - add them to improve geocoding
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => setJsonViewOpen(true)}>
              <Code className="h-4 w-4 mr-1" />
              View JSON
            </Button>
          </div>
        </div>
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search unmatched venues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <div ref={tableContainerRef} className="rounded-md border overflow-x-auto max-h-96 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Venue Name (as extracted)</TableHead>
                <TableHead className="text-center">Posts</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVenues?.map((venue) => (
                <TableRow key={venue.location_name}>
                  <TableCell className="font-medium max-w-xs truncate">
                    {venue.location_name}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{venue.post_count}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(venue.last_seen).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddVenue(venue)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredVenues?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {searchQuery ? "No venues match your search" : "All venues are matched! 🎉"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Add Venue Dialog */}
      <Dialog open={!!selectedVenue} onOpenChange={(open) => !open && setSelectedVenue(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Known Venues</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Aliases (comma-separated)</Label>
              <Input
                value={formData.aliases}
                onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
                placeholder="Alternate spellings, abbreviations..."
              />
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div>
              <Label>City</Label>
              <Input
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Latitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={formData.lat}
                  onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                  placeholder="14.5547"
                />
              </div>
              <div>
                <Label>Longitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={formData.lng}
                  onChange={(e) => setFormData({ ...formData, lng: e.target.value })}
                  placeholder="121.0244"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              💡 Tip: Search "{selectedVenue?.location_name}" on Google Maps, right-click and copy coordinates
            </p>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setSelectedVenue(null)}>Cancel</Button>
              <Button
                onClick={() => addVenueMutation.mutate(formData)}
                disabled={addVenueMutation.isPending || !formData.name}
              >
                Add Venue
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View JSON Dialog */}
      <Dialog open={jsonViewOpen} onOpenChange={setJsonViewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Unmatched Venues JSON ({unmatchedVenues?.length || 0} venues)</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] mt-4">
            <pre className="text-xs bg-muted p-4 rounded-md overflow-x-auto">
              {JSON.stringify(unmatchedVenues, null, 2)}
            </pre>
          </ScrollArea>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(unmatchedVenues, null, 2));
                toast({ title: "Copied to clipboard" });
              }}
            >
              Copy
            </Button>
            <Button variant="outline" size="sm" onClick={() => setJsonViewOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
