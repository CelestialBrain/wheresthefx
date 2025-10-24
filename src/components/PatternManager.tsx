import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Search, CheckCircle2, XCircle, TrendingUp, AlertCircle } from "lucide-react";
import { PatternLearner } from "./PatternLearner";

export const PatternManager = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [testText, setTestText] = useState("");
  const queryClient = useQueryClient();

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

  const togglePatternMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("extraction_patterns")
        .update({ is_active: !isActive })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["extraction-patterns"] });
      toast.success("Pattern updated");
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

  const testPattern = (pattern: string, text: string) => {
    try {
      const regex = new RegExp(pattern, "gi");
      const matches = text.match(regex);
      return matches || [];
    } catch {
      return [];
    }
  };

  const filteredPatterns = patterns?.filter(p =>
    p.pattern_description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.pattern_regex.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const patternTypes = ["all", "time", "date", "venue", "price", "address", "signup_url"];

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return "text-green-600";
    if (score >= 0.6) return "text-yellow-600";
    return "text-orange-600";
  };

  if (isLoading) {
    return <div className="flex justify-center p-8">Loading patterns...</div>;
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="patterns" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="patterns">Patterns</TabsTrigger>
          <TabsTrigger value="learning">Learning</TabsTrigger>
          <TabsTrigger value="testing">Testing</TabsTrigger>
        </TabsList>

        <TabsContent value="patterns" className="space-y-4">
          <div className="flex gap-2">
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
              className="px-3 py-2 border rounded-md"
            >
              {patternTypes.map(type => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3">
            {filteredPatterns?.map((pattern) => (
              <Card key={pattern.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{pattern.pattern_type}</Badge>
                        <Badge
                          variant={pattern.source === "default" ? "secondary" : "default"}
                        >
                          {pattern.source}
                        </Badge>
                        <span className={`text-sm font-semibold ${getConfidenceColor(Number(pattern.confidence_score))}`}>
                          {(Number(pattern.confidence_score) * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                      
                      <code className="block p-2 bg-muted rounded text-sm break-all">
                        {pattern.pattern_regex}
                      </code>
                      
                      {pattern.pattern_description && (
                        <p className="text-sm text-muted-foreground">
                          {pattern.pattern_description}
                        </p>
                      )}
                      
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          {pattern.success_count} successes
                        </span>
                        <span className="flex items-center gap-1">
                          <XCircle className="h-3 w-3 text-red-600" />
                          {pattern.failure_count} failures
                        </span>
                        {pattern.last_used_at && (
                          <span>
                            Last used: {new Date(pattern.last_used_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={pattern.is_active}
                        onCheckedChange={() =>
                          togglePatternMutation.mutate({
                            id: pattern.id,
                            isActive: pattern.is_active,
                          })
                        }
                      />
                      {pattern.source === "learned" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deletePatternMutation.mutate(pattern.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredPatterns?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No patterns found matching your search
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="learning">
          <PatternLearner />
        </TabsContent>

        <TabsContent value="testing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pattern Testing</CardTitle>
              <CardDescription>
                Test your extraction patterns against sample text
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Test Text</label>
                <Input
                  placeholder="Enter text to test patterns against..."
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  className="mt-1"
                />
              </div>

              {testText && (
                <div className="space-y-3">
                  <h3 className="font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Matching Patterns
                  </h3>
                  {patterns
                    ?.filter(p => p.is_active)
                    .map((pattern) => {
                      const matches = testPattern(pattern.pattern_regex, testText);
                      if (matches.length === 0) return null;

                      return (
                        <div key={pattern.id} className="p-3 border rounded-md">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">{pattern.pattern_type}</Badge>
                            <span className="text-sm text-muted-foreground">
                              {pattern.pattern_description}
                            </span>
                          </div>
                          <div className="text-sm">
                            <strong>Matches:</strong> {matches.join(", ")}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
