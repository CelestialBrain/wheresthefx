import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Plus, RefreshCw, Instagram, ClipboardList } from "lucide-react";
import { ReviewQueue } from "@/components/ReviewQueue";

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
  run_type: 'manual_dataset' | 'manual_scrape' | 'automated';
  dataset_id: string | null;
  posts_added: number;
  posts_updated: number;
  accounts_found: number;
  status: 'running' | 'completed' | 'failed';
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

  useEffect(() => {
    fetchAccounts();
    fetchScrapeRuns();
  }, []);

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

  const triggerScraping = async (isDatasetImport: boolean = false) => {
    try {
      setIsScraping(true);
      
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

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold mb-4">Admin Dashboard</h1>
        
        <Tabs defaultValue="scraping">
          <TabsList>
            <TabsTrigger value="scraping"><Instagram className="w-4 h-4 mr-2" />Scraping</TabsTrigger>
            <TabsTrigger value="review"><ClipboardList className="w-4 h-4 mr-2" />Review Queue</TabsTrigger>
          </TabsList>
          
          <TabsContent value="scraping" className="space-y-6">
            <div>
          
          {/* Last Scrape Status */}
          {lastRun && (
            <Card className="p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Last Scrape</p>
                  <p className="font-semibold">
                    {formatTimestamp(lastRun.started_at)} ({getTimeSince(lastRun.started_at)})
                  </p>
                  <div className="flex gap-4 mt-1 text-sm">
                    <span className={lastRun.status === 'completed' ? 'text-green-600' : lastRun.status === 'failed' ? 'text-red-600' : 'text-yellow-600'}>
                      {lastRun.status === 'completed' ? '✓ Success' : lastRun.status === 'failed' ? '✗ Failed' : '⏳ Running'}
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
                    <p className="text-xs text-red-600 mt-1">{lastRun.error_message}</p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
                  {showHistory ? 'Hide' : 'View'} History
                </Button>
              </div>
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
                      <span className={run.status === 'completed' ? 'text-green-600' : run.status === 'failed' ? 'text-red-600' : 'text-yellow-600'}>
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
          
          {/* Dataset Import */}
          <Card className="p-4 mb-4">
            <h2 className="text-lg font-semibold mb-2">Import from Dataset</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Paste an Apify dataset URL or ID from a dataset you've already scraped
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Dataset ID or full URL (e.g., unhzteLFHcz1H4VLQ or https://api.apify.com/v2/datasets/...)"
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={() => triggerScraping(true)}
                disabled={isScraping || !datasetId.trim()}
                variant="default"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isScraping ? "animate-spin" : ""}`} />
                {isScraping ? "Importing..." : "Import Now"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              💡 Accounts will be automatically created from the dataset
            </p>
          </Card>

          {/* Automated Scraping Section */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold">Automated Scraping</h2>
                <p className="text-sm text-muted-foreground">
                  ⏰ Auto-scrapes daily at 3:00 AM (last 5 posts from 30 days per account)
                </p>
              </div>
              <Button
                onClick={() => triggerScraping(false)}
                disabled={isScraping || accounts.length === 0}
                variant="outline"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isScraping ? "animate-spin" : ""}`} />
                Scrape Now
              </Button>
            </div>
          </Card>
        </div>

        {/* Add New Account */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Add Instagram Account</h2>
          <div className="flex gap-2">
            <Input
              placeholder="Enter Instagram username (e.g., @username)"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addAccount()}
            />
            <Button onClick={addAccount} disabled={isLoading || !newUsername.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
        </Card>

        {/* Accounts List */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">
            Tracked Accounts ({accounts.length})
          </h2>
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
        </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="review">
            <ReviewQueue />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
