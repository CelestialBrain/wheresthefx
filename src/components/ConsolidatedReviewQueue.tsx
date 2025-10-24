import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, Loader, CheckCircle, Trash, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PostWithEventEditor } from "./PostWithEventEditor";
import { ClientOCRProcessor } from "./ClientOCRProcessor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

interface Post {
  id: string;
  post_url: string;
  image_url: string;
  stored_image_url: string | null;
  caption: string | null;
  event_title: string | null;
  event_date: string | null;
  event_time: string | null;
  location_name: string | null;
  location_address: string | null;
  price: number | null;
  is_free: boolean;
  signup_url: string | null;
  ocr_processed: boolean;
  ocr_confidence: number | null;
  ocr_error_count: number;
  ocr_last_error: string | null;
  needs_review: boolean;
  is_event: boolean;
  instagram_account: { username: string } | null;
}

const ITEMS_PER_PAGE = 20;

const calculatePriority = (post: Post): number => {
  let score = 0;
  if (post.event_title) score += 15;
  if (post.event_date) score += 30;
  if (post.event_time) score += 20;
  if (post.location_name) score += 20;
  if (post.ocr_confidence) score += post.ocr_confidence * 10;
  
  // Reduce priority for posts with OCR errors
  if (post.ocr_error_count > 0) score -= post.ocr_error_count * 5;
  
  return Math.max(0, Math.min(100, score));
};

const calculateCompleteness = (post: Post): number => {
  const fields = ['event_title', 'event_date', 'event_time', 'location_name', 'location_address'];
  const filled = fields.filter(f => post[f as keyof Post]).length;
  return (filled / fields.length) * 100;
};

export function ConsolidatedReviewQueue() {
  const [filterTab, setFilterTab] = useState<"all" | "needs_data" | "ocr_pending" | "ready">("all");
  const [currentPage, setCurrentPage] = useState(0);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [fieldIssues, setFieldIssues] = useState<Record<string, boolean>>({});
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [postToReject, setPostToReject] = useState<Post | null>(null);
  const queryClient = useQueryClient();

  // Fetch all posts needing attention
  const { data: allPosts, isLoading } = useQuery({
    queryKey: ["consolidated-review-queue", currentPage, filterTab],
    queryFn: async () => {
      let query = supabase
        .from("instagram_posts")
        .select(`
          *,
          instagram_account:instagram_accounts(username)
        `)
        .or('ocr_processed.eq.false,needs_review.eq.true,and(ocr_processed.eq.true,is_event.eq.true)');

      // Apply filter based on active tab
      if (filterTab === 'needs_data') {
        query = query.or('event_title.is.null,event_date.is.null,location_name.is.null');
      } else if (filterTab === 'ocr_pending') {
        query = query.eq('ocr_processed', false);
      } else if (filterTab === 'ready') {
        query = query
          .eq('ocr_processed', true)
          .eq('is_event', true)
          .not('event_title', 'is', null);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      
      if (error) throw error;

      // Calculate priority scores and sort
      const postsWithPriority = (data || []).map(post => ({
        ...post,
        priority: calculatePriority(post),
        completeness: calculateCompleteness(post)
      }));

      return postsWithPriority.sort((a, b) => b.priority - a.priority);
    }
  });

  // Count for OCR pending posts (for showing processor)
  const { data: ocrPendingCount } = useQuery({
    queryKey: ["ocr-pending-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("instagram_posts")
        .select("*", { count: "exact", head: true })
        .eq("ocr_processed", false);
      return count || 0;
    }
  });

  // Force reprocess mutation
  const forceReprocessMutation = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from("instagram_posts")
        .update({
          ocr_processed: false,
          ocr_error_count: 0,
          ocr_last_error: null,
          ocr_last_attempt_at: null
        })
        .eq("id", postId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consolidated-review-queue"] });
      queryClient.invalidateQueries({ queryKey: ["ocr-pending-count"] });
      toast.success("Post reset for reprocessing");
    }
  });

  // Reject with learning mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ post, reason, fields, notes }: { 
      post: Post; 
      reason: string; 
      fields: Record<string, boolean>; 
      notes: string;
    }) => {
      // 1. Log rejection
      const { error: rejectionError } = await supabase
        .from("post_rejections")
        .insert({
          post_id: post.id,
          rejection_reason: reason,
          field_issues: reason === 'bad_extraction' ? fields : null,
          notes: notes || null
        });

      if (rejectionError) throw rejectionError;

      // 2. If bad extraction, log to extraction_corrections
      if (reason === 'bad_extraction') {
        const corrections = Object.entries(fields)
          .filter(([_, isWrong]) => isWrong)
          .map(([field]) => ({
            post_id: post.id,
            field_name: field,
            original_extracted_value: post[field as keyof Post] as string,
            corrected_value: null,
            extraction_method: 'rejected',
            original_ocr_text: null
          }));

        if (corrections.length > 0) {
          const { error: correctionError } = await supabase
            .from("extraction_corrections")
            .insert(corrections);
          
          if (correctionError) throw correctionError;
        }
      }

      // 3. Delete the post
      const { error: deleteError } = await supabase
        .from("instagram_posts")
        .delete()
        .eq("id", post.id);

      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consolidated-review-queue"] });
      toast.success("Post rejected. Feedback logged for learning.");
      setPostToReject(null);
      setRejectionReason("");
      setFieldIssues({});
      setRejectionNotes("");
    },
    onError: (error) => {
      toast.error("Failed to reject post: " + error.message);
    }
  });

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: async (post: Post) => {
      const { error } = await supabase.functions.invoke("publish-event", {
        body: { postId: post.id }
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consolidated-review-queue"] });
      toast.success("Event published successfully!");
    },
    onError: (error) => {
      toast.error("Failed to publish event: " + error.message);
    }
  });

  const paginatedPosts = allPosts?.slice(
    currentPage * ITEMS_PER_PAGE,
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  const totalPages = Math.ceil((allPosts?.length || 0) / ITEMS_PER_PAGE);

  const PriorityBadge = ({ priority }: { priority: number }) => {
    if (priority >= 70) return <Badge className="bg-destructive">High Priority</Badge>;
    if (priority >= 40) return <Badge className="bg-yellow-500">Medium</Badge>;
    return <Badge variant="outline">Low Priority</Badge>;
  };

  const StatusBadge = ({ post }: { post: Post }) => {
    if (!post.ocr_processed) return <Badge variant="secondary"><Loader className="w-3 h-3 mr-1" />OCR Pending</Badge>;
    if (post.needs_review || !post.event_title) return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />Needs Review</Badge>;
    return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Ready</Badge>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Loading review queue...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* OCR Processor - only show if pending posts exist */}
      {(ocrPendingCount || 0) > 0 && (
        <Card>
          <CardHeader className="p-4 md:p-6">
            <h3 className="text-base md:text-lg font-semibold">OCR Processing</h3>
            <p className="text-xs md:text-sm text-muted-foreground">{ocrPendingCount} posts pending OCR processing</p>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <ClientOCRProcessor />
          </CardContent>
        </Card>
      )}

      {/* Main Review Queue */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-bold">Review Queue</h2>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Unified queue for all posts needing attention
          </p>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <Tabs value={filterTab} onValueChange={(v) => {
            setFilterTab(v as typeof filterTab);
            setCurrentPage(0);
          }}>
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 gap-1">
              <TabsTrigger value="all" className="text-xs md:text-sm">
                All ({allPosts?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="needs_data" className="flex items-center gap-1 text-xs md:text-sm">
                <AlertCircle className="w-3 h-3 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Needs Data</span>
                <span className="sm:hidden">Data</span>
              </TabsTrigger>
              <TabsTrigger value="ocr_pending" className="flex items-center gap-1 text-xs md:text-sm">
                <Loader className="w-3 h-3 md:w-4 md:h-4" />
                <span className="hidden sm:inline">OCR</span>
                <span className="sm:hidden">OCR</span>
              </TabsTrigger>
              <TabsTrigger value="ready" className="flex items-center gap-1 text-xs md:text-sm">
                <CheckCircle className="w-3 h-3 md:w-4 md:h-4" />
                <span>Ready</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value={filterTab} className="space-y-3 md:space-y-4 mt-4 md:mt-6">
              {/* Pagination controls */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                <p className="text-xs md:text-sm text-muted-foreground">
                  Showing {currentPage * ITEMS_PER_PAGE + 1}-{Math.min((currentPage + 1) * ITEMS_PER_PAGE, allPosts?.length || 0)} of {allPosts?.length || 0}
                </p>
                <div className="flex gap-2 w-full md:w-auto">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    disabled={currentPage === 0}
                    onClick={() => setCurrentPage(p => p - 1)}
                    className="flex-1 md:flex-initial"
                  >
                    <ChevronLeft className="w-4 h-4 md:mr-1" />
                    <span className="hidden md:inline">Previous</span>
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    disabled={currentPage >= totalPages - 1}
                    onClick={() => setCurrentPage(p => p + 1)}
                    className="flex-1 md:flex-initial"
                  >
                    <span className="hidden md:inline">Next</span>
                    <ChevronRight className="w-4 h-4 md:ml-1" />
                  </Button>
                </div>
              </div>

              {/* Posts list */}
              {paginatedPosts && paginatedPosts.length > 0 ? (
                <div className="space-y-3 md:space-y-4">
                  {paginatedPosts.map((post: any) => (
                    <Card key={post.id}>
                      <CardContent className="p-4 md:p-6">
                        <div className="space-y-3 md:space-y-4">
                          {/* Header with badges */}
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <StatusBadge post={post} />
                              <PriorityBadge priority={post.priority} />
                              {post.instagram_account && (
                                <Badge variant="outline" className="text-xs">@{post.instagram_account.username}</Badge>
                              )}
                            </div>
                          </div>

                          {/* Completeness meter */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Completeness</span>
                              <span>{Math.round(post.completeness)}%</span>
                            </div>
                            <Progress value={post.completeness} className="h-2" />
                          </div>

                          {/* OCR Error Display */}
                          {post.ocr_error_count > 0 && (
                            <div className="bg-destructive/10 p-3 rounded-lg space-y-2">
                              <p className="text-xs md:text-sm text-destructive font-medium">
                                OCR failed {post.ocr_error_count} time{post.ocr_error_count > 1 ? 's' : ''}
                              </p>
                              {post.ocr_last_error && (
                                <p className="text-xs text-muted-foreground">{post.ocr_last_error}</p>
                              )}
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => forceReprocessMutation.mutate(post.id)}
                                disabled={forceReprocessMutation.isPending}
                                className="w-full md:w-auto"
                              >
                                Force Reprocess OCR
                              </Button>
                            </div>
                          )}

                          {/* Post Editor */}
                          <PostWithEventEditor
                            post={post}
                            onCancel={() => setPostToReject(post)}
                            onCreateEvent={() => {
                              queryClient.invalidateQueries({ queryKey: ["consolidated-review-queue"] });
                            }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium">All caught up!</p>
                  <p className="text-sm text-muted-foreground">No posts in this category</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Rejection Dialog */}
      <AlertDialog open={!!postToReject} onOpenChange={(open) => !open && setPostToReject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this post?</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Why reject?</Label>
              <Select value={rejectionReason} onValueChange={setRejectionReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_event">Not an event</SelectItem>
                  <SelectItem value="duplicate">Duplicate</SelectItem>
                  <SelectItem value="spam">Spam/irrelevant</SelectItem>
                  <SelectItem value="bad_extraction">OCR extracted wrong data</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {rejectionReason === 'bad_extraction' && (
              <div className="space-y-2">
                <Label>Which fields were wrong?</Label>
                <div className="space-y-2">
                  {['event_title', 'event_date', 'event_time', 'location_name', 'location_address'].map(field => (
                    <div key={field} className="flex items-center space-x-2">
                      <Checkbox 
                        id={field}
                        checked={fieldIssues[field] || false}
                        onCheckedChange={(checked) => 
                          setFieldIssues({...fieldIssues, [field]: checked === true})
                        }
                      />
                      <Label htmlFor={field} className="text-sm font-normal">
                        {field.replace('event_', '').replace('_', ' ')}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>Additional notes (optional)</Label>
              <Textarea 
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                placeholder="Any additional context..."
                rows={3}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!rejectionReason || rejectMutation.isPending}
              onClick={() => {
                if (postToReject) {
                  rejectMutation.mutate({
                    post: postToReject,
                    reason: rejectionReason,
                    fields: fieldIssues,
                    notes: rejectionNotes
                  });
                }
              }}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject & Log"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
