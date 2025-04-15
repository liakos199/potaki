import { useQuery } from '@tanstack/react-query';
import { fetchAssignedBars } from './api';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import type { Bar } from './types';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';

export const StaffBarList = (): JSX.Element => {
  const profile = useAuthStore((s) => s.profile);
  const {
    data: bars = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['assigned-bars', profile?.id],
    queryFn: () => fetchAssignedBars(profile!.id),
    enabled: !!profile?.id,
  });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }
  if (error) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-red-500">Error loading assigned bars.</Text>
      </View>
    );
  }
  if (!bars.length) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-gray-400">No assigned bars.</Text>
      </View>
    );
  }
  return (
    <View className="flex-1">
      <Text className="text-xl font-bold mb-4">Your Assigned Bars</Text>
      <FlatList
        data={bars as Bar[]}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View className="mb-4 p-4 bg-gray-100 rounded">
            <Text className="text-lg font-semibold mb-1">{item.name}</Text>
            <Text className="text-xs text-gray-500">Bar ID: {item.id}</Text>
          </View>
        )}
      />
    </View>
  );
};
