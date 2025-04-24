import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { View, ActivityIndicator } from 'react-native';

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const profile = useAuthStore((s) => s.profile);
  const hydrated = useAuthStore((s) => s.hydrated);
  const router = useRouter();

  useEffect(() => {
    if (hydrated && profile && profile.role === 'customer') {
      router.replace('/');
    }
  }, [profile, hydrated, router]);

  if (!hydrated || !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (profile.role === 'customer') {
    return null;
  }

  return <>{children}</>;
};

export default function AdminStackLayout() {
  return (
    <AdminLayout>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#2d2d2d' }, // Light background
          headerTintColor: 'white', // Back button and title color
        }}
      />
    </AdminLayout>
  );
}
