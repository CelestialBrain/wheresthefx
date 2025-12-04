import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Brain, Loader2, TrendingUp, AlertCircle, Info, HelpCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CorrectionAnalysis {
  field_name: string;
  correction_count: number;
  common_patterns: string[];
}

export const PatternLearner = () => {
  const [isLearning, setIsLearning] = useState(false);
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
        .select("source, confidence_score");

      const learnedPatterns = patterns?.filter(p => p.source === "learned").length || 0;
      const defaultPatterns = patterns?.filter(p => p.source === "default").length || 0;
      const avgConfidence = patterns?.length 
        ? patterns.reduce((sum, p) => sum + Number(p.confidence_score), 0) / patterns.length
        : 0;

      // Get most recent correction date
      const lastCorrectionAt = corrections?.[0]?.created_at;

      // Count corrections by field
      const fieldCounts: Record<string, number> = {};
      corrections?.forEach(c => {
        fieldCounts[c.field_name] = (fieldCounts[c.field_name] || 0) + 1;
      });

      return {
        totalCorrections: corrections?.length || 0,
        learnedPatterns,
        defaultPatterns,
        avgConfidence: avgConfidence.toFixed(2),
        lastCorrectionAt,
        fieldCounts,
      };
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
            Automatically learn extraction patterns from manual corrections made in the Review Queue
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
