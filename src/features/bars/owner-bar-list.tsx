import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchOwnerBars, deleteBar, createBar } from './api';
import type { CreateBarInput } from './types';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { Plus, Store, ChevronRight, Loader } from 'lucide-react-native';
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
  
  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center">
        <Loader size={24} color="#4B5563" className="animate-spin" />
        <Text className="text-gray-500 mt-2">Loading bars...</Text>
      </View>
    );
  }
  
  if (error) {
    return (
      <View className="flex-1 justify-center items-center px-4">
        <Text className="text-red-500 text-center">Error loading bars.</Text>
      </View>
    );
  }

  // Empty state
  if (!bars || bars.length === 0) {
    return (
      <View className="flex-1 justify-center items-center px-6">
        <Store size={48} color="#9CA3AF" />
        <Text className="text-gray-500 text-center mt-3 mb-6">You don't have any bars yet.</Text>
        <TouchableOpacity
          className="bg-blue-600 flex-row items-center px-5 py-3 rounded-lg"
          onPress={() => router.push('/(admin)/create-bar')}
          accessibilityRole="button"
          accessibilityLabel="Go to create bar page"
          activeOpacity={0.7}
        >
          <Plus size={18} color="#FFFFFF" />
          <Text className="text-white font-medium ml-2">Create Bar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // List state
  return (
    <View className="flex-1 px-4 pt-6 pb-8">
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-xl font-bold text-gray-800">Your Bars</Text>
        <TouchableOpacity
          className="bg-blue-600 flex-row items-center px-3 py-2 rounded-lg"
          onPress={() => router.push('/(admin)/create-bar')}
          accessibilityRole="button"
          accessibilityLabel="Go to create bar page"
          activeOpacity={0.7}
        >
          <Plus size={16} color="#FFFFFF" />
          <Text className="text-white font-medium ml-1">New Bar</Text>
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={bars}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 10 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            className="flex-row items-center px-4 py-4 bg-white rounded-lg border border-gray-100"
            onPress={() => router.push(`/bar/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.name}`}
            activeOpacity={0.7}
          >
            <Store size={20} color="#4B5563" />
            <Text className="text-gray-800 font-medium flex-1 ml-3" numberOfLines={1}>
              {item.name}
            </Text>
            <ChevronRight size={18} color="#6B7280" />
          </TouchableOpacity>
        )}
      />
    </View>
  );
};