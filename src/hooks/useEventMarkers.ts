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
      let query = supabase
        .from('instagram_posts')
        .select('*, instagram_accounts(*)') as any;
      
      query = query
        .eq('is_event', true)
        .not('location_lat', 'is', null)
        .not('location_lng', 'is', null);

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
          `location_name.ilike.%${options.searchQuery}%,location_address.ilike.%${options.searchQuery}%,instagram_accounts.username.ilike.%${options.searchQuery}%`
        );
      }

      // Filter by interest tags (match against event title, caption, or hashtags)
      if (options.interestTags && options.interestTags.length > 0) {
        const tagFilters = options.interestTags
          .map(tag => `event_title.ilike.%${tag}%,caption.ilike.%${tag}%,hashtags.cs.{${tag}}`)
          .join(',');
        query = query.or(tagFilters);
      }

      const { data, error } = await query;

      if (error) throw error;
      return groupEventsByLocation(data || []);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useMostPopularEvent() {
  return useQuery({
    queryKey: ['most-popular-event'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instagram_posts')
        .select('location_lat, location_lng')
        .eq('is_event', true)
        .not('location_lat', 'is', null)
        .not('location_lng', 'is', null)
        .gte('event_date', new Date().toISOString().split('T')[0])
        .order('likes_count', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      return data;
    },
  });
}
