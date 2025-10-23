import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSavedEventsCount() {
  return useQuery({
    queryKey: ['saved-events-count'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return 0;
      
      const { count, error } = await supabase
        .from('saved_events')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      
      if (error) throw error;
      return count || 0;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}
