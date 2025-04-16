import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchOwnerBars } from '@/src/features/bars/api';
import { useAuthStore } from '@/src/features/auth/store/auth-store';

const BarOptionsScreen = (): JSX.Element => {
  const router = useRouter();
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const profile = useAuthStore((s) => s.profile);

  // Fetch all bars for this owner (could optimize with a fetchBarById if available)
  const { data: bars, isLoading } = useQuery({
    queryKey: ['owner-bars', profile?.id],
    queryFn: () => fetchOwnerBars(profile!.id),
    enabled: !!profile?.id,
  });

  const bar = bars?.find((b) => b.id === barId);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white px-4 pt-12">
      <Text className="text-2xl font-bold mb-6 text-center">{bar?.name ?? 'Bar'}</Text>
      <View className="gap-4">
        <TouchableOpacity
          className="bg-indigo-600 px-6 py-4 rounded-lg items-center"
          accessibilityRole="button"
          accessibilityLabel="Edit Bar Info"
          activeOpacity={0.85}
          onPress={() => router.push(`/bar/${barId}/edit`)}
        >
          <Text className="text-white font-medium">Edit Info</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-gray-100 px-6 py-4 rounded-lg items-center"
          accessibilityRole="button"
          accessibilityLabel="Reservations"
          activeOpacity={0.85}
        >
          <Text className="text-gray-800 font-medium">Reservations</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-gray-100 px-6 py-4 rounded-lg items-center"
          accessibilityRole="button"
          accessibilityLabel="Drinks"
          activeOpacity={0.85}
          onPress={() => router.push(`/bar/${barId}/drinks`)}
        >
          <Text className="text-gray-800 font-medium">Drinks</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-gray-100 px-6 py-4 rounded-lg items-center"
          accessibilityRole="button"
          accessibilityLabel="Staff"
          activeOpacity={0.85}
          onPress={() => router.push(`/bar/${barId}/staff`)}
        >
          <Text className="text-gray-800 font-medium">Staff</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-gray-100 px-6 py-4 rounded-lg items-center"
          accessibilityRole="button"
          accessibilityLabel="Camera"
          activeOpacity={0.85}
        >
          <Text className="text-gray-800 font-medium">Camera</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default BarOptionsScreen;
