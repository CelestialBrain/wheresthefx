import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

export function useEventMarkers(options: UseEventMarkersOptions = {}) {
  return useQuery({
    queryKey: ['event-markers', options],
    queryFn: async (): Promise<LocationMarker[]> => {
      const today = new Date().toISOString().split('T')[0];
      
      // Read from published_events (canonical feed)
      let query = supabase
        .from('published_events')
        .select('*, stored_image_url, event_end_date, end_time, signup_url, instagram_post_url, caption, source_post_id') as any;

      // Filter by date range or default to future events only
      if (options.dateRange) {
        const startDate = options.dateRange.start.toISOString().split('T')[0];
        const endDate = options.dateRange.end.toISOString().split('T')[0];
        query = query.gte('event_date', startDate).lte('event_date', endDate);
      } else {
        // Show only upcoming events: either event_end_date >= today OR (no end_date AND event_date >= today)
        query = query.or(`event_end_date.gte.${today},and(event_end_date.is.null,event_date.gte.${today})`);
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

      // Filter by category
      if (options.category && options.category !== 'all') {
        query = query.eq('category', options.category);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Transform published_events to match expected format
      const transformedData = (data || []).map((event: any) => ({
        id: event.id,
        post_id: event.post_id,
        source_post_id: event.source_post_id,
        post_url: event.instagram_post_url,
        caption: event.caption || event.description,
        event_title: event.event_title,
        event_date: event.event_date,
        event_time: event.event_time,
        event_end_date: event.event_end_date,
        end_time: event.end_time,
        location_name: event.location_name,
        location_address: event.location_address,
        location_lat: event.location_lat,
        location_lng: event.location_lng,
        image_url: event.image_url,
        stored_image_url: event.stored_image_url,
        is_free: event.is_free,
        price: event.price,
        signup_url: event.signup_url,
        likes_count: event.likes_count,
        comments_count: event.comments_count,
        category: event.category || 'other',
        instagram_accounts: event.instagram_account_username ? {
          username: event.instagram_account_username
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
