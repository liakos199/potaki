import { useEffect } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/features/auth/store/auth-store';

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
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-2xl font-bold mb-8">Admin Panel</Text>
      <Text className="text-base text-gray-500 mb-2">(Owner/Staff only)</Text>
      <Text className="text-base font-semibold mb-8">Your role: <Text className={profile.role === 'owner' ? 'text-blue-600' : 'text-green-600'}>{profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}</Text></Text>
      <Pressable
        className="w-40 py-3 rounded-lg bg-red-600 items-center"
        accessibilityRole="button"
        accessibilityLabel="Logout"
        onPress={handleLogout}
      >
        <Text className="text-white text-base font-semibold">Logout</Text>
      </Pressable>
    </View>
  );
};

export default AdminPanelScreen;
