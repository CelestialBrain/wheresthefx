import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isLoggedIn } from "@/api/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Instagram,
  ClipboardList,
  MapPin,
  FolderKanban,
  Eye,
  TrendingUp,
  Database,
} from "lucide-react";
import { ConsolidatedReviewQueue } from "@/components/admin/ConsolidatedReviewQueue";
import { PublishedEventsManager } from "@/components/admin/PublishedEventsManager";
import { LocationTemplatesManager } from "@/components/admin/LocationTemplatesManager";
import { PatternManager } from "@/components/admin/PatternManager";
import { ScraperLogs } from "@/components/admin/ScraperLogs";
import { KnownVenuesManager } from "@/components/admin/KnownVenuesManager";
import { LocationCorrectionsViewer } from "@/components/admin/LocationCorrectionsViewer";
import { AccountVenueStatsViewer } from "@/components/admin/AccountVenueStatsViewer";
import { UnmatchedVenuesViewer } from "@/components/admin/UnmatchedVenuesViewer";
import { GeoConfigurationManager } from "@/components/admin/GeoConfigurationManager";
import { InstagramHandlesViewer } from "@/components/admin/InstagramHandlesViewer";

const AdminPlaceholder = ({ title }: { title: string }) => (
  <div className="rounded-lg border border-border bg-card p-6 text-center space-y-2">
    <h3 className="font-semibold text-lg">{title}</h3>
    <p className="text-muted-foreground text-sm">Admin endpoint not yet implemented</p>
  </div>
);

const Admin = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn()) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to access the admin dashboard",
        variant: "destructive",
      });
      navigate("/auth", { replace: true });
    }
  }, [toast, navigate]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8 selection:bg-accent/30">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/50 pb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              Admin Dashboard
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage events, scraping, and platform knowledge.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="px-3 py-1 bg-accent/5 border-accent/20 text-accent"
            >
              <span className="w-2 h-2 rounded-full bg-accent mr-2 animate-pulse" />
              Live System
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="scraping">
          <TabsList className="flex w-full overflow-x-auto scrollbar-hide bg-muted/30 p-1 rounded-xl border border-border/50 backdrop-blur-sm sticky top-4 z-50">
            <TabsTrigger
              value="scraping"
              className="flex-1 items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-accent transition-all py-2.5"
            >
              <Instagram className="w-4 h-4" />
              <span className="hidden md:inline text-sm font-medium">Scraping</span>
            </TabsTrigger>
            <TabsTrigger
              value="review"
              className="flex-1 items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-accent transition-all py-2.5"
            >
              <ClipboardList className="w-4 h-4" />
              <span className="hidden md:inline text-sm font-medium text-nowrap">Review</span>
            </TabsTrigger>
            <TabsTrigger
              value="published"
              className="flex-1 items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-accent transition-all py-2.5"
            >
              <FolderKanban className="w-4 h-4" />
              <span className="hidden md:inline text-sm font-medium text-nowrap">Events</span>
            </TabsTrigger>
            <TabsTrigger
              value="patterns"
              className="flex-1 items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-accent transition-all py-2.5"
            >
              <TrendingUp className="w-4 h-4" />
              <span className="hidden md:inline text-sm font-medium text-nowrap">Patterns</span>
            </TabsTrigger>
            <TabsTrigger
              value="templates"
              className="flex-1 items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-accent transition-all py-2.5"
            >
              <MapPin className="w-4 h-4" />
              <span className="hidden md:inline text-sm font-medium text-nowrap">Loc</span>
            </TabsTrigger>
            <TabsTrigger
              value="knowledge"
              className="flex-1 items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-accent transition-all py-2.5"
            >
              <Database className="w-4 h-4" />
              <span className="hidden md:inline text-sm font-medium text-nowrap">Data</span>
            </TabsTrigger>
            <TabsTrigger
              value="logs"
              className="flex-1 items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-accent transition-all py-2.5"
            >
              <Eye className="w-4 h-4" />
              <span className="hidden md:inline text-sm font-medium text-nowrap">Logs</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scraping" className="space-y-6 mt-6 animate-in fade-in duration-500">
            <AdminPlaceholder title="Scraping Dashboard" />
            <InstagramHandlesViewer />
            <AccountVenueStatsViewer />
          </TabsContent>

          <TabsContent value="review" className="mt-6">
            <ConsolidatedReviewQueue />
          </TabsContent>

          <TabsContent value="published" className="mt-6">
            <PublishedEventsManager />
          </TabsContent>

          <TabsContent value="patterns" className="mt-6">
            <PatternManager />
          </TabsContent>

          <TabsContent value="templates" className="mt-6">
            <LocationTemplatesManager />
          </TabsContent>

          <TabsContent value="knowledge" className="space-y-6 mt-6">
            <KnownVenuesManager />
            <UnmatchedVenuesViewer />
            <LocationCorrectionsViewer />
            <GeoConfigurationManager />
          </TabsContent>

          <TabsContent value="logs" className="mt-6">
            <ScraperLogs />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
