import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import Toast from 'react-native-toast-message';
import { supabase } from '@/src/lib/supabase';
import type { Database } from '@/src/lib/database.types';

const BarOptionsScreen = (): JSX.Element | null => {
  const router = useRouter();
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const profile = useAuthStore((s) => s.profile);

  // Fetch bar details
  const {
    data: bar,
    isPending: barLoading,
    error: barError,
  } = useQuery<Database['public']['Tables']['bars']['Row'] | null>({
    queryKey: ['bar', barId],
    enabled: !!barId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bars')
        .select('*')
        .eq('id', barId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Ownership enforcement
  if (!barLoading && bar && profile && bar.owner_id !== profile.id) {
    Toast.show({ type: 'error', text1: 'Access denied', text2: 'You are not the owner of this bar.' });
    router.replace('/(admin)/admin-panel');
    return null;
  }

  if (barLoading || !profile) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (barError) {
    return (
      <View className="flex-1 justify-center items-center bg-white px-4">
        <Text className="text-red-500 mb-2">Failed to load bar info</Text>
        <Text className="text-gray-500 text-xs">{barError.message}</Text>
        <TouchableOpacity className="mt-4 px-6 py-3 bg-indigo-600 rounded-lg" onPress={() => router.replace('/(admin)/admin-panel')}>
          <Text className="text-white font-bold">Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white px-4 pt-12">
      {/* Bar Info */}
      <View className="mb-8">
        <Text className="text-2xl font-bold mb-1">{bar?.name}</Text>
        <Text className="text-gray-600 mb-1">{bar?.address}</Text>
        {bar?.description && <Text className="text-gray-400 text-xs mb-1">{bar.description}</Text>}
      </View>
      <View className="gap-4">
        <TouchableOpacity
          className="bg-indigo-600 px-6 py-4 rounded-lg items-center"
          accessibilityRole="button"
          accessibilityLabel="Edit Bar Info"
          activeOpacity={0.85}
          onPress={() => router.push(`/(admin)/bar/${barId}/edit`)}
        >
          <Text className="text-white font-medium">Manage Bar Information</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-gray-100 px-6 py-4 rounded-lg items-center"
          accessibilityRole="button"
          accessibilityLabel="Reservations"
          activeOpacity={0.85}
          onPress={() => router.push(`/(admin)/bar/${barId}/reservations`)}
        >
          <Text className="text-gray-800 font-medium">Manage Bar Reservations</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-gray-100 px-6 py-4 rounded-lg items-center"
          accessibilityRole="button"
          accessibilityLabel="Drinks"
          activeOpacity={0.85}
          onPress={() => router.push(`/(admin)/bar/${barId}/drinks`)}
        >
          <Text className="text-gray-800 font-medium">Manage Bar Drinks</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-gray-100 px-6 py-4 rounded-lg items-center"
          accessibilityRole="button"
          accessibilityLabel="Staff"
          activeOpacity={0.85}
          onPress={() => router.push(`/(admin)/bar/${barId}/staff`)}
        >
          <Text className="text-gray-800 font-medium">Manage Bar Staff</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default BarOptionsScreen;
