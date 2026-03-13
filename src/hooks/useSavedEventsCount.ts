import { useQuery } from "@tanstack/react-query";
import { fetchSavedEvents, isLoggedIn } from "@/api/client";

export function useSavedEventsCount() {
  return useQuery({
    queryKey: ['saved-events-count'],
    queryFn: async () => {
      if (!isLoggedIn()) return 0;
      const res = await fetchSavedEvents();
      return (res.data || []).length;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}
