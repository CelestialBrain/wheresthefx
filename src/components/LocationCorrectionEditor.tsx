import { useState, useEffect, useRef } from "react";
import { MapPin, Navigation, Search, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface LocationCorrectionEditorProps {
  eventId: string;
  locationId: string | null;
  originalOCR: {
    venue: string;
    address: string;
  };
  currentLocation?: {
    location_name: string;
    formatted_address: string;
    location_lat: number | null;
    location_lng: number | null;
  };
  onSave: (correction: LocationCorrection) => void;
  onCancel?: () => void;
}

interface LocationCorrection {
  venueName: string;
  streetAddress: string;
  lat: number | null;
  lng: number | null;
}

interface LocationSuggestion {
  id: string;
  corrected_venue_name: string;
  corrected_street_address: string | null;
  manual_lat: number | null;
  manual_lng: number | null;
  correction_count: number;
  confidence_score: number;
  similarity_score: number;
}

export const LocationCorrectionEditor = ({
  eventId,
  locationId,
  originalOCR,
  currentLocation,
  onSave,
  onCancel,
}: LocationCorrectionEditorProps) => {
  const [venueName, setVenueName] = useState(currentLocation?.location_name || originalOCR.venue || "");
  const [streetAddress, setStreetAddress] = useState(currentLocation?.formatted_address || originalOCR.address || "");
  const [lat, setLat] = useState<number | null>(currentLocation?.location_lat || null);
  const [lng, setLng] = useState<number | null>(currentLocation?.location_lng || null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();

  // Fetch suggestions as user types
  const { data: suggestions } = useQuery({
    queryKey: ['location-suggestions', venueName, streetAddress],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('suggest-location-corrections', {
        body: { locationName: venueName, locationAddress: streetAddress }
      });
      if (error) throw error;
      return data?.suggestions || [];
    },
    enabled: venueName.length > 2 || streetAddress.length > 5,
    staleTime: 30000,
  });

  // Query for similar events (for batch apply)
  const { data: similarEvents } = useQuery({
    queryKey: ['similar-events', venueName, streetAddress, eventId],
    queryFn: async () => {
      if (!venueName || venueName.length < 3) return [];
      
      const { data, error } = await supabase
        .from('instagram_posts')
        .select(`
          id,
          event_title,
          location_name,
          location_address
        `)
        .neq('id', eventId)
        .eq('needs_review', true)
        .limit(10);

      if (error) throw error;

      // Filter with fuzzy matching on client side
      return data?.filter((event: any) => {
        const locName = event.location?.location_name?.toLowerCase() || '';
        const searchName = venueName.toLowerCase();
        
        // Simple fuzzy match - could be improved with Levenshtein distance
        return locName.includes(searchName) || 
               searchName.includes(locName) ||
               locName.replace(/\s/g, '') === searchName.replace(/\s/g, '');
      }) || [];
    },
    enabled: venueName.length > 2,
  });

  // Initialize map
  useEffect(() => {
    if (showMap && mapContainerRef.current && lat && lng && !mapRef.current) {
      const map = L.map(mapContainerRef.current).setView([lat, lng], 15);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      
      marker.on('dragend', (e) => {
        const newPos = e.target.getLatLng();
        setLat(newPos.lat);
        setLng(newPos.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [showMap, lat, lng]);

  // Update marker position when coordinates change
  useEffect(() => {
    if (markerRef.current && lat && lng) {
      markerRef.current.setLatLng([lat, lng]);
      mapRef.current?.panTo([lat, lng]);
    }
  }, [lat, lng]);

  const handleGeocode = async () => {
    if (!streetAddress.trim()) {
      toast.error("Enter a street address first");
      return;
    }

    setIsGeocoding(true);
    try {
      const searchQuery = venueName ? `${venueName}, ${streetAddress}` : streetAddress;
      
      const { data, error } = await supabase.functions.invoke('geocode-location', {
        body: { locationName: searchQuery }
      });

      if (error) throw error;

      if (data?.lat && data?.lng) {
        setLat(data.lat);
        setLng(data.lng);
        setShowMap(true);
        toast.success("Coordinates found! Review the map pin.");
      } else {
        toast.error("Could not find coordinates for this address");
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      toast.error("Failed to geocode address");
    } finally {
      setIsGeocoding(false);
    }
  };

  const applySuggestion = (suggestion: LocationSuggestion) => {
    setVenueName(suggestion.corrected_venue_name);
    if (suggestion.corrected_street_address) {
      setStreetAddress(suggestion.corrected_street_address);
    }
    if (suggestion.manual_lat && suggestion.manual_lng) {
      setLat(suggestion.manual_lat);
      setLng(suggestion.manual_lng);
      setShowMap(true);
    }
    setShowSuggestions(false);
    toast.success(`Applied correction (used ${suggestion.correction_count}x)`);
  };

  const handleSave = () => {
    if (!venueName.trim()) {
      toast.error("Venue name is required");
      return;
    }

    if (!lat || !lng) {
      toast.error("Coordinates are required. Use geocode or pick from map.");
      return;
    }

    onSave({
      venueName: venueName.trim(),
      streetAddress: streetAddress.trim(),
      lat,
      lng,
    });
  };

  const hasChanges = 
    venueName !== (currentLocation?.location_name || originalOCR.venue) ||
    streetAddress !== (currentLocation?.formatted_address || originalOCR.address) ||
    lat !== currentLocation?.location_lat ||
    lng !== currentLocation?.location_lng;

  return (
    <Card className="p-4 space-y-4">
      {/* Original OCR Result */}
      <div className="bg-muted/50 rounded-md p-3 space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <AlertCircle className="w-4 h-4" />
          <span>Original OCR Result</span>
        </div>
        <div className="text-sm space-y-1 pl-6">
          <div><span className="font-medium">Venue:</span> {originalOCR.venue || "(none)"}</div>
          <div><span className="font-medium">Address:</span> {originalOCR.address || "(none)"}</div>
        </div>
      </div>

      {/* Correction Form */}
      <div className="space-y-3">
        <div className="space-y-2 relative">
          <Label htmlFor="venue-name">Venue Name *</Label>
          <Input
            id="venue-name"
            value={venueName}
            onChange={(e) => {
              setVenueName(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="e.g., Living Room"
            className="w-full"
          />
          
          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions && suggestions.length > 0 && (
            <Card className="absolute z-10 w-full mt-1 max-h-60 overflow-y-auto">
              <div className="p-2 space-y-1">
                {suggestions.map((s: LocationSuggestion) => (
                  <button
                    key={s.id}
                    onClick={() => applySuggestion(s)}
                    className="w-full text-left p-2 hover:bg-accent rounded-md transition-colors"
                  >
                    <div className="font-medium text-sm">{s.corrected_venue_name}</div>
                    {s.corrected_street_address && (
                      <div className="text-xs text-muted-foreground">{s.corrected_street_address}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        Used {s.correction_count}x
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {(s.similarity_score * 100).toFixed(0)}% match
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="street-address">Street Address</Label>
          <div className="flex gap-2">
            <Input
              id="street-address"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              placeholder="e.g., 42 Esteban Abada, Loyola Heights, QC"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleGeocode}
              disabled={isGeocoding || !streetAddress.trim()}
              title="Geocode address"
            >
              {isGeocoding ? (
                <div className="w-4 h-4 border-2 border-t-transparent border-current rounded-full animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label htmlFor="latitude">Latitude *</Label>
            <Input
              id="latitude"
              type="number"
              step="any"
              value={lat || ""}
              onChange={(e) => setLat(e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="14.123456"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="longitude">Longitude *</Label>
            <Input
              id="longitude"
              type="number"
              step="any"
              value={lng || ""}
              onChange={(e) => setLng(e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="121.123456"
            />
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setShowMap(!showMap)}
          className="w-full"
          disabled={!lat || !lng}
        >
          <MapPin className="w-4 h-4 mr-2" />
          {showMap ? "Hide Map" : "Show Map Preview"}
        </Button>

        {/* Map Preview */}
        {showMap && lat && lng && (
          <div className="space-y-2">
            <div 
              ref={mapContainerRef}
              className="w-full h-[300px] rounded-md border"
            />
            <p className="text-xs text-muted-foreground">
              <Navigation className="w-3 h-3 inline mr-1" />
              Drag the marker to adjust coordinates
            </p>
          </div>
        )}
      </div>

      {/* Similar Events Badge */}
      {similarEvents && similarEvents.length > 0 && (
        <div className="flex items-center gap-2 p-2 bg-blue-500/10 rounded-md">
          <Badge variant="secondary">
            {similarEvents.length} similar event{similarEvents.length > 1 ? 's' : ''} found
          </Badge>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || !venueName.trim() || !lat || !lng}
          className="flex-1"
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          Save Correction
        </Button>
        
        {similarEvents && similarEvents.length > 0 && hasChanges && (
          <Button
            onClick={() => {
              // This will be handled by parent component
              toast.info(`Apply to ${similarEvents.length} similar events - feature coming next`);
            }}
            variant="secondary"
          >
            Apply to {similarEvents.length} Similar
          </Button>
        )}
        
        {onCancel && (
          <Button onClick={onCancel} variant="ghost">
            Cancel
          </Button>
        )}
      </div>
    </Card>
  );
};