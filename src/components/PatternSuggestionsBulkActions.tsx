import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, CheckCheck, XCircle, RefreshCw, Filter, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SuggestionStats {
  total: number;
  byType: Record<string, number>;
  duplicateValues: number;
}

export const PatternSuggestionsBulkActions = () => {
  const [selectedType, setSelectedType] = useState<string>("all");
  const queryClient = useQueryClient();

  // Fetch suggestion stats
  const { data: stats, isLoading } = useQuery({
    queryKey: ["suggestion-stats"],
    queryFn: async (): Promise<SuggestionStats> => {
      const { data, error } = await supabase
        .from("pattern_suggestions")
        .select("pattern_type, expected_value")
        .eq("status", "pending");

      if (error) throw error;

      const byType: Record<string, number> = {};
      const valueCount: Record<string, number> = {};

      for (const row of data || []) {
        byType[row.pattern_type] = (byType[row.pattern_type] || 0) + 1;
        const key = `${row.pattern_type}:${row.expected_value}`;
        valueCount[key] = (valueCount[key] || 0) + 1;
      }

      const duplicateValues = Object.values(valueCount).filter(c => c > 1).length;

      return {
        total: data?.length || 0,
        byType,
        duplicateValues,
      };
    },
  });

  // Bulk reject by type
  const rejectByTypeMutation = useMutation({
    mutationFn: async (type: string) => {
      const query = supabase
        .from("pattern_suggestions")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("status", "pending");

      if (type !== "all") {
        query.eq("pattern_type", type);
      }

      const { error, count } = await query;
      if (error) throw error;
      return count;
    },
    onSuccess: (count) => {
      toast.success(`Rejected ${count || 0} suggestions`);
      queryClient.invalidateQueries({ queryKey: ["pattern-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["suggestion-stats"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Bulk delete rejected
  const deleteRejectedMutation = useMutation({
    mutationFn: async () => {
      const { error, count } = await supabase
        .from("pattern_suggestions")
        .delete()
        .eq("status", "rejected");

      if (error) throw error;
      return count;
    },
    onSuccess: (count) => {
      toast.success(`Deleted ${count || 0} rejected suggestions`);
      queryClient.invalidateQueries({ queryKey: ["pattern-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["suggestion-stats"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Reject venue suggestions (they don't work well with regex)
  const rejectVenuesMutation = useMutation({
    mutationFn: async () => {
      const { error, count } = await supabase
        .from("pattern_suggestions")
        .update({ status: "not_applicable", reviewed_at: new Date().toISOString() })
        .eq("status", "pending")
        .eq("pattern_type", "venue");

      if (error) throw error;
      return count;
    },
    onSuccess: (count) => {
      toast.success(`Marked ${count || 0} venue suggestions as not applicable`);
      queryClient.invalidateQueries({ queryKey: ["pattern-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["suggestion-stats"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Auto-approve high-frequency suggestions
  const autoApproveMutation = useMutation({
    mutationFn: async () => {
      // Get suggestions with 3+ attempts (high frequency = likely real pattern)
      const { data: highFreq, error: fetchError } = await supabase
        .from("pattern_suggestions")
        .select("*")
        .eq("status", "pending")
        .gte("attempt_count", 3)
        .in("pattern_type", ["event_date", "event_time", "price"]);

      if (fetchError) throw fetchError;
      if (!highFreq || highFreq.length === 0) {
        throw new Error("No high-frequency suggestions found");
      }

      let approved = 0;
      for (const suggestion of highFreq) {
        try {
          // Validate regex
          new RegExp(suggestion.suggested_regex, "gi");

          // Create pattern
          await supabase.from("extraction_patterns").insert({
            pattern_type: suggestion.pattern_type,
            pattern_regex: suggestion.suggested_regex,
            pattern_description: `Auto-approved: ${suggestion.expected_value} (${suggestion.attempt_count} occurrences)`,
            source: "ai_learned",
            confidence_score: 0.6,
            priority: 90,
            is_active: true,
          });

          // Mark as approved
          await supabase
            .from("pattern_suggestions")
            .update({ status: "approved", reviewed_at: new Date().toISOString() })
            .eq("id", suggestion.id);

          approved++;
        } catch (e) {
          // Skip invalid regexes
          console.warn(`Skipping invalid regex: ${suggestion.suggested_regex}`);
        }
      }

      return approved;
    },
    onSuccess: (count) => {
      toast.success(`Auto-approved ${count} high-frequency patterns`);
      queryClient.invalidateQueries({ queryKey: ["pattern-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["suggestion-stats"] });
      queryClient.invalidateQueries({ queryKey: ["extraction-patterns"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading stats...</div>;
  }

  const typeOptions = ["all", ...Object.keys(stats?.byType || {})];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Bulk Suggestion Management
        </CardTitle>
        <CardDescription>
          Process multiple pattern suggestions at once
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{stats?.total || 0} pending</Badge>
          {Object.entries(stats?.byType || {}).map(([type, count]) => (
            <Badge key={type} variant="outline">
              {type}: {count}
            </Badge>
          ))}
        </div>

        {/* Venue warning */}
        {stats?.byType.venue && stats.byType.venue > 0 && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 rounded-lg text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-amber-500">
                {stats.byType.venue} venue suggestions should be rejected
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                Venue names are proper nouns and can't be matched by regex patterns.
                Use the known_venues database instead.
              </p>
            </div>
          </div>
        )}

        {/* Type filter */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Filter by type:</span>
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map(type => (
                <SelectItem key={type} value={type}>
                  {type} {type !== "all" && `(${stats?.byType[type] || 0})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => rejectVenuesMutation.mutate()}
            disabled={rejectVenuesMutation.isPending || !stats?.byType.venue}
          >
            <XCircle className="h-4 w-4 mr-1" />
            Reject All Venues ({stats?.byType.venue || 0})
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => autoApproveMutation.mutate()}
            disabled={autoApproveMutation.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-1" />
            Auto-Approve High Frequency
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => rejectByTypeMutation.mutate(selectedType)}
            disabled={rejectByTypeMutation.isPending}
          >
            <XCircle className="h-4 w-4 mr-1" />
            Reject {selectedType === "all" ? "All" : selectedType}
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={() => deleteRejectedMutation.mutate()}
            disabled={deleteRejectedMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Rejected
          </Button>
        </div>

        {/* Refresh */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["pattern-suggestions"] });
            queryClient.invalidateQueries({ queryKey: ["suggestion-stats"] });
          }}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh Stats
        </Button>
      </CardContent>
    </Card>
  );
};