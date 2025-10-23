import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSavedEvents() {
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
          instagram_post_id,
          instagram_posts (
            id,
            event_title,
            event_date,
            event_time,
            location_name,
            location_address,
            post_url,
            caption,
            is_free,
            price,
            instagram_accounts (
              username,
              display_name,
              profile_pic_url
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 1000,
  });
}
