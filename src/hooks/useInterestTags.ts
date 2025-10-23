import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useInterestTags() {
  return useQuery({
    queryKey: ['interest-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interest_tags')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
