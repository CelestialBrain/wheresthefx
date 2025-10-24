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
import { MapPin, Calendar, Clock, AlertCircle, CheckCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocationCorrectionEditor } from "@/components/LocationCorrectionEditor";
import { PostWithEventEditor } from "@/components/PostWithEventEditor";

export function ReviewQueue() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [showLocationEditor, setShowLocationEditor] = useState<string | null>(null);

  const { data: reviewItems, isLoading } = useQuery({
    queryKey: ["review-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_posts")
        .select(`
          *,
          instagram_account:instagram_accounts(username)
        `)
        .eq("is_event", true)
        .eq("needs_review", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const { data: postsWithoutEvents } = useQuery({
    queryKey: ["posts-without-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_posts")
        .select(`
          *,
          instagram_account:instagram_accounts(username)
        `)
        .eq("is_event", true)
        .eq("needs_review", true)
        .is("event_title", null)
        .order("posted_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase
        .from("instagram_posts")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      toast.success("Event updated");
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (postId: string) => {
      const { data, error } = await supabase.functions.invoke("publish-event", {
        body: { postId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      queryClient.invalidateQueries({ queryKey: ["event-markers"] });
      queryClient.invalidateQueries({ queryKey: ["published-events"] });
      toast.success("Event published!");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to publish");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (postId: string) => {
      // Mark post as not an event
      const { error } = await supabase
        .from("instagram_posts")
        .update({ is_event: false, needs_review: false })
        .eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      toast.success("Event rejected");
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
      queryClient.invalidateQueries({ queryKey: ["posts-without-events"] });
      queryClient.invalidateQueries({ queryKey: ["event-markers"] });
      queryClient.invalidateQueries({ queryKey: ["instagram-posts"] });
      toast.success("Post deleted successfully");
    },
    onError: (error: any) => {
      toast.error(`Failed to delete post: ${error.message}`);
    },
  });

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditData({
      event_title: item.event_title,
      event_date: item.event_date,
      event_time: item.event_time,
      caption: item.caption,
      signup_url: item.signup_url,
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateEventMutation.mutate({ id: editingId, updates: editData });
    setEditingId(null);
    setEditData({});
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
              <Card key={item.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex gap-4">
                    {item.image_url && (
                      <img 
                        src={item.image_url} 
                        alt="Post" 
                        className="w-24 h-24 object-cover rounded-md"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg line-clamp-2">
                          {editingId === item.id ? (
                            <Input
                              value={editData.event_title || ""}
                              onChange={(e) => setEditData({ ...editData, event_title: e.target.value })}
                            />
                          ) : (
                            item.event_title
                          )}
                        </CardTitle>
                        {item.ocr_confidence && (
                          <Badge variant="outline" className="shrink-0">
                            OCR: {Math.min(100, Math.round(item.ocr_confidence * 100))}%
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="mt-1">
                        @{item.instagram_account?.username || "unknown"}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {editingId === item.id ? (
                    <div className="space-y-3">
                      <div>
                        <Label>Event Date</Label>
                        <Input
                          type="date"
                          value={editData.event_date || ""}
                          onChange={(e) => setEditData({ ...editData, event_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Event Time</Label>
                        <Input
                          type="time"
                          value={editData.event_time || ""}
                          onChange={(e) => setEditData({ ...editData, event_time: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Textarea
                          value={editData.caption || ""}
                          onChange={(e) => setEditData({ ...editData, caption: e.target.value })}
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label>Signup URL</Label>
                        <Input
                          value={editData.signup_url || ""}
                          onChange={(e) => setEditData({ ...editData, signup_url: e.target.value })}
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
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          {editingId === item.id ? (
                            <Input
                              type="date"
                              value={editData.event_date || ""}
                              onChange={(e) => setEditData({ ...editData, event_date: e.target.value })}
                            />
                          ) : (
                            <span>{item.event_date || "Not set"}</span>
                          )}
                        </div>
                        {(item.event_time || editingId === item.id) && (
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                            {editingId === item.id ? (
                              <Input
                                type="time"
                                value={editData.event_time || ""}
                                onChange={(e) => setEditData({ ...editData, event_time: e.target.value })}
                              />
                            ) : (
                              <span>{item.event_time}</span>
                            )}
                          </div>
                        )}
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                          <div className="flex-1">
                            <div>{item.location_name || "Location not set"}</div>
                            {item.location_address && (
                              <div className="text-muted-foreground text-xs">
                                {item.location_address}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {showLocationEditor === item.id && (
                        <LocationCorrectionEditor
                          eventId={item.id}
                          locationId={null}
                          originalOCR={{
                            venue: item.location_name || "",
                            address: item.location_address || "",
                          }}
                          currentLocation={{
                            location_name: item.location_name,
                            formatted_address: item.location_address,
                            location_lat: item.location_lat,
                            location_lng: item.location_lng,
                          }}
                          onSave={(correction) => {
                            // Update the instagram_posts directly with new location
                            updateEventMutation.mutate({
                              id: item.id,
                              updates: {
                                location_name: correction.venueName,
                                location_address: correction.streetAddress,
                                location_lat: correction.lat,
                                location_lng: correction.lng,
                              }
                            });
                            setShowLocationEditor(null);
                          }}
                          onCancel={() => setShowLocationEditor(null)}
                        />
                      )}

                      {!item.location_lat && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-3">
                          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-500">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-sm font-medium">
                              Missing GPS coordinates - event cannot be published until location is set
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          onClick={() => startEdit(item)}
                          variant="outline"
                          size="sm"
                        >
                          Edit Details
                        </Button>
                        <Button
                          onClick={() => setShowLocationEditor(showLocationEditor === item.id ? null : item.id)}
                          variant="outline"
                          size="sm"
                        >
                          {showLocationEditor === item.id ? "Hide" : "Edit"} Location
                        </Button>
                        <div className="flex-1" />
                        <Button
                          onClick={() => rejectMutation.mutate(item.id)}
                          variant="destructive"
                          size="sm"
                        >
                          Reject
                        </Button>
                        <Button
                          onClick={() => approveMutation.mutate(item.id)}
                          disabled={!item.location_lat || !item.event_date}
                          size="sm"
                        >
                          Publish
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
          {postsWithoutEvents?.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <p className="text-lg font-medium">All posts processed!</p>
                <p className="text-muted-foreground">No posts waiting for event creation</p>
              </CardContent>
            </Card>
          ) : (
            postsWithoutEvents?.map((post) => (
              <PostWithEventEditor
                key={post.id}
                post={post}
                onCreateEvent={(postId) => {
                  queryClient.invalidateQueries({ queryKey: ["posts-without-events"] });
                  queryClient.invalidateQueries({ queryKey: ["review-queue"] });
                }}
                onCancel={() => deletePostMutation.mutate(post.id)}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
