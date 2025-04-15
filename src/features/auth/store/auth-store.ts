import { create } from 'zustand';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/src/lib/supabase';


export type UserRole = 'customer' | 'staff' | 'owner';

export type UserProfile = {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type AuthState = {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
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
      console.log('[restoreSession] start');
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.log('[restoreSession] session error', sessionError);
        set({ user: null, profile: null, isLoading: false });
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
          if (profileError) {
            console.log('[restoreSession] profile error', profileError);
          }
          profile = profileData ?? null;
        } catch (e) {
          console.log('[restoreSession] profile fetch exception', e);
        }
        set({ user, profile, isLoading: false });
        console.log('[restoreSession] set user and profile', user, profile);
      } else {
        set({ user: null, profile: null, isLoading: false });
        console.log('[restoreSession] no session, cleared user and profile');
      }
    } catch (e) {
      set({ user: null, profile: null, isLoading: false });
      console.log('[restoreSession] unexpected error', e);
    }
  },
}));

// Subscribe to Supabase auth state changes (call this once at module load)
supabase.auth.onAuthStateChange((_event, session) => {
  useAuthStore.getState().setUser(session?.user ?? null);
});
