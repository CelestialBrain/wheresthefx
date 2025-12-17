import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, CheckCircle2, XCircle, AlertCircle, Eye, EyeOff, AlertTriangle, Edit2, Save, X, Lightbulb, Database } from "lucide-react";
import { PatternLearner } from "./PatternLearner";
import { PatternCreationForm } from "./PatternCreationForm";
import { PatternSuggestionsReview } from "./PatternSuggestionsReview";
import { PatternSuggestionsBulkActions } from "./PatternSuggestionsBulkActions";
import { GroundTruthViewer } from "./GroundTruthViewer";
import { useJsonExportImport } from "@/hooks/use-json-export-import";

interface PatternTestResult {
  patternId: string;
  patternType: string;
  description: string | null;
  regex: string;
  matches: string[];
  error: string | null;
}

interface EditingPattern {
  id: string;
  regex: string;
  description: string;
  priority: string;
}

export const PatternManager = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [testText, setTestText] = useState("");
  const [showAllPatterns, setShowAllPatterns] = useState(false);
  const [editingPattern, setEditingPattern] = useState<EditingPattern | null>(null);
  const queryClient = useQueryClient();

  const { ExportButton, ImportButton } = useJsonExportImport({
    tableName: 'extraction_patterns',
    displayName: 'patterns',
    onImportComplete: () => queryClient.invalidateQueries({ queryKey: ['extraction-patterns'] })
  });

  const { data: patterns, isLoading } = useQuery({
    queryKey: ["extraction-patterns", selectedType],
    queryFn: async () => {
      let query = supabase
        .from("extraction_patterns")
        .select("*")
        .order("confidence_score", { ascending: false });

      if (selectedType !== "all") {
        query = query.eq("pattern_type", selectedType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Fetch counts for tabs
  const { data: suggestionCount } = useQuery({
    queryKey: ["pattern-suggestions-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("pattern_suggestions")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: groundTruthCount } = useQuery({
    queryKey: ["ground-truth-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("extraction_ground_truth")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  const togglePatternMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from("extraction_patterns")
        .update({ is_active: !isActive })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error("Failed to update pattern");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["extraction-patterns"] });
      toast.success(`Pattern ${data.is_active ? 'enabled' : 'disabled'}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update pattern");
    },
  });

  const updatePatternMutation = useMutation({
    mutationFn: async (pattern: EditingPattern) => {
      // Validate regex
      try {
        new RegExp(pattern.regex, "gi");
      } catch (e) {
        throw new Error(`Invalid regex: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }

      const { error } = await supabase
        .from("extraction_patterns")
        .update({
          pattern_regex: pattern.regex,
          pattern_description: pattern.description || null,
          priority: parseInt(pattern.priority) || 100,
        })
        .eq("id", pattern.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["extraction-patterns"] });
      toast.success("Pattern updated");
      setEditingPattern(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deletePatternMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("extraction_patterns")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["extraction-patterns"] });
      toast.success("Pattern deleted");
    },
  });

  const [testingType, setTestingType] = useState<string>("all");

  const testPattern = (patternRegex: string): { matches: string[]; error: string | null } => {
    try {
      const regex = new RegExp(patternRegex, "gi");
      const matches = testText.match(regex);
      return { matches: matches || [], error: null };
    } catch (error: any) {
      return { matches: [], error: error.message || "Invalid regex" };
    }
  };

  const getTestResults = (): PatternTestResult[] => {
    if (!patterns || !testText.trim()) return [];
    
    const activePatterns = patterns.filter(p => p.is_active);
    const patternsToTest = testingType === "all" 
      ? activePatterns 
      : activePatterns.filter(p => p.pattern_type === testingType);
    
    return patternsToTest.map(pattern => {
      const { matches, error } = testPattern(pattern.pattern_regex);
      return {
        patternId: pattern.id,
        patternType: pattern.pattern_type,
        description: pattern.pattern_description,
        regex: pattern.pattern_regex,
        matches,
        error,
      };
    });
  };

  const testResults = getTestResults();
  const matchedResults = testResults.filter(r => r.matches.length > 0);
  const errorResults = testResults.filter(r => r.error !== null);
  const noMatchResults = testResults.filter(r => r.matches.length === 0 && !r.error);

  const filteredPatterns = patterns?.filter(p =>
    p.pattern_description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.pattern_regex.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const patternTypes = ["all", "time", "date", "venue", "price", "address", "signup_url", "free"];

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return "text-green-600";
    if (score >= 0.6) return "text-yellow-600";
    return "text-orange-600";
  };

  const getPatternHealthColor = (successCount: number, failureCount: number): string => {
    const total = successCount + failureCount;
    if (total < 5) return "";
    const successRate = successCount / total;
    if (successRate >= 0.7) return "border-l-4 border-l-green-500";
    if (successRate >= 0.5) return "border-l-4 border-l-yellow-500";
    return "border-l-4 border-l-red-500";
  };

  const getSuccessRateDisplay = (successCount: number, failureCount: number): string | null => {
    const total = successCount + failureCount;
    if (total < 5) return null;
    const successRate = (successCount / total) * 100;
    return `${successRate.toFixed(0)}%`;
  };

  const getSuccessRateVariant = (successRate: number): "default" | "secondary" | "destructive" => {
    if (successRate >= 70) return "default";
    if (successRate >= 50) return "secondary";
    return "destructive";
  };

  const checkRegexValidity = (regex: string): { valid: boolean; error?: string } => {
    try {
      new RegExp(regex, "gi");
      return { valid: true };
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      return { valid: false, error: errorMessage };
    }
  };

  const startEditing = (pattern: any) => {
    setEditingPattern({
      id: pattern.id,
      regex: pattern.pattern_regex,
      description: pattern.pattern_description || "",
      priority: pattern.priority?.toString() || "100",
    });
  };

  if (isLoading) {
    return <div className="flex justify-center p-8">Loading patterns...</div>;
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <Tabs defaultValue="patterns" className="w-full">
        <TabsList className="grid w-full grid-cols-5 gap-1">
          <TabsTrigger value="patterns" className="text-xs md:text-sm">Patterns</TabsTrigger>
          <TabsTrigger value="suggestions" className="text-xs md:text-sm relative">
            Suggestions
            {suggestionCount && suggestionCount > 0 && (
              <Badge className="ml-1 h-5 w-5 p-0 text-xs flex items-center justify-center bg-accent text-accent-foreground">
                {suggestionCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ground-truth" className="text-xs md:text-sm">
            Ground Truth
            {groundTruthCount && groundTruthCount > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({groundTruthCount})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="learning" className="text-xs md:text-sm">Learning</TabsTrigger>
          <TabsTrigger value="testing" className="text-xs md:text-sm">Testing</TabsTrigger>
        </TabsList>

        <TabsContent value="patterns" className="space-y-3 md:space-y-4 mt-4 md:mt-6">
          {/* Pattern Creation Form */}
          <PatternCreationForm />

          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patterns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm w-full md:w-auto bg-background"
            >
              {patternTypes.map(type => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <ExportButton />
              <ImportButton />
            </div>
          </div>

          <div className="grid gap-3">
            {filteredPatterns?.map((pattern) => {
              const isEditing = editingPattern?.id === pattern.id;
              const regexToCheck = isEditing ? editingPattern.regex : pattern.pattern_regex;
              const regexCheck = checkRegexValidity(regexToCheck);
              const healthColor = getPatternHealthColor(pattern.success_count || 0, pattern.failure_count || 0);
              const successRate = getSuccessRateDisplay(pattern.success_count || 0, pattern.failure_count || 0);
              
              return (
                <Card key={pattern.id} className={`${!regexCheck.valid ? "border-destructive" : ""} ${healthColor}`}>
                  <CardContent className="p-4 md:p-6">
                    {isEditing ? (
                      /* Edit Mode */
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">{pattern.pattern_type}</Badge>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => updatePatternMutation.mutate(editingPattern)}
                              disabled={!regexCheck.valid || updatePatternMutation.isPending}
                            >
                              <Save className="h-4 w-4 mr-1" />
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingPattern(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs">Regex Pattern</Label>
                          <Input
                            value={editingPattern.regex}
                            onChange={(e) => setEditingPattern({ ...editingPattern, regex: e.target.value })}
                            className={`font-mono text-sm ${!regexCheck.valid ? 'border-destructive' : ''}`}
                          />
                          {!regexCheck.valid && (
                            <p className="text-xs text-destructive mt-1">{regexCheck.error}</p>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Description</Label>
                            <Input
                              value={editingPattern.description}
                              onChange={(e) => setEditingPattern({ ...editingPattern, description: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Priority</Label>
                            <Input
                              type="number"
                              value={editingPattern.priority}
                              onChange={(e) => setEditingPattern({ ...editingPattern, priority: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* View Mode */
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 md:gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">{pattern.pattern_type}</Badge>
                            <Badge
                              variant={pattern.source === "default" ? "secondary" : pattern.source === "ai_learned" ? "default" : "outline"}
                              className="text-xs"
                            >
                              {pattern.source === "ai_learned" ? "🤖 AI" : pattern.source === "manual" ? "✏️ Manual" : pattern.source}
                            </Badge>
                            <span className={`text-xs md:text-sm font-semibold ${getConfidenceColor(Number(pattern.confidence_score))}`}>
                              {(Number(pattern.confidence_score) * 100).toFixed(0)}% confidence
                            </span>
                            {successRate && (
                              <Badge 
                                variant={getSuccessRateVariant(Number(successRate.replace('%', '')))}
                                className="text-xs"
                              >
                                {successRate} success
                              </Badge>
                            )}
                            {!regexCheck.valid && (
                              <Badge variant="destructive" className="text-xs">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Invalid Regex
                              </Badge>
                            )}
                          </div>
                          
                          <code className="block p-2 bg-muted rounded text-xs md:text-sm break-all">
                            {pattern.pattern_regex}
                          </code>
                          
                          {!regexCheck.valid && (
                            <p className="text-xs text-destructive">Error: {regexCheck.error}</p>
                          )}
                          
                          {pattern.pattern_description && (
                            <p className="text-xs md:text-sm text-muted-foreground">
                              {pattern.pattern_description}
                            </p>
                          )}
                          
                          <div className="flex flex-wrap gap-2 md:gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                              {pattern.success_count} successes
                            </span>
                            <span className="flex items-center gap-1">
                              <XCircle className="h-3 w-3 text-red-600" />
                              {pattern.failure_count} failures
                            </span>
                            {pattern.priority && (
                              <span>Priority: {pattern.priority}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 md:flex-col md:items-end">
                          <Switch
                            checked={pattern.is_active}
                            onCheckedChange={() =>
                              togglePatternMutation.mutate({
                                id: pattern.id,
                                isActive: pattern.is_active,
                              })
                            }
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEditing(pattern)}
                            className="text-xs"
                          >
                            <Edit2 className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          {(pattern.source === "learned" || pattern.source === "ai_learned" || pattern.source === "manual") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deletePatternMutation.mutate(pattern.id)}
                              className="text-xs text-destructive hover:text-destructive"
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {filteredPatterns?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No patterns found matching your search
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="suggestions" className="mt-4 md:mt-6 space-y-4">
          {/* Bulk Actions */}
          <PatternSuggestionsBulkActions />
          
          {/* Individual Review */}
          <Card>
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <Lightbulb className="h-5 w-5" />
                Pattern Suggestions
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Review and approve AI-generated pattern suggestions
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0">
              <PatternSuggestionsReview />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ground-truth" className="mt-4 md:mt-6">
          <Card>
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <Database className="h-5 w-5" />
                Ground Truth Data
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Verified extraction values used for pattern training
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0">
              <GroundTruthViewer />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="learning">
          <PatternLearner />
        </TabsContent>

        <TabsContent value="testing" className="space-y-4 mt-4 md:mt-6">
          <Card>
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-base md:text-lg">Pattern Testing</CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Test your extraction patterns against sample text
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0 space-y-4">
              <div className="space-y-3">
                <div className="flex flex-col md:flex-row gap-2">
                  <div className="flex-1">
                    <label className="text-sm font-medium">Test Text</label>
                    <Textarea
                      placeholder="Paste event caption or OCR text here to test patterns..."
                      value={testText}
                      onChange={(e) => setTestText(e.target.value)}
                      className="mt-1 min-h-[100px]"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Test against:</label>
                  <select
                    value={testingType}
                    onChange={(e) => setTestingType(e.target.value)}
                    className="px-3 py-2 border rounded-md text-sm bg-background"
                  >
                    {patternTypes.map(type => (
                      <option key={type} value={type}>
                        {type === "all" ? "All pattern types" : `${type.charAt(0).toUpperCase() + type.slice(1)} patterns only`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {testText.trim() && (
                <div className="space-y-4">
                  {/* Summary Stats */}
                  <div className="flex flex-wrap gap-4 p-3 bg-muted rounded-md">
                    <span className="text-xs text-muted-foreground">
                      Testing {testingType === "all" ? "all pattern types" : `${testingType} patterns only`} ({testResults.length} patterns)
                    </span>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">{matchedResults.length} matched</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{noMatchResults.length} no match</span>
                    </div>
                    {errorResults.length > 0 && (
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <span className="text-sm text-destructive">{errorResults.length} errors</span>
                      </div>
                    )}
                    <div className="ml-auto">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAllPatterns(!showAllPatterns)}
                        className="text-xs"
                      >
                        {showAllPatterns ? (
                          <>
                            <EyeOff className="h-3 w-3 mr-1" />
                            Hide unmatched
                          </>
                        ) : (
                          <>
                            <Eye className="h-3 w-3 mr-1" />
                            Show all patterns
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Error Patterns */}
                  {errorResults.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-medium text-sm flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        Failed to Compile ({errorResults.length})
                      </h3>
                      {errorResults.map((result) => (
                        <div key={result.patternId} className="p-3 border border-destructive rounded-md bg-destructive/5">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">{result.patternType}</Badge>
                            <span className="text-xs text-muted-foreground">{result.description}</span>
                          </div>
                          <code className="block text-xs p-1 bg-muted rounded mb-1 break-all">
                            {result.regex}
                          </code>
                          <p className="text-xs text-destructive">Error: {result.error}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Matched Patterns */}
                  {matchedResults.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-medium text-sm flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        Matching Patterns ({matchedResults.length})
                      </h3>
                      {matchedResults.map((result) => (
                        <div key={result.patternId} className="p-3 border border-green-600/30 rounded-md bg-green-600/5">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">{result.patternType}</Badge>
                            <span className="text-xs text-muted-foreground">{result.description}</span>
                          </div>
                          <div className="text-sm">
                            <strong>Matches:</strong>{" "}
                            <span className="text-green-600 font-mono">
                              {result.matches.join(", ")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No Match Patterns (togglable) */}
                  {showAllPatterns && noMatchResults.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
                        <XCircle className="h-4 w-4" />
                        No Matches ({noMatchResults.length})
                      </h3>
                      <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                        {noMatchResults.map((result) => (
                          <div key={result.patternId} className="p-2 border rounded-md bg-muted/30">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{result.patternType}</Badge>
                              <span className="text-xs text-muted-foreground truncate flex-1">
                                {result.description || result.regex.substring(0, 40) + "..."}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {matchedResults.length === 0 && errorResults.length === 0 && (
                    <div className="text-center py-4 text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No patterns matched the test text</p>
                    </div>
                  )}
                </div>
              )}

              {!testText.trim() && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Enter some text above to test patterns</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
