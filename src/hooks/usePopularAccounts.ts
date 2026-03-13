import { useQuery } from "@tanstack/react-query";

// TODO: needs admin API endpoint — GET /api/accounts/popular
// No Express endpoint exists yet for popular Instagram accounts.
export function usePopularAccounts(limit: number = 30) {
  return useQuery({
    queryKey: ['popular-accounts', limit],
    queryFn: async () => {
      return [] as any[];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
