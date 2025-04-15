import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { fetchOwnerBars, deleteBarAndDemoteStaff, updateBar } from '@/src/features/bars/api';
import type { Bar } from '@/src/features/bars/types';
import { useAuthStore } from '@/src/features/auth/store/auth-store';

const EditBarScreen = (): JSX.Element => {
  const router = useRouter();
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [editValue, setEditValue] = useState('');
  const [editMode, setEditMode] = useState(false);

  const {
    data: bar,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['bar', barId],
    queryFn: async () => {
      const bars = await fetchOwnerBars(profile!.id);
      return bars.find((b) => b.id === barId);
    },
    enabled: !!profile?.id && !!barId,
  });

  const updateMutation = useMutation({
    mutationFn: (name: string) => updateBar({ id: barId as string, name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-bars', profile?.id] });
      setEditMode(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteBarAndDemoteStaff(barId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-bars', profile?.id] });
      router.replace('/(admin)/admin-panel');
    },
  });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }
  if (error || !bar) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-red-500 text-lg">Bar not found.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 px-4 pt-12 bg-white max-w-xl mx-auto w-full">
      <Text className="text-2xl font-extrabold text-blue-900 mb-6 text-center">Edit Bar</Text>
      {editMode ? (
        <>
          <TextInput
            className="border border-gray-300 rounded px-3 py-2 mb-4 text-base"
            value={editValue}
            onChangeText={setEditValue}
            placeholder="Bar name"
            autoFocus
            editable={!updateMutation.isPending}
            accessibilityLabel="Bar name input"
          />
          <View className="flex-row gap-3 mb-8">
            <TouchableOpacity
              className="flex-1 py-2 rounded-lg bg-green-600 items-center"
              onPress={() => updateMutation.mutate(editValue)}
              disabled={updateMutation.isPending || editValue.trim().length < 2}
              accessibilityRole="button"
              accessibilityLabel="Save bar name"
              activeOpacity={0.85}
            >
              <Text className="text-white font-semibold text-base">{updateMutation.isPending ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 py-2 rounded-lg bg-gray-300 items-center"
              onPress={() => setEditMode(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel edit"
              activeOpacity={0.85}
            >
              <Text className="text-gray-700 font-medium text-base">Cancel</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text className="text-lg font-semibold mb-8 text-center">Bar Name: <Text className="text-blue-700">{bar.name}</Text></Text>
          <TouchableOpacity
            className="w-full py-3 rounded-lg bg-blue-700 items-center mb-4"
            onPress={() => { setEditValue(bar.name); setEditMode(true); }}
            accessibilityRole="button"
            accessibilityLabel="Edit bar name"
            activeOpacity={0.85}
          >
            <Text className="text-white font-semibold text-base">Edit Name</Text>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity
        className="w-full py-3 rounded-lg bg-red-600 items-center mt-8"
        onPress={() => {
          Alert.alert('Delete Bar', 'Are you sure you want to delete this bar?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => deleteMutation.mutate(),
            },
          ]);
        }}
        accessibilityRole="button"
        accessibilityLabel="Delete bar"
        activeOpacity={0.85}
      >
        <Text className="text-white font-semibold text-base">Delete Bar</Text>
      </TouchableOpacity>
    </View>
  );
};

export default EditBarScreen;
