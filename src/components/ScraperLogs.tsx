import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Trash2, Filter, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface ScraperLog {
  id: string;
  created_at: string;
  run_id: string;
  post_id: string | null;
  instagram_post_id: string | null;
  log_level: string; // Changed from union type to string to match DB
  stage: string;
  message: string;
  data: any;
  duration_ms: number | null;
  error_details: any;
}

export const ScraperLogs = () => {
  const [logs, setLogs] = useState<ScraperLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<ScraperLog[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [runs, setRuns] = useState<Array<{ id: string; started_at: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchLogs();
    fetchRuns();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('scraper-logs-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scraper_logs'
        },
        (payload) => {
          setLogs(prev => [payload.new as ScraperLog, ...prev].slice(0, 1000)); // Keep last 1000
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    applyFilters();
  }, [logs, selectedRun, selectedLevel, selectedStage]);

  const fetchLogs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('scraper_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      toast({
        title: "Error fetching logs",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setLogs(data || []);
    }
    setIsLoading(false);
  };

  const fetchRuns = async () => {
    const { data } = await supabase
      .from('scrape_runs')
      .select('id, started_at')
      .order('started_at', { ascending: false })
      .limit(20);

    setRuns(data || []);
  };

  const applyFilters = () => {
    let filtered = [...logs];

    if (selectedRun !== 'all') {
      filtered = filtered.filter(log => log.run_id === selectedRun);
    }

    if (selectedLevel !== 'all') {
      filtered = filtered.filter(log => log.log_level === selectedLevel);
    }

    if (selectedStage !== 'all') {
      filtered = filtered.filter(log => log.stage === selectedStage);
    }

    setFilteredLogs(filtered);
  };

  const exportLogsAsJSON = async () => {
    // If a specific run is selected, fetch ALL logs for that run from DB
    let logsToExport = filteredLogs;
    
    if (selectedRun !== 'all') {
      toast({ title: "Fetching all logs for run...", description: "This may take a moment" });
      
      const { data, error } = await supabase
        .from('scraper_logs')
        .select('*')
        .eq('run_id', selectedRun)
        .order('created_at', { ascending: false });
      
      if (error) {
        toast({ title: "Error fetching logs", description: error.message, variant: "destructive" });
        return;
      }
      logsToExport = data || [];
    }
    
    const dataStr = JSON.stringify(logsToExport, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scraper-logs-${selectedRun !== 'all' ? selectedRun : 'all'}-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Logs exported",
      description: `Exported ${logsToExport.length} log entries as JSON`,
    });
  };

  const exportLogsAsCSV = async () => {
    // If a specific run is selected, fetch ALL logs for that run from DB
    let logsToExport = filteredLogs;
    
    if (selectedRun !== 'all') {
      toast({ title: "Fetching all logs for run...", description: "This may take a moment" });
      
      const { data, error } = await supabase
        .from('scraper_logs')
        .select('*')
        .eq('run_id', selectedRun)
        .order('created_at', { ascending: false });
      
      if (error) {
        toast({ title: "Error fetching logs", description: error.message, variant: "destructive" });
        return;
      }
      logsToExport = data || [];
    }
    
    const headers = ['Timestamp', 'Stage', 'Level', 'Message', 'Post ID', 'Duration (ms)', 'Data'];
    const rows = logsToExport.map(log => [
      new Date(log.created_at).toLocaleString(),
      log.stage,
      log.log_level,
      log.message,
      log.post_id || '',
      log.duration_ms || '',
      JSON.stringify(log.data || {})
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const dataBlob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scraper-logs-${selectedRun !== 'all' ? selectedRun : 'all'}-${new Date().toISOString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Logs exported",
      description: `Exported ${logsToExport.length} log entries as CSV`,
    });
  };

  const clearLogs = async () => {
    if (!confirm('Are you sure you want to clear all logs? This cannot be undone.')) {
      return;
    }

    const { error } = await supabase
      .from('scraper_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (error) {
      toast({
        title: "Error clearing logs",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setLogs([]);
      toast({
        title: "Logs cleared",
        description: "All scraper logs have been deleted",
      });
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'success': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'info': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'warn': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'error': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'debug': return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'fetch': return 'bg-purple-500/10 text-purple-500';
      case 'ocr': return 'bg-indigo-500/10 text-indigo-500';
      case 'parse': return 'bg-cyan-500/10 text-cyan-500';
      case 'extraction': return 'bg-teal-500/10 text-teal-500';
      case 'validation': return 'bg-orange-500/10 text-orange-500';
      case 'save': return 'bg-green-500/10 text-green-500';
      case 'skip': return 'bg-gray-500/10 text-gray-500';
      case 'image': return 'bg-pink-500/10 text-pink-500';
      case 'geocache': return 'bg-emerald-500/10 text-emerald-500';
      case 'rejection': return 'bg-red-500/10 text-red-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Scraper Logs</CardTitle>
            <CardDescription>
              Real-time logs showing scraper, OCR, and parser activity
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchLogs} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={clearLogs} variant="outline" size="sm">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Select value={selectedRun} onValueChange={setSelectedRun}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by run" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Runs</SelectItem>
                {runs.map(run => (
                  <SelectItem key={run.id} value={run.id}>
                    {new Date(run.started_at).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedLevel} onValueChange={setSelectedLevel}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="debug">Debug</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedStage} onValueChange={setSelectedStage}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="fetch">Fetch</SelectItem>
                <SelectItem value="ocr">OCR</SelectItem>
                <SelectItem value="parse">Parse</SelectItem>
                <SelectItem value="extraction">Extraction</SelectItem>
                <SelectItem value="validation">Validation</SelectItem>
                <SelectItem value="save">Save</SelectItem>
                <SelectItem value="skip">Skip</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="geocache">Geocache</SelectItem>
                <SelectItem value="rejection">Rejection</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1" />

            <Button onClick={exportLogsAsJSON} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              JSON
            </Button>
            <Button onClick={exportLogsAsCSV} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="p-3 rounded-lg bg-muted">
              <div className="text-sm text-muted-foreground">Total Logs</div>
              <div className="text-2xl font-bold">{filteredLogs.length}</div>
            </div>
            <div className="p-3 rounded-lg bg-green-500/10">
              <div className="text-sm text-green-600">Success</div>
              <div className="text-2xl font-bold text-green-600">
                {filteredLogs.filter(l => l.log_level === 'success').length}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-yellow-500/10">
              <div className="text-sm text-yellow-600">Warnings</div>
              <div className="text-2xl font-bold text-yellow-600">
                {filteredLogs.filter(l => l.log_level === 'warn').length}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-red-500/10">
              <div className="text-sm text-red-600">Errors</div>
              <div className="text-2xl font-bold text-red-600">
                {filteredLogs.filter(l => l.log_level === 'error').length}
              </div>
            </div>
          </div>

          {/* Logs Display */}
          <ScrollArea className="h-[600px] w-full rounded-md border">
            <div className="p-4 space-y-2">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading logs...</div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No logs found</div>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 space-y-1">
                        <Badge className={getLevelColor(log.log_level)} variant="outline">
                          {log.log_level}
                        </Badge>
                        <Badge className={getStageColor(log.stage)} variant="outline">
                          {log.stage}
                        </Badge>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                          {log.post_id && <span>• Post: {log.post_id.substring(0, 8)}</span>}
                          {log.duration_ms && <span>• {log.duration_ms}ms</span>}
                        </div>
                        <div className="text-sm font-medium mb-1">{log.message}</div>
                        {log.data && (
                          <details className="text-xs mt-2">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                              View data
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                              {JSON.stringify(log.data, null, 2)}
                            </pre>
                          </details>
                        )}
                        {log.error_details && (
                          <div className="mt-2 p-2 bg-red-500/10 rounded text-xs text-red-600">
                            <strong>Error:</strong>
                            <pre className="mt-1 overflow-x-auto">
                              {JSON.stringify(log.error_details, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
};
