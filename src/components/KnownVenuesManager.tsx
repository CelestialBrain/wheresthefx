import { useState } from "react";
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
  DialogTrigger,
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
import { Plus, Pencil, Trash2, Search, MapPin, Download, Upload } from "lucide-react";

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
}

interface VenueFormData {
  name: string;
  aliases: string;
  address: string;
  city: string;
  lat: string;
  lng: string;
  instagram_handle: string;
}

const emptyFormData: VenueFormData = {
  name: "",
  aliases: "",
  address: "",
  city: "",
  lat: "",
  lng: "",
  instagram_handle: "",
};

export const KnownVenuesManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<VenueFormData>(emptyFormData);

  const { data: venues, isLoading } = useQuery({
    queryKey: ["known-venues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("known_venues")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as KnownVenue[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: VenueFormData) => {
      const { error } = await supabase.from("known_venues").insert({
        name: data.name,
        aliases: data.aliases ? data.aliases.split(",").map((a) => a.trim()).filter(Boolean) : [],
        address: data.address || null,
        city: data.city || null,
        lat: data.lat ? parseFloat(data.lat) : null,
        lng: data.lng ? parseFloat(data.lng) : null,
        instagram_handle: data.instagram_handle || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["known-venues"] });
      toast({ title: "Venue added successfully" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error adding venue", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: VenueFormData }) => {
      const { error } = await supabase
        .from("known_venues")
        .update({
          name: data.name,
          aliases: data.aliases ? data.aliases.split(",").map((a) => a.trim()).filter(Boolean) : [],
          address: data.address || null,
          city: data.city || null,
          lat: data.lat ? parseFloat(data.lat) : null,
          lng: data.lng ? parseFloat(data.lng) : null,
          instagram_handle: data.instagram_handle || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["known-venues"] });
      toast({ title: "Venue updated successfully" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error updating venue", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("known_venues").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["known-venues"] });
      toast({ title: "Venue deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error deleting venue", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData(emptyFormData);
    setEditingId(null);
    setIsDialogOpen(false);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const startEdit = (venue: KnownVenue) => {
    setFormData({
      name: venue.name,
      aliases: venue.aliases?.join(", ") || "",
      address: venue.address || "",
      city: venue.city || "",
      lat: venue.lat?.toString() || "",
      lng: venue.lng?.toString() || "",
      instagram_handle: venue.instagram_handle || "",
    });
    setEditingId(venue.id);
    setIsDialogOpen(true);
  };

  const handleExport = () => {
    if (!venues) return;
    const dataStr = JSON.stringify(venues, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "known_venues.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredVenues = venues?.filter((venue) => {
    const query = searchQuery.toLowerCase();
    return (
      venue.name.toLowerCase().includes(query) ||
      venue.city?.toLowerCase().includes(query) ||
      venue.aliases?.some((a) => a.toLowerCase().includes(query)) ||
      venue.instagram_handle?.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading venues...</div>;
  }

  return (
    <Card>
      <CardHeader className="p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Known Venues ({venues?.length || 0})
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Venues used by AI extraction for location matching
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => { resetForm(); setIsDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Venue
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingId ? "Edit Venue" : "Add New Venue"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Name *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., The Victor"
                    />
                  </div>
                  <div>
                    <Label>Aliases (comma-separated)</Label>
                    <Input
                      value={formData.aliases}
                      onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
                      placeholder="e.g., Victor Gallery, The Victor Space"
                    />
                  </div>
                  <div>
                    <Label>Address</Label>
                    <Input
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="e.g., 123 Main St"
                    />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="e.g., Pasig"
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
                  <div>
                    <Label>Instagram Handle</Label>
                    <Input
                      value={formData.instagram_handle}
                      onChange={(e) => setFormData({ ...formData, instagram_handle: e.target.value })}
                      placeholder="e.g., @thevictor_ph"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={resetForm}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                      {editingId ? "Update" : "Create"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search venues by name, city, alias..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Aliases</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Coordinates</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVenues?.map((venue) => (
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
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(venue)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Delete "${venue.name}"?`)) {
                            deleteMutation.mutate(venue.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredVenues?.length === 0 && (
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
  );
};
