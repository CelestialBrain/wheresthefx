import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { groupEventsByLocation, type LocationMarker } from "@/utils/markerUtils";

interface UseEventMarkersOptions {
  dateRange?: { start: Date; end: Date };
  accountIds?: string[];
  eventTypes?: string[];
  priceFilter?: 'free' | 'paid' | 'all';
  searchQuery?: string;
  interestTags?: string[];
}

export function useEventMarkers(options: UseEventMarkersOptions = {}) {
  return useQuery({
    queryKey: ['event-markers', options],
    queryFn: async (): Promise<LocationMarker[]> => {
      // Read from published_events (canonical feed)
      let query = supabase
        .from('published_events')
        .select('*') as any;

      // Filter by date range or default to future events
      if (options.dateRange) {
        const startDate = options.dateRange.start.toISOString().split('T')[0];
        const endDate = options.dateRange.end.toISOString().split('T')[0];
        query = query.gte('event_date', startDate).lte('event_date', endDate);
      } else {
        query = query.gte('event_date', new Date().toISOString().split('T')[0]);
      }

      // Apply ordering
      query = query.order('likes_count', { ascending: false });

      // Filter by price
      if (options.priceFilter === 'free') {
        query = query.eq('is_free', true);
      } else if (options.priceFilter === 'paid') {
        query = query.eq('is_free', false);
      }

      // Filter by search query (location or account)
      if (options.searchQuery) {
        query = query.or(
          `location_name.ilike.%${options.searchQuery}%,location_address.ilike.%${options.searchQuery}%,instagram_account_username.ilike.%${options.searchQuery}%`
        );
      }

      // Filter by interest tags
      if (options.interestTags && options.interestTags.length > 0) {
        const tagFilters = options.interestTags
          .map(tag => `event_title.ilike.%${tag}%,description.ilike.%${tag}%`)
          .join(',');
        query = query.or(tagFilters);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Transform published_events to match expected format
      const transformedData = (data || []).map((event: any) => ({
        id: event.id,
        post_id: event.source_post_id || event.id,
        event_title: event.event_title,
        event_date: event.event_date,
        event_time: event.event_time,
        location_name: event.location_name,
        location_address: event.location_address,
        location_lat: event.location_lat,
        location_lng: event.location_lng,
        image_url: event.image_url,
        is_free: event.is_free,
        price: event.price,
        signup_url: event.signup_url,
        likes_count: event.likes_count,
        comments_count: event.comments_count,
        instagram_accounts: event.instagram_account_username ? {
          username: event.instagram_account_username
        } : null
      }));
      
      return groupEventsByLocation(transformedData);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useMostPopularEvent() {
  return useQuery({
    queryKey: ['most-popular-event'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('published_events')
        .select('location_lat, location_lng')
        .gte('event_date', new Date().toISOString().split('T')[0])
        .order('likes_count', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      return data;
    },
  });
}
