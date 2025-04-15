import { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/features/auth/store/auth-store';

const HomeScreen = (): JSX.Element => {
  const [bars, setBars] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const signOut = useAuthStore((s) => s.signOut);

  useEffect(() => {
    const fetchBars = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('bars')
        .select('id, name')
        .order('name');
      if (!error && data) setBars(data);
      setLoading(false);
    };
    fetchBars();
  }, []);

  const handleLogout = async () => {
    await signOut();
    router.replace('/');
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white px-4 pt-12">
      <Text className="text-2xl font-bold mb-6 text-center">Available Bars</Text>
      {bars.length === 0 ? (
        <Text className="text-center text-gray-500">No bars found.</Text>
      ) : (
        <FlatList
          data={bars}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View className="mb-4 px-4 py-3 bg-gray-100 rounded-lg">
              <Text className="text-lg font-semibold">{item.name}</Text>
            </View>
          )}
        />
      )}
      <Pressable
        className="mt-10 w-full py-3 rounded-lg bg-red-600 items-center"
        accessibilityRole="button"
        accessibilityLabel="Logout"
        onPress={handleLogout}
      >
        <Text className="text-white text-base font-semibold">Logout</Text>
      </Pressable>
    </View>
  );
};

export default HomeScreen;
