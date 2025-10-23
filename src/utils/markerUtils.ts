import L from 'leaflet';
import markerIcon from '@/assets/middle-finger-marker.png';

export interface LocationMarker {
  lat: number;
  lng: number;
  eventCount: number;
  events: any[];
}

export function createMiddleFingerIcon(count: number): L.DivIcon {
  const iconHtml = `
    <div class="relative">
      <img 
        src="${markerIcon}" 
        alt="Event marker"
        class="w-8 h-10"
        style="filter: brightness(0) saturate(100%) invert(34%) sepia(98%) saturate(4764%) hue-rotate(280deg) brightness(95%) contrast(94%);"
      />
      ${count > 1 ? `
        <div class="absolute -top-1 -right-1 bg-accent text-accent-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-mono font-bold border-2 border-background">
          ${count}
        </div>
      ` : ''}
    </div>
  `;

  return L.divIcon({
    html: iconHtml,
    className: 'custom-marker',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
  });
}

export function groupEventsByLocation(events: any[]): LocationMarker[] {
  const locationMap = new Map<string, LocationMarker>();

  events.forEach(event => {
    if (!event.location_lat || !event.location_lng) return;

    const key = `${event.location_lat.toFixed(4)},${event.location_lng.toFixed(4)}`;
    
    if (locationMap.has(key)) {
      const marker = locationMap.get(key)!;
      marker.eventCount++;
      marker.events.push(event);
    } else {
      locationMap.set(key, {
        lat: parseFloat(event.location_lat),
        lng: parseFloat(event.location_lng),
        eventCount: 1,
        events: [event],
      });
    }
  });

  return Array.from(locationMap.values());
}
