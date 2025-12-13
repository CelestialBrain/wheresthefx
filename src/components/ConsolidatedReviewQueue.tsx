import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/constants/categoryColors";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, Loader, CheckCircle, Trash, ChevronLeft, ChevronRight, CheckCheck, AlertTriangle, XCircle, Download } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PriceDisplay } from "./PriceDisplay";
import { SubEventsDisplay } from "./SubEventsDisplay";
import { PerformersDisplay } from "./PerformersDisplay";
import { Json } from "@/integrations/supabase/types";

interface Post {
  id: string;
  post_id: string;
  post_url: string;
  image_url: string;
  stored_image_url: string | null;
  caption: string | null;
  event_title: string | null;
  event_date: string | null;
  event_end_date: string | null;
  event_time: string | null;
  end_time: string | null;
  location_name: string | null;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_status: string | null;
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  price_notes: string | null;
  is_free: boolean;
  signup_url: string | null;
  ocr_processed: boolean;
  ocr_confidence: number | null;
  ocr_text: string | null;
  ocr_error_count: number;
  ocr_last_error: string | null;
  needs_review: boolean;
  is_event: boolean;
  instagram_account: { username: string } | null;
  extraction_method: string | null;
  category: string | null;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  review_tier: string | null;
  validation_warnings: string[] | null;
  is_duplicate: boolean | null;
  is_recurring: boolean | null;
  recurrence_pattern: string | null;
  urgency_score: number | null;
  sub_events: Json | null;
}

const extractionMethodLabels: Record<string, { label: string; icon: string }> = {
  'regex': { label: 'Regex', icon: '⚡' },
  'ai': { label: 'AI', icon: '🤖' },
  'ai_corrected': { label: 'AI Fixed', icon: '🔧' },
  'ocr_ai': { label: 'OCR+AI', icon: '👁️' },
  'vision': { label: 'Vision', icon: '📷' },
  'github_actions_gemini_vision': { label: 'GitHub', icon: '🐙' },
};

const ITEMS_PER_PAGE = 20;

const calculatePriority = (post: Post): number => {
  let score = 0;
  if (post.event_title) score += 15;
  if (post.event_date) score += 30;
  if (post.event_time) score += 20;
  if (post.location_name) score += 20;
  if (post.ai_confidence) score += post.ai_confidence * 10;
  if (post.location_lat && post.location_lng) score += 10;
  
  // Reduce priority for posts with OCR errors
  if (post.ocr_error_count > 0) score -= post.ocr_error_count * 5;
  
  return Math.max(0, Math.min(100, score));
};

const calculateCompleteness = (post: Post): number => {
  const fields = ['event_title', 'event_date', 'event_time', 'location_name', 'location_lat'];
  const filled = fields.filter(f => post[f as keyof Post]).length;
  return (filled / fields.length) * 100;
};

type TierTab = 'ready' | 'quick' | 'full' | 'rejected';

export function ConsolidatedReviewQueue() {
  const [tierTab, setTierTab] = useState<TierTab>("ready");
  const [currentPage, setCurrentPage] = useState(0);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [fieldIssues, setFieldIssues] = useState<Record<string, boolean>>({});
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [postToReject, setPostToReject] = useState<Post | null>(null);
  const [hidePastEvents, setHidePastEvents] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const queryClient = useQueryClient();

  // Export functions
  const exportQueueAsJSON = async () => {
    setIsExporting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch ALL posts for current tier (bypass pagination)
      let query = supabase
        .from("instagram_posts")
        .select(`
          id, post_id, post_url, caption, ocr_text, ai_reasoning,
          event_title, event_date, event_end_date, event_time, end_time,
          location_name, location_address, location_lat, location_lng,
          price, price_min, price_max, price_notes, is_free,
          signup_url, category, ai_confidence, extraction_method,
          review_tier, validation_warnings, is_duplicate,
          is_recurring, recurrence_pattern, urgency_score,
          ocr_confidence, ocr_error_count,
          instagram_account:instagram_accounts(username)
        `)
        .eq("is_event", true)
        .eq("review_tier", tierTab);

      const { data, error } = await query.order("created_at", { ascending: false });
      
      if (error) throw error;

      // Filter past events if toggle is on
      let filteredData = data || [];
      if (hidePastEvents) {
        filteredData = filteredData.filter(post => 
          !post.event_date || post.event_date >= today
        );
      }

      // Calculate summary statistics
      const summary = {
        exportedAt: new Date().toISOString(),
        tier: tierTab,
        totalPosts: filteredData.length,
        hidePastEvents,
        statistics: {
          avgConfidence: filteredData.length > 0 
            ? (filteredData.reduce((acc, p) => acc + (p.ai_confidence || 0), 0) / filteredData.length).toFixed(3)
            : 0,
          missingFields: {
            event_title: filteredData.filter(p => !p.event_title).length,
            event_date: filteredData.filter(p => !p.event_date).length,
            event_time: filteredData.filter(p => !p.event_time).length,
            location_name: filteredData.filter(p => !p.location_name).length,
            coordinates: filteredData.filter(p => !p.location_lat).length,
            price: filteredData.filter(p => !p.is_free && !p.price).length,
          },
          categories: filteredData.reduce((acc, p) => {
            const cat = p.category || 'unknown';
            acc[cat] = (acc[cat] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          extractionMethods: filteredData.reduce((acc, p) => {
            const method = p.extraction_method || 'unknown';
            acc[method] = (acc[method] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          validationWarnings: filteredData.reduce((acc, p) => {
            (p.validation_warnings || []).forEach((w: string) => {
              acc[w] = (acc[w] || 0) + 1;
            });
            return acc;
          }, {} as Record<string, number>),
        },
      };

      const exportData = {
        summary,
        posts: filteredData.map(p => ({
          ...p,
          instagram_username: p.instagram_account?.username || null,
        })),
      };

      // Download as JSON
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `review_queue_${tierTab}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${filteredData.length} posts as JSON`);
    } catch (error: any) {
      toast.error("Export failed: " + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  const exportQueueAsCSV = async () => {
    setIsExporting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      
      let query = supabase
        .from("instagram_posts")
        .select(`
          id, post_id, post_url, caption, ocr_text,
          event_title, event_date, event_end_date, event_time, end_time,
          location_name, location_address, location_lat, location_lng,
          price, price_min, price_max, price_notes, is_free,
          signup_url, category, ai_confidence, extraction_method,
          review_tier, validation_warnings, is_duplicate,
          is_recurring, recurrence_pattern, urgency_score,
          instagram_account:instagram_accounts(username)
        `)
        .eq("is_event", true)
        .eq("review_tier", tierTab);

      const { data, error } = await query.order("created_at", { ascending: false });
      
      if (error) throw error;

      let filteredData = data || [];
      if (hidePastEvents) {
        filteredData = filteredData.filter(post => 
          !post.event_date || post.event_date >= today
        );
      }

      // CSV headers
      const headers = [
        'id', 'post_id', 'post_url', 'instagram_username',
        'event_title', 'event_date', 'event_time', 'end_time',
        'location_name', 'location_address', 'location_lat', 'location_lng',
        'price', 'price_min', 'price_max', 'price_notes', 'is_free',
        'category', 'ai_confidence', 'extraction_method',
        'review_tier', 'validation_warnings', 'is_duplicate',
        'is_recurring', 'recurrence_pattern', 'urgency_score',
        'caption', 'ocr_text'
      ];

      // Escape CSV values
      const escapeCSV = (val: any): string => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = filteredData.map(p => [
        p.id, p.post_id, p.post_url, p.instagram_account?.username || '',
        p.event_title, p.event_date, p.event_time, p.end_time,
        p.location_name, p.location_address, p.location_lat, p.location_lng,
        p.price, p.price_min, p.price_max, p.price_notes, p.is_free,
        p.category, p.ai_confidence, p.extraction_method,
        p.review_tier, (p.validation_warnings || []).join('; '), p.is_duplicate,
        p.is_recurring, p.recurrence_pattern, p.urgency_score,
        p.caption, p.ocr_text
      ].map(escapeCSV).join(','));

      const csv = [headers.join(','), ...rows].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `review_queue_${tierTab}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${filteredData.length} posts as CSV`);
    } catch (error: any) {
      toast.error("Export failed: " + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Fetch tier counts
  const { data: tierCounts } = useQuery({
    queryKey: ["review-tier-counts", hidePastEvents],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      
      let query = supabase
        .from("instagram_posts")
        .select("review_tier, event_date")
        .eq("is_event", true)
        .eq("needs_review", true);
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      const counts = { ready: 0, quick: 0, full: 0, rejected: 0 };
      data?.forEach(post => {
        // Filter past events if toggle is on
        if (hidePastEvents && post.event_date && post.event_date < today) {
          return;
        }
        if (post.review_tier && counts.hasOwnProperty(post.review_tier)) {
          counts[post.review_tier as TierTab]++;
        }
      });
      return counts;
    }
  });

  // Fetch posts for current tier
  const { data: allPosts, isLoading } = useQuery({
    queryKey: ["consolidated-review-queue", currentPage, tierTab, hidePastEvents],
    queryFn: async () => {
      let query = supabase
        .from("instagram_posts")
        .select(`
          *,
          instagram_account:instagram_accounts(username)
        `)
        .eq("is_event", true)
        .eq("needs_review", true)
        .eq("review_tier", tierTab);

      const { data, error } = await query.order("created_at", { ascending: false });
      
      if (error) throw error;

      // Filter past events if toggle is on
      const today = new Date().toISOString().split('T')[0];
      let filteredData = data || [];
      if (hidePastEvents) {
        filteredData = filteredData.filter(post => 
          !post.event_date || post.event_date >= today
        );
      }

      // Calculate priority scores and sort
      const postsWithPriority = filteredData.map(post => ({
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

  // Batch publish mutation for Ready tier
  const batchPublishMutation = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      
      // Get all ready tier posts with future dates
      const { data: readyPosts, error: fetchError } = await supabase
        .from("instagram_posts")
        .select("id")
        .eq("review_tier", "ready")
        .eq("is_event", true)
        .gte("event_date", today);
      
      if (fetchError) throw fetchError;
      if (!readyPosts || readyPosts.length === 0) {
        throw new Error("No posts to publish");
      }
      
      // Publish each post
      let published = 0;
      for (const post of readyPosts) {
        const { error } = await supabase.functions.invoke("publish-event", {
          body: { postId: post.id }
        });
        if (!error) published++;
      }
      
      return { published, total: readyPosts.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["consolidated-review-queue"] });
      queryClient.invalidateQueries({ queryKey: ["review-tier-counts"] });
      toast.success(`Published ${data.published}/${data.total} events!`);
    },
    onError: (error) => {
      toast.error("Batch publish failed: " + error.message);
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
      queryClient.invalidateQueries({ queryKey: ["review-tier-counts"] });
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
      queryClient.invalidateQueries({ queryKey: ["review-tier-counts"] });
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

  const TierBadge = ({ tier }: { tier: string | null }) => {
    switch (tier) {
      case 'ready':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Ready</Badge>;
      case 'quick':
        return <Badge className="bg-yellow-500"><AlertTriangle className="w-3 h-3 mr-1" />Quick</Badge>;
      case 'full':
        return <Badge className="bg-orange-500"><AlertCircle className="w-3 h-3 mr-1" />Full</Badge>;
      case 'rejected':
        return <Badge className="bg-destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const ValidationWarnings = ({ warnings }: { warnings: string[] | null }) => {
    if (!warnings || warnings.length === 0) return null;
    
    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {warnings.map((warning, i) => (
          <Badge key={i} variant="outline" className="text-xs text-orange-600 border-orange-300">
            ⚠️ {warning.replace(/_/g, ' ')}
          </Badge>
        ))}
      </div>
    );
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

      {/* Main Review Queue with Tier Tabs */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg md:text-xl font-bold">Review Queue</h2>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Tiered review system - Ready posts can be batch published
              </p>
            </div>
            {tierTab === 'ready' && (tierCounts?.ready || 0) > 0 && (
              <Button 
                onClick={() => batchPublishMutation.mutate()}
                disabled={batchPublishMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCheck className="w-4 h-4 mr-2" />
                {batchPublishMutation.isPending ? "Publishing..." : `Publish All Ready (${tierCounts?.ready || 0})`}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <Tabs value={tierTab} onValueChange={(v) => {
            setTierTab(v as TierTab);
            setCurrentPage(0);
          }}>
            <TabsList className="grid w-full grid-cols-4 gap-1">
              <TabsTrigger value="ready" className="flex items-center gap-1 text-xs md:text-sm">
                <CheckCircle className="w-3 h-3 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Ready</span>
                {(tierCounts?.ready || 0) > 0 && (
                  <Badge className="ml-1 bg-green-500 text-xs">{tierCounts?.ready}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="quick" className="flex items-center gap-1 text-xs md:text-sm">
                <AlertTriangle className="w-3 h-3 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Quick</span>
                {(tierCounts?.quick || 0) > 0 && (
                  <Badge className="ml-1 bg-yellow-500 text-xs">{tierCounts?.quick}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="full" className="flex items-center gap-1 text-xs md:text-sm">
                <AlertCircle className="w-3 h-3 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Full</span>
                {(tierCounts?.full || 0) > 0 && (
                  <Badge className="ml-1 bg-orange-500 text-xs">{tierCounts?.full}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="rejected" className="flex items-center gap-1 text-xs md:text-sm">
                <XCircle className="w-3 h-3 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Rejected</span>
                {(tierCounts?.rejected || 0) > 0 && (
                  <Badge className="ml-1 bg-destructive text-xs">{tierCounts?.rejected}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Tier descriptions */}
            <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm">
              {tierTab === 'ready' && (
                <p className="text-green-700 dark:text-green-400">
                  ✅ <strong>Ready to Publish:</strong> High confidence events with all fields + geocoded. Can be batch published.
                </p>
              )}
              {tierTab === 'quick' && (
                <p className="text-yellow-700 dark:text-yellow-400">
                  ⚡ <strong>Quick Review:</strong> Good confidence - just verify the highlighted fields.
                </p>
              )}
              {tierTab === 'full' && (
                <p className="text-orange-700 dark:text-orange-400">
                  🔍 <strong>Full Review:</strong> These need manual data entry or verification.
                </p>
              )}
              {tierTab === 'rejected' && (
                <p className="text-destructive">
                  ❌ <strong>Rejected:</strong> Low confidence or too many validation issues. Review or delete.
                </p>
              )}
            </div>

            <TabsContent value={tierTab} className="space-y-3 md:space-y-4 mt-4 md:mt-6">
              {/* Filter and pagination controls */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                <div className="flex items-center gap-4">
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Showing {Math.min(currentPage * ITEMS_PER_PAGE + 1, allPosts?.length || 0)}-{Math.min((currentPage + 1) * ITEMS_PER_PAGE, allPosts?.length || 0)} of {allPosts?.length || 0}
                  </p>
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="hidePast" 
                      checked={hidePastEvents} 
                      onCheckedChange={(checked) => {
                        setHidePastEvents(checked as boolean);
                        setCurrentPage(0);
                      }}
                    />
                    <Label htmlFor="hidePast" className="text-xs md:text-sm cursor-pointer">
                      Hide past events
                    </Label>
                  </div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  {/* Export Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        size="sm" 
                        variant="outline"
                        disabled={isExporting || !allPosts?.length}
                      >
                        <Download className="w-4 h-4 md:mr-1" />
                        <span className="hidden md:inline">
                          {isExporting ? "Exporting..." : `Export (${allPosts?.length || 0})`}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={exportQueueAsJSON}>
                        📄 Export as JSON (with analysis)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={exportQueueAsCSV}>
                        📊 Export as CSV (spreadsheet)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

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
                              <TierBadge tier={post.review_tier} />
                              {post.instagram_account && (
                                <Badge variant="outline" className="text-xs">@{post.instagram_account.username}</Badge>
                              )}
                              {post.extraction_method && extractionMethodLabels[post.extraction_method] && (
                                <Badge variant="outline" className="text-xs">
                                  {extractionMethodLabels[post.extraction_method].icon} {extractionMethodLabels[post.extraction_method].label}
                                </Badge>
                              )}
                              {post.category && (
                                <Badge 
                                  style={{ 
                                    backgroundColor: CATEGORY_COLORS[post.category] || '#9E9E9E',
                                    color: post.category === 'food' ? '#333' : '#fff'
                                  }}
                                  className="text-xs"
                                >
                                  {CATEGORY_LABELS[post.category] || post.category}
                                </Badge>
                              )}
                              {post.ai_confidence && (
                                <Badge variant="outline" className="text-xs">
                                  AI: {(post.ai_confidence * 100).toFixed(0)}%
                                </Badge>
                              )}
                              {post.is_duplicate && (
                                <Badge variant="destructive" className="text-xs">Duplicate</Badge>
                              )}
                              {post.location_status === 'outside_service_area' && (
                                <Badge className="text-xs bg-purple-600 text-white">🌍 Outside NCR</Badge>
                              )}
                              {(post.validation_warnings?.includes('venue_outside_ncr') || 
                                post.validation_warnings?.includes('coordinates_outside_ncr')) && 
                                post.location_status !== 'outside_service_area' && (
                                <Badge className="text-xs bg-purple-600 text-white">🌍 Outside NCR</Badge>
                              )}
                              <PriceDisplay 
                                isFree={post.is_free}
                                price={post.price}
                                priceMin={post.price_min}
                                priceMax={post.price_max}
                                priceNotes={post.price_notes}
                                size="sm"
                              />
                            </div>
                          </div>

                          {/* Validation Warnings */}
                          <ValidationWarnings warnings={post.validation_warnings} />

                          {/* Sub-Events Display for multi-event posts */}
                          <SubEventsDisplay subEvents={post.sub_events} />
                          
                          {/* Performers Display for events with featured artists */}
                          <PerformersDisplay subEvents={post.sub_events} />

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
                              queryClient.invalidateQueries({ queryKey: ["review-tier-counts"] });
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
                  <p className="text-sm text-muted-foreground">No posts in this tier</p>
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
