import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PostWithEventEditor } from "@/components/PostWithEventEditor";

export function ReviewQueue() {
  const queryClient = useQueryClient();

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


  const rejectMutation = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from("instagram_posts")
        .delete()
        .eq("id", postId);
      if (error) throw error;
    },
    onMutate: async (postId) => {
      await queryClient.cancelQueries({ queryKey: ["review-queue"] });
      const previous = queryClient.getQueryData(["review-queue"]);
      queryClient.setQueryData(["review-queue"], (old: any[]) => 
        old?.filter(item => item.id !== postId)
      );
      return { previous };
    },
    onError: (err, postId, context: any) => {
      queryClient.setQueryData(["review-queue"], context.previous);
      toast.error("Failed to delete event");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      queryClient.invalidateQueries({ queryKey: ["posts-without-events"] });
      queryClient.invalidateQueries({ queryKey: ["unprocessed-ocr-posts"] });
      queryClient.invalidateQueries({ queryKey: ["event-markers"] });
      toast.success("Event deleted");
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
    onMutate: async (postId) => {
      // Cancel ongoing queries
      await queryClient.cancelQueries({ queryKey: ["posts-without-events"] });
      
      // Snapshot current state
      const previous = queryClient.getQueryData(["posts-without-events"]);
      
      // Optimistically remove from UI
      queryClient.setQueryData(["posts-without-events"], (old: any[]) => 
        old?.filter(item => item.id !== postId)
      );
      
      return { previous };
    },
    onError: (err, postId, context: any) => {
      // Rollback on error
      queryClient.setQueryData(["posts-without-events"], context.previous);
      toast.error(`Failed to delete post: ${err.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts-without-events"] });
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      queryClient.invalidateQueries({ queryKey: ["unprocessed-ocr-posts"] });
      queryClient.invalidateQueries({ queryKey: ["event-markers"] });
      toast.success("Post deleted successfully");
    },
  });


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
            reviewItems?.map((item: any) => (
              <div key={item.id} className="space-y-4">
                <PostWithEventEditor
                  post={{
                    ...item,
                    event_end_date: item.event_end_date || null,
                    end_time: item.end_time || null,
                  }}
                  onCreateEvent={async (eventId) => {
                    // Save changes first
                    await queryClient.invalidateQueries({ queryKey: ["review-queue"] });
                    await queryClient.invalidateQueries({ queryKey: ["posts-without-events"] });
                    
                    // Then publish to feed
                    try {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) {
                        toast.error("Please sign in to publish events");
                        return;
                      }

                      const { data, error } = await supabase.functions.invoke("publish-event", {
                        body: { postId: item.id },
                      });

                      if (error) throw error;

                      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
                      queryClient.invalidateQueries({ queryKey: ["event-markers"] });
                      queryClient.invalidateQueries({ queryKey: ["published-events"] });
                      toast.success("Event published to feed!");
                    } catch (error: any) {
                      toast.error(error?.message || "Failed to publish event");
                    }
                  }}
                  onCancel={() => rejectMutation.mutate(item.id)}
                />
              </div>
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
            postsWithoutEvents?.map((post: any) => (
              <PostWithEventEditor
                key={post.id}
                post={{
                  ...post,
                  event_end_date: post.event_end_date || null,
                  end_time: post.end_time || null,
                }}
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
