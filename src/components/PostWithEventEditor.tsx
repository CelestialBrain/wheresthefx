import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, DollarSign, ExternalLink, Image as ImageIcon } from "lucide-react";
import { LocationCorrectionEditor } from "./LocationCorrectionEditor";

interface PostWithEventEditorProps {
  post: {
    id: string;
    post_id: string;
    image_url: string | null;
    caption: string | null;
    event_title: string | null;
    event_date: string | null;
    event_time: string | null;
    location_name: string | null;
    location_address: string | null;
    location_lat: number | null;
    location_lng: number | null;
    signup_url: string | null;
    ocr_confidence: number | null;
    instagram_account: { username: string } | null;
  };
  onCreateEvent: (eventData: any) => void;
  onCancel: () => void;
}

export const PostWithEventEditor = ({ post, onCreateEvent, onCancel }: PostWithEventEditorProps) => {
  const [eventData, setEventData] = useState({
    event_title: post.event_title || "",
    event_date: post.event_date || "",
    event_time: post.event_time || "",
    description: post.caption || "",
    signup_url: post.signup_url || "",
    is_free: true,
    price: null as number | null,
  });

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

  const handleCreateEvent = () => {
    const finalData = {
      ...eventData,
      location: locationCorrection || {
        venueName: post.location_name || "",
        streetAddress: post.location_address || "",
        lat: post.location_lat,
        lng: post.location_lng,
      },
      instagram_post_id: post.id,
    };
    onCreateEvent(finalData);
  };

  const isValid = 
    eventData.event_title.trim() &&
    eventData.event_date &&
    (locationCorrection || (post.location_lat && post.location_lng));

  return (
    <Card className="border-accent/20">
      <CardHeader>
        <div className="flex gap-4">
          {post.image_url && (
            <img 
              src={post.image_url} 
              alt="Post" 
              className="w-32 h-32 object-cover rounded-md"
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="date"
                  type="date"
                  className="pl-10"
                  value={eventData.event_date}
                  onChange={(e) => setEventData({ ...eventData, event_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
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
            onClick={handleCreateEvent}
            disabled={!isValid}
            className="flex-1"
          >
            Create Draft Event
          </Button>
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};