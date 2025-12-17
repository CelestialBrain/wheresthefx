import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Instagram, Search, Download, Users, AtSign, ExternalLink } from "lucide-react";
import { useJsonExportImport } from "@/hooks/use-json-export-import";

interface TrackedAccount {
  id: string;
  username: string;
  display_name: string | null;
  is_active: boolean | null;
  last_scraped_at: string | null;
  post_count: number;
  default_category: string | null;
}

interface DiscoveredMention {
  handle: string;
  count: number;
  last_seen: string;
  is_tracked: boolean;
}

export const InstagramHandlesViewer = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("tracked");
  const queryClient = useQueryClient();

  const { ExportButton, ImportButton } = useJsonExportImport({
    tableName: 'instagram_accounts',
    displayName: 'accounts',
    onImportComplete: () => queryClient.invalidateQueries({ queryKey: ['instagram-accounts'] })
  });

  // Fetch tracked accounts with post counts
  const { data: trackedAccounts, isLoading: loadingTracked } = useQuery({
    queryKey: ["instagram-handles-tracked"],
    queryFn: async () => {
      const { data: accounts, error } = await supabase
        .from("instagram_accounts")
        .select("id, username, display_name, is_active, last_scraped_at, default_category")
        .order("username", { ascending: true });

      if (error) throw error;

      // Get post counts
      const { data: postCounts } = await supabase
        .from("instagram_posts")
        .select("instagram_account_id")
        .not("instagram_account_id", "is", null);

      const countMap = new Map<string, number>();
      postCounts?.forEach(p => {
        const id = p.instagram_account_id;
        countMap.set(id, (countMap.get(id) || 0) + 1);
      });

      return accounts?.map(a => ({
        ...a,
        post_count: countMap.get(a.id) || 0,
      })) as TrackedAccount[];
    },
  });

  // Fetch discovered mentions from captions
  const { data: discoveredMentions, isLoading: loadingMentions } = useQuery({
    queryKey: ["instagram-handles-discovered"],
    queryFn: async () => {
      // Get all mentions arrays from posts
      const { data: posts, error } = await supabase
        .from("instagram_posts")
        .select("mentions, created_at")
        .not("mentions", "is", null);

      if (error) throw error;

      // Get tracked usernames for comparison
      const { data: accounts } = await supabase
        .from("instagram_accounts")
        .select("username");

      const trackedUsernames = new Set(accounts?.map(a => a.username.toLowerCase()) || []);

      // Aggregate mentions
      const mentionMap = new Map<string, { count: number; last_seen: string }>();
      posts?.forEach(post => {
        const mentions = post.mentions as string[] | null;
        mentions?.forEach(handle => {
          const cleanHandle = handle.replace(/^@/, "").toLowerCase();
          if (!cleanHandle) return;
          
          const existing = mentionMap.get(cleanHandle);
          if (existing) {
            existing.count++;
            if (new Date(post.created_at) > new Date(existing.last_seen)) {
              existing.last_seen = post.created_at;
            }
          } else {
            mentionMap.set(cleanHandle, { count: 1, last_seen: post.created_at });
          }
        });
      });

      // Convert to array with tracked status
      const result: DiscoveredMention[] = Array.from(mentionMap.entries()).map(([handle, data]) => ({
        handle,
        count: data.count,
        last_seen: data.last_seen,
        is_tracked: trackedUsernames.has(handle),
      }));

      // Sort by count descending
      return result.sort((a, b) => b.count - a.count);
    },
  });

  const handleExportTracked = () => {
    if (!trackedAccounts) return;
    const dataStr = JSON.stringify(trackedAccounts, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tracked_accounts.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMentions = () => {
    if (!discoveredMentions) return;
    const dataStr = JSON.stringify(discoveredMentions, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "discovered_mentions.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredTracked = trackedAccounts?.filter(a =>
    a.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredMentions = discoveredMentions?.filter(m =>
    m.handle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalMentions = discoveredMentions?.length || 0;
  const untrackedMentions = discoveredMentions?.filter(m => !m.is_tracked).length || 0;

  return (
    <Card>
      <CardHeader className="p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Instagram className="h-5 w-5" />
              Instagram Handles
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              All tracked accounts and discovered @mentions from captions
            </p>
          </div>
          <div className="flex gap-2">
            <ExportButton />
            <ImportButton />
          </div>
        </div>
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search handles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="tracked" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Tracked ({trackedAccounts?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="discovered" className="flex items-center gap-2">
                <AtSign className="h-4 w-4" />
                Discovered ({totalMentions})
                {untrackedMentions > 0 && (
                  <Badge variant="secondary" className="ml-1">{untrackedMentions} new</Badge>
                )}
              </TabsTrigger>
            </TabsList>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={activeTab === "tracked" ? handleExportTracked : handleExportMentions}
            >
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>

          <TabsContent value="tracked">
            {loadingTracked ? (
              <div className="text-muted-foreground p-4">Loading accounts...</div>
            ) : (
              <div className="rounded-md border overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-center">Posts</TableHead>
                      <TableHead>Last Scraped</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTracked?.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">
                          <a 
                            href={`https://instagram.com/${account.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:underline"
                          >
                            @{account.username}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {account.display_name || "-"}
                        </TableCell>
                        <TableCell>
                          {account.default_category ? (
                            <Badge variant="outline">{account.default_category}</Badge>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{account.post_count}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {account.last_scraped_at 
                            ? new Date(account.last_scraped_at).toLocaleDateString()
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          {account.is_active ? (
                            <Badge variant="default" className="bg-green-500/20 text-green-600">Active</Badge>
                          ) : (
                            <Badge variant="outline">Inactive</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredTracked?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No accounts match your search
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="discovered">
            {loadingMentions ? (
              <div className="text-muted-foreground p-4">Loading mentions...</div>
            ) : discoveredMentions?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AtSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No @mentions extracted from captions yet</p>
                <p className="text-xs mt-1">Mentions will appear after the next scrape with extraction enabled</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Handle</TableHead>
                      <TableHead className="text-center">Times Mentioned</TableHead>
                      <TableHead>Last Seen</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMentions?.map((mention) => (
                      <TableRow key={mention.handle}>
                        <TableCell className="font-medium">
                          <a 
                            href={`https://instagram.com/${mention.handle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:underline"
                          >
                            @{mention.handle}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{mention.count}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(mention.last_seen).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {mention.is_tracked ? (
                            <Badge variant="default" className="bg-green-500/20 text-green-600">Tracked</Badge>
                          ) : (
                            <Badge variant="outline" className="text-orange-500 border-orange-500/50">Not Tracked</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
