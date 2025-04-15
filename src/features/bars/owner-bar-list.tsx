import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchOwnerBars, deleteBar, createBar } from './api';
import type { Bar, CreateBarInput } from './types';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { BarForm } from './bar-form';

import { useState } from 'react';

export const OwnerBarList = (): JSX.Element => {
  const profile = useAuthStore((s) => s.profile);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editingBarId, setEditingBarId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const {
    data: bars,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['owner-bars', profile?.id],
    queryFn: () => fetchOwnerBars(profile!.id),
    enabled: !!profile?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: (barId: string) => deleteBar(barId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner-bars', profile?.id] }),
  });

  const updateBarMutation = useMutation({
    mutationFn: async ({ barId, name }: { barId: string; name: string }) => {
      // Only update name for now
      return await (await import('./api')).updateBar({ id: barId, name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-bars', profile?.id] });
      setEditingBarId(null);
      setEditValue('');
    },
  });

  const createBarMutation = useMutation({
    mutationFn: (input: CreateBarInput) => createBar(input, profile!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-bars', profile?.id] });
    },
  });

  // Reset form after success (using key prop)
  const formKeyRef = useRef(0);
  useEffect(() => {
    if (createBarMutation.isSuccess) {
      formKeyRef.current += 1;
    }
  }, [createBarMutation.isSuccess]);

  if (!profile) return <></>;
  if (isLoading) return <Text>Loading bars...</Text>;
  if (error) return <Text>Error loading bars.</Text>;

  return (
    <View className="flex-1 items-center justify-start w-full pt-8 px-4 bg-white">
      <Text className="text-lg font-semibold mb-4">Your Bars</Text>
      <TouchableOpacity
        className="bg-blue-700 py-2 px-4 rounded items-center mb-4 border border-blue-800 shadow-sm"
        onPress={() => router.push('/(admin)/create-bar')}
        accessibilityRole="button"
        accessibilityLabel="Go to create bar page"
        activeOpacity={0.85}
      >
        <Text className="text-white font-extrabold text-base">Create Bar</Text>
      </TouchableOpacity>
      <FlatList
        data={bars}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ alignItems: 'center', width: '100%' }}
        renderItem={({ item }) => (
          <View className="flex-row items-center justify-between w-full max-w-xl px-4 py-2 bg-gray-100 rounded mb-2">
            {editingBarId === item.id ? (
              <View className="flex-1 flex-row items-center gap-2">
                <TextInput
                  value={editValue}
                  onChangeText={setEditValue}
                  className="flex-1 px-2 py-1 bg-white rounded border border-gray-300 text-base"
                  editable={!updateBarMutation.isPending}
                  autoFocus
                  placeholder="Bar name"
                />
                <TouchableOpacity
                  className="px-2 py-1 bg-green-600 rounded mr-1"
                  onPress={() => updateBarMutation.mutate({ barId: item.id, name: editValue })}
                  disabled={updateBarMutation.isPending || editValue.trim().length < 2}
                  activeOpacity={0.85}
                >
                  {updateBarMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text className="text-white font-bold">Save</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  className="px-2 py-1 bg-gray-400 rounded"
                  onPress={() => { setEditingBarId(null); setEditValue(''); }}
                  disabled={updateBarMutation.isPending}
                  activeOpacity={0.85}
                >
                  <Text className="text-white font-bold">Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text className="text-base font-medium flex-1">{item.name}</Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    className="px-3 py-1 bg-yellow-500 rounded border border-yellow-700 shadow-sm"
                    onPress={() => { setEditingBarId(item.id); setEditValue(item.name); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${item.name}`}
                    activeOpacity={0.85}
                  >
                    <Text className="text-white font-bold">Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="px-3 py-1 bg-red-700 rounded border border-red-900 shadow-sm"
                    onPress={() => deleteMutation.mutate(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${item.name}`}
                    activeOpacity={0.85}
                  >
                    <Text className="text-white font-extrabold">Delete</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}
        ListEmptyComponent={<Text className="text-red-400">No bars yet.</Text>}
      />
    </View>
  );
};
