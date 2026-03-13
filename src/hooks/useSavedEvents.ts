import { useQuery } from "@tanstack/react-query";
import { fetchSavedEvents, isLoggedIn } from "@/api/client";

export function useSavedEvents() {
  return useQuery({
    queryKey: ['saved-events'],
    queryFn: async () => {
      if (!isLoggedIn()) return [];
      const res = await fetchSavedEvents();
      return res.data || [];
    },
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
