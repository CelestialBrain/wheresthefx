import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, AlertTriangle, CheckCircle2 } from "lucide-react";

interface PatternCreationFormProps {
  onSuccess?: () => void;
}

export const PatternCreationForm = ({ onSuccess }: PatternCreationFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [patternType, setPatternType] = useState("time");
  const [regex, setRegex] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("100");
  const [testText, setTestText] = useState("");
  const queryClient = useQueryClient();

  const patternTypes = ["time", "date", "venue", "price", "address", "signup_url", "free"];

  const validateRegex = (pattern: string): { valid: boolean; error?: string } => {
    if (!pattern.trim()) return { valid: false, error: "Pattern is required" };
    try {
      new RegExp(pattern, "gi");
      return { valid: true };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : "Invalid regex" };
    }
  };

  const testPattern = (): string[] => {
    if (!testText.trim() || !regex.trim()) return [];
    try {
      const re = new RegExp(regex, "gi");
      return testText.match(re) || [];
    } catch {
      return [];
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const validation = validateRegex(regex);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const { error } = await supabase
        .from("extraction_patterns")
        .insert({
          pattern_type: patternType,
          pattern_regex: regex,
          pattern_description: description || null,
          priority: parseInt(priority) || 100,
          source: "manual",
          confidence_score: 0.5,
          is_active: true,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pattern created successfully");
      queryClient.invalidateQueries({ queryKey: ["extraction-patterns"] });
      resetForm();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setRegex("");
    setDescription("");
    setPriority("100");
    setTestText("");
    setIsOpen(false);
  };

  const validation = validateRegex(regex);
  const testMatches = testPattern();

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} className="w-full md:w-auto">
        <Plus className="h-4 w-4 mr-2" />
        Create New Pattern
      </Button>
    );
  }

  return (
    <Card className="border-accent">
      <CardHeader className="p-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create New Pattern
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Pattern Type</Label>
            <select
              value={patternType}
              onChange={(e) => setPatternType(e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background"
            >
              {patternTypes.map(type => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1).replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <Label>Priority</Label>
            <Input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              placeholder="100"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Higher = tried first</p>
          </div>
        </div>

        <div>
          <Label>Regex Pattern</Label>
          <Input
            value={regex}
            onChange={(e) => setRegex(e.target.value)}
            placeholder="e.g., (\d{1,2}):(\d{2})\s*(am|pm)?"
            className={`mt-1 font-mono ${!validation.valid && regex ? 'border-destructive' : ''}`}
          />
          {!validation.valid && regex && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {validation.error}
            </p>
          )}
          {validation.valid && regex && (
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Valid regex
            </p>
          )}
        </div>

        <div>
          <Label>Description (optional)</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Matches 12-hour time format with AM/PM"
            className="mt-1"
          />
        </div>

        <div>
          <Label>Test Text (optional)</Label>
          <Textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="Paste sample text to test your pattern..."
            className="mt-1 min-h-[60px]"
          />
          {testText && regex && validation.valid && (
            <div className="mt-2">
              {testMatches.length > 0 ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Matches:</span>
                  {testMatches.map((match, i) => (
                    <Badge key={i} variant="secondary" className="font-mono text-xs">
                      {match}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-orange-600">No matches found in test text</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!validation.valid || createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Pattern"}
          </Button>
          <Button variant="ghost" onClick={resetForm}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
