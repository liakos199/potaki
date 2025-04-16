import { useEffect } from 'react';
import { View, Text, ActivityIndicator, Pressable, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { OwnerBarList } from '@/src/features/bars/owner-bar-list';
import { StaffBarList } from '@/src/features/bars/StaffBarList';

const AdminPanelScreen = (): JSX.Element => {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (!isLoading && profile && profile.role === 'customer') {
      router.replace('/(main)/home');
    }
  }, [isLoading, profile, router]);

  if (isLoading || !profile) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (profile.role !== 'owner' && profile.role !== 'staff') {
    // Redirect will occur, but always return a valid element to avoid lint error
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  const handleLogout = async () => {
    await useAuthStore.getState().signOut();
    router.replace('/'); // Go to welcome page
  };

  return (
    <View className="flex-1 items-center justify-start pt-8 px-4 bg-white">
      <Text className="text-2xl font-bold mb-6 text-center">Admin Panel</Text>
      <Text className="text-base text-gray-500 mb-2 self-start">(Owner/Staff only)</Text>
      <Text className="text-base font-semibold mb-4 self-start">Your role: <Text className={profile.role === 'owner' ? 'text-blue-600' : 'text-green-600'}>{profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}</Text></Text>
      {profile.role === 'owner' && (() => {
        // Fetch bars here to determine if Manage Staff should be shown
        const { data: bars, isLoading: barsLoading } = require('@tanstack/react-query').useQuery({
          queryKey: ['owner-bars', profile.id],
          queryFn: () => require('@/src/features/bars/api').fetchOwnerBars(profile.id),
          enabled: !!profile.id,
        });
        return <>
          <OwnerBarList />
          {barsLoading ? null : Array.isArray(bars) && bars.length > 0 && (
            <TouchableOpacity
              className="w-full max-w-xl py-2 rounded bg-blue-700 items-center mt-6 mb-2"
              accessibilityRole="button"
              accessibilityLabel="Go to Manage Staff"
              onPress={() => router.push('/(admin)/manage-staff')}
              activeOpacity={0.85}
            >
              <Text className="text-white text-base font-bold">Manage Staff</Text>
            </TouchableOpacity>
          )}
        </>;
      })()}

      {profile.role === 'staff' && <StaffBarList />}
      <Pressable
        className="w-32 py-2 rounded bg-red-600 items-center mt-8"
        accessibilityRole="button"
        accessibilityLabel="Logout"
        onPress={handleLogout}
      >
        <Text className="text-white text-base font-medium">Logout</Text>
      </Pressable>
    </View>
  );
};

export default AdminPanelScreen;
