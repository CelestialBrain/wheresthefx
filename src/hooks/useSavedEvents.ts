import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export function useSavedEvents() {
  const queryClient = useQueryClient();

  // Realtime subscription for instant cross-device sync
  useEffect(() => {
    const channel = supabase
      .channel('saved-events-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'saved_events'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['saved-events'] });
          queryClient.invalidateQueries({ queryKey: ['saved-events-count'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['saved-events'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('saved_events')
        .select(`
          id,
          created_at,
          published_event_id,
          published_events (
            id,
            event_title,
            event_date,
            event_time,
            event_end_date,
            end_time,
            location_name,
            location_address,
            location_lat,
            location_lng,
            instagram_post_url,
            caption,
            description,
            is_free,
            price,
            signup_url,
            image_url,
            stored_image_url,
            likes_count,
            comments_count,
            created_at,
            instagram_account_username
          )
        `)
        .eq('user_id', user.id)
        .not('published_event_id', 'is', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
