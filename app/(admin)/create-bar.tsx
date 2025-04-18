import React from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { supabase } from '@/src/lib/supabase';
import type { TablesInsert } from '@/src/lib/database.types';
import { useToast } from '@/src/components/general/Toast';

const createBarSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  address: z.string().min(5, 'Address is required'),
  latitude: z.coerce.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
  longitude: z.coerce.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
});
type CreateBarValues = z.infer<typeof createBarSchema>;

const createBar = async (data: TablesInsert<'bars'>) => {
  const { error } = await supabase.from('bars').insert([data]);
  if (error) throw error;
};

const CreateBarScreen = (): JSX.Element => {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { control, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<CreateBarValues>({
    resolver: zodResolver(createBarSchema),
    defaultValues: { name: '', address: '', latitude: undefined, longitude: undefined },
  });
  const toast = useToast();

  const onSubmit = async (values: CreateBarValues) => {
    if (!user) {
      toast.show({ type: 'error', text1: 'Not authenticated' });
      return;
    }
    try {
      const { latitude, longitude, ...rest } = values;
      await createBar({
        ...rest,
        owner_id: user.id,
        location: `POINT(${longitude} ${latitude})`,
      } as TablesInsert<'bars'>);
      toast.show({ type: 'success', text1: 'Bar created!' });
      reset();
      router.replace('/admin-panel');
    } catch (err: any) {
      const errorMsg = err?.message || err?.error_description || 'An unknown error occurred';
      toast.show({ type: 'error', text1: 'Error', text2: errorMsg });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white px-4 justify-center">
      <Text className="text-2xl font-bold mb-6">Create Bar</Text>
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
        className="bg-black py-3 rounded items-center"
        onPress={handleSubmit(onSubmit)}
        accessibilityRole="button"
        accessibilityLabel="Create Bar"
        disabled={isSubmitting}
        style={isSubmitting ? { opacity: 0.6 } : undefined}
      >
        <Text className="text-white font-bold">{isSubmitting ? 'Creating...' : 'Create Bar'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default CreateBarScreen;
