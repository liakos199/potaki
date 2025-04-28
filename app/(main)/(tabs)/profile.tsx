import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useColorScheme } from 'react-native';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { useRouter } from 'expo-router';
import { LogOut, User2 } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useToast } from '@/src/components/general/Toast';
import LogoutButton from '@/components/general/LogoutButton';
export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const { user, profile, isLoading, signOut } = useAuthStore();
  const router = useRouter();
  const toast = useToast();

  const handleLogout = async () => {
    try {
      await signOut();
      // Wait for Zustand state to clear (max 500ms)
      let waited = 0;
      while ((useAuthStore.getState().user || useAuthStore.getState().profile) && waited < 500) {
        await new Promise((res) => setTimeout(res, 50));
        waited += 50;
      }
      toast.show({ type: 'success', text1: 'Signed out' });
    } catch (err: any) {
      toast.show({ type: 'error', text1: 'Sign out failed', text2: err.message });
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="large" color="#f01669" />
      </View>
    );
  }

  return (
    <SafeAreaView className={`flex-1 ${colorScheme === 'dark' ? 'bg-black' : 'bg-white'}`}
      edges={["top", "left", "right"]}
    >
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-24 h-24 rounded-full bg-[#f01669]/10 items-center justify-center mb-4">
          <User2 size={56} color="#f01669" />
        </View>
        <Text className="text-2xl font-bold text-center text-white mb-1">
          {profile?.name || 'No Name'}
        </Text>
        <Text className="text-base text-center text-gray-400 mb-6">
          {profile?.email || user?.email || 'No Email'}
        </Text>
        <Text className="text-xs text-gray-500 mb-2">
          Role: <Text className="font-semibold text-gray-300">{profile?.role || 'customer'}</Text>
        </Text>
        <Pressable
          className="flex-row items-center justify-center mt-8 bg-[#f01669] px-6 py-3 rounded-xl"
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={handleLogout}
        >
          <LogOut size={20} color="#fff" className="mr-2" />
          <Text className="text-white text-base font-semibold">Sign Out</Text>
        </Pressable>
        <LogoutButton/>
      </View>
    </SafeAreaView>
  );
}
