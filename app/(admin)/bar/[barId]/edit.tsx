import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, TouchableOpacity, StatusBar, Keyboard } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchOwnerBars, updateBar } from '@/src/features/bars/api';
import { SaveButton } from '@/src/features/owner-components/SaveButton';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Edit2, AlertCircle } from 'lucide-react-native';
import type { UpdateBarInput } from '@/src/features/bars/types';

const barSchema = z.object({
  name: z.string().min(2, 'Name is too short'),
  address: z.string().min(5, 'Address is too short'),
  phone: z.string().min(5, 'Phone is too short'),
  website: z.string().url('Website must be a valid URL').optional().or(z.literal('')),
  description: z.string().optional(),
  latitude: z.coerce.number().min(-90, 'Latitude must be >= -90').max(90, 'Latitude must be <= 90'),
  longitude: z.coerce.number().min(-180, 'Longitude must be >= -180').max(180, 'Longitude must be <= 180'),
});
type BarFormInput = z.infer<typeof barSchema>;

const EditBarScreen = (): JSX.Element => {
  const router = useRouter();
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // Fetch all bars for owner, then find the one by barId
  const { data: bars, isLoading: barsLoading, error: barsError } = useQuery({
    queryKey: ['owner-bars', profile?.id],
    queryFn: () => fetchOwnerBars(profile!.id),
    enabled: !!profile?.id,
  });
  const bar = bars?.find((b) => b.id === barId);

  // --- Utility: Parse WKT 'POINT(lon lat)' to { latitude, longitude }
function parseLocation(location?: string | null): { latitude: number; longitude: number } {
  if (!location || typeof location !== 'string') return { latitude: 0, longitude: 0 };
  const match = location.match(/^POINT\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)$/);
  if (!match) return { latitude: 0, longitude: 0 };
  const [, lon, lat] = match;
  return { latitude: Number(lat), longitude: Number(lon) };
}
// --- Utility: Convert lon/lat to WKT
function toWKTLocation(lon: number, lat: number): string {
  return `POINT(${lon} ${lat})`;
}

// Form setup
  const { control, handleSubmit, formState: { errors, isDirty }, reset } = useForm<BarFormInput>({
    resolver: zodResolver(barSchema),
    defaultValues: {
  name: bar?.name ?? '',
  address: bar?.address ?? '',
  phone: bar?.phone ?? '',
  website: bar?.website ?? '',
  description: bar?.description ?? '',
  ...parseLocation(bar?.location),
},
    mode: 'onChange',
  });

  // Keyboard handling
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardOffset(e.endCoordinates.height / 3); // Move modal up by 1/3 of keyboard height
    });
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardOffset(0);
    });

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  // Keep form in sync with bar data
  useEffect(() => {
    if (bar) {
      reset({
        name: bar.name,
        address: bar.address ?? '',
        phone: bar.phone ?? '',
        website: bar.website ?? '',
        description: bar.description ?? '',
        ...parseLocation(bar.location),
      });
    }
  }, [bar, reset]);

  const openEditModal = () => {
    if (bar) {
      reset({ name: bar.name });
      setModalOpen(true);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    reset({
    name: bar?.name ?? '',
    address: bar?.address ?? '',
    phone: bar?.phone ?? '',
    website: bar?.website ?? '',
    description: bar?.description ?? '',
    ...parseLocation(bar?.location),
  });
  };

  const mutation = useMutation({
    mutationFn: (input: UpdateBarInput) => updateBar(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-bars', profile?.id] });
      setModalOpen(false);
      Alert.alert('Success', 'Bar updated successfully!');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.message || 'Could not update bar.');
    },
  });

  if (barsLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  if (barsError || !bar) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <StatusBar barStyle="light-content" />
        <Text className="text-lg text-red-400">Bar not found or failed to load.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View className="px-5 pt-12 pb-4 bg-zinc-900 border-b border-zinc-800 shadow-sm">
        <Text className="text-2xl font-bold text-gray-100 text-center">Manage Bar Info</Text>
        <Text className="text-purple-400 text-sm mt-1 text-center">Update your bar details</Text>
      </View>
      
      {/* Bar details display - Title, Value, Edit button layout */}
      <View className="w-full mt-6 px-4">
        <View className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm text-gray-400 mb-1">Bar Name</Text>
              <Text className="text-lg text-gray-200 font-medium">{bar.name}</Text>
            </View>
            <TouchableOpacity
              className="p-2 bg-zinc-800 rounded-lg"
              onPress={openEditModal}
              accessibilityRole="button"
              accessibilityLabel="Edit bar name"
              activeOpacity={0.7}
            >
              <Edit2 size={18} color="#a855f7" />
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Add additional fields here with same layout pattern */}
      </View>

      {/* Edit Modal */}
      {modalOpen && (
        <View className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50" style={{ paddingBottom: keyboardOffset }}>
          <View className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl mx-4 px-6 py-6">
            <Text className="text-xl font-bold mb-5 text-purple-300">Edit Bar Details</Text>

            {/* Name */}
            <View className="mb-4">
              <Controller
                control={control}
                name="name"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    className="border border-zinc-700 rounded-lg px-4 py-3.5 text-base bg-zinc-800 text-gray-200"
                    placeholder="Bar name"
                    placeholderTextColor="#71717a"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    editable={!mutation.isPending}
                    accessibilityLabel="Bar name input"
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="done"
                  />
                )}
              />
              {errors.name && (
                <View className="flex-row items-center mt-2">
                  <AlertCircle size={16} color="#f87171" />
                  <Text className="text-red-400 ml-1">{errors.name.message}</Text>
                </View>
              )}
            </View>

            {/* Address */}
            <View className="mb-4">
              <Controller
                control={control}
                name="address"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    className="border border-zinc-700 rounded-lg px-4 py-3.5 text-base bg-zinc-800 text-gray-200"
                    placeholder="Address"
                    placeholderTextColor="#71717a"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    editable={!mutation.isPending}
                    accessibilityLabel="Bar address input"
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="done"
                  />
                )}
              />
              {errors.address && (
                <View className="flex-row items-center mt-2">
                  <AlertCircle size={16} color="#f87171" />
                  <Text className="text-red-400 ml-1">{errors.address.message}</Text>
                </View>
              )}
            </View>

            {/* Phone */}
            <View className="mb-4">
              <Controller
                control={control}
                name="phone"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    className="border border-zinc-700 rounded-lg px-4 py-3.5 text-base bg-zinc-800 text-gray-200"
                    placeholder="Phone"
                    placeholderTextColor="#71717a"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    editable={!mutation.isPending}
                    accessibilityLabel="Bar phone input"
                    keyboardType="phone-pad"
                    returnKeyType="done"
                  />
                )}
              />
              {errors.phone && (
                <View className="flex-row items-center mt-2">
                  <AlertCircle size={16} color="#f87171" />
                  <Text className="text-red-400 ml-1">{errors.phone.message}</Text>
                </View>
              )}
            </View>

            {/* Website */}
            <View className="mb-4">
              <Controller
                control={control}
                name="website"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    className="border border-zinc-700 rounded-lg px-4 py-3.5 text-base bg-zinc-800 text-gray-200"
                    placeholder="Website (optional)"
                    placeholderTextColor="#71717a"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    editable={!mutation.isPending}
                    accessibilityLabel="Bar website input"
                    keyboardType="url"
                    returnKeyType="done"
                  />
                )}
              />
              {errors.website && (
                <View className="flex-row items-center mt-2">
                  <AlertCircle size={16} color="#f87171" />
                  <Text className="text-red-400 ml-1">{errors.website.message}</Text>
                </View>
              )}
            </View>

            {/* Description */}
            <View className="mb-4">
              <Controller
                control={control}
                name="description"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    className="border border-zinc-700 rounded-lg px-4 py-3.5 text-base bg-zinc-800 text-gray-200"
                    placeholder="Description (optional)"
                    placeholderTextColor="#71717a"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    editable={!mutation.isPending}
                    accessibilityLabel="Bar description input"
                    multiline
                    numberOfLines={3}
                    style={{ minHeight: 60, textAlignVertical: 'top' }}
                  />
                )}
              />
              {errors.description && (
                <View className="flex-row items-center mt-2">
                  <AlertCircle size={16} color="#f87171" />
                  <Text className="text-red-400 ml-1">{errors.description.message}</Text>
                </View>
              )}
            </View>

            {/* Location */}
            <View className="mb-4 flex-row gap-2">
              <View className="flex-1">
                <Controller
                  control={control}
                  name="latitude"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className="border border-zinc-700 rounded-lg px-4 py-3.5 text-base bg-zinc-800 text-gray-200"
                      placeholder="Latitude"
                      placeholderTextColor="#71717a"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={String(value)}
                      editable={!mutation.isPending}
                      accessibilityLabel="Bar latitude input"
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                    />
                  )}
                />
                {errors.latitude && (
                  <View className="flex-row items-center mt-2">
                    <AlertCircle size={16} color="#f87171" />
                    <Text className="text-red-400 ml-1">{errors.latitude.message}</Text>
                  </View>
                )}
              </View>
              <View className="flex-1">
                <Controller
                  control={control}
                  name="longitude"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className="border border-zinc-700 rounded-lg px-4 py-3.5 text-base bg-zinc-800 text-gray-200"
                      placeholder="Longitude"
                      placeholderTextColor="#71717a"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={String(value)}
                      editable={!mutation.isPending}
                      accessibilityLabel="Bar longitude input"
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                    />
                  )}
                />
                {errors.longitude && (
                  <View className="flex-row items-center mt-2">
                    <AlertCircle size={16} color="#f87171" />
                    <Text className="text-red-400 ml-1">{errors.longitude.message}</Text>
                  </View>
                )}
              </View>
            </View>
            
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-3.5 rounded-lg bg-zinc-800 items-center border border-zinc-700"
                onPress={closeModal}
                disabled={mutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                activeOpacity={0.7}
              >
                <Text className="text-gray-300 font-semibold text-base">Cancel</Text>
              </TouchableOpacity>
              <View className="flex-1">
                <SaveButton
                  onPress={handleSubmit((data) => mutation.mutate({
  id: bar.id,
  name: data.name,
  address: data.address,
  phone: data.phone,
  website: data.website || undefined,
  description: data.description || undefined,
  location: toWKTLocation(data.longitude, data.latitude),
}))}
                  loading={mutation.isPending}
                  disabled={!isDirty || mutation.isPending}
                />
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default EditBarScreen;