import { useQuery } from "@tanstack/react-query";
import { fetchVenues } from "@/api/client";

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
      const res = await fetchVenues();
      return (res.data || []).map((v: any) => ({
        id: String(v.id),
        name: v.name,
        address: v.address ?? null,
        city: v.city ?? null,
        lat: v.lat ?? null,
        lng: v.lng ?? null,
        aliases: v.aliases ?? null,
      }));
    },
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });
}
