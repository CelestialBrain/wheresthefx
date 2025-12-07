import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, DollarSign, ExternalLink, Eye, EyeOff, AlertTriangle, CheckCircle2 } from "lucide-react";
import { LocationCorrectionEditor } from "./LocationCorrectionEditor";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageWithSkeleton } from "./ImageWithSkeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
    // Price fields - read from database
    is_free?: boolean;
    price?: number | null;
    price_min?: number | null;
    price_max?: number | null;
    price_notes?: string | null;
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
    // Read price from database for tracking corrections
    price: post.price ?? null,
    is_free: post.is_free ?? true,
  };

  const [eventData, setEventData] = useState({
    event_title: post.event_title || "",
    event_date: post.event_date || "",
    event_time: post.event_time || "",
    event_end_date: post.event_end_date || "",
    end_time: post.end_time || "",
    description: post.caption || "",
    signup_url: post.signup_url || "",
    // Read is_free and price from database, not hardcoded
    is_free: post.is_free ?? true,
    price: post.price ?? null,
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

      // Update post with all event data
      const { error: updateError } = await supabase
        .from("instagram_posts")
        .update({
          event_title: eventData.event_title,
          event_date: eventData.event_date,
          event_time: eventData.event_time || null,
          event_end_date: eventData.event_end_date || null,
          end_time: eventData.end_time || null,
          location_name: location.venueName,
          location_address: location.streetAddress,
          location_lat: location.lat,
          location_lng: location.lng,
          signup_url: eventData.signup_url || null,
          is_free: eventData.is_free,
          price: eventData.is_free ? null : eventData.price,
          is_event: true,
          needs_review: false,
          ocr_confidence: 1.0,
        })
        .eq("id", post.id);

      if (updateError) throw updateError;

      // Now publish to published_events table
      const { error: publishError } = await supabase.functions.invoke("publish-event", {
        body: { postId: post.id }
      });

      if (publishError) throw publishError;

      toast.success("Event published successfully!");
      onCreateEvent(post.id);
    } catch (error: any) {
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

    try {
      const { error } = await supabase
        .from("instagram_posts")
        .update({
          event_title: eventData.event_title,
          event_date: eventData.event_date,
          event_time: eventData.event_time || null,
          event_end_date: eventData.event_end_date || null,
          end_time: eventData.end_time || null,
          location_name: location.venueName,
          location_address: location.streetAddress,
          location_lat: location.lat,
          location_lng: location.lng,
          signup_url: eventData.signup_url || null,
          is_free: eventData.is_free,
          price: eventData.is_free ? null : eventData.price,
          // Keep review flag until Publish
          needs_review: true,
          is_event: true,
        })
        .eq("id", post.id);

      if (error) throw error;

      toast.success("Saved changes");
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const isValid = 
    eventData.event_title.trim() &&
    eventData.event_date &&
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
                      // Clear end date if it's before start date
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
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={eventData.is_free}
                onChange={(e) => setEventData({ 
                  ...eventData, 
                  is_free: e.target.checked,
                  price: e.target.checked ? null : eventData.price 
                })}
                className="w-4 h-4"
              />
              <span className="text-sm">Free Event</span>
            </label>
            {!eventData.is_free && (
              <div className="relative flex-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  className="pl-10"
                  value={eventData.price || ""}
                  onChange={(e) => setEventData({ 
                    ...eventData, 
                    price: e.target.value ? parseFloat(e.target.value) : null 
                  })}
                  placeholder="Price"
                />
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

          {!showLocationEditor && (
            <div className="bg-muted/50 rounded-md p-3 space-y-1 text-sm">
              <div><strong>Venue:</strong> {locationCorrection?.venueName || post.location_name || "(not set)"}</div>
              <div><strong>Address:</strong> {locationCorrection?.streetAddress || post.location_address || "(not set)"}</div>
              <div><strong>Coordinates:</strong> {
                locationCorrection?.lat && locationCorrection?.lng 
                  ? `${locationCorrection.lat.toFixed(6)}, ${locationCorrection.lng.toFixed(6)}`
                  : post.location_lat && post.location_lng
                    ? `${post.location_lat}, ${post.location_lng}`
                    : "(not set)"
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