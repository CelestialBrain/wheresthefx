import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LocationCorrectionEditor } from "./LocationCorrectionEditor";
import { Search, MapPin, Calendar, Clock, Edit2, Undo2, ExternalLink, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface PublishedEvent {
  id: string;
  event_title: string;
  event_date: string;
  event_time: string | null;
  description: string | null;
  signup_url: string | null;
  is_free: boolean;
  price: number | null;
  location_id: string | null;
  instagram_post_id: string | null;
  created_at: string;
  updated_at: string;
  location: {
    id: string;
    location_name: string;
    formatted_address: string | null;
    location_lat: number | null;
    location_lng: number | null;
    manual_override: boolean;
  } | null;
  instagram_post: {
    post_id: string;
    image_url: string | null;
    caption: string | null;
    ocr_confidence: number | null;
    instagram_account: { username: string } | null;
  } | null;
}

export const PublishedEventsManager = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<PublishedEvent | null>(null);
  const [editingLocation, setEditingLocation] = useState(false);
  const [undoStack, setUndoStack] = useState<Array<{ eventId: string; field: string; oldValue: any; newValue: any }>>([]);
  
  const queryClient = useQueryClient();

  const formatTime = (timeStr: string | null): string => {
    if (!timeStr) return "Not specified";
    
    // Handle HH:MM:SS format
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12; // Convert 0 to 12 for midnight
    
    return `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
  };

  // Fetch published events from canonical feed
  const { data: events, isLoading } = useQuery({
    queryKey: ["published-events", searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("published_events")
        .select("*")
        .order("event_date", { ascending: false });

      if (searchQuery.trim()) {
        query = query.or(`event_title.ilike.%${searchQuery}%,location_name.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Transform to match expected interface
      return (data || []).map((event: any) => ({
        id: event.id,
        event_title: event.event_title,
        event_date: event.event_date,
        event_time: event.event_time,
        description: event.description,
        signup_url: event.signup_url,
        is_free: event.is_free,
        price: event.price,
        location_id: null,
        instagram_post_id: event.source_post_id,
        created_at: event.created_at,
        updated_at: event.updated_at,
        location: {
          id: event.id,
          location_name: event.location_name,
          formatted_address: event.location_address,
          location_lat: event.location_lat,
          location_lng: event.location_lng,
          manual_override: true,
        },
        instagram_post: {
          post_id: event.source_post_id || "",
          image_url: event.image_url,
          caption: null,
          ocr_confidence: null,
          instagram_account: event.instagram_account_username ? {
            username: event.instagram_account_username
          } : null,
        },
      })) as PublishedEvent[];
    },
  });

  // Fetch edit history for selected event
  const { data: editHistory } = useQuery({
    queryKey: ["edit-history", selectedEvent?.id],
    queryFn: async () => {
      if (!selectedEvent) return [];
      
      const { data, error } = await supabase
        .from("event_edit_history")
        .select("*")
        .eq("event_id", selectedEvent.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    },
    enabled: !!selectedEvent,
  });

  // Update event mutation
  const updateEventMutation = useMutation({
    mutationFn: async ({ 
      eventId, 
      updates, 
      oldValues 
    }: { 
      eventId: string; 
      updates: any; 
      oldValues: any;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Update published event
      const { error } = await supabase
        .from("published_events")
        .update(updates)
        .eq("id", eventId);

      if (error) throw error;

      // Log history for each field
      const historyEntries = Object.entries(updates).map(([field, newValue]) => ({
        event_id: eventId,
        edited_by: user?.id,
        field_name: field,
        old_value: oldValues[field] as any,
        new_value: newValue as any,
        action_type: "update",
      }));

      const { error: historyError } = await supabase
        .from("event_edit_history")
        .insert(historyEntries);

      if (historyError) console.error("Failed to log history:", historyError);

      return { eventId, updates, oldValues };
    },
    onSuccess: ({ eventId, updates, oldValues }) => {
      // Add to undo stack
      setUndoStack((prev) => [
        { eventId, field: Object.keys(updates).join(","), oldValue: oldValues, newValue: updates },
        ...prev.slice(0, 9), // Keep last 10
      ]);
      
      toast.success("Event updated successfully");
      queryClient.invalidateQueries({ queryKey: ["published-events"] });
      queryClient.invalidateQueries({ queryKey: ["edit-history", eventId] });
    },
  });

  // Undo mutation
  const undoMutation = useMutation({
    mutationFn: async (undoItem: { eventId: string; oldValue: any }) => {
      const { error } = await supabase
        .from("published_events")
        .update(undoItem.oldValue)
        .eq("id", undoItem.eventId);

      if (error) throw error;
    },
    onSuccess: () => {
      setUndoStack((prev) => prev.slice(1));
      toast.success("Change undone");
      queryClient.invalidateQueries({ queryKey: ["published-events"] });
    },
  });

  // Location correction mutation
  const saveLocationMutation = useMutation({
    mutationFn: async ({
      eventId,
      locationId,
      correction,
    }: {
      eventId: string;
      locationId: string;
      correction: { venueName: string; streetAddress: string; lat: number | null; lng: number | null };
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Get old values first
      const { data: location } = await supabase
        .from("locations")
        .select("*")
        .eq("id", locationId)
        .single();

      // Update location
      const { error } = await supabase
        .from("locations")
        .update({
          location_name: correction.venueName,
          formatted_address: correction.streetAddress,
          location_lat: correction.lat,
          location_lng: correction.lng,
          manual_override: true,
        })
        .eq("id", locationId);

      if (error) throw error;

      // Log history
      await supabase.from("event_edit_history").insert({
        event_id: eventId,
        edited_by: user?.id,
        field_name: "location",
        old_value: location,
        new_value: correction,
        action_type: "location_correction",
      });

      // Save to location_corrections for learning
      await supabase.from("location_corrections").insert({
        corrected_venue_name: correction.venueName,
        corrected_street_address: correction.streetAddress,
        manual_lat: correction.lat,
        manual_lng: correction.lng,
        corrected_by: user?.id,
        applied_to_event_id: eventId,
      });
    },
    onSuccess: () => {
      toast.success("Location updated");
      setEditingLocation(false);
      queryClient.invalidateQueries({ queryKey: ["published-events"] });
      queryClient.invalidateQueries({ queryKey: ["edit-history", selectedEvent?.id] });
    },
  });

  const handleUndo = () => {
    if (undoStack.length > 0) {
      undoMutation.mutate(undoStack[0]);
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading published events...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Published Events</h2>
          <p className="text-muted-foreground">{events?.length || 0} events published</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleUndo}
          disabled={undoStack.length === 0}
        >
          <Undo2 className="w-4 h-4 mr-2" />
          Undo Last Change
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by title or venue..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Events Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {events?.map((event) => (
          <Card 
            key={event.id} 
            className="cursor-pointer hover:border-accent transition-colors"
            onClick={() => setSelectedEvent(event)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                {event.instagram_post?.image_url && (
                  <img
                    src={event.instagram_post.image_url}
                    alt=""
                    className="w-16 h-16 object-cover rounded"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base truncate">{event.event_title}</CardTitle>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    <span>{format(new Date(event.event_date), "MMM d, yyyy")}</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                <span className="line-clamp-1">{event.location?.location_name || "No location"}</span>
              </div>
              {event.location?.manual_override && (
                <Badge variant="secondary" className="text-xs">Manually Corrected</Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Event Detail Modal */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedEvent.event_title}</DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                {/* Instagram Post */}
                {selectedEvent.instagram_post && (
                  <div className="space-y-2">
                    <h3 className="font-medium flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      Original Instagram Post
                    </h3>
                    <div className="flex gap-4">
                      {selectedEvent.instagram_post.image_url && (
                        <img
                          src={selectedEvent.instagram_post.image_url}
                          alt="Post"
                          className="w-40 h-40 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 space-y-2 text-sm">
                        <p><strong>Account:</strong> @{selectedEvent.instagram_post.instagram_account?.username}</p>
                        <p><strong>Post ID:</strong> {selectedEvent.instagram_post.post_id}</p>
                        {selectedEvent.instagram_post.ocr_confidence && (
                          <Badge variant="outline">
                            OCR: {(selectedEvent.instagram_post.ocr_confidence * 100).toFixed(0)}%
                          </Badge>
                        )}
                        {selectedEvent.instagram_post.caption && (
                          <p className="text-muted-foreground line-clamp-3">{selectedEvent.instagram_post.caption}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Event Details */}
                <div className="space-y-3">
                  <h3 className="font-medium">Event Details</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><strong>Date:</strong> {format(new Date(selectedEvent.event_date), "PPP")}</div>
                    <div><strong>Time:</strong> {formatTime(selectedEvent.event_time)}</div>
                    <div><strong>Price:</strong> {selectedEvent.is_free ? "Free" : `₱${selectedEvent.price}`}</div>
                    {selectedEvent.signup_url && (
                      <div className="col-span-2">
                        <strong>Signup:</strong>{" "}
                        <a href={selectedEvent.signup_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                          Link <ExternalLink className="w-3 h-3 inline" />
                        </a>
                      </div>
                    )}
                  </div>
                  {selectedEvent.description && (
                    <div>
                      <strong className="text-sm">Description:</strong>
                      <p className="text-sm text-muted-foreground mt-1">{selectedEvent.description}</p>
                    </div>
                  )}
                </div>

                {/* Location */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Location
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingLocation(!editingLocation)}
                    >
                      <Edit2 className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  </div>

                  {!editingLocation && selectedEvent.location && (
                    <div className="bg-muted/50 rounded-md p-3 space-y-1 text-sm">
                      <div><strong>Venue:</strong> {selectedEvent.location.location_name}</div>
                      <div><strong>Address:</strong> {selectedEvent.location.formatted_address || "N/A"}</div>
                      <div><strong>Coordinates:</strong> {selectedEvent.location.location_lat}, {selectedEvent.location.location_lng}</div>
                      {selectedEvent.location.manual_override && (
                        <Badge variant="secondary" className="mt-2">Manually Corrected</Badge>
                      )}
                    </div>
                  )}

                  {editingLocation && selectedEvent.location && (
                    <LocationCorrectionEditor
                      eventId={selectedEvent.id}
                      locationId={selectedEvent.location.id}
                      originalOCR={{
                        venue: selectedEvent.location.location_name,
                        address: selectedEvent.location.formatted_address || "",
                      }}
                      currentLocation={selectedEvent.location}
                      onSave={(correction) => {
                        saveLocationMutation.mutate({
                          eventId: selectedEvent.id,
                          locationId: selectedEvent.location!.id,
                          correction,
                        });
                      }}
                      onCancel={() => setEditingLocation(false)}
                    />
                  )}
                </div>

                {/* Edit History */}
                {editHistory && editHistory.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-medium">Edit History</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {editHistory.map((entry) => (
                        <div key={entry.id} className="text-xs bg-muted/50 rounded p-2">
                          <div className="font-medium">{entry.field_name} - {entry.action_type}</div>
                          <div className="text-muted-foreground">
                            {format(new Date(entry.created_at), "PPp")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};