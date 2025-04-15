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

  // If no bars, show only the Create Bar button and a gentle prompt
  if (!bars || bars.length === 0) {
    return (
      <View className="w-full max-w-xs mx-auto flex-1 justify-center items-center mt-16">
        <Text className="text-lg font-semibold text-gray-700 mb-6 text-center">You don't have any bars yet.</Text>
        <TouchableOpacity
          className="bg-blue-700 py-3 px-4 rounded-xl items-center shadow-sm w-full"
          onPress={() => router.push('/(admin)/create-bar')}
          accessibilityRole="button"
          accessibilityLabel="Go to create bar page"
          activeOpacity={0.85}
        >
          <Text className="text-white font-semibold text-base tracking-wide">+ Create Bar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // If bars exist, show the list (name only), each selectable, plus the Create Bar button at the top
  return (
    <View className="w-full max-w-xl mx-auto">
      <Text className="text-2xl font-extrabold text-blue-900 mb-1 text-center tracking-tight">Your Bars</Text>
      <View className="h-0.5 bg-blue-100 mb-6 w-full" />
      <TouchableOpacity
        className="bg-blue-700 py-3 px-4 rounded-xl items-center mb-7 shadow-sm self-center w-full max-w-xs"
        onPress={() => router.push('/(admin)/create-bar')}
        accessibilityRole="button"
        accessibilityLabel="Go to create bar page"
        activeOpacity={0.85}
      >
        <Text className="text-white font-semibold text-base tracking-wide">+ Create Bar</Text>
      </TouchableOpacity>
      <FlatList
        data={bars}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 16, paddingBottom: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            className="w-full rounded-2xl shadow-sm border border-gray-200 bg-white px-5 py-4 flex-row items-center"
            onPress={() => router.push(`/edit-bar/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.name}`}
            activeOpacity={0.85}
          >
            <Text className="text-lg font-semibold text-gray-900 flex-1" numberOfLines={1}>{item.name}</Text>
            <Text className="text-blue-600 font-medium ml-2">Edit</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};
