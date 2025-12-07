import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Database, Download, ChevronLeft, ChevronRight, RefreshCw, AlertCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface GroundTruthEntry {
  id: string;
  post_id: string | null;
  field_name: string;
  ground_truth_value: string;
  original_text: string | null;
  source: string | null;
  created_at: string | null;
}

export const GroundTruthViewer = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedField, setSelectedField] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const pageSize = 50;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ground-truth", selectedField, page],
    queryFn: async () => {
      let query = supabase
        .from("extraction_ground_truth")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (selectedField !== "all") {
        query = query.eq("field_name", selectedField);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { entries: data as GroundTruthEntry[], total: count || 0 };
    },
  });

  // Count entries missing original_text
  const { data: missingCount } = useQuery({
    queryKey: ["ground-truth-missing-original"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("extraction_ground_truth")
        .select("*", { count: "exact", head: true })
        .is("original_text", null);
      if (error) throw error;
      return count || 0;
    },
  });

  const handleBackfill = async () => {
    try {
      setIsBackfilling(true);
      const { data, error } = await supabase.functions.invoke("backfill-ground-truth", {
        body: {},
      });

      if (error) throw error;

      toast.success(`Backfilled ${data.updated}/${data.processed} records. ${data.remaining > 0 ? `${data.remaining} remaining` : 'Complete!'}`);
      queryClient.invalidateQueries({ queryKey: ["ground-truth"] });
      queryClient.invalidateQueries({ queryKey: ["ground-truth-missing-original"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to backfill");
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to delete ALL ground truth records and pattern suggestions? This cannot be undone.")) {
      return;
    }
    
    try {
      setIsClearing(true);
      
      // Delete ground truth and pattern suggestions
      const { error: gtError } = await supabase.from("extraction_ground_truth").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (gtError) throw gtError;
      
      const { error: psError } = await supabase.from("pattern_suggestions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (psError) throw psError;
      
      toast.success("Cleared all ground truth and pattern suggestions");
      queryClient.invalidateQueries({ queryKey: ["ground-truth"] });
      queryClient.invalidateQueries({ queryKey: ["ground-truth-missing-original"] });
      queryClient.invalidateQueries({ queryKey: ["pattern-suggestions"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to clear data");
    } finally {
      setIsClearing(false);
    }
  };

  const fieldTypes = ["all", "event_title", "event_date", "event_time", "venue", "price", "category"];

  const getFieldColor = (field: string): string => {
    const colors: Record<string, string> = {
      event_title: "bg-purple-500/20 text-purple-700",
      event_date: "bg-blue-500/20 text-blue-700",
      event_time: "bg-cyan-500/20 text-cyan-700",
      venue: "bg-green-500/20 text-green-700",
      price: "bg-yellow-500/20 text-yellow-700",
      category: "bg-pink-500/20 text-pink-700",
    };
    return colors[field] || "bg-muted text-muted-foreground";
  };

  const filteredEntries = data?.entries?.filter(entry =>
    entry.ground_truth_value.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.field_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.post_id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleExport = () => {
    if (!data?.entries) return;
    
    const exportData = data.entries.map(e => ({
      field_name: e.field_name,
      ground_truth_value: e.ground_truth_value,
      post_id: e.post_id,
      source: e.source,
      created_at: e.created_at,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ground-truth-${selectedField}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil((data?.total || 0) / pageSize);

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading ground truth data...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Backfill Alert */}
      {missingCount && missingCount > 0 && (
        <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30 rounded-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-700">
              {missingCount} records missing original_text - pattern learning won't work until backfilled
            </span>
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleBackfill}
            disabled={isBackfilling}
            className="border-amber-500/50 text-amber-700 hover:bg-amber-500/10"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isBackfilling ? 'animate-spin' : ''}`} />
            {isBackfilling ? 'Backfilling...' : 'Backfill Now'}
          </Button>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {data?.total || 0} ground truth entries
          </span>
        </div>
        
        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search values..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <select
            value={selectedField}
            onChange={(e) => { setSelectedField(e.target.value); setPage(0); }}
            className="px-3 py-2 border rounded-md text-sm bg-background h-9"
          >
            {fieldTypes.map(type => (
              <option key={type} value={type}>
                {type === "all" ? "All fields" : type.replace("_", " ")}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={handleExport} className="h-9">
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleClearAll}
            disabled={isClearing}
            className="h-9 text-destructive hover:bg-destructive/10 border-destructive/30"
          >
            <Trash2 className={`h-4 w-4 mr-1 ${isClearing ? 'animate-spin' : ''}`} />
            {isClearing ? 'Clearing...' : 'Clear All'}
          </Button>
        </div>
      </div>

      {(!filteredEntries || filteredEntries.length === 0) ? (
        <div className="text-center py-12 text-muted-foreground">
          <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No ground truth data found</p>
          <p className="text-xs mt-1">Ground truth is saved when AI extractions have high confidence (≥0.7)</p>
        </div>
      ) : (
        <>
          <div className="grid gap-2">
            {filteredEntries.map((entry) => (
              <Card key={entry.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                  <Badge className={`${getFieldColor(entry.field_name)} shrink-0 w-fit`}>
                    {entry.field_name}
                  </Badge>
                  
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-medium text-sm truncate">{entry.ground_truth_value}</p>
                    {entry.original_text ? (
                      <p className="text-xs text-muted-foreground truncate" title={entry.original_text}>
                        📝 Raw: "{entry.original_text}"
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600">⚠️ Missing original text</p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    {entry.source && (
                      <Badge variant="outline" className="text-xs">{entry.source}</Badge>
                    )}
                    {entry.post_id && (
                      <span className="font-mono truncate max-w-24" title={entry.post_id}>
                        {entry.post_id.substring(0, 8)}...
                      </span>
                    )}
                    {entry.created_at && (
                      <span>{new Date(entry.created_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
