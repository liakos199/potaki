import React from 'react';
import { useEffect } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { supabase } from '@/src/lib/supabase';
import type { Database } from '@/src/lib/database.types';
import { useToast } from '@/src/components/general/Toast';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Bar = Database['public']['Tables']['bars']['Row'];

const AdminPanelScreen = (): JSX.Element => {
  const router = useRouter();
  const profile: Profile | null = useAuthStore((s) => s.profile);
  const isLoading = useAuthStore((s) => s.isLoading);
  const toast = useToast();
  // Fetch bars owned by the user
  const {
    data: bars,
    isPending: barsLoading,
    error: barsError,
    refetch,
  } = useQuery<Bar[]>({
    queryKey: ['bars', profile?.id],
    enabled: !!profile?.id && profile.role === 'owner',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bars')
        .select('*')
        .eq('owner_id', profile!.id);
      if (error) throw error;
      return data as Bar[];
    },
  });

  // Error feedback
  React.useEffect(() => {
    if (barsError) {
      toast.show({ type: 'error', text1: 'Error loading bars', text2: barsError.message });
    }
  }, [barsError]);

  // Redirect non-admin users to home
  useEffect(() => {
    if (!isLoading && profile && profile.role === 'customer') {
      router.replace('/(main)/home');
    }
  }, [isLoading, profile, router]);

  const handleLogout = async () => {
    await useAuthStore.getState().signOut();
    router.replace('/'); // Go to welcome page
  };

  const handleCreateBar = () => {
    router.push('/(admin)/create-bar');
  };

  // If you want staff to have a different dashboard, split logic here
  const handleBarPress = (barId: string) => {
    router.push(`/(admin)/bar/${barId}`);
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
        <Text>Welcome {profile.name ?? profile.email}</Text>
      </View>

      {/* Bars List or Empty State */}
      <View className="flex-1 p-4">
        {barsLoading ? (
          <ActivityIndicator size="large" color="#4f46e5" />
        ) : bars && bars.length > 0 ? (
          <>
            <Text className="text-lg font-semibold mb-2">Your Bars</Text>
            <FlatList
              data={bars}
              keyExtractor={(bar) => bar.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="bg-white rounded-lg p-4 mb-3 border border-gray-200"
                  onPress={() => handleBarPress(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Manage bar ${item.name}`}
                >
                  <Text className="text-lg font-medium">{item.name}</Text>
                  <Text className="text-gray-500 text-sm">{item.address}</Text>
                  {item.description ? (
                    <Text className="text-gray-400 text-xs mt-1">{item.description}</Text>
                  ) : null}
                </TouchableOpacity>
              )}
            />
          </>
        ) : (
          <View className="flex-1 justify-center items-center">
            <Text className="text-gray-500 mb-4">You have no bars yet.</Text>
            <TouchableOpacity
              className="bg-indigo-600 py-3 px-5 rounded-lg"
              onPress={handleCreateBar}
              accessibilityRole="button"
              accessibilityLabel="Create New Bar"
            >
              <Text className="text-white font-bold">Create New Bar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Always show create bar button at the bottom */}
      <View className="px-4 py-6 bg-white border-t border-gray-200">
        <TouchableOpacity
          className="py-3 rounded-lg bg-indigo-600 items-center"
          accessibilityRole="button"
          accessibilityLabel="Create New Bar"
          onPress={handleCreateBar}
        >
          <Text className="text-white font-medium">Create New Bar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="py-3 rounded-lg bg-gray-100 items-center mt-2"
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