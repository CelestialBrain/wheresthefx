import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePopularAccounts(limit: number = 30) {
  return useQuery({
    queryKey: ['popular-accounts', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('popular_instagram_accounts')
        .select('*')
        .limit(limit);
      
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
