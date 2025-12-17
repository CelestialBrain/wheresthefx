import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, Plus, MapPin, Globe, ChevronDown, Trash2, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useJsonExportImport } from "@/hooks/use-json-export-import";

interface GeoConfig {
  id: string;
  config_type: string;
  config_key: string;
  config_value: string | null;
  notes: string | null;
  is_active: boolean;
}

export function GeoConfigurationManager() {
  const { toast } = useToast();
  const [keywords, setKeywords] = useState<GeoConfig[]>([]);
  const [bounds, setBounds] = useState<GeoConfig[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isKeywordsOpen, setIsKeywordsOpen] = useState(true);
  const [isBoundsOpen, setIsBoundsOpen] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editedBounds, setEditedBounds] = useState<Record<string, string>>({});
  const [isSavingBounds, setIsSavingBounds] = useState(false);

  const fetchConfiguration = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("geo_configuration")
        .select("*")
        .order("config_key");

      if (error) throw error;

      const keywordConfigs = data?.filter(c => c.config_type === 'non_ncr_keyword') || [];
      const boundConfigs = data?.filter(c => c.config_type === 'ncr_bounds') || [];
      
      setKeywords(keywordConfigs);
      setBounds(boundConfigs);
      
      // Initialize edited bounds
      const boundsMap: Record<string, string> = {};
      boundConfigs.forEach(b => {
        boundsMap[b.config_key] = b.config_value || '';
      });
      setEditedBounds(boundsMap);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch geo configuration",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const { ExportButton, ViewJsonButton } = useJsonExportImport({
    tableName: 'geo_configuration',
    displayName: 'geo configuration',
    onImportComplete: fetchConfiguration
  });

  useEffect(() => {
    fetchConfiguration();
  }, []);

  const toggleKeyword = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("geo_configuration")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (error) throw error;

      setKeywords(prev => prev.map(k => 
        k.id === id ? { ...k, is_active: !currentStatus } : k
      ));

      toast({
        title: "Updated",
        description: `Keyword ${!currentStatus ? "enabled" : "disabled"}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update keyword",
        variant: "destructive",
      });
    }
  };

  const addKeyword = async () => {
    if (!newKeyword.trim()) return;

    try {
      const { error } = await supabase
        .from("geo_configuration")
        .insert({
          config_type: 'non_ncr_keyword',
          config_key: newKeyword.toLowerCase().trim(),
          notes: newNotes.trim() || null,
          is_active: true,
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: "Keyword exists",
            description: "This keyword is already configured",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      toast({
        title: "Added",
        description: `"${newKeyword}" added to non-NCR keywords`,
      });

      setNewKeyword("");
      setNewNotes("");
      setIsAddDialogOpen(false);
      fetchConfiguration();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to add keyword",
        variant: "destructive",
      });
    }
  };

  const deleteKeyword = async (id: string, keyword: string) => {
    if (!confirm(`Delete "${keyword}" from non-NCR keywords?`)) return;

    try {
      const { error } = await supabase
        .from("geo_configuration")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setKeywords(prev => prev.filter(k => k.id !== id));
      toast({
        title: "Deleted",
        description: `"${keyword}" removed`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete keyword",
        variant: "destructive",
      });
    }
  };

  const saveBounds = async () => {
    try {
      setIsSavingBounds(true);

      for (const bound of bounds) {
        const newValue = editedBounds[bound.config_key];
        if (newValue !== bound.config_value) {
          const { error } = await supabase
            .from("geo_configuration")
            .update({ config_value: newValue })
            .eq("id", bound.id);

          if (error) throw error;
        }
      }

      toast({
        title: "Saved",
        description: "NCR bounds updated",
      });

      fetchConfiguration();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to save bounds",
        variant: "destructive",
      });
    } finally {
      setIsSavingBounds(false);
    }
  };

  const filteredKeywords = keywords.filter(k =>
    k.config_key.includes(searchTerm.toLowerCase()) ||
    (k.notes?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const activeCount = keywords.filter(k => k.is_active).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Geo Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Geo Configuration
            </CardTitle>
            <CardDescription>
              Manage NCR boundaries and non-NCR location keywords for filtering
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <ExportButton />
            <ViewJsonButton />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* NCR Bounds Section */}
        <Collapsible open={isBoundsOpen} onOpenChange={setIsBoundsOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span className="font-medium">NCR Bounding Box</span>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${isBoundsOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid grid-cols-2 gap-3">
              {['minLat', 'maxLat', 'minLng', 'maxLng'].map(key => {
                const bound = bounds.find(b => b.config_key === key);
                return (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {key === 'minLat' && 'Min Latitude (South)'}
                      {key === 'maxLat' && 'Max Latitude (North)'}
                      {key === 'minLng' && 'Min Longitude (West)'}
                      {key === 'maxLng' && 'Max Longitude (East)'}
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editedBounds[key] || ''}
                      onChange={(e) => setEditedBounds(prev => ({ ...prev, [key]: e.target.value }))}
                      className="h-8 text-sm"
                    />
                    {bound?.notes && (
                      <p className="text-xs text-muted-foreground">{bound.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <Button 
              onClick={saveBounds} 
              disabled={isSavingBounds}
              size="sm" 
              className="mt-3"
            >
              <Save className="h-3 w-3 mr-1" />
              {isSavingBounds ? "Saving..." : "Save Bounds"}
            </Button>
          </CollapsibleContent>
        </Collapsible>

        {/* Non-NCR Keywords Section */}
        <Collapsible open={isKeywordsOpen} onOpenChange={setIsKeywordsOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              <span className="font-medium">Non-NCR Keywords</span>
              <Badge variant="secondary" className="ml-2">{activeCount} active</Badge>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${isKeywordsOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3">
            {/* Search and Add */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search keywords..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-9">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Non-NCR Keyword</DialogTitle>
                    <DialogDescription>
                      Add a keyword that indicates a location outside Metro Manila
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-4">
                    <div>
                      <Label>Keyword</Label>
                      <Input
                        placeholder="e.g., subic, baguio, cebu"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Notes (optional)</Label>
                      <Input
                        placeholder="e.g., Zambales province"
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={addKeyword} disabled={!newKeyword.trim()}>
                      Add Keyword
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Keywords List */}
            <div className="max-h-[300px] overflow-y-auto space-y-1 border rounded-lg p-2">
              {filteredKeywords.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {searchTerm ? "No keywords match your search" : "No keywords configured"}
                </p>
              ) : (
                filteredKeywords.map(keyword => (
                  <div 
                    key={keyword.id}
                    className={`flex items-center justify-between p-2 rounded-md hover:bg-muted/50 ${
                      !keyword.is_active ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm truncate">{keyword.config_key}</span>
                        {keyword.notes && (
                          <span className="text-xs text-muted-foreground truncate">
                            ({keyword.notes})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <Switch
                        checked={keyword.is_active}
                        onCheckedChange={() => toggleKeyword(keyword.id, keyword.is_active)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteKeyword(keyword.id, keyword.config_key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}