import { View, Text, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { supabase } from '@/src/lib/supabase';
import type { Database } from '@/src/lib/database.types';
import { useToast } from '@/src/components/general/Toast';
import * as React from 'react';

const BarOptionsScreen = (): JSX.Element | null => {
  const router = useRouter();
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const profile = useAuthStore((s) => s.profile);
  const toast = useToast();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = React.useState(false);

  // Delete handler (strict typing, best practices)
  const handleDelete = async (): Promise<void> => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('bars').delete().eq('id', barId);
      if (error) throw error;
      setDeleteModalVisible(false);
      toast.show({ type: 'success', text1: 'Bar deleted successfully' });
      router.replace('/(admin)/admin-panel');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      toast.show({ type: 'error', text1: 'Delete failed', text2: errorMsg });
    } finally {
      setIsDeleting(false);
    }
  };
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
    toast.show({ type: 'error', text1: 'Access denied', text2: 'You are not the owner of this bar.' });
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
          className="bg-green-600 px-6 py-4 rounded-lg items-center"
          accessibilityRole="button"
          accessibilityLabel="Edit Bar Info"
          activeOpacity={0.85}
          onPress={() => router.push(`/(admin)/bar/${barId}/info`)}
        >
          <Text className="text-white font-medium">Manage Bar Information</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          className="bg-green-600 px-6 py-4 rounded-lg items-center"
          accessibilityRole="button"
          accessibilityLabel="Edit Bar Hours"
          activeOpacity={0.85}
          onPress={() => router.push(`/(admin)/bar/${barId}/hours`)}
        >
          <Text className="text-white font-medium">Manage Bar Hours</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-green-600 px-6 py-4 rounded-lg items-center"
          accessibilityRole="button"
          accessibilityLabel="Edit Bar Seats"
          activeOpacity={0.85}
          onPress={() => router.push(`/(admin)/bar/${barId}/seats`)}
        >
          <Text className="text-white font-medium">Manage Bar Seats</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-green-600 px-6 py-4 rounded-lg items-center"
          accessibilityRole="button"
          accessibilityLabel="Drinks"
          activeOpacity={0.85}
          onPress={() => router.push(`/(admin)/bar/${barId}/drinks`)}
        >
          <Text className="text-white font-medium">Manage Bar Drinks</Text>
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
          accessibilityLabel="Staff"
          activeOpacity={0.85}
          onPress={() => router.push(`/(admin)/bar/${barId}/staff`)}
        >
          <Text className="text-gray-800 font-medium">Manage Bar Staff</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-gray-100 px-6 py-4 rounded-lg items-center"
          accessibilityRole="button"
          accessibilityLabel="Images"
          activeOpacity={0.85}
          onPress={() => router.push(`/(admin)/bar/${barId}/images`)}
        >
          <Text className="text-gray-800 font-medium">Manage Bar Images</Text>
        </TouchableOpacity>
        {/* Delete Bar Button */}
        <TouchableOpacity
          className="bg-red-600 px-6 py-4 rounded-lg items-center"
          accessibilityRole="button"
          accessibilityLabel="Delete Bar"
          activeOpacity={0.85}
          onPress={() => setDeleteModalVisible(true)}
          disabled={isDeleting}
        >
          <Text className="text-white font-medium">{isDeleting ? 'Deleting...' : 'Delete Bar'}</Text>
        </TouchableOpacity>

        {/* Delete Confirmation Modal */}
        {deleteModalVisible && (
          <Modal
            visible={deleteModalVisible}
            animationType="fade"
            transparent
            onRequestClose={() => setDeleteModalVisible(false)}
          >
            <View className="flex-1 justify-center items-center bg-black/40 px-6">
              <View className="bg-white rounded-xl p-6 w-full max-w-md shadow-lg">
                <Text className="text-lg font-semibold text-gray-900 mb-2 text-center">Delete Bar?</Text>
                <Text className="text-gray-700 text-center mb-4">
                  This action cannot be undone. Are you sure you want to permanently delete this bar and all its data?
                </Text>
                <View className="flex-row justify-end space-x-3 mt-2">
                  <TouchableOpacity
                    className="px-4 py-2 rounded-md bg-gray-100"
                    onPress={() => setDeleteModalVisible(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel Delete"
                  >
                    <Text className="text-gray-700 font-medium">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className={`px-4 py-2 rounded-md bg-red-600 ${isDeleting ? 'opacity-60' : ''}`}
                    onPress={handleDelete}
                    accessibilityRole="button"
                    accessibilityLabel="Confirm Delete"
                    disabled={isDeleting}
                  >
                    <Text className="text-white font-medium">{isDeleting ? 'Deleting...' : 'Delete'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </View>
  );
};



export default BarOptionsScreen;
