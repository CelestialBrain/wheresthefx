import { useEffect, useMemo, useRef, useState } from "react";
import L, { LatLngExpression, Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import { createMiddleFingerIcon, type LocationMarker } from "@/utils/markerUtils";
import { EventPopup } from "./EventPopup";
import { EventSidePanel } from "./EventSidePanel";
import { useEventMarkers, useMostPopularEvent } from "@/hooks/useEventMarkers";
import { useIsMobile } from "@/hooks/use-mobile";

interface EventMapProps {
  filters?: any;
  searchQuery?: string;
}

export function EventMap({ filters, searchQuery }: EventMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersLayerRef = useRef<LayerGroup | null>(null);

  const [selectedMarker, setSelectedMarker] = useState<LocationMarker | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLngExpression>([14.5995, 120.9842]); // Manila default

  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

  const { data: markers = [] } = useEventMarkers({
    ...filters,
    searchQuery,
  });
  const { data: popularEvent } = useMostPopularEvent();

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: mapCenter as [number, number],
      zoom: 12,
      zoomControl: false,
    });

    // Add zoom control in bottom-left
    L.control.zoom({
      position: 'bottomleft'
    }).addTo(map);

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }
    ).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
  }, [mapCenter]);

  // Update center based on geolocation or most popular event (run once on load)
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const center: [number, number] = [position.coords.latitude, position.coords.longitude];
          setMapCenter(center);
          mapRef.current?.setView(center, 12);
        },
        () => {
          if (popularEvent?.location_lat && popularEvent?.location_lng) {
            const center: [number, number] = [
              Number(popularEvent.location_lat),
              Number(popularEvent.location_lng),
            ];
            setMapCenter(center);
            mapRef.current?.setView(center, 12);
          }
        }
      );
    } else if (popularEvent?.location_lat && popularEvent?.location_lng) {
      const center: [number, number] = [
        Number(popularEvent.location_lat),
        Number(popularEvent.location_lng),
      ];
      setMapCenter(center);
      mapRef.current?.setView(center, 12);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popularEvent]);

  // Render markers whenever data changes
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    markers.forEach((m) => {
      const marker = L.marker([m.lat, m.lng], {
        icon: createMiddleFingerIcon(m.eventCount),
      });
      marker.on("click", () => setSelectedMarker(m));
      marker.addTo(layer);
    });
  }, [markers]);

  return (
    <div className="relative w-full h-screen">
      <div ref={containerRef} className="w-full h-full" />

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
