import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Download, Upload, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export type TableName = 'known_venues' | 'extraction_patterns' | 'geo_configuration' | 'instagram_accounts';

interface UseJsonExportImportProps {
  tableName: TableName;
  displayName: string;
  onImportComplete?: () => void;
}

export const useJsonExportImport = ({ tableName, displayName, onImportComplete }: UseJsonExportImportProps) => {
  const { toast } = useToast();

  const handleExport = async () => {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*');

      if (error) throw error;

      // Create JSON file and download
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Successful",
        description: `Exported ${data?.length || 0} ${displayName} records`,
      });
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data)) {
        throw new Error('Invalid format: Expected an array of records');
      }

      let imported = 0;
      let updated = 0;
      let failed = 0;

      for (const record of data) {
        try {
          // Remove system fields
          const { id, created_at, updated_at, ...recordData } = record;

          // Check if record exists (different unique key per table)
          let uniqueField = 'id';
          let uniqueValue = id;

          if (tableName === 'known_venues') {
            uniqueField = 'name';
            uniqueValue = record.name;
          } else if (tableName === 'extraction_patterns') {
            // For patterns, check by pattern_type + pattern_regex
            const { data: existing } = await supabase
              .from(tableName)
              .select('id')
              .eq('pattern_type', record.pattern_type)
              .eq('pattern_regex', record.pattern_regex)
              .maybeSingle();

            if (existing) {
              await supabase
                .from(tableName)
                .update(recordData)
                .eq('id', existing.id);
              updated++;
              continue;
            } else {
              await supabase
                .from(tableName)
                .insert(recordData);
              imported++;
              continue;
            }
          } else if (tableName === 'geo_configuration') {
            const { data: existing } = await supabase
              .from(tableName)
              .select('id')
              .eq('config_type', record.config_type)
              .eq('config_key', record.config_key)
              .maybeSingle();

            if (existing) {
              await supabase
                .from(tableName)
                .update(recordData)
                .eq('id', existing.id);
              updated++;
              continue;
            } else {
              await supabase
                .from(tableName)
                .insert(recordData);
              imported++;
              continue;
            }
          } else if (tableName === 'instagram_accounts') {
            uniqueField = 'username';
            uniqueValue = record.username?.toLowerCase();
            recordData.username = recordData.username?.toLowerCase();
          }

          const { data: existing } = await supabase
            .from(tableName)
            .select('id')
            .eq(uniqueField, uniqueValue)
            .maybeSingle();

          if (existing) {
            await supabase
              .from(tableName)
              .update(recordData)
              .eq('id', existing.id);
            updated++;
          } else {
            await supabase
              .from(tableName)
              .insert(recordData);
            imported++;
          }
        } catch (err: any) {
          console.error(`Failed to import record:`, err);
          failed++;
        }
      }

      toast({
        title: "Import Complete",
        description: `Imported: ${imported}, Updated: ${updated}, Failed: ${failed}`,
      });

      onImportComplete?.();
    } catch (error: any) {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const triggerFileInput = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (file) {
        await handleImport(file);
      }
    };
    input.click();
  };

  const ExportButton = () => (
    <Button
      onClick={handleExport}
      variant="outline"
      size="sm"
    >
      <Download className="mr-2 h-4 w-4" />
      Export JSON
    </Button>
  );

  const ImportButton = () => (
    <Button
      onClick={triggerFileInput}
      variant="outline"
      size="sm"
    >
      <Upload className="mr-2 h-4 w-4" />
      Import JSON
    </Button>
  );

  const ViewJsonButton = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [jsonData, setJsonData] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const loadJson = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*');

        if (error) throw error;

        const jsonString = JSON.stringify(data, null, 2);
        setJsonData(jsonString);
      } catch (error: any) {
        toast({
          title: "Load Failed",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    const handleOpen = (open: boolean) => {
      setIsOpen(open);
      if (open) {
        loadJson();
      }
    };

    const copyToClipboard = () => {
      navigator.clipboard.writeText(jsonData);
      toast({
        title: "Copied",
        description: "JSON copied to clipboard",
      });
    };

    const saveJson = async () => {
      try {
        setIsSaving(true);
        const data = JSON.parse(jsonData);

        if (!Array.isArray(data)) {
          throw new Error('Invalid format: Expected an array of records');
        }

        let imported = 0;
        let updated = 0;
        let failed = 0;

        for (const record of data) {
          try {
            const { id, created_at, updated_at, ...recordData } = record;

            let uniqueField = 'id';
            let uniqueValue = id;

            if (tableName === 'known_venues') {
              uniqueField = 'name';
              uniqueValue = record.name;
            } else if (tableName === 'extraction_patterns') {
              const { data: existing } = await supabase
                .from(tableName)
                .select('id')
                .eq('pattern_type', record.pattern_type)
                .eq('pattern_regex', record.pattern_regex)
                .maybeSingle();

              if (existing) {
                await supabase
                  .from(tableName)
                  .update(recordData)
                  .eq('id', existing.id);
                updated++;
                continue;
              } else {
                await supabase
                  .from(tableName)
                  .insert(recordData);
                imported++;
                continue;
              }
            } else if (tableName === 'geo_configuration') {
              const { data: existing } = await supabase
                .from(tableName)
                .select('id')
                .eq('config_type', record.config_type)
                .eq('config_key', record.config_key)
                .maybeSingle();

              if (existing) {
                await supabase
                  .from(tableName)
                  .update(recordData)
                  .eq('id', existing.id);
                updated++;
                continue;
              } else {
                await supabase
                  .from(tableName)
                  .insert(recordData);
                imported++;
                continue;
              }
            } else if (tableName === 'instagram_accounts') {
              uniqueField = 'username';
              uniqueValue = record.username?.toLowerCase();
              recordData.username = recordData.username?.toLowerCase();
            }

            const { data: existing } = await supabase
              .from(tableName)
              .select('id')
              .eq(uniqueField, uniqueValue)
              .maybeSingle();

            if (existing) {
              await supabase
                .from(tableName)
                .update(recordData)
                .eq('id', existing.id);
              updated++;
            } else {
              await supabase
                .from(tableName)
                .insert(recordData);
              imported++;
            }
          } catch (err: any) {
            console.error(`Failed to import record:`, err);
            failed++;
          }
        }

        toast({
          title: "Save Complete",
          description: `Imported: ${imported}, Updated: ${updated}, Failed: ${failed}`,
        });

        onImportComplete?.();
        setIsOpen(false);
      } catch (error: any) {
        toast({
          title: "Save Failed",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <Dialog open={isOpen} onOpenChange={handleOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <FileJson className="mr-2 h-4 w-4" />
            View JSON
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Table JSON Data: {displayName}</DialogTitle>
            <DialogDescription>
              View, edit, and save JSON data. You can paste JSON from another table here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <>
                <Textarea
                  value={jsonData}
                  onChange={(e) => setJsonData(e.target.value)}
                  className="font-mono text-xs h-[50vh] resize-none"
                  placeholder="JSON data will appear here..."
                />
                <div className="flex justify-between gap-2">
                  <Button onClick={copyToClipboard} size="sm" variant="outline">
                    Copy to Clipboard
                  </Button>
                  <Button onClick={saveJson} size="sm" disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return {
    handleExport,
    handleImport,
    triggerFileInput,
    ExportButton,
    ImportButton,
    ViewJsonButton,
  };
};
