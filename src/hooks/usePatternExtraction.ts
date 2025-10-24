import { supabase } from "@/integrations/supabase/client";

interface ExtractionPattern {
  id: string;
  pattern_type: string;
  pattern_regex: string;
  pattern_description: string | null;
  confidence_score: number;
  success_count: number;
  failure_count: number;
}

export const usePatternExtraction = () => {
  const extractWithLearnedPatterns = async (
    text: string,
    patternType: string
  ): Promise<{ value: string | null; patternId: string | null }> => {
    const { data: patterns } = await supabase
      .from("extraction_patterns")
      .select("*")
      .eq("pattern_type", patternType)
      .eq("is_active", true)
      .gte("confidence_score", 0.5)
      .order("confidence_score", { ascending: false })
      .limit(10);

    if (!patterns || patterns.length === 0) {
      return { value: null, patternId: null };
    }

    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern.pattern_regex, "gi");
        const match = text.match(regex);
        
        if (match) {
          // Update success count
          await supabase
            .from("extraction_patterns")
            .update({
              success_count: pattern.success_count + 1,
              last_used_at: new Date().toISOString(),
            })
            .eq("id", pattern.id);

          return {
            value: match[1] || match[0],
            patternId: pattern.id,
          };
        }
      } catch (e) {
        console.error("Invalid regex pattern:", pattern.pattern_regex, e);
        // Mark pattern as failed
        await supabase
          .from("extraction_patterns")
          .update({
            failure_count: pattern.failure_count + 1,
          })
          .eq("id", pattern.id);
      }
    }

    return { value: null, patternId: null };
  };

  const logCorrection = async (
    postId: string,
    fieldName: string,
    originalValue: any,
    correctedValue: any,
    ocrText?: string,
    patternUsed?: string
  ) => {
    if (originalValue === correctedValue) return;

    await supabase.from("extraction_corrections").insert({
      post_id: postId,
      field_name: fieldName,
      original_extracted_value: String(originalValue || ""),
      corrected_value: String(correctedValue),
      extraction_method: "manual",
      original_ocr_text: ocrText,
      pattern_used: patternUsed,
    });
  };

  return {
    extractWithLearnedPatterns,
    logCorrection,
  };
};
