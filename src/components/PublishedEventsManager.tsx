import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge as UIBadge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LocationCorrectionEditor } from "./LocationCorrectionEditor";
import { PriceDisplay } from "./PriceDisplay";
import { RecurringEventBadge } from "./RecurringEventBadge";
import { EventDatesDisplay } from "./EventDatesDisplay";
import { Search, MapPin, Calendar, Clock, Edit2, Undo2, ExternalLink, Image as ImageIcon, Trash2, Save, X, Repeat } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatDateRange, formatTimeRange } from "@/utils/dateUtils";
import { CATEGORY_LABELS } from "@/constants/categoryColors";

// Status options
const EVENT_STATUS_OPTIONS = [
  { value: 'confirmed', label: 'Confirmed', color: 'bg-green-500/20 text-green-700' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-500/20 text-red-700' },
  { value: 'rescheduled', label: 'Rescheduled', color: 'bg-yellow-500/20 text-yellow-700' },
  { value: 'postponed', label: 'Postponed', color: 'bg-orange-500/20 text-orange-700' },
];

const AVAILABILITY_STATUS_OPTIONS = [
  { value: 'available', label: 'Available', color: 'bg-green-500/20 text-green-700' },
  { value: 'sold_out', label: 'Sold Out', color: 'bg-red-500/20 text-red-700' },
  { value: 'few_left', label: 'Few Left', color: 'bg-orange-500/20 text-orange-700' },
  { value: 'waitlist', label: 'Waitlist', color: 'bg-blue-500/20 text-blue-700' },
];

interface PublishedEvent {
  id: string;
  event_title: string;
  event_date: string;
  event_time: string | null;
  event_end_date: string | null;
  end_time: string | null;
  description: string | null;
  signup_url: string | null;
  is_free: boolean;
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  price_notes: string | null;
  category: string | null;
  event_status: string | null;
  availability_status: string | null;
  is_recurring: boolean | null;
  recurrence_pattern: string | null;
  location_name: string;
  location_address: string | null;
  location_lat: number;
  location_lng: number;
  source_post_id: string | null;
  instagram_account_username: string | null;
  image_url: string | null;
  stored_image_url: string | null;
  created_at: string;
  updated_at: string;
}

interface EditFormData {
  event_title: string;
  event_date: string;
  event_time: string;
  end_time: string;
  description: string;
  signup_url: string;
  is_free: boolean;
  price_min: string;
  price_max: string;
  price_notes: string;
  category: string;
  event_status: string;
  availability_status: string;
  is_recurring: boolean;
  recurrence_pattern: string;
}

export const PublishedEventsManager = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<PublishedEvent | null>(null);
  const [editingLocation, setEditingLocation] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [editForm, setEditForm] = useState<EditFormData | null>(null);
  const [undoStack, setUndoStack] = useState<Array<{ eventId: string; field: string; oldValue: any; newValue: any }>>([]);

  const queryClient = useQueryClient();

  // Helper function to check if event is in the past
  const isPastEvent = (eventDate: string) => {
    return new Date(eventDate) < new Date(new Date().setHours(0, 0, 0, 0));
  };

  // Initialize edit form from selected event
  const initEditForm = (event: PublishedEvent) => {
    setEditForm({
      event_title: event.event_title || '',
      event_date: event.event_date || '',
      event_time: event.event_time || '',
      end_time: event.end_time || '',
      description: event.description || '',
      signup_url: event.signup_url || '',
      is_free: event.is_free ?? true,
      price_min: event.price_min?.toString() || '',
      price_max: event.price_max?.toString() || '',
      price_notes: event.price_notes || '',
      category: event.category || 'other',
      event_status: event.event_status || 'confirmed',
      availability_status: event.availability_status || 'available',
      is_recurring: event.is_recurring ?? false,
      recurrence_pattern: event.recurrence_pattern || '',
    });
    setEditingDetails(true);
  };

  // Fetch published events
  const { data: events, isLoading } = useQuery({
    queryKey: ["published-events", searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("published_events")
        .select("*")
        .order("event_date", { ascending: false });

      if (searchQuery.trim()) {
        query = query.or(`event_title.ilike.%${searchQuery}%,location_name.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data as PublishedEvent[];
    },
  });

  // Fetch edit history for selected event
  const { data: editHistory } = useQuery({
    queryKey: ["edit-history", selectedEvent?.id],
    queryFn: async () => {
      if (!selectedEvent) return [];

      const { data, error } = await supabase
        .from("event_edit_history")
        .select("*")
        .eq("event_id", selectedEvent.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    },
    enabled: !!selectedEvent,
  });

  // Update event mutation
  const updateEventMutation = useMutation({
    mutationFn: async ({
      eventId,
      updates,
      oldValues
    }: {
      eventId: string;
      updates: any;
      oldValues: any;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Update published event
      const { error } = await supabase
        .from("published_events")
        .update(updates)
        .eq("id", eventId);

      if (error) throw error;

      // Log history for each changed field
      const historyEntries = Object.entries(updates)
        .filter(([field]) => oldValues[field] !== updates[field])
        .map(([field, newValue]) => ({
          event_id: eventId,
          edited_by: user?.id,
          field_name: field,
          old_value: oldValues[field] as any,
          new_value: newValue as any,
          action_type: "update",
        }));

      if (historyEntries.length > 0) {
        const { error: historyError } = await supabase
          .from("event_edit_history")
          .insert(historyEntries);

        if (historyError) console.error("Failed to log history:", historyError);
      }

      return { eventId, updates, oldValues };
    },
    onSuccess: ({ eventId, updates, oldValues }) => {
      // Add to undo stack
      setUndoStack((prev) => [
        { eventId, field: Object.keys(updates).join(","), oldValue: oldValues, newValue: updates },
        ...prev.slice(0, 9),
      ]);

      toast.success("Event updated successfully");
      setEditingDetails(false);
      setEditForm(null);
      queryClient.invalidateQueries({ queryKey: ["published-events"] });
      queryClient.invalidateQueries({ queryKey: ["edit-history", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event-markers"] });
    },
  });

  // Undo mutation
  const undoMutation = useMutation({
    mutationFn: async (undoItem: { eventId: string; oldValue: any }) => {
      const { error } = await supabase
        .from("published_events")
        .update(undoItem.oldValue)
        .eq("id", undoItem.eventId);

      if (error) throw error;
    },
    onSuccess: () => {
      setUndoStack((prev) => prev.slice(1));
      toast.success("Change undone");
      queryClient.invalidateQueries({ queryKey: ["published-events"] });
    },
  });

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: event } = await supabase
        .from("published_events")
        .select("*")
        .eq("id", eventId)
        .single();

      const { error } = await supabase
        .from("published_events")
        .delete()
        .eq("id", eventId);

      if (error) throw error;

      if (event) {
        await supabase.from("event_edit_history").insert({
          event_id: eventId,
          edited_by: user?.id,
          field_name: "event",
          old_value: event,
          new_value: null,
          action_type: "delete",
        });
      }
    },
    onSuccess: () => {
      toast.success("Event deleted");
      setSelectedEvent(null);
      queryClient.invalidateQueries({ queryKey: ["published-events"] });
      queryClient.invalidateQueries({ queryKey: ["event-markers"] });
    },
    onError: (error: any) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  const handleSaveDetails = () => {
    if (!selectedEvent || !editForm) return;

    const updates: Record<string, any> = {
      event_title: editForm.event_title,
      event_date: editForm.event_date,
      event_time: editForm.event_time || null,
      end_time: editForm.end_time || null,
      description: editForm.description || null,
      signup_url: editForm.signup_url || null,
      is_free: editForm.is_free,
      price_min: editForm.price_min ? parseFloat(editForm.price_min) : null,
      price_max: editForm.price_max ? parseFloat(editForm.price_max) : null,
      price_notes: editForm.price_notes || null,
      category: editForm.category,
      event_status: editForm.event_status,
      availability_status: editForm.availability_status,
      is_recurring: editForm.is_recurring,
      recurrence_pattern: editForm.is_recurring ? editForm.recurrence_pattern || null : null,
    };

    const oldValues: Record<string, any> = {
      event_title: selectedEvent.event_title,
      event_date: selectedEvent.event_date,
      event_time: selectedEvent.event_time,
      end_time: selectedEvent.end_time,
      description: selectedEvent.description,
      signup_url: selectedEvent.signup_url,
      is_free: selectedEvent.is_free,
      price_min: selectedEvent.price_min,
      price_max: selectedEvent.price_max,
      price_notes: selectedEvent.price_notes,
      category: selectedEvent.category,
      event_status: selectedEvent.event_status,
      availability_status: selectedEvent.availability_status,
      is_recurring: selectedEvent.is_recurring,
      recurrence_pattern: selectedEvent.recurrence_pattern,
    };

    updateEventMutation.mutate({ eventId: selectedEvent.id, updates, oldValues });
  };

  const handleDeleteClick = () => {
    if (!selectedEvent) return;

    const eventId = selectedEvent.id;
    const eventTitle = selectedEvent.event_title;
    let timeoutId: NodeJS.Timeout;

    toast.success(`Deleting "${eventTitle}"`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timeoutId);
          toast.info("Deletion cancelled");
        },
      },
    });

    timeoutId = setTimeout(() => {
      deleteEventMutation.mutate(eventId);
    }, 5000);
  };

  const handleUndo = () => {
    if (undoStack.length > 0) {
      undoMutation.mutate(undoStack[0]);
    }
  };

  const getStatusBadge = (status: string | null, options: typeof EVENT_STATUS_OPTIONS) => {
    const option = options.find(o => o.value === status) || options[0];
    return <UIBadge className={`${option.color} text-xs`}>{option.label}</UIBadge>;
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
            <CardTitle className="text-xl">Published Events</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {events?.length || 0} events • Manage your published events
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="w-full md:w-auto frosted-glass"
          >
            <Undo2 className="w-4 h-4 mr-2" />
            Undo Last Change
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-6">
        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by title or venue..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-background/50"
          />
        </div>

        {/* Events Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events?.map((event) => (
            <Card
              key={event.id}
              className={`cursor-pointer frosted-glass border-border/50 hover:border-accent/50 hover:shadow-lg transition-all duration-300 ${event.event_status === 'cancelled' ? 'opacity-60' : ''}`}
              onClick={() => setSelectedEvent(event)}
            >
              <CardHeader className="p-4 pb-3">
                <div className="flex items-start gap-3">
                  {(event.stored_image_url || event.image_url) && (
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 group">
                      <img
                        src={event.stored_image_url || event.image_url || ''}
                        alt=""
                        className={`w-full h-full object-cover transition-transform group-hover:scale-110 ${event.event_status === 'cancelled' ? 'grayscale' : ''}`}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className={`text-sm md:text-base truncate ${event.event_status === 'cancelled' ? 'line-through' : ''}`}>
                        {event.event_title}
                      </CardTitle>
                      {isPastEvent(event.event_date) && (
                        <UIBadge variant="secondary" className="text-[10px] h-5 shrink-0">Done</UIBadge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDateRange(event.event_date, event.event_end_date)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{formatTimeRange(event.event_time, event.end_time) || 'TBA'}</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3">
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-1">{event.location_name || "No location"}</span>
                </div>

                {/* Price Display */}
                <PriceDisplay
                  isFree={event.is_free}
                  priceMin={event.price_min}
                  priceMax={event.price_max}
                  priceNotes={event.price_notes}
                  size="sm"
                />

                {/* Badges Row */}
                <div className="flex flex-wrap gap-1">
                  {event.category && (
                    <UIBadge variant="outline" className="text-[10px] h-5">
                      {CATEGORY_LABELS[event.category] || event.category}
                    </UIBadge>
                  )}
                  <RecurringEventBadge
                    isRecurring={event.is_recurring}
                    pattern={event.recurrence_pattern}
                    size="sm"
                  />
                  {event.event_status && event.event_status !== 'confirmed' &&
                    getStatusBadge(event.event_status, EVENT_STATUS_OPTIONS)
                  }
                  {event.availability_status && event.availability_status !== 'available' &&
                    getStatusBadge(event.availability_status, AVAILABILITY_STATUS_OPTIONS)
                  }
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {(!events || events.length === 0) && (
          <div className="frosted-glass border border-border/50 rounded-xl p-12 text-center mt-6">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Calendar className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">No published events</h3>
            <p className="text-muted-foreground mt-1 max-w-sm mx-auto">
              {searchQuery ? "No events match your search." : "Events you publish will appear here."}
            </p>
          </div>
        )}
      </CardContent>

      {/* Event Detail Modal */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => {
        if (!open) {
          setSelectedEvent(null);
          setEditingDetails(false);
          setEditForm(null);
          setEditingLocation(false);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
          {selectedEvent && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className={selectedEvent.event_status === 'cancelled' ? 'line-through' : ''}>
                    {selectedEvent.event_title}
                  </DialogTitle>
                  {!editingDetails && (
                    <Button variant="outline" size="sm" onClick={() => initEditForm(selectedEvent)}>
                      <Edit2 className="w-4 h-4 mr-2" />
                      Edit Details
                    </Button>
                  )}
                </div>
              </DialogHeader>

              <div className="space-y-6">
                {/* Instagram Post Info */}
                {selectedEvent.source_post_id && (
                  <div className="space-y-2">
                    <h3 className="font-medium flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      Source Post
                    </h3>
                    <div className="flex gap-4">
                      {(selectedEvent.stored_image_url || selectedEvent.image_url) && (
                        <img
                          src={selectedEvent.stored_image_url || selectedEvent.image_url || ''}
                          alt="Post"
                          className="w-32 h-32 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 space-y-1 text-sm">
                        {selectedEvent.instagram_account_username && (
                          <p><strong>Account:</strong> @{selectedEvent.instagram_account_username}</p>
                        )}
                        <p><strong>Post ID:</strong> {selectedEvent.source_post_id}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Event Details - Edit Mode */}
                {editingDetails && editForm ? (
                  <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">Edit Event Details</h3>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setEditingDetails(false); setEditForm(null); }}>
                          <X className="w-4 h-4 mr-1" /> Cancel
                        </Button>
                        <Button size="sm" onClick={handleSaveDetails} disabled={updateEventMutation.isPending}>
                          <Save className="w-4 h-4 mr-1" /> Save
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Title */}
                      <div className="col-span-2">
                        <Label>Event Title</Label>
                        <Input
                          value={editForm.event_title}
                          onChange={(e) => setEditForm({ ...editForm, event_title: e.target.value })}
                        />
                      </div>

                      {/* Date & Time */}
                      <div>
                        <Label>Event Date</Label>
                        <Input
                          type="date"
                          value={editForm.event_date}
                          onChange={(e) => setEditForm({ ...editForm, event_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Event Time</Label>
                        <Input
                          type="time"
                          value={editForm.event_time}
                          onChange={(e) => setEditForm({ ...editForm, event_time: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>End Time (optional)</Label>
                        <Input
                          type="time"
                          value={editForm.end_time}
                          onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                        />
                      </div>

                      {/* Category */}
                      <div>
                        <Label>Category</Label>
                        <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Event Status */}
                      <div>
                        <Label>Event Status</Label>
                        <Select value={editForm.event_status} onValueChange={(v) => setEditForm({ ...editForm, event_status: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EVENT_STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Availability Status */}
                      <div>
                        <Label>Availability</Label>
                        <Select value={editForm.availability_status} onValueChange={(v) => setEditForm({ ...editForm, availability_status: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABILITY_STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Free Toggle */}
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={editForm.is_free}
                          onCheckedChange={(checked) => setEditForm({ ...editForm, is_free: checked })}
                        />
                        <Label>Free Event</Label>
                      </div>

                      {/* Price Fields - only if not free */}
                      {!editForm.is_free && (
                        <>
                          <div>
                            <Label>Min Price (₱)</Label>
                            <Input
                              type="number"
                              value={editForm.price_min}
                              onChange={(e) => setEditForm({ ...editForm, price_min: e.target.value })}
                              placeholder="e.g., 300"
                            />
                          </div>
                          <div>
                            <Label>Max Price (₱)</Label>
                            <Input
                              type="number"
                              value={editForm.price_max}
                              onChange={(e) => setEditForm({ ...editForm, price_max: e.target.value })}
                              placeholder="e.g., 500"
                            />
                          </div>
                          <div className="col-span-2">
                            <Label>Price Notes</Label>
                            <Input
                              value={editForm.price_notes}
                              onChange={(e) => setEditForm({ ...editForm, price_notes: e.target.value })}
                              placeholder="e.g., VIP ₱1000, Early bird ₱200"
                            />
                          </div>
                        </>
                      )}

                      {/* Recurring Event */}
                      <div className="col-span-2 flex items-center gap-3">
                        <Switch
                          checked={editForm.is_recurring}
                          onCheckedChange={(checked) => setEditForm({ ...editForm, is_recurring: checked })}
                        />
                        <Repeat className="w-4 h-4 text-muted-foreground" />
                        <Label>Recurring Event</Label>
                      </div>

                      {editForm.is_recurring && (
                        <div className="col-span-2">
                          <Label>Recurrence Pattern</Label>
                          <Input
                            value={editForm.recurrence_pattern}
                            onChange={(e) => setEditForm({ ...editForm, recurrence_pattern: e.target.value })}
                            placeholder="e.g., weekly:friday, monthly:first-saturday"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Format: weekly:day, monthly:first-day, biweekly:day
                          </p>
                        </div>
                      )}

                      {/* Signup URL */}
                      <div className="col-span-2">
                        <Label>Signup URL</Label>
                        <Input
                          value={editForm.signup_url}
                          onChange={(e) => setEditForm({ ...editForm, signup_url: e.target.value })}
                          placeholder="https://..."
                        />
                      </div>

                      {/* Description */}
                      <div className="col-span-2">
                        <Label>Description</Label>
                        <Textarea
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Event Details - View Mode */
                  <div className="space-y-3">
                    <h3 className="font-medium">Event Details</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><strong>Date:</strong> {formatDateRange(selectedEvent.event_date, selectedEvent.event_end_date)}</div>
                      <div><strong>Time:</strong> {formatTimeRange(selectedEvent.event_time, selectedEvent.end_time) || 'TBA'}</div>
                      <div><strong>Category:</strong> {CATEGORY_LABELS[selectedEvent.category || ''] || selectedEvent.category || 'Other'}</div>
                      <div className="flex items-center gap-2">
                        <strong>Status:</strong>
                        {getStatusBadge(selectedEvent.event_status, EVENT_STATUS_OPTIONS)}
                      </div>
                      <div className="flex items-center gap-2">
                        <strong>Availability:</strong>
                        {getStatusBadge(selectedEvent.availability_status, AVAILABILITY_STATUS_OPTIONS)}
                      </div>
                      <div className="flex items-center gap-2">
                        <strong>Price:</strong>
                        <PriceDisplay
                          isFree={selectedEvent.is_free}
                          priceMin={selectedEvent.price_min}
                          priceMax={selectedEvent.price_max}
                          priceNotes={selectedEvent.price_notes}
                          size="sm"
                        />
                      </div>
                      {selectedEvent.is_recurring && (
                        <div className="col-span-2 flex items-center gap-2">
                          <strong>Recurring:</strong>
                          <RecurringEventBadge
                            isRecurring={selectedEvent.is_recurring}
                            pattern={selectedEvent.recurrence_pattern}
                          />
                        </div>
                      )}
                      {selectedEvent.signup_url && (
                        <div className="col-span-2">
                          <strong>Signup:</strong>{" "}
                          <a href={selectedEvent.signup_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                            Link <ExternalLink className="w-3 h-3 inline" />
                          </a>
                        </div>
                      )}
                    </div>
                    {selectedEvent.description && (
                      <div>
                        <strong className="text-sm">Description:</strong>
                        <p className="text-sm text-muted-foreground mt-1">{selectedEvent.description}</p>
                      </div>
                    )}

                    {/* Multi-day Event Dates */}
                    {selectedEvent.source_post_id && (
                      <EventDatesDisplay
                        eventId={selectedEvent.source_post_id}
                        primaryDate={selectedEvent.event_date}
                        primaryEndDate={selectedEvent.event_end_date}
                        primaryTime={selectedEvent.event_time}
                        primaryEndTime={selectedEvent.end_time}
                        primaryVenue={selectedEvent.location_name}
                      />
                    )}
                  </div>
                )}

                {/* Location */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Location
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingLocation(!editingLocation)}
                    >
                      <Edit2 className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  </div>

                  {!editingLocation && (
                    <div className="bg-muted/50 rounded-md p-3 space-y-1 text-sm">
                      <div><strong>Venue:</strong> {selectedEvent.location_name}</div>
                      <div><strong>Address:</strong> {selectedEvent.location_address || "N/A"}</div>
                      <div><strong>Coordinates:</strong> {selectedEvent.location_lat}, {selectedEvent.location_lng}</div>
                    </div>
                  )}

                  {editingLocation && (
                    <LocationCorrectionEditor
                      eventId={selectedEvent.id}
                      locationId={selectedEvent.id}
                      originalOCR={{
                        venue: selectedEvent.location_name,
                        address: selectedEvent.location_address || "",
                      }}
                      currentLocation={{
                        location_name: selectedEvent.location_name,
                        formatted_address: selectedEvent.location_address,
                        location_lat: selectedEvent.location_lat,
                        location_lng: selectedEvent.location_lng,
                      }}
                      onSave={async (correction) => {
                        const { data: { user } } = await supabase.auth.getUser();

                        const oldValues = {
                          location_name: selectedEvent.location_name,
                          location_address: selectedEvent.location_address,
                          location_lat: selectedEvent.location_lat,
                          location_lng: selectedEvent.location_lng,
                        };

                        const updates = {
                          location_name: correction.venueName,
                          location_address: correction.streetAddress,
                          location_lat: correction.lat,
                          location_lng: correction.lng,
                        };

                        updateEventMutation.mutate({
                          eventId: selectedEvent.id,
                          updates,
                          oldValues,
                        });

                        // Save to location_corrections for learning
                        await supabase.from("location_corrections").insert({
                          corrected_venue_name: correction.venueName,
                          corrected_street_address: correction.streetAddress,
                          manual_lat: correction.lat,
                          manual_lng: correction.lng,
                          corrected_by: user?.id,
                          applied_to_event_id: selectedEvent.id,
                        });

                        setEditingLocation(false);
                      }}
                      onCancel={() => setEditingLocation(false)}
                    />
                  )}
                </div>

                {/* Edit History */}
                {editHistory && editHistory.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-medium">Edit History</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {editHistory.map((entry) => (
                        <div key={entry.id} className="text-xs bg-muted/50 rounded p-2">
                          <div className="font-medium">{entry.field_name} - {entry.action_type}</div>
                          <div className="text-muted-foreground">
                            {format(new Date(entry.created_at), "PPp")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Dialog Footer with Delete Button */}
              <DialogFooter className="gap-2">
                <Button
                  variant="destructive"
                  onClick={handleDeleteClick}
                  disabled={deleteEventMutation.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deleteEventMutation.isPending ? "Deleting..." : "Delete Event"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card >
  );
};
