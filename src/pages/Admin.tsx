import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Plus, RefreshCw, Instagram, ClipboardList, MapPin, FolderKanban, Eye, TrendingUp, Database, Square, Eraser, Github, ExternalLink, AlertCircle, Upload, CheckCheck } from "lucide-react";
import { ConsolidatedReviewQueue } from "@/components/ConsolidatedReviewQueue";
import { PublishedEventsManager } from "@/components/PublishedEventsManager";
import { LocationTemplatesManager } from "@/components/LocationTemplatesManager";
import { PatternManager } from "@/components/PatternManager";
import { ScraperLogs } from "@/components/ScraperLogs";
import { KnownVenuesManager } from "@/components/KnownVenuesManager";
import { LocationCorrectionsViewer } from "@/components/LocationCorrectionsViewer";
import { AccountVenueStatsViewer } from "@/components/AccountVenueStatsViewer";
import { UnmatchedVenuesViewer } from "@/components/UnmatchedVenuesViewer";
import { GeoConfigurationManager } from "@/components/GeoConfigurationManager";
import { InstagramHandlesViewer } from "@/components/InstagramHandlesViewer";

interface InstagramAccount {
  id: string;
  username: string;
  display_name: string | null;
  follower_count: number | null;
  is_verified: boolean;
  is_active: boolean;
  last_scraped_at: string | null;
}

interface ScrapeRun {
  id: string;
  run_type: 'manual_dataset' | 'manual_scrape' | 'automated' | 'github_actions_ingest';
  dataset_id: string | null;
  posts_added: number;
  posts_updated: number;
  accounts_found: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

const Admin = () => {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [scrapeRuns, setScrapeRuns] = useState<ScrapeRun[]>([]);
  const [lastRun, setLastRun] = useState<ScrapeRun | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isBulkPublishing, setIsBulkPublishing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isAutoApproving, setIsAutoApproving] = useState(false);
  const [isBackfillingGroundTruth, setIsBackfillingGroundTruth] = useState(false);

  useEffect(() => {
    checkAuth();
    fetchAccounts();
    fetchScrapeRuns();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to access the admin dashboard",
        variant: "destructive",
      });
      window.location.href = '/auth';
    }
  };

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from("instagram_accounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch accounts",
        variant: "destructive",
      });
    }
  };

  const fetchScrapeRuns = async () => {
    try {
      const { data, error } = await supabase
        .from("scrape_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setScrapeRuns(data || []);
      setLastRun(data && data.length > 0 ? data[0] : null);
    } catch (error: any) {
      console.error("Failed to fetch scrape runs:", error);
    }
  };

  const addAccount = async () => {
    if (!newUsername.trim()) return;

    try {
      setIsLoading(true);
      const username = newUsername.trim().replace("@", "");

      const { error } = await supabase
        .from("instagram_accounts")
        .insert({ username, is_active: true });

      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Account already exists",
            description: "This Instagram account is already being tracked",
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: "Account added",
          description: `@${username} will be scraped on the next run`,
        });
        setNewUsername("");
        fetchAccounts();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to add account",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAccount = async (accountId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("instagram_accounts")
        .update({ is_active: !currentStatus })
        .eq("id", accountId);

      if (error) throw error;

      toast({
        title: "Account updated",
        description: `Account ${!currentStatus ? "activated" : "deactivated"}`,
      });
      fetchAccounts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update account",
        variant: "destructive",
      });
    }
  };

  const deleteAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from("instagram_accounts")
        .delete()
        .eq("id", accountId);

      if (error) throw error;

      toast({
        title: "Account deleted",
        description: "Account removed from tracking",
      });
      fetchAccounts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete account",
        variant: "destructive",
      });
    }
  };

  const cleanupStuckScrapes = async () => {
    try {
      setIsCleaning(true);
      
      const { data, error } = await supabase.functions.invoke("cleanup-stuck-scrapes", {
        body: { timeoutMinutes: 5 },
      });

      if (error) throw error;

      if (data.cleaned > 0) {
        toast({
          title: "Cleanup Complete",
          description: `Marked ${data.cleaned} stuck scrape(s) as failed`,
        });
      } else {
        toast({
          title: "No Stuck Scrapes",
          description: "No stuck scrapes found to clean up",
        });
      }

      fetchScrapeRuns();
      return data;
    } catch (error: any) {
      toast({
        title: "Cleanup Failed",
        description: error.message || "Failed to cleanup stuck scrapes",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsCleaning(false);
    }
  };

  const triggerScraping = async (isDatasetImport: boolean = false) => {
    try {
      setIsScraping(true);
      
      // First, cleanup any stuck scrapes before starting a new one
      console.log("[Admin] Cleaning up stuck scrapes before starting new scrape...");
      await supabase.functions.invoke("cleanup-stuck-scrapes", {
        body: { timeoutMinutes: 5 },
      });
      
      const body = isDatasetImport && datasetId.trim() 
        ? { datasetId: datasetId.trim() } 
        : {};
        
      const { data, error } = await supabase.functions.invoke("scrape-instagram", {
        body,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: isDatasetImport
          ? `Imported ${data.newPostsAdded} new posts from ${data.accountsProcessed} accounts`
          : `Scraped ${data.newPostsAdded} new posts, updated ${data.postsUpdated} existing posts`,
      });

      // Clear dataset input after successful import
      if (isDatasetImport) {
        setDatasetId("");
      }

      // Refresh data
      fetchAccounts();
      fetchScrapeRuns();

      console.log("Scraping result:", data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to trigger scraping",
        variant: "destructive",
      });
    } finally {
      setIsScraping(false);
    }
  };

  const formatRunType = (type: string) => {
    switch (type) {
      case 'manual_dataset': return 'Dataset Import';
      case 'manual_scrape': return 'Manual Scrape';
      case 'automated': return 'Automated';
      default: return type;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getTimeSince = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const purgeAllPosts = async () => {
    if (!confirm("⚠️ This will delete all posts, published events, and scrape history.\n\nPreserved: Instagram accounts, Known Venues, Location Corrections, Patterns\n\nType 'DELETE' to confirm.")) {
      return;
    }

    const confirmation = prompt("Type DELETE in all caps to confirm:");
    if (confirmation !== "DELETE") {
      toast({
        title: "Cancelled",
        description: "Purge cancelled",
      });
      return;
    }

    try {
      setIsPurging(true);

      // Delete child tables first (FK constraints)
      // Children of instagram_posts
      await supabase.from("event_dates").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("event_updates").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("validation_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      
      // Children of scrape_runs
      await supabase.from("scraper_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      
      // Main tables
      await supabase.from("published_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("saved_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("locations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("instagram_posts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("ocr_cache").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("scrape_runs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      
      // PRESERVED: instagram_accounts, known_venues, location_corrections, 
      // account_venue_stats, extraction_patterns, extraction_ground_truth,
      // extraction_feedback, pattern_suggestions

      toast({
        title: "Success",
        description: "Posts and scrape data purged. Accounts & knowledge preserved.",
      });

      fetchAccounts();
      fetchScrapeRuns();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to purge data",
        variant: "destructive",
      });
    } finally {
      setIsPurging(false);
    }
  };

  const stopCurrentScrape = async () => {
    if (!lastRun) return;
    
    try {
      setIsStopping(true);
      
      const { error } = await supabase
        .from("scrape_runs")
        .update({ 
          status: 'cancelled' as any,
          completed_at: new Date().toISOString(),
          error_message: 'Manually stopped by admin'
        })
        .eq("id", lastRun.id);

      if (error) throw error;

      toast({
        title: "Scrape Stopped",
        description: "The scrape run has been marked as cancelled",
      });
      
      fetchScrapeRuns();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to stop scrape",
        variant: "destructive",
      });
    } finally {
      setIsStopping(false);
    }
  };

  const backfillImages = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.functions.invoke("backfill-images", {
        body: {},
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Backfilled ${data.success} images. ${data.failed > 0 ? `Failed: ${data.failed}` : ''}`,
      });

      console.log("Backfill result:", data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to backfill images",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const backfillGroundTruth = async () => {
    try {
      setIsBackfillingGroundTruth(true);
      
      const { data, error } = await supabase.functions.invoke("backfill-ground-truth", {
        body: {},
      });

      if (error) throw error;

      toast({
        title: "Ground Truth Backfill",
        description: `Updated ${data.updated}/${data.processed} records. ${data.remaining > 0 ? `${data.remaining} remaining - run again!` : 'Complete!'}`,
      });

      console.log("Backfill ground truth result:", data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to backfill ground truth",
        variant: "destructive",
      });
    } finally {
      setIsBackfillingGroundTruth(false);
    }
  };

  const bulkPublishEvents = async () => {
    try {
      setIsBulkPublishing(true);
      
      // Get all reviewed event posts with coordinates and future dates
      const { data: postsToPublish, error: fetchError } = await supabase
        .from("instagram_posts")
        .select(`
          id,
          event_title,
          event_date,
          event_time,
          end_time,
          location_name,
          location_address,
          location_lat,
          location_lng,
          caption,
          image_url,
          stored_image_url,
          is_free,
          price,
          signup_url,
          category,
          topic_label,
          post_url,
          likes_count,
          comments_count,
          instagram_account_id
        `)
        .eq("is_event", true)
        .eq("needs_review", false)
        .not("location_lat", "is", null)
        .not("location_lng", "is", null)
        .gte("event_date", new Date().toISOString().split('T')[0]);

      if (fetchError) throw fetchError;

      if (!postsToPublish || postsToPublish.length === 0) {
        toast({
          title: "No Events to Publish",
          description: "No reviewed events with coordinates and future dates found",
        });
        return;
      }

      // Get account usernames
      const accountIds = [...new Set(postsToPublish.map(p => p.instagram_account_id))];
      const { data: accounts } = await supabase
        .from("instagram_accounts")
        .select("id, username")
        .in("id", accountIds);

      const accountMap = new Map(accounts?.map(a => [a.id, a.username]) || []);

      // Check which posts are already published
      const { data: existingPublished } = await supabase
        .from("published_events")
        .select("source_post_id")
        .in("source_post_id", postsToPublish.map(p => p.id));

      const existingIds = new Set(existingPublished?.map(p => p.source_post_id) || []);
      const newPosts = postsToPublish.filter(p => !existingIds.has(p.id));

      if (newPosts.length === 0) {
        toast({
          title: "All Events Already Published",
          description: `${postsToPublish.length} events are already published`,
        });
        return;
      }

      // Insert new published events
      const publishedEvents = newPosts.map(post => ({
        event_title: post.event_title || "Untitled Event",
        event_date: post.event_date,
        event_time: post.event_time,
        end_time: post.end_time,
        location_name: post.location_name || "Unknown Venue",
        location_address: post.location_address,
        location_lat: post.location_lat,
        location_lng: post.location_lng,
        caption: post.caption,
        image_url: post.image_url,
        stored_image_url: post.stored_image_url,
        is_free: post.is_free,
        price: post.price,
        signup_url: post.signup_url,
        category: post.category,
        topic_label: post.topic_label,
        instagram_post_url: post.post_url,
        instagram_account_username: accountMap.get(post.instagram_account_id),
        source_post_id: post.id,
        likes_count: post.likes_count,
        comments_count: post.comments_count,
      }));

      const { error: insertError } = await supabase
        .from("published_events")
        .insert(publishedEvents);

      if (insertError) throw insertError;

      toast({
        title: "Events Published!",
        description: `Published ${newPosts.length} events to the map. ${existingIds.size > 0 ? `(${existingIds.size} already existed)` : ''}`,
      });

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to bulk publish events",
        variant: "destructive",
      });
    } finally {
      setIsBulkPublishing(false);
    }
  };

  const autoApproveEvents = async () => {
    try {
      setIsAutoApproving(true);
      const today = new Date().toISOString().split('T')[0];
      
      // Find events that meet auto-approval criteria
      const { data: eventsToApprove, error: fetchError } = await supabase
        .from("instagram_posts")
        .select("id")
        .eq("is_event", true)
        .eq("needs_review", true)
        .not("event_title", "is", null)
        .not("event_date", "is", null)
        .not("location_lat", "is", null)
        .gte("event_date", today);

      if (fetchError) throw fetchError;

      if (!eventsToApprove || eventsToApprove.length === 0) {
        toast({
          title: "No Events to Auto-Approve",
          description: "No events meet the criteria (title, future date, coordinates)",
        });
        return;
      }

      // Update all matching events
      const { error: updateError } = await supabase
        .from("instagram_posts")
        .update({ needs_review: false })
        .in("id", eventsToApprove.map(e => e.id));

      if (updateError) throw updateError;

      toast({
        title: "Events Auto-Approved!",
        description: `Approved ${eventsToApprove.length} events with complete data`,
      });

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to auto-approve events",
        variant: "destructive",
      });
    } finally {
      setIsAutoApproving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold">Admin Dashboard</h1>
        
        <Tabs defaultValue="scraping">
          <TabsList className="grid w-full grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-1">
            <TabsTrigger value="scraping" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
              <Instagram className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Scraping</span>
              <span className="sm:hidden">Scrape</span>
            </TabsTrigger>
            <TabsTrigger value="review" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
              <ClipboardList className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Review Queue</span>
              <span className="sm:hidden">Review</span>
            </TabsTrigger>
            <TabsTrigger value="published" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
              <FolderKanban className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Published</span>
              <span className="sm:hidden">Events</span>
            </TabsTrigger>
            <TabsTrigger value="patterns" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
              <TrendingUp className="w-3 h-3 md:w-4 md:h-4" />
              <span>Patterns</span>
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
              <MapPin className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Templates</span>
              <span className="sm:hidden">Loc</span>
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
              <Database className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Knowledge</span>
              <span className="sm:hidden">Data</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
              <Eye className="w-3 h-3 md:w-4 md:h-4" />
              <span>Logs</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="scraping" className="space-y-4 md:space-y-6 mt-4 md:mt-6">
          
          {/* Danger Zone - Purge All Posts */}
          <Card className="border-destructive">
            <CardHeader className="p-4 md:p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-destructive text-base md:text-lg">Danger Zone</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Delete all posts and events from the database
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={purgeAllPosts}
                  disabled={isPurging}
                  className="w-full md:w-auto"
                >
                  <Trash2 className={`h-4 w-4 mr-2 ${isPurging ? "animate-pulse" : ""}`} />
                  {isPurging ? "Purging..." : "Purge All Posts"}
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* GitHub Actions Scraper */}
          <Card>
            <CardHeader className="p-4 md:p-6">
              <div className="flex items-center gap-2 flex-wrap">
                <Github className="w-5 h-5" />
                <h3 className="font-semibold text-base md:text-lg">GitHub Actions Scraper</h3>
                <Badge variant="secondary">For Large Datasets</Badge>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground">
                Process 300+ posts without timeout using Gemini Vision OCR
              </p>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0 space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-3">
                <p className="text-sm font-medium">How to use:</p>
                <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
                  <li>Run your Apify Instagram scrape</li>
                  <li>Copy the <strong>dataset URL</strong></li>
                  <li>Click the button below to open GitHub Actions</li>
                  <li>Click "Run workflow" → Paste URL → Run</li>
                  <li>Wait 30-60 minutes for processing</li>
                </ol>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2">
                <Button asChild>
                  <a 
                    href="https://github.com/CelestialBrain/wheresthefx/actions/workflows/process-scrape.yml" 
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Github className="w-4 h-4 mr-2" />
                    Run GitHub Actions
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </a>
                </Button>
              </div>
              
              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  <strong>Tip:</strong> Use this for datasets with 15+ posts. The regular scraper times out on large datasets.
                </p>
              </div>
            </CardContent>
          </Card>
          
          {/* Last Scrape Status */}
          {lastRun && (
            <Card>
              <CardHeader className="p-4 md:p-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-xs md:text-sm text-muted-foreground">Last Scrape</p>
                    <p className="font-semibold text-sm md:text-base mt-1">
                      {formatTimestamp(lastRun.started_at)} ({getTimeSince(lastRun.started_at)})
                    </p>
                    <div className="flex flex-wrap gap-2 md:gap-4 mt-2 text-xs md:text-sm">
                      <span className={
                        lastRun.status === 'completed' ? 'text-green-600' : 
                        lastRun.status === 'failed' ? 'text-red-600' : 
                        lastRun.status === 'cancelled' ? 'text-orange-600' : 
                        'text-yellow-600'
                      }>
                        {lastRun.status === 'completed' ? '✓ Success' : 
                         lastRun.status === 'failed' ? '✗ Failed' : 
                         lastRun.status === 'cancelled' ? '⊘ Cancelled' : 
                         '⏳ Running'}
                      </span>
                      {lastRun.status === 'completed' && (
                        <>
                          <span>• Posts Added: {lastRun.posts_added}</span>
                          <span>• Updated: {lastRun.posts_updated}</span>
                          <span>• Accounts: {lastRun.accounts_found}</span>
                        </>
                      )}
                    </div>
                    {lastRun.error_message && (
                      <p className="text-xs text-red-600 mt-2">{lastRun.error_message}</p>
                    )}
                  </div>
                  <div className="flex gap-2 w-full md:w-auto flex-wrap">
                    {lastRun.status === 'running' && (
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={stopCurrentScrape}
                        disabled={isStopping}
                        className="w-full md:w-auto"
                      >
                        <Square className="h-4 w-4 mr-2" />
                        {isStopping ? "Stopping..." : "Stop Scrape"}
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={cleanupStuckScrapes}
                      disabled={isCleaning}
                      className="w-full md:w-auto"
                    >
                      <Eraser className="h-4 w-4 mr-2" />
                      {isCleaning ? "Cleaning..." : "Cleanup Stuck"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)} className="w-full md:w-auto">
                      {showHistory ? 'Hide' : 'View'} History
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          )}

          {/* Scrape History */}
          {showHistory && (
            <Card className="p-4 mb-4">
              <h3 className="font-semibold mb-3">Scrape History</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {scrapeRuns.map((run) => (
                  <div key={run.id} className="flex items-center justify-between p-2 border rounded text-sm">
                    <div>
                      <span className="font-medium">{formatRunType(run.run_type)}</span>
                      <span className="text-muted-foreground ml-2">{formatTimestamp(run.started_at)}</span>
                      {run.dataset_id && <span className="text-xs text-muted-foreground ml-2">({run.dataset_id})</span>}
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className={
                        run.status === 'completed' ? 'text-green-600' : 
                        run.status === 'failed' ? 'text-red-600' : 
                        run.status === 'cancelled' ? 'text-orange-600' : 
                        'text-yellow-600'
                      }>
                        {run.status}
                      </span>
                      {run.status === 'completed' && (
                        <>
                          <span>+{run.posts_added}</span>
                          <span>~{run.posts_updated}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          
          {/* Image Backfill Tool */}
          <Card>
            <CardHeader className="p-4 md:p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-base md:text-lg">Fix OCR Images</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Re-download and store Instagram images to fix CORS errors
                  </p>
                </div>
                <Button
                  onClick={backfillImages}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full md:w-auto"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  {isLoading ? "Processing..." : "Backfill Images"}
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* Auto-Approve Events */}
          <Card>
            <CardHeader className="p-4 md:p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-base md:text-lg">Auto-Approve Events</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Approve events with title, future date, and coordinates
                  </p>
                </div>
                <Button
                  onClick={autoApproveEvents}
                  disabled={isAutoApproving}
                  variant="outline"
                  className="w-full md:w-auto"
                >
                  <CheckCheck className={`h-4 w-4 mr-2 ${isAutoApproving ? "animate-pulse" : ""}`} />
                  {isAutoApproving ? "Approving..." : "Auto-Approve"}
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* Bulk Publish Events */}
          <Card>
            <CardHeader className="p-4 md:p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-base md:text-lg">Bulk Publish Events</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Publish all reviewed events with coordinates to the map
                  </p>
                </div>
                <Button
                  onClick={bulkPublishEvents}
                  disabled={isBulkPublishing}
                  variant="default"
                  className="w-full md:w-auto"
                >
                  <Upload className={`h-4 w-4 mr-2 ${isBulkPublishing ? "animate-pulse" : ""}`} />
                  {isBulkPublishing ? "Publishing..." : "Bulk Publish"}
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* Dataset Import */}
          <Card>
            <CardHeader className="p-4 md:p-6">
              <h2 className="text-base md:text-lg font-semibold">Import from Dataset</h2>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Paste an Apify dataset URL or ID from a dataset you've already scraped
              </p>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0 space-y-3">
              <div className="flex flex-col md:flex-row gap-2">
                <Input
                  placeholder="Dataset ID or full URL..."
                  value={datasetId}
                  onChange={(e) => setDatasetId(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={() => triggerScraping(true)}
                  disabled={isScraping || !datasetId.trim()}
                  variant="default"
                  className="w-full md:w-auto"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isScraping ? "animate-spin" : ""}`} />
                  {isScraping ? "Importing..." : "Import Now"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 Accounts will be automatically created from the dataset
              </p>
            </CardContent>
          </Card>

          {/* Automated Scraping Section */}
          <Card>
            <CardHeader className="p-4 md:p-6">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div className="flex-1">
                  <h2 className="text-base md:text-lg font-semibold">Automated Scraping</h2>
                  <p className="text-xs md:text-sm text-muted-foreground mt-1">
                    ⏰ Auto-scrapes daily at 3:00 AM (last 5 posts from 30 days per account)
                  </p>
                </div>
                <Button
                  onClick={() => triggerScraping(false)}
                  disabled={isScraping || accounts.length === 0}
                  variant="outline"
                  className="w-full md:w-auto"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isScraping ? "animate-spin" : ""}`} />
                  Scrape Now
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* Add New Account */}
        <Card>
          <CardHeader className="p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold">Add Instagram Account</h2>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="flex flex-col md:flex-row gap-2">
              <Input
                placeholder="Enter Instagram username (e.g., @username)"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && addAccount()}
                className="flex-1"
              />
              <Button onClick={addAccount} disabled={isLoading || !newUsername.trim()} className="w-full md:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Accounts List */}
        <Card>
          <CardHeader className="p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold">
              Tracked Accounts ({accounts.length})
            </h2>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
          <div className="space-y-3">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-4 border border-border rounded-lg"
              >
                <div className="flex items-center gap-3 flex-1">
                  <Instagram className="h-5 w-5 text-accent" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">@{account.username}</span>
                      {account.is_verified && (
                        <Badge variant="secondary">Verified</Badge>
                      )}
                      {!account.is_active && (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </div>
                    {account.display_name && (
                      <p className="text-sm text-muted-foreground">
                        {account.display_name}
                      </p>
                    )}
                    <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                      {account.follower_count && (
                        <span>{account.follower_count.toLocaleString()} followers</span>
                      )}
                      {account.last_scraped_at && (
                        <span>
                          Last scraped:{" "}
                          {new Date(account.last_scraped_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleAccount(account.id, account.is_active)}
                  >
                    {account.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteAccount(account.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {accounts.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No accounts added yet. Add your first Instagram account to start tracking events.
              </p>
            )}
          </div>
          </CardContent>
        </Card>
          </TabsContent>
          
        <TabsContent value="review">
          <ConsolidatedReviewQueue />
        </TabsContent>

        <TabsContent value="published">
          <PublishedEventsManager />
        </TabsContent>

          <TabsContent value="patterns">
            <PatternManager />
          </TabsContent>

          <TabsContent value="templates">
            <LocationTemplatesManager />
          </TabsContent>

          <TabsContent value="knowledge" className="space-y-6 mt-6">
            <GeoConfigurationManager />
            <UnmatchedVenuesViewer />
            <InstagramHandlesViewer />
            <KnownVenuesManager />
            <LocationCorrectionsViewer />
            <AccountVenueStatsViewer />
          </TabsContent>

          <TabsContent value="logs">
            <ScraperLogs />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
