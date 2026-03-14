import { useState, useEffect } from "react";
import { fetchVenues } from "@/api/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Clock } from "lucide-react";

interface KnownVenue {
  id: string;
  name: string;
  aliases: string[] | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  instagram_handle: string | null;
  learned_from_corrections: boolean | null;
  correction_count: number | null;
  created_at: string | null;
  operating_hours: unknown | null;
}

export const KnownVenuesManager = () => {
  const [venues, setVenues] = useState<KnownVenue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchVenues()
      .then((res) => setVenues((res.data as KnownVenue[]) || []))
      .catch((err) => console.error("Failed to fetch venues:", err))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredVenues = venues.filter((venue) => {
    const query = searchQuery.toLowerCase();
    return (
      venue.name.toLowerCase().includes(query) ||
      venue.city?.toLowerCase().includes(query) ||
      venue.aliases?.some((a) => a.toLowerCase().includes(query)) ||
      venue.instagram_handle?.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">Known Venues</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Venues used by AI extraction for location matching
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-muted-foreground text-sm">Admin endpoint not yet implemented — write operations disabled</p>
        </div>
      </div>
      <Card className="frosted-glass border-border/50">
        <CardHeader className="p-4 border-b border-border/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search venues by name, city, alias..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background/50"
            />
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <div className="rounded-md border overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Aliases</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Coordinates</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVenues.map((venue) => (
                  <TableRow key={venue.id}>
                    <TableCell className="font-medium">
                      <div>{venue.name}</div>
                      {venue.instagram_handle && (
                        <div className="text-xs text-muted-foreground">{venue.instagram_handle}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {venue.aliases?.slice(0, 2).map((alias, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{alias}</Badge>
                        ))}
                        {(venue.aliases?.length || 0) > 2 && (
                          <Badge variant="outline" className="text-xs">+{venue.aliases!.length - 2}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{venue.city || "-"}</TableCell>
                    <TableCell>
                      {venue.operating_hours ? (
                        <Badge variant="secondary" className="text-xs flex items-center gap-1 w-fit">
                          <Clock className="h-3 w-3" />
                          Set
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {venue.lat && venue.lng ? `${venue.lat.toFixed(4)}, ${venue.lng.toFixed(4)}` : "-"}
                    </TableCell>
                    <TableCell>
                      {venue.learned_from_corrections ? (
                        <Badge variant="secondary" className="text-xs">Learned</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Seeded</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredVenues.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {searchQuery ? "No venues match your search" : "No venues yet"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
