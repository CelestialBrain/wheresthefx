import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  return {
    handleExport,
    handleImport,
    triggerFileInput,
    ExportButton,
    ImportButton,
  };
};
