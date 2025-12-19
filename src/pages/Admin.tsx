import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trash2,
  Plus,
  RefreshCw,
  Instagram,
  ClipboardList,
  MapPin,
  FolderKanban,
  Eye,
  TrendingUp,
  Database,
  AlertCircle,
  ExternalLink,
  Github,
  Square,
  Eraser,
  CheckCircle,
  BadgeCheck,
  CheckCheck,
  Upload
} from "lucide-react";
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
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8 selection:bg-accent/30">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/50 pb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              Admin Dashboard
            </h1>
            <p className="text-muted-foreground mt-2">Manage events, scraping, and platform knowledge.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-3 py-1 bg-accent/5 border-accent/20 text-accent">
              <span className="w-2 h-2 rounded-full bg-accent mr-2 animate-pulse" />
              Live System
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="scraping">
          <TabsList className="flex w-full overflow-x-auto scrollbar-hide bg-muted/30 p-1 rounded-xl border border-border/50 backdrop-blur-sm sticky top-4 z-50">
            <TabsTrigger value="scraping" className="flex-1 items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-accent transition-all py-2.5">
              <Instagram className="w-4 h-4" />
              <span className="hidden md:inline text-sm font-medium">Scraping</span>
            </TabsTrigger>
            <TabsTrigger value="review" className="flex-1 items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-accent transition-all py-2.5">
              <ClipboardList className="w-4 h-4" />
              <span className="hidden md:inline text-sm font-medium text-nowrap">Review</span>
            </TabsTrigger>
            <TabsTrigger value="published" className="flex-1 items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-accent transition-all py-2.5">
              <FolderKanban className="w-4 h-4" />
              <span className="hidden md:inline text-sm font-medium text-nowrap">Events</span>
            </TabsTrigger>
            <TabsTrigger value="patterns" className="flex-1 items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-accent transition-all py-2.5">
              <TrendingUp className="w-4 h-4" />
              <span className="hidden md:inline text-sm font-medium text-nowrap">Patterns</span>
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex-1 items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-accent transition-all py-2.5">
              <MapPin className="w-4 h-4" />
              <span className="hidden md:inline text-sm font-medium text-nowrap">Loc</span>
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="flex-1 items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-accent transition-all py-2.5">
              <Database className="w-4 h-4" />
              <span className="hidden md:inline text-sm font-medium text-nowrap">Data</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex-1 items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-accent transition-all py-2.5">
              <Eye className="w-4 h-4" />
              <span className="hidden md:inline text-sm font-medium text-nowrap">Logs</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scraping" className="space-y-6 mt-6 animate-in fade-in duration-500">
            {/* 1. Status & Primary Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Last Scrape Status */}
              <div className="lg:col-span-2">
                {lastRun ? (
                  <Card className="frosted-glass overflow-hidden border-accent/20 h-full">
                    <CardHeader className="p-6 pb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Scrape Status</p>
                          <p className="font-bold text-xl mt-1">
                            {formatTimestamp(lastRun.started_at)}
                          </p>
                          <p className="text-sm text-muted-foreground italic">{getTimeSince(lastRun.started_at)}</p>
                        </div>
                        <div className={`p-3 rounded-xl ${lastRun.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                          lastRun.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                            'bg-yellow-500/10 text-yellow-500'
                          }`}>
                          {lastRun.status === 'completed' ? <CheckCircle className="w-6 h-6" /> :
                            lastRun.status === 'failed' ? <AlertCircle className="w-6 h-6" /> :
                              <RefreshCw className="w-6 h-6 animate-spin" />}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6 pt-0">
                      <div className="grid grid-cols-3 gap-4 py-4 border-y border-border/50 my-4">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-accent">{lastRun.posts_added}</p>
                          <p className="text-[10px] uppercase text-muted-foreground font-semibold">New Posts</p>
                        </div>
                        <div className="text-center border-x border-border/50">
                          <p className="text-2xl font-bold text-accent">{lastRun.posts_updated}</p>
                          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Updated</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-accent">{lastRun.accounts_found}</p>
                          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Accounts</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex gap-2">
                          <Badge variant="outline" className="bg-background/50">
                            {formatRunType(lastRun.run_type)}
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          {lastRun.status === 'running' && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={stopCurrentScrape}
                              disabled={isStopping}
                              className="rounded-lg shadow-sm"
                            >
                              <Square className="h-4 w-4 mr-2" />
                              Stop
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)} className="rounded-lg">
                            {showHistory ? 'Hide' : 'View'} History
                          </Button>
                        </div>
                      </div>
                      {lastRun.error_message && (
                        <div className="mt-4 p-3 bg-red-500/5 border border-red-500/20 rounded-lg text-xs text-red-500">
                          <strong>Error:</strong> {lastRun.error_message}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="frosted-glass p-12 text-center text-muted-foreground">
                    No scrape runs recorded yet.
                  </Card>
                )}
              </div>

              {/* Maintenance & Quick Actions */}
              <Card className="frosted-glass">
                <CardHeader className="p-6 pb-2">
                  <h3 className="font-bold text-lg">System Maintenance</h3>
                </CardHeader>
                <CardContent className="p-6 space-y-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cleanupStuckScrapes}
                    disabled={isCleaning}
                    className="w-full justify-start rounded-xl h-11 border-border/50 hover:border-accent/40 transition-colors"
                  >
                    <Eraser className="h-4 w-4 mr-3 text-accent" />
                    {isCleaning ? "Cleaning..." : "Cleanup Stuck Scrapes"}
                  </Button>
                  <Button
                    onClick={backfillImages}
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start rounded-xl h-11 border-border/50 hover:border-accent/40 transition-colors"
                  >
                    <RefreshCw className={`h-4 w-4 mr-3 text-accent ${isLoading ? "animate-spin" : ""}`} />
                    Backfill OCR Images
                  </Button>
                  <Button
                    onClick={backfillGroundTruth}
                    disabled={isBackfillingGroundTruth}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start rounded-xl h-11 border-border/50 hover:border-accent/40 transition-colors"
                  >
                    <ClipboardList className={`h-4 w-4 mr-3 text-accent ${isBackfillingGroundTruth ? "animate-pulse" : ""}`} />
                    Backfill Ground Truth
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* 2. Scraping Methods */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* GitHub Actions Card */}
              <Card className="frosted-glass overflow-hidden border-l-4 border-l-accent group hover:shadow-lg transition-all duration-300">
                <CardHeader className="p-6 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-accent/10 text-accent group-hover:scale-110 transition-transform">
                      <Github className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">GitHub Actions (Vision OCR)</h3>
                      <Badge variant="secondary" className="bg-accent/5 text-accent border-accent/10 mt-1">For Large Datasets</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-4">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    Process bulk Instagram scrapes using concurrent Gemini Vision processing.
                    Best for ingestion of 15+ posts to avoid timeouts.
                  </p>

                  <div className="bg-muted/50 p-4 rounded-xl border border-border/50">
                    <ol className="text-xs space-y-2 list-decimal list-inside text-muted-foreground">
                      <li>Run Apify scrape & copy **dataset URL**</li>
                      <li>Click "Run GitHub Actions" below</li>
                      <li>Paste URL into the workflow input</li>
                    </ol>
                  </div>

                  <Button asChild className="w-full rounded-xl h-11 shadow-md bg-accent hover:bg-accent/90">
                    <a
                      href="https://github.com/CelestialBrain/wheresthefx/actions/workflows/process-scrape.yml"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="w-4 h-4 mr-2 font-bold" />
                      Configure & Run Workflow
                    </a>
                  </Button>
                </CardContent>
              </Card>

              {/* Dataset Import Card */}
              <Card className="frosted-glass group hover:shadow-lg transition-all duration-300 border-l-4 border-l-blue-500">
                <CardHeader className="p-6 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Local Dataset Ingest</h3>
                      <Badge variant="secondary" className="bg-blue-500/5 text-blue-500 border-blue-500/10 mt-1">Quick Edge Ingest</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Import data directly via Supabase Edge Functions. Good for small
                    batches or testing new extraction rules.
                  </p>
                  <div className="flex flex-col gap-2 mt-4">
                    <Input
                      placeholder="Dataset ID or full URL..."
                      value={datasetId}
                      onChange={(e) => setDatasetId(e.target.value)}
                      className="rounded-xl border-border/50"
                    />
                    <Button
                      onClick={() => triggerScraping(true)}
                      disabled={isScraping || !datasetId.trim()}
                      className="rounded-xl h-11"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${isScraping ? "animate-spin" : ""}`} />
                      {isScraping ? "Importing..." : "Start Import"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 3. Account Management */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Add Account Card */}
              <div className="lg:col-span-1">
                <Card className="frosted-glass h-full sticky top-24">
                  <CardHeader className="p-6">
                    <h3 className="font-bold text-lg">Add Tracked Account</h3>
                    <p className="text-xs text-muted-foreground">Monitor specific Instagram accounts daily</p>
                  </CardHeader>
                  <CardContent className="p-6 pt-0 space-y-4">
                    <div className="space-y-3">
                      <Input
                        placeholder="@username"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && addAccount()}
                        className="rounded-xl"
                      />
                      <Button onClick={addAccount} disabled={isLoading || !newUsername.trim()} className="w-full rounded-xl">
                        <Plus className="h-4 w-4 mr-2" />
                        Add to Watchlist
                      </Button>
                    </div>
                    <div className="mt-6 p-4 bg-accent/5 border border-accent/10 rounded-xl space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-accent/80">Daily Automation</h4>
                      <p className="text-[11px] text-muted-foreground">
                        All tracked accounts are scraped every day at **3:00 AM** automatically.
                      </p>
                      <Button
                        variant="link"
                        className="p-0 h-auto text-[11px] text-accent font-semibold"
                        onClick={() => triggerScraping(false)}
                      >
                        Trigger Manual Daily Run →
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Accounts List */}
              <div className="lg:col-span-2">
                <Card className="frosted-glass overflow-hidden">
                  <CardHeader className="p-6 border-b border-border/50">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg">Tracked Accounts</h3>
                      <Badge variant="outline" className="rounded-full px-3">{accounts.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border/50">
                      {accounts.map((account) => (
                        <div key={account.id} className="flex items-center justify-between p-4 px-6 hover:bg-muted/30 transition-colors group">
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-full ${account.is_active ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                              <Instagram className="h-5 w-5" />
                            </div>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm">@{account.username}</span>
                                {account.is_verified && <BadgeCheck className="w-3 h-3 text-blue-500" />}
                                {!account.is_active && <Badge variant="secondary" className="text-[9px] h-4 py-0">Paused</Badge>}
                              </div>
                              <p className="text-[11px] text-muted-foreground tabular-nums">
                                {account.follower_count?.toLocaleString() || '---'} followers •
                                Scraped {account.last_scraped_at ? getTimeSince(account.last_scraped_at) : 'never'}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg"
                              onClick={() => toggleAccount(account.id, account.is_active)}
                            >
                              {account.is_active ? <Square className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => deleteAccount(account.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* 4. Batch Operations */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
              <Card className="frosted-glass border-green-500/20">
                <CardHeader className="p-6 pb-2">
                  <h3 className="font-bold text-lg">Batch Publishing</h3>
                  <p className="text-xs text-muted-foreground">Move reviewed events to the public live map</p>
                </CardHeader>
                <CardContent className="p-6 flex flex-col gap-3">
                  <Button
                    onClick={autoApproveEvents}
                    disabled={isAutoApproving}
                    variant="outline"
                    className="w-full justify-start rounded-xl h-11 border-border/50 hover:bg-green-500/5 hover:border-green-500/30 transition-all font-medium"
                  >
                    <CheckCheck className={`h-4 w-4 mr-3 text-green-500 ${isAutoApproving ? "animate-pulse" : ""}`} />
                    {isAutoApproving ? "Approving..." : "Auto-Approve High Conf Events"}
                  </Button>
                  <Button
                    onClick={bulkPublishEvents}
                    disabled={isBulkPublishing}
                    className="w-full justify-start rounded-xl h-11 bg-green-600 hover:bg-green-700 shadow-md font-bold"
                  >
                    <Upload className={`h-4 w-4 mr-3 ${isBulkPublishing ? "animate-pulse" : ""}`} />
                    {isBulkPublishing ? "Publishing..." : "Bulk Publish Reviewed Events"}
                  </Button>
                </CardContent>
              </Card>

              {/* Danger Zone Moved to Bottom */}
              <Card className="border-destructive/20 bg-destructive/[0.02]">
                <CardHeader className="p-6 pb-2">
                  <h3 className="font-bold text-lg text-destructive">Danger Zone</h3>
                  <p className="text-xs text-muted-foreground">Irreversible administrative actions</p>
                </CardHeader>
                <CardContent className="p-6">
                  <Button
                    variant="destructive"
                    onClick={purgeAllPosts}
                    disabled={isPurging}
                    className="w-full justify-start rounded-xl h-11 font-bold"
                  >
                    <Trash2 className={`h-4 w-4 mr-3 ${isPurging ? "animate-pulse" : ""}`} />
                    {isPurging ? "Purging..." : "Purge All Posts & Scrape Data"}
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-3 text-center">
                    Note: Accounts, known venues, and patterns are preserved.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="review" className="mt-6">
            <ConsolidatedReviewQueue />
          </TabsContent>

          <TabsContent value="published" className="mt-6">
            <PublishedEventsManager />
          </TabsContent>

          <TabsContent value="patterns" className="mt-6">
            <PatternManager />
          </TabsContent>

          <TabsContent value="templates" className="mt-6">
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

          <TabsContent value="logs" className="mt-6">
            <ScraperLogs />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
