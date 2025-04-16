import { useEffect } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { OwnerBarList } from '@/src/features/bars/owner-bar-list';
import { StaffBarList } from '@/src/features/bars/StaffBarList';
import { fetchOwnerBars } from '@/src/features/bars/api';

const AdminPanelScreen = (): JSX.Element => {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const isLoading = useAuthStore((s) => s.isLoading);

  // Redirect non-admin users to home
  useEffect(() => {
    if (!isLoading && profile && profile.role === 'customer') {
      router.replace('/(main)/home');
    }
  }, [isLoading, profile, router]);

  // Fetch bars for owners to determine if Manage Staff button should be shown
  const { data: ownerBars, isLoading: barsLoading } = useQuery({
    queryKey: ['owner-bars', profile?.id],
    queryFn: () => fetchOwnerBars(profile!.id),
    enabled: !isLoading && !!profile?.id && profile?.role === 'owner',
  });

  const handleLogout = async () => {
    await useAuthStore.getState().signOut();
    router.replace('/'); // Go to welcome page
  };

  // Loading state
  if (isLoading || !profile) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  // Unauthorized state (this will redirect, but we need to return a component)
  if (profile.role !== 'owner' && profile.role !== 'staff') {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  const isOwner = profile.role === 'owner';
  const roleColor = isOwner ? 'text-indigo-600' : 'text-emerald-600';
  const formattedRole = profile.role.charAt(0).toUpperCase() + profile.role.slice(1);

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-4 pt-12 pb-4 border-b border-gray-200">
        <Text className="text-xl font-bold text-gray-800">Admin Panel</Text>
        <View className="flex-row items-center mt-2">
          <Text className="text-sm text-gray-500">Role: </Text>
          <Text className={`text-sm font-medium ${roleColor}`}>{formattedRole}</Text>
        </View>
      </View>

      {/* Content */}
      <View className="flex-1 px-4 pt-4">
        {/* Owner Content */}
        {isOwner && (
          <>
            <OwnerBarList />
           
          </>
        )}

        {/* Staff Content */}
        {profile.role === 'staff' && (
          <StaffBarList />
        )}
      </View>

      {/* Footer with Logout */}
      <View className="px-4 py-6 bg-white border-t border-gray-200">
        <TouchableOpacity
          className="py-3 rounded-lg bg-gray-100 items-center"
          accessibilityRole="button"
          accessibilityLabel="Logout"
          onPress={handleLogout}
        >
          <Text className="text-gray-700 font-medium">Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default AdminPanelScreen;