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
    <div class="relative inline-flex items-center justify-center">
      <img 
        src="${markerIcon}" 
        alt="Event marker"
        class="w-8 h-10"
        style="filter: brightness(0) saturate(100%) invert(34%) sepia(98%) saturate(4764%) hue-rotate(280deg) brightness(95%) contrast(94%); transform: rotate(180deg);"
      />
      ${count > 1 ? `
        <div class="absolute inset-0 flex items-center justify-center" style="padding-bottom: 8px;">
          <span class="text-white text-xs font-mono font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" style="text-shadow: 0 0 3px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.8);">
            ${count}
          </span>
        </div>
      ` : ''}
    </div>
  `;

  return L.divIcon({
    html: iconHtml,
    className: 'custom-marker',
    iconSize: [32, 40],
    iconAnchor: [16, 20],
    popupAnchor: [0, -20],
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
