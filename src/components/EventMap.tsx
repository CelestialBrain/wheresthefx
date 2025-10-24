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
  const userLocationMarkerRef = useRef<L.Marker | null>(null);

  const [selectedMarker, setSelectedMarker] = useState<LocationMarker | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLngExpression>([14.5995, 120.9842]); // Manila default
  const [isMapLoading, setIsMapLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

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
      center: [14.651676537238625, 121.04921119789635],
      zoom: 13,
      zoomControl: false,
    });

    const tileLayer = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        crossOrigin: true, // Enable proper caching
      }
    ).addTo(map);

    // Hide loading background once tiles load
    tileLayer.on('load', () => {
      setIsMapLoading(false);
    });

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
          setUserLocation(center);
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

  // Add user location marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;

    // Remove existing user location marker if any
    if (userLocationMarkerRef.current) {
      userLocationMarkerRef.current.remove();
    }

    const userIcon = L.divIcon({
      html: '<div class="user-location-marker"></div>',
      className: '',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    const marker = L.marker(userLocation, {
      icon: userIcon,
      zIndexOffset: 1000, // Keep above event markers
    }).addTo(map);

    userLocationMarkerRef.current = marker;

    return () => {
      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.remove();
      }
    };
  }, [userLocation]);

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
    <>
      {/* Black loading background */}
      {isMapLoading && (
        <div className="fixed inset-0 w-full h-screen z-[1] bg-black" />
      )}
      
      <div ref={containerRef} className="fixed inset-0 w-full h-screen z-0" />

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
    </>
  );
}
