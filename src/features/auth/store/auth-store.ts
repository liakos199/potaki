import { create } from 'zustand';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/src/lib/supabase';
import { UserProfile, UserProfileSchema } from '../schemas/user-profile-schema';

export type AuthState = {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  hydrated: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setIsLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;
  restoreSession: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  isLoading: false, // Set to false by default
  hydrated: false, // Track if auth state is initialized
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setIsLoading: (isLoading) => set({ isLoading }),
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null });
  },
  restoreSession: async () => {
    set({ isLoading: true });
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        set({ user: null, profile: null, isLoading: false, hydrated: true });
        return;
      }
      if (sessionData.session) {
        const user = sessionData.session.user;
        let profile = null;
        try {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
          if (profileData) {
            const parsed = UserProfileSchema.safeParse(profileData);
            profile = parsed.success ? parsed.data : null;
          } else {
            profile = null;
          }
        } catch (e) {
          profile = null;
        }
        set({ user, profile, isLoading: false, hydrated: true });
      } else {
        set({ user: null, profile: null, isLoading: false, hydrated: true });
      }
    } catch (e) {
      set({ user: null, profile: null, isLoading: false, hydrated: true });
    }
  },
}));

// Subscribe to Supabase auth state changes (call this once at module load)
supabase.auth.onAuthStateChange((_event, session) => {
  useAuthStore.getState().setUser(session?.user ?? null);
});
