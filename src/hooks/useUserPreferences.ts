import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface UserPreferences {
  interest_tags?: string[];
  has_completed_onboarding?: boolean;
}

export function useUserPreferences() {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['user-preferences'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return null;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('preferences, has_completed_onboarding')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      return data;
    },
  });
  
  const updatePreferences = useMutation({
    mutationFn: async (preferences: UserPreferences) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('Not authenticated');
      
      const { error } = await supabase
        .from('profiles')
        .update({
          preferences: preferences as any,
          has_completed_onboarding: preferences.has_completed_onboarding ?? true,
        })
        .eq('id', user.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] });
    },
  });
  
  return {
    preferences: query.data?.preferences as UserPreferences,
    hasCompletedOnboarding: query.data?.has_completed_onboarding,
    isLoading: query.isLoading,
    updatePreferences: updatePreferences.mutate,
  };
}
