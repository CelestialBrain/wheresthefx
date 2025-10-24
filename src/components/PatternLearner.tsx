import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Brain, Loader2, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface CorrectionAnalysis {
  field_name: string;
  correction_count: number;
  common_patterns: string[];
}

export const PatternLearner = () => {
  const [isLearning, setIsLearning] = useState(false);
  const [progress, setProgress] = useState(0);
  const queryClient = useQueryClient();

  const { data: recentCorrections } = useQuery({
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

  const { data: learningStats } = useQuery({
    queryKey: ["learning-stats"],
    queryFn: async () => {
      const { data: corrections } = await supabase
        .from("extraction_corrections")
        .select("field_name");

      const { data: patterns } = await supabase
        .from("extraction_patterns")
        .select("source, confidence_score");

      const learnedPatterns = patterns?.filter(p => p.source === "learned").length || 0;
      const avgConfidence = patterns?.reduce((sum, p) => sum + Number(p.confidence_score), 0) / (patterns?.length || 1);

      return {
        totalCorrections: corrections?.length || 0,
        learnedPatterns,
        avgConfidence: avgConfidence.toFixed(2),
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Pattern Learning Engine
          </CardTitle>
          <CardDescription>
            Automatically learn extraction patterns from manual corrections
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {learningStats?.totalCorrections || 0}
              </div>
              <div className="text-sm text-muted-foreground">Total Corrections</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {learningStats?.learnedPatterns || 0}
              </div>
              <div className="text-sm text-muted-foreground">Learned Patterns</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {learningStats?.avgConfidence || "0.00"}
              </div>
              <div className="text-sm text-muted-foreground">Avg Confidence</div>
            </div>
          </div>

          {isLearning && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground text-center">
                Analyzing corrections and generating patterns...
              </p>
            </div>
          )}

          <Button
            onClick={() => learnPatternsMutation.mutate()}
            disabled={isLearning || !recentCorrections || recentCorrections.length === 0}
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
            patterns that can improve automatic data extraction.
          </p>
        </CardContent>
      </Card>
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
