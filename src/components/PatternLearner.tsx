import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Brain, Loader2, TrendingUp, Info, HelpCircle, Sparkles, Ban, Database, RotateCcw, Zap, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

interface OptimizationStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}

export const PatternLearner = () => {
  const [isLearning, setIsLearning] = useState(false);
  const [isGeneratingFromAI, setIsGeneratingFromAI] = useState(false);
  const [isDisablingFailing, setIsDisablingFailing] = useState(false);
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [isRunningOptimization, setIsRunningOptimization] = useState(false);
  const [optimizationSteps, setOptimizationSteps] = useState<OptimizationStep[]>([]);
  const [progress, setProgress] = useState(0);
  const queryClient = useQueryClient();

  const { data: recentCorrections, isLoading: correctionsLoading } = useQuery({
    queryKey: ["recent-corrections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extraction_corrections")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
  });

  const { data: recentFeedback } = useQuery({
    queryKey: ["recent-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extraction_feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
  });

  const { data: learningStats } = useQuery({
    queryKey: ["learning-stats"],
    queryFn: async () => {
      const { data: corrections } = await supabase
        .from("extraction_corrections")
        .select("field_name, created_at")
        .order("created_at", { ascending: false });

      const { data: patterns } = await supabase
        .from("extraction_patterns")
        .select("source, confidence_score, success_count, failure_count, is_active");

      const learnedPatterns = patterns?.filter(p => p.source === "learned" || p.source === "ai_learned").length || 0;
      const defaultPatterns = patterns?.filter(p => p.source === "default").length || 0;
      const avgConfidence = patterns?.length 
        ? patterns.reduce((sum, p) => sum + Number(p.confidence_score), 0) / patterns.length
        : 0;

      // Count failing patterns (>66% failure rate with 10+ attempts)
      const failingPatterns = patterns?.filter(p => {
        const total = (p.success_count || 0) + (p.failure_count || 0);
        return p.is_active && total > 10 && (p.failure_count || 0) > (p.success_count || 0) * 2;
      }).length || 0;

      // Get most recent correction date
      const lastCorrectionAt = corrections?.[0]?.created_at;

      // Count corrections by field
      const fieldCounts: Record<string, number> = {};
      corrections?.forEach(c => {
        fieldCounts[c.field_name] = (fieldCounts[c.field_name] || 0) + 1;
      });

      // Get pending suggestions count
      const { count: pendingSuggestions } = await supabase
        .from("pattern_suggestions")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      // Get failed suggestions count (for retry button)
      const { count: failedSuggestions } = await supabase
        .from("pattern_suggestions")
        .select("*", { count: "exact", head: true })
        .eq("status", "generation_failed");

      // Get ground truth count
      const { count: groundTruthCount } = await supabase
        .from("extraction_ground_truth")
        .select("*", { count: "exact", head: true })
        .eq("source", "ai_high_confidence");

      return {
        totalCorrections: corrections?.length || 0,
        learnedPatterns,
        defaultPatterns,
        avgConfidence: avgConfidence.toFixed(2),
        lastCorrectionAt,
        fieldCounts,
        pendingSuggestions: pendingSuggestions || 0,
        failedSuggestions: failedSuggestions || 0,
        groundTruthCount: groundTruthCount || 0,
        failingPatterns,
      };
    },
  });

  // Mutation for generating patterns from AI
  const generateFromAIMutation = useMutation({
    mutationFn: async () => {
      setIsGeneratingFromAI(true);
      
      const { data, error } = await supabase.functions.invoke("generate-patterns-from-ai", {
        body: {
          useGroundTruth: true,
          useSuggestions: true,
          minSamplesPerType: 3,
          minSuccessRate: 0.7,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.patternsGenerated > 0) {
        toast.success(`Generated ${data.patternsGenerated} new patterns from AI!`);
      } else {
        toast.info("No new patterns were generated. Need more samples or patterns already exist.");
      }
      queryClient.invalidateQueries({ queryKey: ["extraction-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["learning-stats"] });
      setIsGeneratingFromAI(false);
    },
    onError: (error: Error) => {
      toast.error(`AI generation failed: ${error.message}`);
      setIsGeneratingFromAI(false);
    },
  });

  // Mutation for disabling failing patterns
  const disableFailingMutation = useMutation({
    mutationFn: async () => {
      setIsDisablingFailing(true);
      
      // Fetch patterns with high failure rate
      const { data: patterns, error: fetchError } = await supabase
        .from("extraction_patterns")
        .select("id, success_count, failure_count")
        .eq("is_active", true);

      if (fetchError) throw fetchError;

      const toDisable = patterns?.filter(p => {
        const total = (p.success_count || 0) + (p.failure_count || 0);
        return total > 10 && (p.failure_count || 0) > (p.success_count || 0) * 2;
      }) || [];

      if (toDisable.length === 0) {
        return { disabled: 0 };
      }

      const ids = toDisable.map(p => p.id);
      const { error: updateError } = await supabase
        .from("extraction_patterns")
        .update({ is_active: false })
        .in("id", ids);

      if (updateError) throw updateError;

      return { disabled: toDisable.length };
    },
    onSuccess: (data) => {
      if (data.disabled > 0) {
        toast.success(`Disabled ${data.disabled} failing patterns`);
      } else {
        toast.info("No failing patterns found to disable");
      }
      queryClient.invalidateQueries({ queryKey: ["extraction-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["learning-stats"] });
      setIsDisablingFailing(false);
    },
    onError: (error: Error) => {
      toast.error(`Failed to disable patterns: ${error.message}`);
      setIsDisablingFailing(false);
    },
  });

  // Mutation for retrying failed suggestions
  const retryFailedMutation = useMutation({
    mutationFn: async () => {
      setIsRetryingFailed(true);
      
      // Reset all failed suggestions to pending with attempt_count = 0
      const { data, error } = await supabase
        .from("pattern_suggestions")
        .update({ status: "pending", attempt_count: 0 })
        .eq("status", "generation_failed")
        .select("id");

      if (error) throw error;
      return { reset: data?.length || 0 };
    },
    onSuccess: (data) => {
      if (data.reset > 0) {
        toast.success(`Reset ${data.reset} failed suggestions for retry`);
      } else {
        toast.info("No failed suggestions to reset");
      }
      queryClient.invalidateQueries({ queryKey: ["learning-stats"] });
      setIsRetryingFailed(false);
    },
    onError: (error: Error) => {
      toast.error(`Failed to reset suggestions: ${error.message}`);
      setIsRetryingFailed(false);
    },
  });

  const learnPatternsMutation = useMutation({
    mutationFn: async () => {
      setIsLearning(true);
      setProgress(10);

      // Analyze corrections by field
      const correctionsByField = new Map<string, string[]>();
      
      recentCorrections?.forEach(correction => {
        if (!correctionsByField.has(correction.field_name)) {
          correctionsByField.set(correction.field_name, []);
        }
        correctionsByField.get(correction.field_name)?.push(correction.corrected_value);
      });

      setProgress(30);

      const newPatterns: any[] = [];

      // Generate patterns for each field type
      for (const [fieldName, values] of correctionsByField.entries()) {
        if (values.length < 3) continue; // Need at least 3 examples

        const patterns = generatePatternsFromValues(fieldName, values);
        newPatterns.push(...patterns);
      }

      setProgress(60);

      // Test patterns against historical data
      const validatedPatterns = await validatePatterns(newPatterns, recentCorrections || []);

      setProgress(80);

      // Insert validated patterns
      if (validatedPatterns.length > 0) {
        const { error } = await supabase
          .from("extraction_patterns")
          .insert(validatedPatterns);

        if (error) throw error;
      }

      setProgress(100);
      return validatedPatterns.length;
    },
    onSuccess: (count) => {
      toast.success(`Learned ${count} new patterns!`);
      queryClient.invalidateQueries({ queryKey: ["extraction-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["learning-stats"] });
      setIsLearning(false);
      setProgress(0);
    },
    onError: (error: any) => {
      toast.error(`Learning failed: ${error.message}`);
      setIsLearning(false);
      setProgress(0);
    },
  });

  // Full optimization mutation - runs all steps in sequence
  const runFullOptimizationMutation = useMutation({
    mutationFn: async () => {
      setIsRunningOptimization(true);
      const steps: OptimizationStep[] = [
        { id: 'disable', label: 'Disable failing patterns', status: 'pending' },
        { id: 'reject_venue', label: 'Reject venue/address suggestions', status: 'pending' },
        { id: 'generate', label: 'Generate patterns from AI', status: 'pending' },
        { id: 'cleanup', label: 'Cleanup rejected suggestions', status: 'pending' },
      ];
      setOptimizationSteps(steps);
      setProgress(0);
      
      const results: Record<string, string> = {};
      
      // Step 1: Disable failing patterns
      const updateStep = (id: string, status: OptimizationStep['status'], result?: string) => {
        setOptimizationSteps(prev => prev.map(s => 
          s.id === id ? { ...s, status, result } : s
        ));
      };
      
      try {
        updateStep('disable', 'running');
        const { data: patterns } = await supabase
          .from("extraction_patterns")
          .select("id, success_count, failure_count")
          .eq("is_active", true);
        
        const toDisable = patterns?.filter(p => {
          const total = (p.success_count || 0) + (p.failure_count || 0);
          return total > 10 && (p.failure_count || 0) > (p.success_count || 0) * 2;
        }) || [];
        
        if (toDisable.length > 0) {
          await supabase
            .from("extraction_patterns")
            .update({ is_active: false })
            .in("id", toDisable.map(p => p.id));
        }
        
        results.disable = `Disabled ${toDisable.length} failing patterns`;
        updateStep('disable', 'completed', results.disable);
        setProgress(25);
      } catch (err) {
        updateStep('disable', 'failed', String(err));
      }
      
      // Step 2: Reject venue/address suggestions (not applicable for regex)
      try {
        updateStep('reject_venue', 'running');
        const { data: rejectedVenues } = await supabase
          .from("pattern_suggestions")
          .update({ status: "not_applicable" })
          .in("pattern_type", ["venue", "address"])
          .eq("status", "pending")
          .select("id");
        
        results.reject_venue = `Rejected ${rejectedVenues?.length || 0} venue/address suggestions`;
        updateStep('reject_venue', 'completed', results.reject_venue);
        setProgress(50);
      } catch (err) {
        updateStep('reject_venue', 'failed', String(err));
      }
      
      // Step 3: Generate patterns from AI
      try {
        updateStep('generate', 'running');
        const { data, error } = await supabase.functions.invoke("generate-patterns-from-ai", {
          body: {
            useGroundTruth: true,
            useSuggestions: true,
            minSamplesPerCluster: 2,
            minSuccessRate: 0.6,
          },
        });
        
        if (error) throw error;
        
        results.generate = `Generated ${data?.patternsGenerated || 0} new patterns`;
        updateStep('generate', 'completed', results.generate);
        setProgress(75);
      } catch (err) {
        updateStep('generate', 'failed', String(err));
      }
      
      // Step 4: Cleanup rejected suggestions
      try {
        updateStep('cleanup', 'running');
        const { data: deleted } = await supabase
          .from("pattern_suggestions")
          .delete()
          .in("status", ["rejected", "not_applicable"])
          .select("id");
        
        results.cleanup = `Deleted ${deleted?.length || 0} rejected suggestions`;
        updateStep('cleanup', 'completed', results.cleanup);
        setProgress(100);
      } catch (err) {
        updateStep('cleanup', 'failed', String(err));
      }
      
      return results;
    },
    onSuccess: (results) => {
      toast.success("Full optimization completed!");
      queryClient.invalidateQueries({ queryKey: ["extraction-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["learning-stats"] });
      queryClient.invalidateQueries({ queryKey: ["pattern-suggestions-stats"] });
      setIsRunningOptimization(false);
    },
    onError: (error: Error) => {
      toast.error(`Optimization failed: ${error.message}`);
      setIsRunningOptimization(false);
    },
  });

  const hasCorrections = recentCorrections && recentCorrections.length > 0;
  const hasMinimumCorrections = recentCorrections && recentCorrections.length >= 3;

  return (
    <div className="space-y-4 mt-4 md:mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Pattern Learning Engine
          </CardTitle>
          <CardDescription>
            Automatically learn extraction patterns from manual corrections and AI ground truth
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted rounded-md">
              <div className="text-2xl font-bold text-primary">
                {learningStats?.totalCorrections || 0}
              </div>
              <div className="text-xs text-muted-foreground">Total Corrections</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-md">
              <div className="text-2xl font-bold text-primary">
                {learningStats?.learnedPatterns || 0}
              </div>
              <div className="text-xs text-muted-foreground">Learned Patterns</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-md">
              <div className="text-2xl font-bold text-primary">
                {learningStats?.groundTruthCount || 0}
              </div>
              <div className="text-xs text-muted-foreground">Ground Truth Records</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-md">
              <div className="text-2xl font-bold text-primary">
                {learningStats?.pendingSuggestions || 0}
              </div>
              <div className="text-xs text-muted-foreground">Pending Suggestions</div>
            </div>
          </div>

          {/* Additional Stats Row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-muted rounded-md">
              <div className="text-2xl font-bold text-primary">
                {learningStats?.defaultPatterns || 0}
              </div>
              <div className="text-xs text-muted-foreground">Default Patterns</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-md">
              <div className="text-2xl font-bold text-primary">
                {learningStats?.avgConfidence || "0.00"}
              </div>
              <div className="text-xs text-muted-foreground">Avg Confidence</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-md">
              <div className={`text-2xl font-bold ${(learningStats?.failingPatterns || 0) > 0 ? 'text-destructive' : 'text-primary'}`}>
                {learningStats?.failingPatterns || 0}
              </div>
              <div className="text-xs text-muted-foreground">Failing Patterns</div>
            </div>
          </div>

          {/* Field Breakdown */}
          {learningStats?.fieldCounts && Object.keys(learningStats.fieldCounts).length > 0 && (
            <div className="p-3 bg-muted/50 rounded-md">
              <h4 className="text-sm font-medium mb-2">Corrections by Field</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(learningStats.fieldCounts).map(([field, count]) => (
                  <span key={field} className="text-xs bg-background px-2 py-1 rounded">
                    {field}: <strong>{count}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Last Correction Info */}
          {learningStats?.lastCorrectionAt && (
            <p className="text-xs text-muted-foreground">
              Last correction: {new Date(learningStats.lastCorrectionAt).toLocaleString()}
            </p>
          )}

          <Separator />

          {/* Full Optimization Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Pre-Scrape Optimization
            </h4>
            <Alert className="border-yellow-500/50 bg-yellow-500/10">
              <Zap className="h-4 w-4 text-yellow-500" />
              <AlertTitle>Run Before Large Scrapes</AlertTitle>
              <AlertDescription className="text-sm">
                This will: (1) disable failing patterns, (2) reject venue/address suggestions, 
                (3) generate new patterns from {learningStats?.groundTruthCount || 0} ground truth records, 
                (4) cleanup rejected suggestions.
              </AlertDescription>
            </Alert>
            
            {isRunningOptimization && optimizationSteps.length > 0 && (
              <div className="space-y-2 p-3 bg-muted rounded-md">
                <Progress value={progress} className="h-2" />
                {optimizationSteps.map((step) => (
                  <div key={step.id} className="flex items-center gap-2 text-sm">
                    {step.status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />}
                    {step.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {step.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {step.status === 'failed' && <Ban className="h-4 w-4 text-destructive" />}
                    <span className={step.status === 'completed' ? 'text-muted-foreground' : ''}>
                      {step.label}
                    </span>
                    {step.result && (
                      <span className="text-xs text-muted-foreground ml-auto">{step.result}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            <Button
              onClick={() => runFullOptimizationMutation.mutate()}
              disabled={isRunningOptimization}
              className="w-full"
              variant="default"
            >
              {isRunningOptimization ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running Optimization...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  ⚡ Run Full Optimization
                </>
              )}
            </Button>
          </div>

          <Separator />

          {/* AI Pattern Generation Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              AI Pattern Generation
            </h4>
            <p className="text-xs text-muted-foreground">
              Generate regex patterns automatically using AI from {learningStats?.groundTruthCount || 0} ground truth records 
              and {learningStats?.pendingSuggestions || 0} pending suggestions.
              {(learningStats?.failedSuggestions || 0) > 0 && (
                <span className="text-destructive"> ({learningStats?.failedSuggestions} failed)</span>
              )}
            </p>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Note:</strong> Venue/address patterns cannot be auto-generated (venue names are proper nouns with no regex pattern). 
                These are handled by AI extraction + known_venues database instead. Date/time patterns may fail if existing patterns already cover the format.
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button
                onClick={() => generateFromAIMutation.mutate()}
                disabled={isGeneratingFromAI || ((learningStats?.groundTruthCount || 0) + (learningStats?.pendingSuggestions || 0) < 3)}
                className="flex-1"
                variant="secondary"
              >
                {isGeneratingFromAI ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    🤖 Generate Patterns
                  </>
                )}
              </Button>
              {(learningStats?.failedSuggestions || 0) > 0 && (
                <Button
                  onClick={() => retryFailedMutation.mutate()}
                  disabled={isRetryingFailed}
                  variant="outline"
                  title={`Reset ${learningStats?.failedSuggestions} failed suggestions for retry`}
                >
                  {isRetryingFailed ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RotateCcw className="mr-1 h-4 w-4" />
                      Retry Failed
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Disable Failing Patterns Section */}
          {(learningStats?.failingPatterns || 0) > 0 && (
            <div className="space-y-3">
              <Alert variant="destructive">
                <Ban className="h-4 w-4" />
                <AlertTitle>Failing Patterns Detected</AlertTitle>
                <AlertDescription className="text-sm">
                  {learningStats?.failingPatterns} pattern(s) have {'>'}66% failure rate and should be disabled.
                </AlertDescription>
              </Alert>
              <Button
                onClick={() => disableFailingMutation.mutate()}
                disabled={isDisablingFailing}
                variant="destructive"
                className="w-full"
              >
                {isDisablingFailing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Disabling Patterns...
                  </>
                ) : (
                  <>
                    <Ban className="mr-2 h-4 w-4" />
                    Disable Failing Patterns
                  </>
                )}
              </Button>
            </div>
          )}

          <Separator />

          {/* Learn from Corrections Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Learn from Manual Corrections
            </h4>

            {/* No Corrections Alert */}
            {!correctionsLoading && !hasCorrections && (
              <Alert>
                <HelpCircle className="h-4 w-4" />
                <AlertTitle>No corrections recorded yet</AlertTitle>
                <AlertDescription className="text-sm">
                  The learning engine needs manual corrections to learn new patterns. To generate corrections:
                  <ol className="list-decimal list-inside mt-2 space-y-1 text-xs">
                    <li>Go to the <strong>Review</strong> tab</li>
                    <li>Edit event fields (time, date, venue, price) when extraction is wrong</li>
                    <li>Save your corrections - they'll be logged automatically</li>
                    <li>Return here after making at least 3 corrections for a field type</li>
                  </ol>
                </AlertDescription>
              </Alert>
            )}

            {/* Not Enough Corrections Warning */}
            {hasCorrections && !hasMinimumCorrections && (
              <Alert variant="default">
                <Info className="h-4 w-4" />
                <AlertTitle>Need more corrections</AlertTitle>
                <AlertDescription className="text-sm">
                  You have {recentCorrections?.length} correction(s), but the learning engine needs at least 3 
                  corrections per field type to generate reliable patterns. Keep correcting events in the Review Queue!
                </AlertDescription>
              </Alert>
            )}

            {/* Progress Bar */}
            {isLearning && (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-sm text-muted-foreground text-center">
                  {progress < 30 && "Analyzing corrections..."}
                  {progress >= 30 && progress < 60 && "Generating patterns..."}
                  {progress >= 60 && progress < 80 && "Validating patterns..."}
                  {progress >= 80 && "Saving learned patterns..."}
                </p>
              </div>
            )}

            {/* Learn Button */}
            <Button
              onClick={() => learnPatternsMutation.mutate()}
              disabled={isLearning || !hasMinimumCorrections}
              className="w-full"
            >
              {isLearning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Learning Patterns...
                </>
              ) : (
                <>
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Learn from Recent Corrections
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground">
              This will analyze the last 100 manual corrections and generate new extraction
              patterns that can improve automatic data extraction. Patterns are validated before being added.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Recent Feedback Section */}
      {recentFeedback && recentFeedback.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Extraction Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {recentFeedback.map((fb) => (
                <div key={fb.id} className="text-xs p-2 bg-muted rounded">
                  <span className="font-medium">{fb.field_name}</span>
                  <span className="text-muted-foreground mx-2">→</span>
                  <span className="text-green-600">{fb.corrected_value}</span>
                  <span className="text-muted-foreground ml-2">
                    ({fb.feedback_type})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

function generatePatternsFromValues(fieldName: string, values: string[]): any[] {
  const patterns: any[] = [];
  const patternType = mapFieldToPatternType(fieldName);

  // Analyze common structures
  const structures = values.map(v => analyzeStructure(v));
  const commonStructures = findCommonStructures(structures);

  for (const struct of commonStructures) {
    const regex = structureToRegex(struct);
    if (regex) {
      patterns.push({
        pattern_type: patternType,
        pattern_regex: regex,
        pattern_description: `Learned from ${fieldName} corrections`,
        confidence_score: 0.5,
        source: "learned",
      });
    }
  }

  return patterns;
}

function mapFieldToPatternType(fieldName: string): string {
  const mapping: Record<string, string> = {
    event_time: "time",
    event_date: "date",
    location_name: "venue",
    price: "price",
    signup_url: "signup_url",
  };
  return mapping[fieldName] || "venue";
}

function analyzeStructure(value: string): string {
  return value
    .replace(/\d+/g, "\\d+")
    .replace(/[a-z]+/gi, "[a-z]+")
    .replace(/\s+/g, "\\s+");
}

function findCommonStructures(structures: string[]): string[] {
  const frequency = new Map<string, number>();
  
  structures.forEach(struct => {
    frequency.set(struct, (frequency.get(struct) || 0) + 1);
  });

  return Array.from(frequency.entries())
    .filter(([_, count]) => count >= 2)
    .map(([struct]) => struct);
}

function structureToRegex(structure: string): string | null {
  try {
    // Test if it's a valid regex
    new RegExp(structure);
    return structure;
  } catch {
    return null;
  }
}

async function validatePatterns(patterns: any[], corrections: any[]): Promise<any[]> {
  const validated: any[] = [];

  for (const pattern of patterns) {
    let successCount = 0;
    let totalTests = 0;

    // Test against corrections
    for (const correction of corrections) {
      if (mapFieldToPatternType(correction.field_name) !== pattern.pattern_type) continue;

      totalTests++;
      try {
        const regex = new RegExp(pattern.pattern_regex, "gi");
        if (regex.test(correction.corrected_value)) {
          successCount++;
        }
      } catch {
        // Invalid regex, skip
        break;
      }
    }

    // Only keep patterns with >70% success rate and at least 3 tests
    if (totalTests >= 3 && successCount / totalTests > 0.7) {
      validated.push({
        ...pattern,
        confidence_score: successCount / totalTests,
      });
    }
  }

  return validated;
}
