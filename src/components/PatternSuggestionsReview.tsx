import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, X, AlertTriangle, Search, Lightbulb } from "lucide-react";

interface PatternSuggestion {
  id: string;
  pattern_type: string;
  suggested_regex: string;
  sample_text: string | null;
  expected_value: string | null;
  status: string | null;
  attempt_count: number | null;
  created_at: string | null;
}

export const PatternSuggestionsReview = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedRegex, setEditedRegex] = useState("");
  const queryClient = useQueryClient();

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["pattern-suggestions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pattern_suggestions")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as PatternSuggestion[];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ suggestion, regex }: { suggestion: PatternSuggestion; regex: string }) => {
      // Validate regex first
      try {
        new RegExp(regex, "gi");
      } catch (e) {
        throw new Error(`Invalid regex: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }

      // Create pattern
      const { error: patternError } = await supabase
        .from("extraction_patterns")
        .insert({
          pattern_type: suggestion.pattern_type,
          pattern_regex: regex,
          pattern_description: `Approved from suggestion: ${suggestion.expected_value || 'Auto-generated'}`,
          source: "ai_learned",
          confidence_score: 0.5,
          priority: 100,
          is_active: true,
        });

      if (patternError) throw patternError;

      // Update suggestion status
      const { error: updateError } = await supabase
        .from("pattern_suggestions")
        .update({ 
          status: "approved",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", suggestion.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast.success("Pattern approved and created");
      queryClient.invalidateQueries({ queryKey: ["pattern-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["extraction-patterns"] });
      setEditingId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pattern_suggestions")
        .update({ 
          status: "rejected",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Suggestion rejected");
      queryClient.invalidateQueries({ queryKey: ["pattern-suggestions"] });
    },
  });

  const testRegex = (regex: string, sampleText: string | null): { valid: boolean; matches: string[] | null; error?: string } => {
    if (!sampleText) return { valid: true, matches: null };
    try {
      const re = new RegExp(regex, "gi");
      const matches = sampleText.match(re);
      return { valid: true, matches };
    } catch (e) {
      return { valid: false, matches: null, error: e instanceof Error ? e.message : 'Invalid regex' };
    }
  };

  const filteredSuggestions = suggestions?.filter(s =>
    s.pattern_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.suggested_regex.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.expected_value?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading suggestions...</div>;
  }

  if (!suggestions || suggestions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Lightbulb className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No pending pattern suggestions</p>
        <p className="text-xs mt-1">Suggestions are generated when AI extractions differ from regex patterns</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {suggestions.length} pending suggestion{suggestions.length !== 1 ? 's' : ''}
        </p>
        <div className="relative w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search suggestions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      <div className="grid gap-3">
        {filteredSuggestions?.map((suggestion) => {
          const isEditing = editingId === suggestion.id;
          const regexToTest = isEditing ? editedRegex : suggestion.suggested_regex;
          const testResult = testRegex(regexToTest, suggestion.sample_text);

          return (
            <Card key={suggestion.id} className={!testResult.valid ? "border-destructive" : ""}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{suggestion.pattern_type}</Badge>
                    {suggestion.attempt_count && suggestion.attempt_count > 1 && (
                      <Badge variant="secondary" className="text-xs">
                        {suggestion.attempt_count} attempts
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {suggestion.created_at && new Date(suggestion.created_at).toLocaleDateString()}
                  </span>
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <Label>Edit Regex</Label>
                    <Input
                      value={editedRegex}
                      onChange={(e) => setEditedRegex(e.target.value)}
                      className="font-mono text-sm"
                      placeholder="Enter regex pattern..."
                    />
                    {!testResult.valid && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {testResult.error}
                      </p>
                    )}
                  </div>
                ) : (
                  <code className="block p-2 bg-muted rounded text-xs break-all">
                    {suggestion.suggested_regex}
                  </code>
                )}

                {suggestion.sample_text && (
                  <div className="text-xs space-y-1">
                    <p className="text-muted-foreground">Sample text:</p>
                    <p className="p-2 bg-muted/50 rounded line-clamp-2">{suggestion.sample_text}</p>
                  </div>
                )}

                {suggestion.expected_value && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Expected: </span>
                    <span className="font-medium text-green-600">{suggestion.expected_value}</span>
                  </div>
                )}

                {testResult.matches && testResult.matches.length > 0 && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Matches: </span>
                    <span className="font-mono text-green-600">{testResult.matches.join(", ")}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  {isEditing ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate({ suggestion, regex: editedRegex })}
                        disabled={!testResult.valid || approveMutation.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Save & Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate({ suggestion, regex: suggestion.suggested_regex })}
                        disabled={!testResult.valid || approveMutation.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(suggestion.id);
                          setEditedRegex(suggestion.suggested_regex);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => rejectMutation.mutate(suggestion.id)}
                        disabled={rejectMutation.isPending}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
