import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MapPin, Plus, Trash2, Edit2, Save } from "lucide-react";
import { toast } from "sonner";

interface LocationTemplate {
  id: string;
  template_name: string;
  venue_name: string;
  street_address: string | null;
  lat: number;
  lng: number;
  usage_count: number;
  notes: string | null;
  created_at: string;
}

export const LocationTemplatesManager = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    template_name: "",
    venue_name: "",
    street_address: "",
    lat: "",
    lng: "",
    notes: "",
  });

  const queryClient = useQueryClient();

  // Fetch templates
  const { data: templates, isLoading } = useQuery({
    queryKey: ["location-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("location_templates")
        .select("*")
        .order("usage_count", { ascending: false });

      if (error) throw error;
      return data as LocationTemplate[];
    },
  });

  // Create template
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("location_templates")
        .insert({
          ...data,
          created_by: user?.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template created");
      queryClient.invalidateQueries({ queryKey: ["location-templates"] });
      resetForm();
      setIsCreating(false);
    },
  });

  // Update template
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase
        .from("location_templates")
        .update(data)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template updated");
      queryClient.invalidateQueries({ queryKey: ["location-templates"] });
      setEditingId(null);
      resetForm();
    },
  });

  // Delete template
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("location_templates")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template deleted");
      queryClient.invalidateQueries({ queryKey: ["location-templates"] });
    },
  });

  const resetForm = () => {
    setFormData({
      template_name: "",
      venue_name: "",
      street_address: "",
      lat: "",
      lng: "",
      notes: "",
    });
  };

  const handleSubmit = () => {
    if (!formData.template_name || !formData.venue_name || !formData.lat || !formData.lng) {
      toast.error("Please fill in required fields");
      return;
    }

    const data = {
      template_name: formData.template_name,
      venue_name: formData.venue_name,
      street_address: formData.street_address || null,
      lat: parseFloat(formData.lat),
      lng: parseFloat(formData.lng),
      notes: formData.notes || null,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const startEdit = (template: LocationTemplate) => {
    setEditingId(template.id);
    setFormData({
      template_name: template.template_name,
      venue_name: template.venue_name,
      street_address: template.street_address || "",
      lat: template.lat.toString(),
      lng: template.lng.toString(),
      notes: template.notes || "",
    });
    setIsCreating(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }

  return (
    <Card className="frosted-glass border-border/50">
      <CardHeader className="p-4 md:p-6 border-b border-border/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl">Location Templates</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Save frequently used locations for quick event creation
            </p>
          </div>
          <Dialog open={isCreating} onOpenChange={(open) => {
            setIsCreating(open);
            if (!open) {
              setEditingId(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button className="w-full md:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent className="p-4 md:p-6 max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-base md:text-lg">{editingId ? "Edit" : "Create"} Location Template</DialogTitle>
              </DialogHeader>

              <div className="space-y-3 md:space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Template Name *</Label>
                  <Input
                    id="template-name"
                    value={formData.template_name}
                    onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
                    placeholder="e.g., Living Room Makati"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="venue">Venue Name *</Label>
                  <Input
                    id="venue"
                    value={formData.venue_name}
                    onChange={(e) => setFormData({ ...formData, venue_name: e.target.value })}
                    placeholder="e.g., Living Room"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Street Address</Label>
                  <Input
                    id="address"
                    value={formData.street_address}
                    onChange={(e) => setFormData({ ...formData, street_address: e.target.value })}
                    placeholder="Full address"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="lat" className="text-sm">Latitude *</Label>
                    <Input
                      id="lat"
                      type="number"
                      step="any"
                      value={formData.lat}
                      onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                      placeholder="14.123456"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lng" className="text-sm">Longitude *</Label>
                    <Input
                      id="lng"
                      type="number"
                      step="any"
                      value={formData.lng}
                      onChange={(e) => setFormData({ ...formData, lng: e.target.value })}
                      placeholder="121.123456"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Floor number, entrance instructions, etc."
                    rows={3}
                  />
                </div>

                <div className="flex flex-col md:flex-row gap-2">
                  <Button onClick={handleSubmit} className="flex-1">
                    <Save className="w-4 h-4 mr-2" />
                    {editingId ? "Update" : "Create"} Template
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsCreating(false);
                      setEditingId(null);
                      resetForm();
                    }}
                    className="w-full md:w-auto"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-6">
        {/* Templates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates?.map((template) => (
            <Card key={template.id} className="frosted-glass border-border/50 hover:border-accent/30 transition-colors">
              <CardHeader className="p-4 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm md:text-base truncate">{template.template_name}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        Used {template.usage_count}x
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 md:h-8 md:w-8"
                      onClick={() => startEdit(template)}
                    >
                      <Edit2 className="w-3 h-3 md:w-4 md:h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 md:h-8 md:w-8 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("Delete this template?")) {
                          deleteMutation.mutate(template.id);
                        }
                      }}
                    >
                      <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0 space-y-2 text-xs md:text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{template.venue_name}</div>
                    {template.street_address && (
                      <div className="text-muted-foreground text-xs line-clamp-2">
                        {template.street_address}
                      </div>
                    )}
                    <div className="text-muted-foreground text-xs mt-1">
                      {template.lat.toFixed(6)}, {template.lng.toFixed(6)}
                    </div>
                  </div>
                </div>
                {template.notes && (
                  <p className="text-xs text-muted-foreground line-clamp-2 italic">
                    {template.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {templates?.length === 0 && (
          <div className="frosted-glass border border-border/50 rounded-xl p-12 text-center mt-6">
            <MapPin className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-lg font-medium">No templates yet</p>
            <p className="text-muted-foreground text-sm">Create your first location template</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};