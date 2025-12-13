import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, DollarSign, ExternalLink, Eye, CalendarDays, Repeat } from "lucide-react";
import { LocationCorrectionEditor } from "./LocationCorrectionEditor";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageWithSkeleton } from "./ImageWithSkeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EventScheduleEditor, ScheduleDay } from "./EventScheduleEditor";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_LABELS } from "@/constants/categoryColors";
import { VenueSelector } from "./VenueSelector";
import { KnownVenue } from "@/hooks/useKnownVenues";
// Helper component to compare extracted vs current values
const CompareValue = ({ extracted, current }: { extracted: any; current: any }) => {
  const extractedStr = extracted?.toString() || '(null)';
  const currentStr = current?.toString() || '(null)';
  const matches = extractedStr === currentStr || 
    (extracted === null && current === null) ||
    (extracted === undefined && current === undefined);
  
  return (
    <span className={`font-mono ${matches ? 'text-green-600' : 'text-amber-600'}`}>
      {extractedStr}
      {!matches && (
        <span className="ml-1 text-muted-foreground">
          → {currentStr}
        </span>
      )}
    </span>
  );
};

// Event status options
const EVENT_STATUS_OPTIONS = [
  { value: 'confirmed', label: '✅ Confirmed' },
  { value: 'cancelled', label: '❌ Cancelled' },
  { value: 'rescheduled', label: '📅 Rescheduled' },
  { value: 'postponed', label: '⏸️ Postponed' },
];

// Availability status options
const AVAILABILITY_STATUS_OPTIONS = [
  { value: 'available', label: '🟢 Available' },
  { value: 'sold_out', label: '🔴 Sold Out' },
  { value: 'few_left', label: '🟠 Few Left' },
  { value: 'waitlist', label: '📋 Waitlist' },
];

interface PostWithEventEditorProps {
  post: {
    id: string;
    post_id: string;
    image_url: string | null;
    stored_image_url?: string | null;
    caption: string | null;
    event_title: string | null;
    event_date: string | null;
    event_time: string | null;
    event_end_date: string | null;
    end_time: string | null;
    location_name: string | null;
    location_address: string | null;
    location_lat: number | null;
    location_lng: number | null;
    signup_url: string | null;
    ocr_confidence: number | null;
    ocr_text?: string | null;
    ai_extraction?: any;
    ai_confidence?: number | null;
    ai_reasoning?: string | null;
    extraction_method?: string | null;
    instagram_account: { username: string } | null;
    // Price fields
    is_free?: boolean;
    price?: number | null;
    price_min?: number | null;
    price_max?: number | null;
    price_notes?: string | null;
    // Category and status fields
    category?: string | null;
    event_status?: string | null;
    availability_status?: string | null;
    is_recurring?: boolean | null;
    recurrence_pattern?: string | null;
  };
  onCreateEvent: (eventData: any) => void;
  onCancel: () => void;
}

export const PostWithEventEditor = ({ post, onCreateEvent, onCancel }: PostWithEventEditorProps) => {
  // Store original values for correction tracking
  const originalValues = {
    event_title: post.event_title || "",
    event_date: post.event_date || "",
    event_time: post.event_time || "",
    location_name: post.location_name || "",
    signup_url: post.signup_url || "",
    price: post.price ?? null,
    is_free: post.is_free ?? true,
    price_min: post.price_min ?? null,
    price_max: post.price_max ?? null,
    price_notes: post.price_notes ?? "",
    category: post.category ?? "other",
    event_status: post.event_status ?? "confirmed",
    availability_status: post.availability_status ?? "available",
    is_recurring: post.is_recurring ?? false,
    recurrence_pattern: post.recurrence_pattern ?? "",
  };

  const [eventData, setEventData] = useState({
    event_title: post.event_title || "",
    event_date: post.event_date || "",
    event_time: post.event_time || "",
    event_end_date: post.event_end_date || "",
    end_time: post.end_time || "",
    description: post.caption || "",
    signup_url: post.signup_url || "",
    is_free: post.is_free ?? true,
    price: post.price ?? null,
    price_min: post.price_min ?? null,
    price_max: post.price_max ?? null,
    price_notes: post.price_notes ?? "",
    // New fields
    category: post.category ?? "other",
    event_status: post.event_status ?? "confirmed",
    availability_status: post.availability_status ?? "available",
    is_recurring: post.is_recurring ?? false,
    recurrence_pattern: post.recurrence_pattern ?? "",
  });

  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showLocationEditor, setShowLocationEditor] = useState(false);
  const [locationCorrection, setLocationCorrection] = useState<{
    venueName: string;
    streetAddress: string;
    lat: number | null;
    lng: number | null;
  } | null>(null);

  // Multi-day schedule mode
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [scheduleData, setScheduleData] = useState<ScheduleDay[]>([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);

  // Auto-detect multi-day from AI extraction OR load from database
  useEffect(() => {
    const loadExistingSchedule = async () => {
      if (!post.id) return;
      
      setIsLoadingSchedule(true);
      try {
        // Check if there are existing event_dates for this post
        const { data: existingDates, error } = await supabase
          .from('event_dates')
          .select('*')
          .eq('instagram_post_id', post.id)
          .order('event_date', { ascending: true });
        
        if (error) {
          console.error('Failed to load event dates:', error);
          return;
        }
        
        if (existingDates && existingDates.length > 0) {
          // Convert database records to ScheduleDay format
          const grouped: Record<string, ScheduleDay> = {};
          const primaryVenue = post.location_name;
          
          for (const record of existingDates) {
            const dateKey = record.event_date;
            if (!grouped[dateKey]) {
              // Only set venue at day level if it differs from primary event venue
              const isDifferentVenue = record.venue_name && record.venue_name !== primaryVenue;
              grouped[dateKey] = {
                date: dateKey,
                timeSlots: [],
                venueName: isDifferentVenue ? record.venue_name : undefined,
                venueAddress: isDifferentVenue ? record.venue_address : undefined,
              };
            }
            grouped[dateKey].timeSlots.push({
              time: record.event_time || '',
              endTime: (record as any).end_time || '', // Include end_time from DB
              label: '',
            });
          }
          
          const loadedSchedule = Object.values(grouped);
          if (loadedSchedule.length > 0) {
            setIsMultiDay(true);
            setScheduleData(loadedSchedule);
            return;
          }
        }
        
        // Fallback: auto-detect from AI extraction if no DB records
        if (post.event_end_date && post.event_date && post.event_end_date !== post.event_date) {
          setIsMultiDay(true);
          
          // Generate ALL dates between start and end (inclusive)
          const { generateDateRange } = await import('@/utils/dateUtils');
          const allDates = generateDateRange(post.event_date, post.event_end_date);
          
          // ALL days get the SAME start time and end time from the primary event
          const initialSchedule: ScheduleDay[] = allDates.map((dateStr) => ({
            date: dateStr,
            timeSlots: [{ 
              time: post.event_time || "",      // Start time for ALL days
              endTime: post.end_time || "",     // End time for ALL days
              label: "" 
            }]
          }));
          
          setScheduleData(initialSchedule);
        }
      } finally {
        setIsLoadingSchedule(false);
      }
    };
    
    loadExistingSchedule();
  }, [post.id]);

  const handleLocationSave = (correction: any) => {
    setLocationCorrection(correction);
    setShowLocationEditor(false);
  };

  // Log all field corrections for pattern learning
  const logCorrections = async (finalLocation: { venueName: string }) => {
    const corrections: Array<{
      post_id: string;
      field_name: string;
      original_extracted_value: string;
      corrected_value: string;
      extraction_method: string;
      original_ocr_text: string | null;
    }> = [];

    // Track all field changes
    if (originalValues.event_title !== eventData.event_title && eventData.event_title) {
      corrections.push({
        post_id: post.id,
        field_name: "event_title",
        original_extracted_value: originalValues.event_title,
        corrected_value: eventData.event_title,
        extraction_method: "manual",
        original_ocr_text: post.caption,
      });
    }
    if (originalValues.event_date !== eventData.event_date && eventData.event_date) {
      corrections.push({
        post_id: post.id,
        field_name: "event_date",
        original_extracted_value: originalValues.event_date,
        corrected_value: eventData.event_date,
        extraction_method: "manual",
        original_ocr_text: post.caption,
      });
    }
    if (originalValues.event_time !== eventData.event_time && eventData.event_time) {
      corrections.push({
        post_id: post.id,
        field_name: "event_time",
        original_extracted_value: originalValues.event_time,
        corrected_value: eventData.event_time,
        extraction_method: "manual",
        original_ocr_text: post.caption,
      });
    }
    if (originalValues.location_name !== finalLocation.venueName && finalLocation.venueName) {
      corrections.push({
        post_id: post.id,
        field_name: "location_name",
        original_extracted_value: originalValues.location_name,
        corrected_value: finalLocation.venueName,
        extraction_method: "manual",
        original_ocr_text: post.caption,
      });
    }
    if (originalValues.signup_url !== eventData.signup_url && eventData.signup_url) {
      corrections.push({
        post_id: post.id,
        field_name: "signup_url",
        original_extracted_value: originalValues.signup_url,
        corrected_value: eventData.signup_url,
        extraction_method: "manual",
        original_ocr_text: post.caption,
      });
    }
    // Price field corrections
    if (!eventData.is_free && eventData.price !== null && eventData.price !== originalValues.price) {
      corrections.push({
        post_id: post.id,
        field_name: "price",
        original_extracted_value: String(originalValues.price || ""),
        corrected_value: String(eventData.price),
        extraction_method: "manual",
        original_ocr_text: post.caption,
      });
    }
    if (!eventData.is_free && eventData.price_min !== null && eventData.price_min !== originalValues.price_min) {
      corrections.push({
        post_id: post.id,
        field_name: "price_min",
        original_extracted_value: String(originalValues.price_min || ""),
        corrected_value: String(eventData.price_min),
        extraction_method: "manual",
        original_ocr_text: post.caption,
      });
    }
    if (!eventData.is_free && eventData.price_max !== null && eventData.price_max !== originalValues.price_max) {
      corrections.push({
        post_id: post.id,
        field_name: "price_max",
        original_extracted_value: String(originalValues.price_max || ""),
        corrected_value: String(eventData.price_max),
        extraction_method: "manual",
        original_ocr_text: post.caption,
      });
    }
    if (!eventData.is_free && eventData.price_notes && eventData.price_notes !== originalValues.price_notes) {
      corrections.push({
        post_id: post.id,
        field_name: "price_notes",
        original_extracted_value: originalValues.price_notes,
        corrected_value: eventData.price_notes,
        extraction_method: "manual",
        original_ocr_text: post.caption,
      });
    }
    // Category and status corrections
    if (eventData.category !== originalValues.category) {
      corrections.push({
        post_id: post.id,
        field_name: "category",
        original_extracted_value: originalValues.category,
        corrected_value: eventData.category,
        extraction_method: "manual",
        original_ocr_text: post.caption,
      });
    }
    if (eventData.event_status !== originalValues.event_status) {
      corrections.push({
        post_id: post.id,
        field_name: "event_status",
        original_extracted_value: originalValues.event_status,
        corrected_value: eventData.event_status,
        extraction_method: "manual",
        original_ocr_text: post.caption,
      });
    }
    if (eventData.availability_status !== originalValues.availability_status) {
      corrections.push({
        post_id: post.id,
        field_name: "availability_status",
        original_extracted_value: originalValues.availability_status,
        corrected_value: eventData.availability_status,
        extraction_method: "manual",
        original_ocr_text: post.caption,
      });
    }
    if (eventData.is_recurring !== originalValues.is_recurring) {
      corrections.push({
        post_id: post.id,
        field_name: "is_recurring",
        original_extracted_value: String(originalValues.is_recurring),
        corrected_value: String(eventData.is_recurring),
        extraction_method: "manual",
        original_ocr_text: post.caption,
      });
    }
    if (eventData.recurrence_pattern !== originalValues.recurrence_pattern && eventData.recurrence_pattern) {
      corrections.push({
        post_id: post.id,
        field_name: "recurrence_pattern",
        original_extracted_value: originalValues.recurrence_pattern,
        corrected_value: eventData.recurrence_pattern,
        extraction_method: "manual",
        original_ocr_text: post.caption,
      });
    }

    if (corrections.length > 0) {
      const { error } = await supabase.from("extraction_corrections").insert(corrections);
      if (error) console.error("Failed to log corrections:", error);
      else console.log(`Logged ${corrections.length} corrections for pattern learning`);
    }
  };

  const handleCreateEvent = async () => {
    if (isPublishing) return;
    
    setIsPublishing(true);
    const location = locationCorrection || {
      venueName: post.location_name || "",
      streetAddress: post.location_address || "",
      lat: post.location_lat,
      lng: post.location_lng,
    };

    try {
      // Log all field corrections for pattern learning
      await logCorrections(location);

      // Determine dates based on mode
      const primaryDate = isMultiDay && scheduleData.length > 0 
        ? scheduleData[0].date 
        : eventData.event_date;
      const primaryTime = isMultiDay && scheduleData.length > 0 && scheduleData[0].timeSlots.length > 0
        ? scheduleData[0].timeSlots[0].time
        : eventData.event_time;
      const endDate = isMultiDay && scheduleData.length > 1
        ? scheduleData[scheduleData.length - 1].date
        : eventData.event_end_date;

      // Update post with all event data
      const { error: updateError } = await supabase
        .from("instagram_posts")
        .update({
          event_title: eventData.event_title,
          event_date: primaryDate,
          event_time: primaryTime || null,
          event_end_date: endDate || null,
          end_time: eventData.end_time || null,
          location_name: location.venueName,
          location_address: location.streetAddress,
          location_lat: location.lat,
          location_lng: location.lng,
          signup_url: eventData.signup_url || null,
          is_free: eventData.is_free,
          price: eventData.is_free ? null : (eventData.price_min || eventData.price),
          price_min: eventData.is_free ? null : eventData.price_min,
          price_max: eventData.is_free ? null : eventData.price_max,
          price_notes: eventData.is_free ? null : (eventData.price_notes || null),
          category: eventData.category,
          event_status: eventData.event_status,
          availability_status: eventData.availability_status,
          is_recurring: eventData.is_recurring,
          recurrence_pattern: eventData.is_recurring ? eventData.recurrence_pattern : null,
          is_event: true,
          needs_review: false,
          ocr_confidence: 1.0,
        })
        .eq("id", post.id);

      if (updateError) throw updateError;

      // Save multi-day schedule to event_dates table
      if (isMultiDay && scheduleData.length > 0) {
        // First delete any existing event_dates for this post
        await supabase.from("event_dates").delete().eq("instagram_post_id", post.id);
        
        // Insert all schedule entries with start AND end times
        const eventDatesInserts = scheduleData.flatMap(day => 
          day.timeSlots.map(slot => ({
            instagram_post_id: post.id,
            event_date: day.date,
            event_time: slot.time || null,
            end_time: slot.endTime || null,  // Save end time per slot
            venue_name: day.venueName || location.venueName,
            venue_address: day.venueAddress || location.streetAddress,
          }))
        );

        if (eventDatesInserts.length > 0) {
          const { error: datesError } = await supabase
            .from("event_dates")
            .insert(eventDatesInserts);
          
          if (datesError) {
            console.error("Failed to save event dates:", datesError);
            // Don't block publish, just log
          }
        }
      }

      // Now publish to published_events table
      console.log('[Publish] Calling publish-event edge function for post:', post.id);
      const { data: publishData, error: publishError } = await supabase.functions.invoke("publish-event", {
        body: { postId: post.id }
      });

      if (publishError) {
        console.error('[Publish] Edge function error:', publishError);
        // Revert needs_review back to true since publish failed
        await supabase.from("instagram_posts").update({ needs_review: true }).eq("id", post.id);
        throw publishError;
      }

      console.log('[Publish] Success:', publishData);
      toast.success("Event published successfully!");
      onCreateEvent(post.id);
    } catch (error: any) {
      console.error('[Publish] Error:', error);
      toast.error(`Failed to publish: ${error.message}`);
      setIsPublishing(false);
    }
  };

  const handleSaveDraft = async () => {
    if (isSaving) return;
    setIsSaving(true);
    const location = locationCorrection || {
      venueName: post.location_name || "",
      streetAddress: post.location_address || "",
      lat: post.location_lat,
      lng: post.location_lng,
    };

    // Determine dates based on mode
    const primaryDate = isMultiDay && scheduleData.length > 0 
      ? scheduleData[0].date 
      : eventData.event_date;
    const primaryTime = isMultiDay && scheduleData.length > 0 && scheduleData[0].timeSlots.length > 0
      ? scheduleData[0].timeSlots[0].time
      : eventData.event_time;
    const endDate = isMultiDay && scheduleData.length > 1
      ? scheduleData[scheduleData.length - 1].date
      : eventData.event_end_date;

    try {
      const { error } = await supabase
        .from("instagram_posts")
        .update({
          event_title: eventData.event_title,
          event_date: primaryDate,
          event_time: primaryTime || null,
          event_end_date: endDate || null,
          end_time: eventData.end_time || null,
          location_name: location.venueName,
          location_address: location.streetAddress,
          location_lat: location.lat,
          location_lng: location.lng,
          signup_url: eventData.signup_url || null,
          is_free: eventData.is_free,
          price: eventData.is_free ? null : (eventData.price_min || eventData.price),
          price_min: eventData.is_free ? null : eventData.price_min,
          price_max: eventData.is_free ? null : eventData.price_max,
          price_notes: eventData.is_free ? null : (eventData.price_notes || null),
          category: eventData.category,
          event_status: eventData.event_status,
          availability_status: eventData.availability_status,
          is_recurring: eventData.is_recurring,
          recurrence_pattern: eventData.is_recurring ? eventData.recurrence_pattern : null,
          // Keep review flag until Publish
          needs_review: true,
          is_event: true,
        })
        .eq("id", post.id);

      if (error) throw error;

      // Save multi-day schedule to event_dates table
      if (isMultiDay && scheduleData.length > 0) {
        await supabase.from("event_dates").delete().eq("instagram_post_id", post.id);
        
        const eventDatesInserts = scheduleData.flatMap(day => 
          day.timeSlots.map(slot => ({
            instagram_post_id: post.id,
            event_date: day.date,
            event_time: slot.time || null,
            venue_name: day.venueName || location.venueName,
            venue_address: day.venueAddress || location.streetAddress,
          }))
        );

        if (eventDatesInserts.length > 0) {
          await supabase.from("event_dates").insert(eventDatesInserts);
        }
      }

      toast.success("Saved changes");
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const hasValidDate = isMultiDay 
    ? scheduleData.length > 0 && scheduleData.some(d => d.date)
    : !!eventData.event_date;

  const isValid = 
    eventData.event_title.trim() &&
    hasValidDate &&
    (locationCorrection || (post.location_lat && post.location_lng));

  return (
    <Card className="border-accent/20">
      <CardHeader>
        <div className="flex gap-4">
          {(post.stored_image_url || post.image_url) && (
            <ImageWithSkeleton
              src={post.stored_image_url || post.image_url}
              alt="Post"
              className="w-32 h-32 rounded-md"
            />
          )}
          <div className="flex-1 space-y-2">
            <CardTitle className="text-lg">Draft Event from Post</CardTitle>
            <CardDescription>
              @{post.instagram_account?.username || "unknown"} · Post ID: {post.post_id}
            </CardDescription>
            {post.ocr_confidence && (
              <Badge variant="outline">
                OCR Confidence: {(post.ocr_confidence * 100).toFixed(0)}%
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Source Comparison View - OCR vs Caption vs Extracted */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Source Comparison (Debug)
              </span>
              <Badge variant="secondary" className="text-xs">
                {post.extraction_method || 'unknown'}
              </Badge>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            {/* OCR Text */}
            {post.ocr_text && (
              <div className="rounded-md border p-3 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs">📷 OCR Text</Badge>
                  {post.ocr_confidence && (
                    <span className="text-xs text-muted-foreground">
                      {(post.ocr_confidence * 100).toFixed(0)}% confidence
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {post.ocr_text}
                </p>
              </div>
            )}
            
            {/* Caption */}
            <div className="rounded-md border p-3 bg-muted/30">
              <Badge variant="outline" className="text-xs mb-2">📝 Caption</Badge>
              <p className="text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                {post.caption || '(No caption)'}
              </p>
            </div>
            
            {/* AI Extraction Results */}
            {post.ai_extraction && (
              <div className="rounded-md border p-3 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs">🤖 AI Extracted</Badge>
                  {post.ai_confidence && (
                    <span className={`text-xs ${post.ai_confidence >= 0.8 ? 'text-green-600' : post.ai_confidence >= 0.6 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {(post.ai_confidence * 100).toFixed(0)}% confidence
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Date:</span>
                    <CompareValue 
                      extracted={post.ai_extraction?.eventDate} 
                      current={eventData.event_date}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Time:</span>
                    <CompareValue 
                      extracted={post.ai_extraction?.eventTime} 
                      current={eventData.event_time}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Venue:</span>
                    <CompareValue 
                      extracted={post.ai_extraction?.locationName} 
                      current={post.location_name}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Price:</span>
                    <CompareValue 
                      extracted={post.ai_extraction?.price} 
                      current={eventData.price}
                    />
                  </div>
                </div>
                {post.ai_reasoning && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    {post.ai_reasoning}
                  </p>
                )}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Event Details */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="title">Event Title *</Label>
            <Input
              id="title"
              value={eventData.event_title}
              onChange={(e) => setEventData({ ...eventData, event_title: e.target.value })}
              placeholder="Enter event title"
            />
          </div>

          {/* Category & Status Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select
                value={eventData.category}
                onValueChange={(value) => setEventData({ ...eventData, category: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Event Status</Label>
              <Select
                value={eventData.event_status}
                onValueChange={(value) => setEventData({ ...eventData, event_status: value })}
              >
                <SelectTrigger className={`h-9 ${eventData.event_status === 'cancelled' ? 'border-destructive text-destructive' : ''}`}>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Availability</Label>
              <Select
                value={eventData.availability_status}
                onValueChange={(value) => setEventData({ ...eventData, availability_status: value })}
              >
                <SelectTrigger className={`h-9 ${eventData.availability_status === 'sold_out' ? 'border-destructive text-destructive' : ''}`}>
                  <SelectValue placeholder="Availability" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITY_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Recurring Event Toggle */}
          <div className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-md">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-muted-foreground" />
              <Label htmlFor="recurring-toggle" className="text-sm font-medium cursor-pointer">
                Recurring event
              </Label>
            </div>
            <Switch
              id="recurring-toggle"
              checked={eventData.is_recurring}
              onCheckedChange={(checked) => setEventData({ 
                ...eventData, 
                is_recurring: checked,
                recurrence_pattern: checked ? eventData.recurrence_pattern : ""
              })}
            />
          </div>

          {/* Recurrence Pattern Input */}
          {eventData.is_recurring && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Recurrence Pattern</Label>
              <Input
                value={eventData.recurrence_pattern}
                onChange={(e) => setEventData({ ...eventData, recurrence_pattern: e.target.value })}
                placeholder="e.g., weekly:friday, monthly:first-saturday"
              />
              <p className="text-xs text-muted-foreground">
                Format: weekly:day, biweekly:day, monthly:first-day, monthly:last-day
              </p>
            </div>
          )}

          {/* Schedule Mode Toggle */}
          <div className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-md">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <Label htmlFor="multi-day-toggle" className="text-sm font-medium cursor-pointer">
                Multi-day event
              </Label>
            </div>
            <Switch
              id="multi-day-toggle"
              checked={isMultiDay}
              onCheckedChange={(checked) => {
                setIsMultiDay(checked);
                if (checked && scheduleData.length === 0 && eventData.event_date) {
                  // Initialize schedule from current single date
                  setScheduleData([{
                    date: eventData.event_date,
                    timeSlots: [{ time: eventData.event_time || "", label: "" }]
                  }]);
                }
              }}
            />
          </div>

          {/* Single Day Mode */}
          {!isMultiDay && (
            <>
              {/* Start Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="date">Start Date *</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="date"
                      type="date"
                      className="pl-10"
                      value={eventData.event_date}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setEventData({ 
                          ...eventData, 
                          event_date: newDate,
                          event_end_date: eventData.event_end_date && newDate > eventData.event_end_date 
                            ? "" 
                            : eventData.event_end_date
                        });
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="time">Start Time</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="time"
                      type="time"
                      className="pl-10"
                      value={eventData.event_time}
                      onChange={(e) => setEventData({ ...eventData, event_time: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* End Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="end-date">End Date (optional)</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="end-date"
                      type="date"
                      className="pl-10"
                      value={eventData.event_end_date}
                      min={eventData.event_date}
                      onChange={(e) => setEventData({ ...eventData, event_end_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end-time">End Time (optional)</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="end-time"
                      type="time"
                      className="pl-10"
                      value={eventData.end_time}
                      onChange={(e) => setEventData({ ...eventData, end_time: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Multi-Day Mode - Schedule Editor */}
          {isMultiDay && (
            <EventScheduleEditor
              schedule={scheduleData}
              onScheduleChange={setScheduleData}
              defaultVenue={locationCorrection?.venueName || post.location_name || ""}
              defaultAddress={locationCorrection?.streetAddress || post.location_address || ""}
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={eventData.description}
              onChange={(e) => setEventData({ ...eventData, description: e.target.value })}
              placeholder="Event description..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup">Signup URL</Label>
            {['link_in_bio', 'dm_for_slots', 'check_bio'].includes(eventData.signup_url) ? (
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground italic">
                  {eventData.signup_url === 'link_in_bio' ? '🔗 Link in Instagram bio' : 
                   eventData.signup_url === 'dm_for_slots' ? '💬 DM for reservations' :
                   '📱 Check Instagram bio'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEventData({ ...eventData, signup_url: "" })}
                >
                  Clear
                </Button>
              </div>
            ) : (
              <div className="relative">
                <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="signup"
                  type="url"
                  className="pl-10"
                  value={eventData.signup_url}
                  onChange={(e) => setEventData({ ...eventData, signup_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={eventData.is_free}
                onChange={(e) => setEventData({ 
                  ...eventData, 
                  is_free: e.target.checked,
                  price: e.target.checked ? null : eventData.price,
                  price_min: e.target.checked ? null : eventData.price_min,
                  price_max: e.target.checked ? null : eventData.price_max,
                  price_notes: e.target.checked ? "" : eventData.price_notes,
                })}
                className="w-4 h-4"
              />
              <span className="text-sm">Free Event</span>
            </label>
            {!eventData.is_free && (
              <div className="space-y-3">
                {/* Price Range Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Price Min</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="number"
                        className="pl-10"
                        value={eventData.price_min || ""}
                        onChange={(e) => setEventData({ 
                          ...eventData, 
                          price_min: e.target.value ? parseFloat(e.target.value) : null 
                        })}
                        placeholder="500"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Price Max</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="number"
                        className="pl-10"
                        value={eventData.price_max || ""}
                        onChange={(e) => setEventData({ 
                          ...eventData, 
                          price_max: e.target.value ? parseFloat(e.target.value) : null 
                        })}
                        placeholder="1500"
                      />
                    </div>
                  </div>
                </div>
                {/* Price Notes */}
                <div>
                  <Label className="text-xs text-muted-foreground">Price Notes (tier details)</Label>
                  <Input
                    value={eventData.price_notes || ""}
                    onChange={(e) => setEventData({ ...eventData, price_notes: e.target.value })}
                    placeholder="GA ₱500, VIP ₱1500, Student ₱300"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Location Section */}
        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-muted-foreground" />
              <h3 className="font-medium">Location</h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLocationEditor(!showLocationEditor)}
            >
              {showLocationEditor ? "Hide" : "Edit"} Location
            </Button>
          </div>

          {/* Quick Venue Selector */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Quick Select from Known Venues</Label>
            <VenueSelector 
              value={locationCorrection?.venueName || post.location_name || undefined}
              onSelect={(venue: KnownVenue) => {
                setLocationCorrection({
                  venueName: venue.name,
                  streetAddress: venue.address || "",
                  lat: venue.lat,
                  lng: venue.lng,
                });
                toast.success(`Selected ${venue.name}${venue.lat ? ' (with coordinates)' : ''}`);
              }}
              placeholder="Search known venues..."
            />
          </div>

          {!showLocationEditor && (
            <div className="bg-muted/50 rounded-md p-3 space-y-1 text-sm">
              <div><strong>Venue:</strong> {locationCorrection?.venueName || post.location_name || "(not set)"}</div>
              <div><strong>Address:</strong> {locationCorrection?.streetAddress || post.location_address || "(not set)"}</div>
              <div><strong>Coordinates:</strong> {
                locationCorrection?.lat && locationCorrection?.lng 
                  ? `${locationCorrection.lat.toFixed(6)}, ${locationCorrection.lng.toFixed(6)}`
                  : post.location_lat && post.location_lng
                    ? `${post.location_lat}, ${post.location_lng}`
                    : "(not set - select a known venue)"
              }</div>
            </div>
          )}

          {showLocationEditor && (
            <LocationCorrectionEditor
              eventId={post.id}
              locationId={null}
              originalOCR={{
                venue: post.location_name || "",
                address: post.location_address || "",
              }}
              currentLocation={locationCorrection ? {
                location_name: locationCorrection.venueName,
                formatted_address: locationCorrection.streetAddress,
                location_lat: locationCorrection.lat,
                location_lng: locationCorrection.lng,
              } : undefined}
              onSave={handleLocationSave}
              onCancel={() => setShowLocationEditor(false)}
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <Button
            onClick={handleSaveDraft}
            disabled={!isValid || isSaving || isPublishing}
            variant="secondary"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button
            onClick={handleCreateEvent}
            disabled={!isValid || isPublishing}
            className="flex-1"
          >
            {isPublishing ? "Publishing..." : "Publish Event"}
          </Button>
          <Button onClick={onCancel} variant="outline" disabled={isPublishing || isSaving}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};