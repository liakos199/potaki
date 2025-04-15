import { useCallback } from 'react';
import { useAuthStore } from '../store/auth-store';
import { supabase } from '../../../lib/supabase';
import { SignInInput, SignUpInput } from '../schemas/auth-schema';
import { UserProfile } from '../store/auth-store';

const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as UserProfile;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const useAuth = () => {
  const setUser = useAuthStore((s) => s.setUser);
  const setProfile = useAuthStore((s) => s.setProfile);
  const setIsLoading = useAuthStore((s) => s.setIsLoading);

  const signIn = useCallback(async (input: SignInInput) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error || !data.user) {
        throw error ?? new Error('Sign in failed');
      }
      setUser(data.user);
      const profile = await fetchProfile(data.user.id);
      setProfile(profile);
      return profile;
    } finally {
      setIsLoading(false);
    }
  }, [setUser, setProfile, setIsLoading]);

  const signUp = useCallback(async (input: SignUpInput) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
      });
      if (error || !data.user) {
        throw error ?? new Error('Sign up failed');
      }
      setUser(data.user);
      // Supabase triggers will create profile row, but may not be instant
      // Poll for up to 2 seconds (4 tries, 500ms interval)
      let profile: UserProfile | null = null;
      for (let i = 0; i < 4; i++) {
        profile = await fetchProfile(data.user.id);
        if (profile) break;
        await sleep(500);
      }
      setProfile(profile);
      return profile;
    } finally {
      setIsLoading(false);
    }
  }, [setUser, setProfile, setIsLoading]);

  return { signIn, signUp };
};
