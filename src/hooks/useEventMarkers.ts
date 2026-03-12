import { useQuery } from "@tanstack/react-query";
import { groupEventsByProximity, type LocationMarker } from "@/utils/markerUtils";

interface UseEventMarkersOptions {
  dateRange?: { start: Date; end: Date };
  accountIds?: string[];
  eventTypes?: string[];
  priceFilter?: 'free' | 'paid' | 'all';
  searchQuery?: string;
  interestTags?: string[];
  category?: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function useEventMarkers(options: UseEventMarkersOptions = {}) {
  return useQuery({
    queryKey: ['event-markers', options],
    queryFn: async (): Promise<LocationMarker[]> => {
      // Build query params for the Express API
      const params = new URLSearchParams();

      if (options.dateRange) {
        params.set('date_from', options.dateRange.start.toISOString().split('T')[0]);
        params.set('date_to', options.dateRange.end.toISOString().split('T')[0]);
      }

      if (options.category && options.category !== 'all') {
        params.set('category', options.category);
      }

      if (options.priceFilter === 'free') {
        params.set('free', 'true');
      } else if (options.priceFilter === 'paid') {
        params.set('free', 'false');
      }

      if (options.searchQuery) {
        params.set('search', options.searchQuery);
      }

      const query = params.toString();
      const url = `${API_BASE}/api/events/map${query ? '?' + query : ''}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();

      // API returns snake_case with all fields needed by sidebar cards
      const transformedData = (json.data || []).map((event: any) => ({
        id: event.id,
        post_id: null,
        source_post_id: null,
        post_url: null,
        caption: null,
        event_title: event.title,
        event_date: event.event_date,
        event_time: event.event_time,
        event_end_date: event.event_end_date || null,
        end_time: event.end_time || null,
        location_name: event.venue_name,
        location_address: event.venue_address || null,
        location_lat: event.venue_lat,
        location_lng: event.venue_lng,
        image_url: event.image_url,
        stored_image_url: null,
        is_free: event.is_free,
        price: event.price,
        price_min: event.price_min || null,
        price_max: event.price_max || null,
        price_notes: event.price_notes || null,
        signup_url: event.signup_url || null,
        event_status: event.event_status || 'confirmed',
        availability_status: event.availability_status || 'available',
        is_recurring: event.is_recurring || false,
        recurrence_pattern: event.recurrence_pattern || null,
        likes_count: 0,
        comments_count: 0,
        category: event.category || 'other',
        instagram_account_username: event.source_username || null,
        instagram_accounts: event.source_username ? {
          username: event.source_username
        } : null
      }));

      return groupEventsByProximity(transformedData, 100);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useMostPopularEvent() {
  return useQuery({
    queryKey: ['most-popular-event'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`${API_BASE}/api/events/map?date_from=${today}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();

      if (json.data && json.data.length > 0) {
        return {
          location_lat: json.data[0].venue_lat,
          location_lng: json.data[0].venue_lng,
        };
      }
      return null;
    },
  });
}
