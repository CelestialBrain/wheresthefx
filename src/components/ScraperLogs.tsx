import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Trash2, RefreshCw, ChevronDown, Bot, Loader2, AlertTriangle, CheckCircle, XCircle, Lightbulb } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
interface ScraperLog {
  id: string;
  created_at: string;
  run_id: string;
  post_id: string | null;
  instagram_post_id: string | null;
  log_level: string;
  stage: string;
  message: string;
  data: any;
  duration_ms: number | null;
  error_details: any;
}

interface DbStats {
  total: number;
  success: number;
  info: number;
  warnings: number;
  errors: number;
  debug: number;
}

interface AggregatedData {
  runId: string;
  runStartedAt: string;
  runCompletedAt: string | null;
  runStatus: string;
  totalPosts: number;
  totalLogs: number;
  metrics: {
    eventsDetected: number;
    notEvents: number;
    geocodeSuccess: number;
    geocodeFailures: number;
    historicalRejected: number;
    preFilterSkipped: number;
    imagesStored: number;
    imagesFailed: number;
  };
  categoryBreakdown: Record<string, number>;
  topVenueMatches: Array<{ venue: string; count: number }>;
  failedVenueMatches: Array<{ venue: string; count: number }>;
  rejectionReasons: Array<{ reason: string; count: number }>;
  validationWarnings: Array<{ warning: string; count: number }>;
}

interface AnalysisResult {
  overallQuality: 'excellent' | 'good' | 'fair' | 'poor';
  summary: string;
  keyMetrics: {
    eventDetectionRate: string;
    geocodingRate: string;
    dataQuality: string;
  };
  issues: Array<{
    severity: 'high' | 'medium' | 'low';
    issue: string;
    recommendation: string;
  }>;
  venuesToAdd: string[];
  accountsToReview: string[];
  positives: string[];
  actionItems: string[];
}
export const ScraperLogs = () => {
  const [logs, setLogs] = useState<ScraperLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<ScraperLog[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [runs, setRuns] = useState<Array<{ id: string; started_at: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [aggregatedData, setAggregatedData] = useState<AggregatedData | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(true);
  const [dbStats, setDbStats] = useState<DbStats>({ total: 0, success: 0, info: 0, warnings: 0, errors: 0, debug: 0 });
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
          setLogs(prev => [payload.new as ScraperLog, ...prev].slice(0, 1000));
          // Refresh stats on new log
          fetchDbStats(selectedRun === 'all' ? null : selectedRun);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch true stats when run selection changes
  useEffect(() => {
    fetchDbStats(selectedRun === 'all' ? null : selectedRun);
  }, [selectedRun]);

  useEffect(() => {
    applyFilters();
  }, [logs, selectedRun, selectedLevel, selectedStage]);

  // Fetch TRUE stats from database using COUNT aggregate (not limited to 1000)
  const fetchDbStats = async (runId: string | null) => {
    try {
      const buildCountQuery = (level?: string) => {
        let q = supabase.from('scraper_logs').select('*', { count: 'exact', head: true });
        if (runId) q = q.eq('run_id', runId);
        if (level) q = q.eq('log_level', level);
        return q;
      };

      const [total, success, info, warnings, errors, debug] = await Promise.all([
        buildCountQuery(),
        buildCountQuery('success'),
        buildCountQuery('info'),
        buildCountQuery('warn'),
        buildCountQuery('error'),
        buildCountQuery('debug'),
      ]);

      setDbStats({
        total: total.count || 0,
        success: success.count || 0,
        info: info.count || 0,
        warnings: warnings.count || 0,
        errors: errors.count || 0,
        debug: debug.count || 0,
      });
    } catch (err) {
      console.error('Error in fetchDbStats:', err);
    }
  };

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

  // Paginated fetch to get ALL logs for a run (bypasses 1000 limit)
  const fetchAllLogsForRun = async (runId: string | null, levelFilter?: string): Promise<ScraperLog[]> => {
    const allLogs: ScraperLog[] = [];
    let offset = 0;
    const batchSize = 1000;

    while (true) {
      let query = supabase
        .from('scraper_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + batchSize - 1);

      if (runId) {
        query = query.eq('run_id', runId);
      }

      if (levelFilter) {
        query = query.eq('log_level', levelFilter);
      }

      const { data, error } = await query;

      if (error) {
        toast({
          title: "Error fetching logs",
          description: error.message,
          variant: "destructive"
        });
        break;
      }

      if (!data || data.length === 0) break;

      allLogs.push(...data);
      offset += batchSize;

      // Progress toast for large fetches
      if (offset > batchSize) {
        toast({
          title: "Fetching logs...",
          description: `${allLogs.length} logs fetched`
        });
      }

      // If we got less than batchSize, we've reached the end
      if (data.length < batchSize) break;
    }

    return allLogs;
  };

  const exportLogs = async (format: 'json' | 'csv', levelFilter?: string) => {
    setIsExporting(true);

    try {
      const filterLabel = levelFilter ? ` (${levelFilter} only)` : '';
      toast({
        title: `Exporting${filterLabel}...`,
        description: "Fetching all logs from database"
      });

      // Fetch ALL logs with pagination
      const logsToExport = await fetchAllLogsForRun(
        selectedRun === 'all' ? null : selectedRun,
        levelFilter
      );

      if (logsToExport.length === 0) {
        toast({
          title: "No logs to export",
          description: "No logs match the current filters",
          variant: "destructive"
        });
        return;
      }

      const filename = `scraper-logs-${selectedRun !== 'all' ? selectedRun.substring(0, 8) : 'all'}${levelFilter ? `-${levelFilter}` : ''}-${new Date().toISOString().split('T')[0]}`;

      if (format === 'json') {
        const dataStr = JSON.stringify(logsToExport, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
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
        link.download = `${filename}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }

      toast({
        title: "Export complete",
        description: `Exported ${logsToExport.length.toLocaleString()} log entries as ${format.toUpperCase()}`,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const clearLogs = async () => {
    if (!confirm('Are you sure you want to clear all logs? This cannot be undone.')) {
      return;
    }

    const { error } = await supabase
      .from('scraper_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      toast({
        title: "Error clearing logs",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setLogs([]);
      setDbStats({ total: 0, success: 0, info: 0, warnings: 0, errors: 0, debug: 0 });
      toast({
        title: "Logs cleared",
        description: "All scraper logs have been deleted",
      });
    }
  };

  const analyzeRun = async () => {
    if (selectedRun === 'all') {
      toast({
        title: "Select a specific run",
        description: "Please select a specific run to analyze",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResult(null);
    setAggregatedData(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-scrape-run`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ runId: selectedRun }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Analysis failed');
      }

      const data = await response.json();
      setAnalysisResult(data.analysis);
      setAggregatedData(data.aggregated);
      setAnalysisOpen(true);

      toast({
        title: "Analysis complete",
        description: `Run quality: ${data.analysis.overallQuality}`,
      });
    } catch (error) {
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'bg-green-500/10 text-green-600 border-green-500/30';
      case 'good': return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
      case 'fair': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30';
      case 'poor': return 'bg-red-500/10 text-red-600 border-red-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'medium': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'low': return <CheckCircle className="h-4 w-4 text-green-500" />;
      default: return null;
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
      case 'pre_filter': return 'bg-amber-500/10 text-amber-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card className="frosted-glass border-border/50">
      <CardHeader className="p-4 md:p-6 border-b border-border/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl">Scraper Logs</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time logs showing scraper, OCR, and parser activity
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => { fetchLogs(); fetchDbStats(selectedRun === 'all' ? null : selectedRun); }} variant="outline" size="sm" className="frosted-glass-button">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={clearLogs} variant="outline" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-6">

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
                <SelectItem value="pre_filter">Pre-Filter</SelectItem>
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

            {/* Export Dropdown - JSON */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={isExporting}>
                  <Download className="h-4 w-4 mr-2" />
                  JSON
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportLogs('json')}>
                  All Logs ({dbStats.total.toLocaleString()})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => exportLogs('json', 'success')}>
                  Success Only ({dbStats.success.toLocaleString()})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportLogs('json', 'warn')}>
                  Warnings Only ({dbStats.warnings.toLocaleString()})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportLogs('json', 'error')}>
                  Errors Only ({dbStats.errors.toLocaleString()})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportLogs('json', 'info')}>
                  Info Only ({dbStats.info.toLocaleString()})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Export Dropdown - CSV */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={isExporting}>
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportLogs('csv')}>
                  All Logs ({dbStats.total.toLocaleString()})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => exportLogs('csv', 'success')}>
                  Success Only ({dbStats.success.toLocaleString()})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportLogs('csv', 'warn')}>
                  Warnings Only ({dbStats.warnings.toLocaleString()})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportLogs('csv', 'error')}>
                  Errors Only ({dbStats.errors.toLocaleString()})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportLogs('csv', 'info')}>
                  Info Only ({dbStats.info.toLocaleString()})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* AI Analyze Button */}
            <Button
              onClick={analyzeRun}
              variant="default"
              size="sm"
              disabled={isAnalyzing || selectedRun === 'all'}
              className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Bot className="h-4 w-4 mr-2" />
                  AI Analyze
                </>
              )}
            </Button>
          </div>

          {/* AI Analysis Results */}
          {analysisResult && (
            <Collapsible open={analysisOpen} onOpenChange={setAnalysisOpen}>
              <div className="rounded-lg border bg-gradient-to-br from-purple-500/5 to-indigo-500/5 p-4">
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Bot className="h-5 w-5 text-purple-500" />
                      <h3 className="font-semibold">AI Analysis</h3>
                      <Badge className={getQualityColor(analysisResult.overallQuality)} variant="outline">
                        {analysisResult.overallQuality.toUpperCase()}
                      </Badge>
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform ${analysisOpen ? 'rotate-180' : ''}`} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4 space-y-4">
                  {/* Summary */}
                  <p className="text-sm text-muted-foreground">{analysisResult.summary}</p>

                  {/* Raw Metrics Summary */}
                  {aggregatedData && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 rounded-lg bg-background/50 border">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-500">
                          {aggregatedData.metrics.eventsDetected}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Events / {aggregatedData.metrics.eventsDetected + aggregatedData.metrics.notEvents} posts
                        </div>
                        <div className="text-xs font-medium text-purple-500">
                          {aggregatedData.metrics.eventsDetected + aggregatedData.metrics.notEvents > 0
                            ? `${Math.round((aggregatedData.metrics.eventsDetected / (aggregatedData.metrics.eventsDetected + aggregatedData.metrics.notEvents)) * 100)}%`
                            : '0%'}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-emerald-500">
                          {aggregatedData.metrics.geocodeSuccess}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Geocoded / {aggregatedData.metrics.geocodeSuccess + aggregatedData.metrics.geocodeFailures}
                        </div>
                        <div className="text-xs font-medium text-emerald-500">
                          {aggregatedData.metrics.geocodeSuccess + aggregatedData.metrics.geocodeFailures > 0
                            ? `${Math.round((aggregatedData.metrics.geocodeSuccess / (aggregatedData.metrics.geocodeSuccess + aggregatedData.metrics.geocodeFailures)) * 100)}%`
                            : '0%'}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-pink-500">
                          {aggregatedData.metrics.imagesStored}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Images / {aggregatedData.metrics.imagesStored + aggregatedData.metrics.imagesFailed}
                        </div>
                        <div className="text-xs font-medium text-pink-500">
                          {aggregatedData.metrics.imagesStored + aggregatedData.metrics.imagesFailed > 0
                            ? `${Math.round((aggregatedData.metrics.imagesStored / (aggregatedData.metrics.imagesStored + aggregatedData.metrics.imagesFailed)) * 100)}%`
                            : '0%'}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-amber-500">
                          {aggregatedData.metrics.historicalRejected}
                        </div>
                        <div className="text-xs text-muted-foreground">Historical</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-500">
                          {aggregatedData.metrics.preFilterSkipped}
                        </div>
                        <div className="text-xs text-muted-foreground">Skipped</div>
                      </div>
                    </div>
                  )}

                  {/* Category Breakdown */}
                  {aggregatedData && Object.keys(aggregatedData.categoryBreakdown).length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">📂 Category Distribution</h4>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(aggregatedData.categoryBreakdown)
                          .sort(([, a], [, b]) => b - a)
                          .map(([category, count]) => (
                            <Badge key={category} variant="secondary" className="text-xs">
                              {category}: {count}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Top Venue Matches */}
                  {aggregatedData && aggregatedData.topVenueMatches.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 text-emerald-600">
                        ✅ Top Venue Matches ({aggregatedData.topVenueMatches.reduce((sum, v) => sum + v.count, 0)} total)
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {aggregatedData.topVenueMatches.slice(0, 12).map((v, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-emerald-500/10 border-emerald-500/30">
                            {v.venue} ({v.count}x)
                          </Badge>
                        ))}
                        {aggregatedData.topVenueMatches.length > 12 && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            +{aggregatedData.topVenueMatches.length - 12} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Failed Venues with Counts */}
                  {aggregatedData && aggregatedData.failedVenueMatches.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 text-amber-600">
                        ⚠️ Failed Venue Matches ({aggregatedData.failedVenueMatches.reduce((sum, v) => sum + v.count, 0)} lookups)
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {aggregatedData.failedVenueMatches.slice(0, 15).map((v, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-amber-500/10 border-amber-500/30">
                            {v.venue} ({v.count}x)
                          </Badge>
                        ))}
                        {aggregatedData.failedVenueMatches.length > 15 && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            +{aggregatedData.failedVenueMatches.length - 15} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Rejection Reasons */}
                  {aggregatedData && aggregatedData.rejectionReasons.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">🚫 Rejection Breakdown</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                        {aggregatedData.rejectionReasons.map((r, i) => (
                          <div key={i} className="flex justify-between text-xs p-1.5 rounded bg-background/50">
                            <span className="truncate">{r.reason}</span>
                            <span className="font-medium text-muted-foreground ml-2">{r.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Validation Warnings */}
                  {aggregatedData && aggregatedData.validationWarnings.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">⚠️ Validation Warnings</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                        {aggregatedData.validationWarnings.map((w, i) => (
                          <div key={i} className="flex justify-between text-xs p-1.5 rounded bg-yellow-500/10">
                            <span className="truncate">{w.warning}</span>
                            <span className="font-medium text-yellow-600 ml-2">{w.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Key Metrics Analysis */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-background/50 border">
                      <div className="text-xs text-muted-foreground mb-1">Event Detection</div>
                      <div className="text-sm">{analysisResult.keyMetrics.eventDetectionRate}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-background/50 border">
                      <div className="text-xs text-muted-foreground mb-1">Geocoding</div>
                      <div className="text-sm">{analysisResult.keyMetrics.geocodingRate}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-background/50 border">
                      <div className="text-xs text-muted-foreground mb-1">Data Quality</div>
                      <div className="text-sm">{analysisResult.keyMetrics.dataQuality}</div>
                    </div>
                  </div>

                  {/* Issues */}
                  {analysisResult.issues.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        Issues ({analysisResult.issues.length})
                      </h4>
                      <div className="space-y-2">
                        {analysisResult.issues.map((issue, i) => (
                          <div key={i} className="flex items-start gap-2 p-2 rounded bg-background/50 border">
                            {getSeverityIcon(issue.severity)}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{issue.issue}</div>
                              <div className="text-xs text-muted-foreground">{issue.recommendation}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Positives */}
                  {analysisResult.positives.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        What Worked Well
                      </h4>
                      <ul className="text-sm text-muted-foreground list-disc list-inside">
                        {analysisResult.positives.map((positive, i) => (
                          <li key={i}>{positive}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action Items */}
                  {analysisResult.actionItems.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Action Items</h4>
                      <ul className="text-sm space-y-1">
                        {analysisResult.actionItems.map((item, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="p-3 rounded-lg bg-muted">
              <div className="text-sm text-muted-foreground">Total Logs (DB)</div>
              <div className="text-2xl font-bold">{dbStats.total.toLocaleString()}</div>
              {filteredLogs.length < dbStats.total && (
                <div className="text-xs text-muted-foreground">Showing {filteredLogs.length}</div>
              )}
            </div>
            <div className="p-3 rounded-lg bg-green-500/10">
              <div className="text-sm text-green-600">Success</div>
              <div className="text-2xl font-bold text-green-600">
                {dbStats.success.toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-yellow-500/10">
              <div className="text-sm text-yellow-600">Warnings</div>
              <div className="text-2xl font-bold text-yellow-600">
                {dbStats.warnings.toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-red-500/10">
              <div className="text-sm text-red-600">Errors</div>
              <div className="text-2xl font-bold text-red-600">
                {dbStats.errors.toLocaleString()}
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
