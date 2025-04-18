import React from 'react';
import { View, Text, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { useToast } from '@/src/components/general/Toast';
import BarInfoSection, { barFormSchema, type BarFormValues } from '@/src/features/owner-components/bar-info-section';
import type { Database } from '@/src/lib/database.types';
import BarOperatingHours from '@/src/features/owner-components/bar-operating-hours';
import { BarSeatOptions } from '@/src/features/owner-components/bar-seat-options';

type Bar = Database['public']['Tables']['bars']['Row'];

const EditBarScreen = (): JSX.Element | null => {
  const router = useRouter();
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const profile = useAuthStore((s) => s.profile);
  const toast = useToast();
  const queryClient = useQueryClient();

  // Fetch bar details
  const {
    data: bar,
    isPending: barLoading,
    error: barError,
  } = useQuery<Bar | null>({
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
  React.useEffect(() => {
    if (!barLoading && bar && profile && bar.owner_id !== profile.id) {
      toast.show({ type: 'error', text1: 'Access denied', text2: 'You are not the owner of this bar.' });
      router.replace('/(admin)/admin-panel');
    }
  }, [barLoading, bar, profile, router, toast]);

  // RHF setup
  const { control, handleSubmit, reset, formState: { errors, isDirty } } = useForm<BarFormValues>({
    resolver: zodResolver(barFormSchema),
    defaultValues: {
      name: '',
      address: '',
      location: '',
      description: '',
    },
  });

  // Populate form when bar loads
  React.useEffect(() => {
    if (bar) {
      reset({
        name: bar.name || '',
        address: bar.address || '',
        location:
          typeof bar.location === 'string'
            ? bar.location
            : bar.location
              ? JSON.stringify(bar.location)
              : '',
        description: bar.description || '',
      });
    }
  }, [bar, reset]);

  // Mutation for updating bar
  const updateBar = useMutation({
    mutationFn: async (values: BarFormValues) => {
      const { error } = await supabase
        .from('bars')
        .update(values)
        .eq('id', barId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bar', barId] });
      toast.show({ type: 'success', text1: 'Bar updated!' });
    },
    onError: (err: any) => {
      toast.show({ type: 'error', text1: 'Failed to update bar', text2: err?.message });
    },
  });

  const onSubmit = (values: BarFormValues) => {
    updateBar.mutate(values);
  };

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
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Section 1: Bar Information */}
        <BarInfoSection 
          control={control}
          errors={errors}
          onSubmit={handleSubmit(onSubmit)}
          isSubmitting={updateBar.isPending}
          isDirty={isDirty}
        />
        
        {/* Section 2: Operating Hours */}
        <BarOperatingHours barId={barId as string} />
        
        {/* Section 3: Seating Options */}
        <View className="px-0 pt-6">
          <BarSeatOptions barId={barId as string} />
        </View>
      </ScrollView>
    </View>
  );
};

export default EditBarScreen;