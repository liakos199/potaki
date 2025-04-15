

import { useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useAuthStore } from '@/src/features/auth/store/auth-store';

const Index = (): JSX.Element => {
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {

    if (
      navigationState?.key &&
      !isLoading &&
      user &&
      profile
    ) {
      if (profile.role === 'customer') router.replace('/(main)/home');
      else if (profile.role === 'owner' || profile.role === 'staff') router.replace('/(admin)/admin-panel');
    }
  }, [navigationState?.key, isLoading, user, profile, router]);

  if (
    isLoading ||
    user === undefined ||
    profile === undefined ||
    !navigationState?.key
  ) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  // If not logged in, show sign in/up
  return (
    <View className="flex-1 justify-center items-center bg-white px-6">
      <Text className="text-3xl font-bold mb-8" accessibilityRole="header">
        Welcome to Potaki Bar App
      </Text>
      <Pressable
        className="w-full py-4 mb-4 rounded-lg bg-black items-center"
        accessibilityRole="button"
        accessibilityLabel="Sign In"
        onPress={() => router.push('/(auth)/sign-in')}
      >
        <Text className="text-white text-lg font-semibold">Sign In</Text>
      </Pressable>
      <Pressable
        className="w-full py-4 rounded-lg bg-gray-100 items-center border border-black"
        accessibilityRole="button"
        accessibilityLabel="Sign Up"
        onPress={() => router.push('/(auth)/sign-up')}
      >
        <Text className="text-black text-lg font-semibold">Sign Up</Text>
      </Pressable>
    </View>
  );
};

export default Index;
