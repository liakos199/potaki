import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { supabase } from '@/src/lib/supabase';
import type { Database } from '@/src/lib/database.types';

const barSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  address: z.string().min(5, 'Address is required'),
  latitude: z.coerce.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
  longitude: z.coerce.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
});
type BarFormValues = z.infer<typeof barSchema>;

type Bar = Database['public']['Tables']['bars']['Row'];

const EditBarScreen = (): JSX.Element => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const profile = useAuthStore((s) => s.profile);

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
      Toast.show({ type: 'error', text1: 'Access denied', text2: 'You are not the owner of this bar.' });
      router.replace('/(admin)/admin-panel');
    }
  }, [barLoading, bar, profile, router]);

  // Extract lat/lon from WKT POINT string
  function parsePoint(location: string | null): { latitude: number | undefined, longitude: number | undefined } {
    if (!location) return { latitude: undefined, longitude: undefined };
    const match = location.match(/POINT\\(([-\d.]+) ([-\d.]+)\\)/);
    if (match) {
      return { longitude: parseFloat(match[1]), latitude: parseFloat(match[2]) };
    }
    return { latitude: undefined, longitude: undefined };
  }

  // Setup form
  const { control, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<BarFormValues>({
    resolver: zodResolver(barSchema),
    defaultValues: React.useMemo(() => {
      if (!bar) return { name: '', address: '', latitude: undefined, longitude: undefined };
      const { latitude, longitude } = parsePoint(bar.location as string);
      return {
        name: bar.name || '',
        address: bar.address || '',
        latitude,
        longitude,
      };
    }, [bar]),
  });

  // When bar loads, reset form with latest values
  React.useEffect(() => {
    if (bar) {
      const { latitude, longitude } = parsePoint(bar.location as string);
      reset({
        name: bar.name || '',
        address: bar.address || '',
        latitude,
        longitude,
      });
    }
  }, [bar, reset]);

  // Mutation for updating bar
  const mutation = useMutation({
    mutationFn: async (values: BarFormValues) => {
      const { latitude, longitude, ...rest } = values;
      const { error } = await supabase
        .from('bars')
        .update({
          ...rest,
          location: `POINT(${longitude} ${latitude})`,
        })
        .eq('id', barId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bar', barId] });
      queryClient.invalidateQueries({ queryKey: ['bars', profile?.id] });
      Toast.show({ type: 'success', text1: 'Bar updated!' });
      router.replace(`/(admin)/bar/${barId}`);
    },
    onError: (err: any) => {
      Toast.show({ type: 'error', text1: 'Error updating bar', text2: err?.message || 'Unknown error' });
    },
  });

  const onSubmit = (values: BarFormValues) => {
    mutation.mutate(values);
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
        <TouchableOpacity className="mt-4 px-6 py-3 bg-indigo-600 rounded-lg" onPress={() => router.replace('/(admin)/admin-panel')}>
          <Text className="text-white font-bold">Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white px-4 pt-12">
      <Text className="text-2xl font-bold mb-6">Edit Bar</Text>
      <View className="mb-4">
        <Text className="mb-1">Name</Text>
        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              className="border rounded px-3 py-2 mb-1"
              placeholder="Bar Name"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              accessible accessibilityLabel="Bar Name"
            />
          )}
        />
        {errors.name && <Text className="text-red-500 text-xs">{errors.name.message}</Text>}
      </View>
      <View className="mb-4">
        <Text className="mb-1">Address</Text>
        <Controller
          control={control}
          name="address"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              className="border rounded px-3 py-2 mb-1"
              placeholder="Address"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              accessible accessibilityLabel="Bar Address"
            />
          )}
        />
        {errors.address && <Text className="text-red-500 text-xs">{errors.address.message}</Text>}
      </View>
      <View className="mb-4">
        <Text className="mb-1">Latitude</Text>
        <Controller
          control={control}
          name="latitude"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              className="border rounded px-3 py-2 mb-1"
              placeholder="Latitude (e.g., 37.9838)"
              keyboardType="numeric"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value == null ? '' : value.toString()}
              accessible accessibilityLabel="Bar Latitude"
            />
          )}
        />
        {errors.latitude && <Text className="text-red-500 text-xs">{errors.latitude.message}</Text>}
      </View>
      <View className="mb-4">
        <Text className="mb-1">Longitude</Text>
        <Controller
          control={control}
          name="longitude"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              className="border rounded px-3 py-2 mb-1"
              placeholder="Longitude (e.g., 23.7275)"
              keyboardType="numeric"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value == null ? '' : value.toString()}
              accessible accessibilityLabel="Bar Longitude"
            />
          )}
        />
        {errors.longitude && <Text className="text-red-500 text-xs">{errors.longitude.message}</Text>}
      </View>
      <TouchableOpacity
        className="bg-indigo-600 py-3 rounded items-center"
        onPress={handleSubmit(onSubmit)}
        accessibilityRole="button"
        accessibilityLabel="Save Changes"
        disabled={isSubmitting || mutation.isPending}
        style={isSubmitting || mutation.isPending ? { opacity: 0.6 } : undefined}
      >
        <Text className="text-white font-bold">{isSubmitting || mutation.isPending ? 'Saving...' : 'Save Changes'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        className="mt-4 py-3 rounded items-center border border-gray-200"
        onPress={() => router.replace(`/(admin)/bar/${barId}`)}
        accessibilityRole="button"
        accessibilityLabel="Cancel Edit"
      >
        <Text className="text-gray-700 font-medium">Cancel</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default EditBarScreen;
