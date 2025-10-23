import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { createMiddleFingerIcon, LocationMarker } from "@/utils/markerUtils";
import { EventPopup } from "./EventPopup";
import { EventSidePanel } from "./EventSidePanel";
import { useEventMarkers, useMostPopularEvent } from "@/hooks/useEventMarkers";
import { MapFilters } from "./MapFilters";
import { useIsMobile } from "@/hooks/use-mobile";

function MapUpdater({ center }: { center: LatLngExpression }) {
  const map = useMap();
  
  useEffect(() => {
    if (map) {
      map.setView(center, 12);
    }
  }, [center, map]);
  
  return null;
}

function MapMarkers({ markers, onMarkerClick }: { markers: LocationMarker[]; onMarkerClick: (marker: LocationMarker) => void }) {
  return (
    <>
      {markers.map((marker, index) => (
        <Marker
          key={`${marker.lat}-${marker.lng}-${index}`}
          position={[marker.lat, marker.lng]}
          icon={createMiddleFingerIcon(marker.eventCount)}
          eventHandlers={{
            click: () => onMarkerClick(marker),
          }}
        />
      ))}
    </>
  );
}

interface EventMapProps {
  filters?: any;
  searchQuery?: string;
}

export function EventMap({ filters, searchQuery }: EventMapProps) {
  const [selectedMarker, setSelectedMarker] = useState<LocationMarker | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLngExpression>([14.5995, 120.9842]); // Manila default
  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

  const { data: markers = [], isLoading } = useEventMarkers({
    ...filters,
    searchQuery,
  });
  
  const { data: popularEvent } = useMostPopularEvent();

  // Set initial center based on user location or most popular event
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setMapCenter([position.coords.latitude, position.coords.longitude]);
        },
        () => {
          // If geolocation fails, use most popular event
          if (popularEvent?.location_lat && popularEvent?.location_lng) {
            setMapCenter([
              Number(popularEvent.location_lat),
              Number(popularEvent.location_lng),
            ]);
          }
        }
      );
    } else if (popularEvent?.location_lat && popularEvent?.location_lng) {
      setMapCenter([
        Number(popularEvent.location_lat),
        Number(popularEvent.location_lng),
      ]);
    }
  }, [popularEvent]);

  return (
    <div className="relative w-full h-screen">
      <MapContainer
        center={mapCenter}
        zoom={12}
        className="w-full h-full"
        zoomControl={true}
      >
        <MapUpdater center={mapCenter} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <MapMarkers markers={markers} onMarkerClick={setSelectedMarker} />
      </MapContainer>

      {selectedMarker && (
        <>
          {isDesktop ? (
            <EventSidePanel
              events={selectedMarker.events}
              onClose={() => setSelectedMarker(null)}
            />
          ) : (
            <EventPopup
              events={selectedMarker.events}
              onClose={() => setSelectedMarker(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
