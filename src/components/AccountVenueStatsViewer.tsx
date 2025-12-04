import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { BarChart3, Instagram } from "lucide-react";

interface AccountVenueStat {
  id: string;
  instagram_account_id: string | null;
  venue_name: string;
  post_count: number | null;
  last_used_at: string | null;
  account_username?: string;
}

export const AccountVenueStatsViewer = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["account-venue-stats"],
    queryFn: async () => {
      // First get the stats
      const { data: statsData, error: statsError } = await supabase
        .from("account_venue_stats")
        .select("*")
        .order("post_count", { ascending: false });
      if (statsError) throw statsError;

      // Get unique account IDs
      const accountIds = [...new Set(statsData?.map((s) => s.instagram_account_id).filter(Boolean))];
      
      if (accountIds.length === 0) return statsData as AccountVenueStat[];

      // Fetch account usernames
      const { data: accounts } = await supabase
        .from("instagram_accounts")
        .select("id, username")
        .in("id", accountIds);

      const accountMap = new Map(accounts?.map((a) => [a.id, a.username]) || []);

      return (statsData || []).map((stat) => ({
        ...stat,
        account_username: stat.instagram_account_id ? accountMap.get(stat.instagram_account_id) : undefined,
      })) as AccountVenueStat[];
    },
  });

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading stats...</div>;
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Account Venue Stats ({stats?.length || 0})
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Which Instagram accounts post about which venues - helps AI predict likely venues
        </p>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        {stats?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No venue stats recorded yet</p>
            <p className="text-xs mt-1">Stats are generated automatically when events are processed</p>
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Posts</TableHead>
                  <TableHead>Last Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats?.map((stat) => (
                  <TableRow key={stat.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Instagram className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {stat.account_username ? `@${stat.account_username}` : "Unknown"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{stat.venue_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {stat.post_count || 0} posts
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(stat.last_used_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
