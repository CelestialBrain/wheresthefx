import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";
import { MapPin, Calendar, Clock, AlertCircle, CheckCircle, X, Navigation, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocationCorrectionEditor } from "@/components/LocationCorrectionEditor";
import { PostWithEventEditor } from "@/components/PostWithEventEditor";

interface ReviewItem {
  id: string;
  instagram_post_id: string;
  event_title: string;
  event_date: string;
  event_time: string | null;
  description: string | null;
  status: string;
  needs_review: boolean;
  location_id: string | null;
  signup_url: string | null;
  likes_count: number;
  comments_count: number;
  location?: {
    id: string;
    location_name: string;
    location_lat: number | null;
    location_lng: number | null;
    formatted_address: string | null;
    floor_note: string | null;
    needs_review: boolean;
  };
  instagram_post?: {
    post_url: string;
    posted_at: string;
    instagram_account: {
      username: string;
      display_name: string | null;
    };
  };
}

export function ReviewQueue() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<ReviewItem>>({});
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);

  const { data: reviewItems, isLoading } = useQuery({
    queryKey: ["review-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events_enriched")
        .select(`
          *,
          location:locations(*),
          instagram_post:instagram_posts(
            post_url,
            posted_at,
            instagram_account:instagram_accounts(username, display_name)
          )
        `)
        .eq("needs_review", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ReviewItem[];
    },
  });

  const { data: postsWithoutEvents } = useQuery({
    queryKey: ["posts-without-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_posts")
        .select(`
          *,
          instagram_account:instagram_accounts(username, display_name)
        `)
        .eq("is_event", true)
        .order("posted_at", { ascending: false });

      if (error) throw error;

      // Filter out posts that already have events
      const { data: existingEvents } = await supabase
        .from("events_enriched")
        .select("instagram_post_id");

      const existingPostIds = new Set(existingEvents?.map(e => e.instagram_post_id) || []);
      return data?.filter(post => !existingPostIds.has(post.id)) || [];
    },
  });

  const geocodeMutation = useMutation({
    mutationFn: async (locationName: string) => {
      const { data, error } = await supabase.functions.invoke("geocode-location", {
        body: { locationName },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, locationName) => {
      toast.success(`Geocoded: ${locationName}`);
      console.log("Geocode result:", data);
    },
    onError: (error: any) => {
      toast.error(`Geocoding failed: ${error.message}`);
    },
  });

  const enrichEventMutation = useMutation({
    mutationFn: async (postId: string) => {
      const { data, error } = await supabase.functions.invoke("enrich-event", {
        body: { postId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Event created successfully");
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      queryClient.invalidateQueries({ queryKey: ["posts-without-events"] });
    },
    onError: (error: any) => {
      toast.error(`Failed to create event: ${error.message}`);
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ReviewItem> }) => {
      const { error } = await supabase
        .from("events_enriched")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event updated");
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      setEditingId(null);
      setEditData({});
    },
  });

  const updateLocationMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase
        .from("locations")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Location updated");
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("events_enriched")
        .update({
          needs_review: false,
          verified: true,
          status: "published",
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event approved and published");
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("events_enriched")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event rejected");
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from("instagram_posts")
        .delete()
        .eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Post deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["posts-without-events"] });
      queryClient.invalidateQueries({ queryKey: ["event-markers"] });
      queryClient.invalidateQueries({ queryKey: ["instagram-posts"] });
    },
    onError: (error: any) => {
      toast.error(`Failed to delete post: ${error.message}`);
    },
  });

  const saveLocationCorrectionMutation = useMutation({
    mutationFn: async ({ 
      eventId, 
      locationId, 
      correction,
      originalOCR 
    }: { 
      eventId: string;
      locationId: string | null;
      correction: { venueName: string; streetAddress: string; lat: number | null; lng: number | null };
      originalOCR: { venue: string; address: string };
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create or update location
      let finalLocationId = locationId;
      
      if (locationId) {
        // Update existing location
        const { error } = await supabase
          .from("locations")
          .update({
            location_name: correction.venueName,
            formatted_address: correction.streetAddress,
            location_lat: correction.lat,
            location_lng: correction.lng,
            manual_override: true,
            needs_review: false,
          })
          .eq("id", locationId);
        
        if (error) throw error;
      } else {
        // Create new location
        const { data: newLocation, error } = await supabase
          .from("locations")
          .insert({
            location_name: correction.venueName,
            formatted_address: correction.streetAddress,
            location_lat: correction.lat,
            location_lng: correction.lng,
            manual_override: true,
            needs_review: false,
          })
          .select()
          .single();
        
        if (error) throw error;
        finalLocationId = newLocation.id;
        
        // Update event with new location
        const { error: updateError } = await supabase
          .from("events_enriched")
          .update({ location_id: finalLocationId })
          .eq("id", eventId);
        
        if (updateError) throw updateError;
      }
      
      // Save to location_corrections table for learning
      const { error: correctionError } = await supabase
        .from("location_corrections")
        .insert({
          original_location_name: originalOCR.venue,
          original_location_address: originalOCR.address,
          corrected_venue_name: correction.venueName,
          corrected_street_address: correction.streetAddress,
          manual_lat: correction.lat,
          manual_lng: correction.lng,
          corrected_by: user?.id,
          applied_to_event_id: eventId,
          match_pattern: correction.streetAddress?.toLowerCase().replace(/[^a-z0-9\s]/g, ''),
        });
      
      if (correctionError) throw correctionError;
      
      return finalLocationId;
    },
    onSuccess: () => {
      toast.success("Location corrected and saved for future learning");
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      setEditingLocationId(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to save correction: ${error.message}`);
    },
  });

  const startEdit = (item: ReviewItem) => {
    setEditingId(item.id);
    setEditData({
      event_title: item.event_title,
      event_date: item.event_date,
      event_time: item.event_time,
      description: item.description,
      signup_url: item.signup_url,
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateEventMutation.mutate({ id: editingId, updates: editData });
  };

  if (isLoading) {
    return <div className="p-4">Loading review queue...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Review Queue</h2>
          <p className="text-muted-foreground">
            {reviewItems?.length || 0} events need attention
          </p>
        </div>
      </div>

      <Tabs defaultValue="events" className="w-full">
        <TabsList>
          <TabsTrigger value="events">
            Events Needing Review ({reviewItems?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="posts">
            Posts Without Events ({postsWithoutEvents?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4">
          {reviewItems?.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <p className="text-lg font-medium">All caught up!</p>
                <p className="text-muted-foreground">No events need review</p>
              </CardContent>
            </Card>
          ) : (
            reviewItems?.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      {editingId === item.id ? (
                        <Input
                          value={editData.event_title || ""}
                          onChange={(e) =>
                            setEditData({ ...editData, event_title: e.target.value })
                          }
                          className="text-xl font-bold"
                        />
                      ) : (
                        <CardTitle>{item.event_title}</CardTitle>
                      )}
                      <CardDescription className="flex items-center gap-2">
                        <span>
                          @{item.instagram_post?.instagram_account?.username || "unknown"}
                        </span>
                        <span>·</span>
                        <span>
                          {new Date(
                            item.instagram_post?.posted_at || ""
                          ).toLocaleDateString()}
                        </span>
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {!item.location?.location_lat && (
                        <Badge variant="destructive">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Missing GPS
                        </Badge>
                      )}
                      {!item.event_date && (
                        <Badge variant="destructive">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Missing Date
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {editingId === item.id ? (
                    <div className="space-y-4">
                      <div>
                        <Label>Event Date</Label>
                        <Input
                          type="date"
                          value={editData.event_date || ""}
                          onChange={(e) =>
                            setEditData({ ...editData, event_date: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label>Event Time</Label>
                        <Input
                          type="time"
                          value={editData.event_time || ""}
                          onChange={(e) =>
                            setEditData({ ...editData, event_time: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Textarea
                          value={editData.description || ""}
                          onChange={(e) =>
                            setEditData({ ...editData, description: e.target.value })
                          }
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label>Signup URL</Label>
                        <Input
                          value={editData.signup_url || ""}
                          onChange={(e) =>
                            setEditData({ ...editData, signup_url: e.target.value })
                          }
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={saveEdit}>Save Changes</Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingId(null);
                            setEditData({});
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span>
                            {item.event_date
                              ? new Date(item.event_date).toLocaleDateString()
                              : "No date"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span>{item.event_time || "No time"}</span>
                        </div>
                      </div>

                      {editingLocationId === item.id ? (
                        <LocationCorrectionEditor
                          eventId={item.id}
                          locationId={item.location_id}
                          originalOCR={{
                            venue: item.location?.location_name || "",
                            address: item.location?.formatted_address || ""
                          }}
                          currentLocation={item.location ? {
                            location_name: item.location.location_name,
                            formatted_address: item.location.formatted_address || "",
                            location_lat: item.location.location_lat,
                            location_lng: item.location.location_lng,
                          } : undefined}
                          onSave={(correction) => {
                            saveLocationCorrectionMutation.mutate({
                              eventId: item.id,
                              locationId: item.location_id,
                              correction,
                              originalOCR: {
                                venue: item.location?.location_name || "",
                                address: item.location?.formatted_address || ""
                              }
                            });
                          }}
                          onCancel={() => setEditingLocationId(null)}
                        />
                      ) : (
                        item.location && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium">
                                {item.location.location_name}
                              </span>
                            </div>
                            <div className="ml-6 space-y-2">
                              {item.location.location_lat && item.location.location_lng ? (
                                <div className="text-sm text-muted-foreground">
                                  GPS: {item.location.location_lat}, {item.location.location_lng}
                                </div>
                              ) : null}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingLocationId(item.id)}
                              >
                                <MapPin className="w-4 h-4 mr-2" />
                                {item.location.location_lat ? "Edit Location" : "Add Coordinates"}
                              </Button>
                            </div>
                          </div>
                        )
                      )}

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(item)}
                        >
                          Edit Details
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => approveMutation.mutate(item.id)}
                          disabled={
                            !item.location?.location_lat || !item.event_date
                          }
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Approve & Publish
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => rejectMutation.mutate(item.id)}
                        >
                          <X className="w-4 h-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="posts" className="space-y-4">
          {postsWithoutEvents?.map((post: any) => (
            <PostWithEventEditor
              key={post.id}
              post={post}
              onCreateEvent={(postId) => {
                if (postId) {
                  queryClient.invalidateQueries({ queryKey: ["posts-without-events"] });
                  queryClient.invalidateQueries({ queryKey: ["event-markers"] });
                  queryClient.invalidateQueries({ queryKey: ["instagram-posts"] });
                }
              }}
              onCancel={() => deletePostMutation.mutate(post.id)}
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
