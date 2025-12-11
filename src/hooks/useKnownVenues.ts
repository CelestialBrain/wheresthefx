import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface KnownVenue {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  aliases: string[] | null;
}

export function useKnownVenues() {
  return useQuery({
    queryKey: ["known-venues"],
    queryFn: async (): Promise<KnownVenue[]> => {
      const { data, error } = await supabase
        .from("known_venues")
        .select("id, name, address, city, lat, lng, aliases")
        .order("name", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });
}
