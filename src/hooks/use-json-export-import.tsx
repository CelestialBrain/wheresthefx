import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

// TODO: Admin JSON export/import needs dedicated Express API endpoints.
// Tables: known_venues, extraction_patterns, geo_configuration, instagram_accounts
// Currently returns empty data until admin endpoints are implemented.

export type TableName = 'known_venues' | 'extraction_patterns' | 'geo_configuration' | 'instagram_accounts';

interface UseJsonExportImportProps {
  tableName: TableName;
  displayName: string;
  onImportComplete?: () => void;
}

export const useJsonExportImport = ({ tableName, displayName, onImportComplete }: UseJsonExportImportProps) => {
  const { toast } = useToast();

  const handleExport = async () => {
    // TODO: needs admin API endpoint — GET /api/admin/{tableName}
    toast({
      title: "Export Not Available",
      description: `Admin export for ${displayName} requires a backend endpoint. See TODO in use-json-export-import.tsx.`,
      variant: "destructive",
    });
  };

  const handleImport = async (_file: File) => {
    // TODO: needs admin API endpoint — POST /api/admin/{tableName}/import
    toast({
      title: "Import Not Available",
      description: `Admin import for ${displayName} requires a backend endpoint. See TODO in use-json-export-import.tsx.`,
      variant: "destructive",
    });
    onImportComplete?.();
  };

  const triggerFileInput = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement)?.files?.[0];
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
    const [jsonData] = useState<string>("[]");

    const copyToClipboard = () => {
      navigator.clipboard.writeText(jsonData);
      toast({
        title: "Copied",
        description: "JSON copied to clipboard",
      });
    };

    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
              Admin API endpoint not yet implemented. Data unavailable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              TODO: needs admin API endpoint — GET /api/admin/{tableName}
            </p>
            <Textarea
              value={jsonData}
              readOnly
              className="font-mono text-xs h-[50vh] resize-none"
              placeholder="Data will appear here once admin endpoints are implemented..."
            />
            <div className="flex justify-between gap-2">
              <Button onClick={copyToClipboard} size="sm" variant="outline">
                Copy to Clipboard
              </Button>
            </div>
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
