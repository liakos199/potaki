import { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, ActivityIndicator, Alert, TouchableOpacity, StatusBar, Keyboard } from 'react-native';
import { SeatOptionsSection } from '@/src/features/owner-components/SeatOptionsSection';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchOwnerBars, updateBar } from '@/src/features/bars/api';
import { SaveButton } from '@/src/features/owner-components/SaveButton';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Edit2, AlertCircle, Plus } from 'lucide-react-native';
import type { UpdateBarInput } from '@/src/features/bars/types';

// Schema definition for form validation
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

// Field type for our data display
type FieldType = {
  key: keyof BarFormInput | 'location';
  label: string;
  formatter?: (bar: any) => string;
};

const EditBarScreen = (): JSX.Element => {
  const [seatDirty, setSeatDirty] = useState(false);
  const [seatSaving, setSeatSaving] = useState(false);
  const router = useRouter();
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [currentField, setCurrentField] = useState<keyof BarFormInput | 'location' | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // Fetch all bars for owner, then find the one by barId
  const { data: bars, isLoading: barsLoading, error: barsError } = useQuery({
    queryKey: ['owner-bars', profile?.id],
    queryFn: () => fetchOwnerBars(profile!.id),
    enabled: !!profile?.id,
  });
  const bar = bars?.find((b) => b.id === barId);

  // Parse WKT 'POINT(lon lat)' to { latitude, longitude }
  function parseLocation(location?: string | null): { latitude: number; longitude: number } {
    if (!location || typeof location !== 'string') return { latitude: 0, longitude: 0 };
    const match = location.match(/^POINT\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)$/);
    if (!match) return { latitude: 0, longitude: 0 };
    const [, lon, lat] = match;
    return { latitude: Number(lat), longitude: Number(lon) };
  }

  // Convert lon/lat to WKT
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
      setKeyboardOffset(e.endCoordinates.height / 3);
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

  const openEditModal = (field: keyof BarFormInput | 'location') => {
    if (bar) {
      setCurrentField(field);
      setModalOpen(true);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrentField(null);
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
      setCurrentField(null);
      Alert.alert('Success', 'Bar updated successfully!');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.message || 'Could not update bar.');
    },
  });

  // Define all fields for display
  const fields: FieldType[] = [
    { key: 'name', label: 'Bar Name' },
    { key: 'address', label: 'Address' },
    { key: 'phone', label: 'Phone Number' },
    { key: 'website', label: 'Website' },
    { key: 'description', label: 'Description' },
    { 
      key: 'location', 
      label: 'Location (doesnt work)', 
      formatter: (barData) => {
        const { latitude, longitude } = parseLocation(barData?.location);
        return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      }
    },
  ];

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

  const getFieldValue = (key: keyof BarFormInput | 'location') => {
    if (key === 'location') {
      return fields.find(f => f.key === 'location')?.formatter?.(bar) || 'Not set';
    }
    
    const value = bar[key as keyof typeof bar];
    return value ? String(value) : 'Not set';
  };

  const handleSave = (data: BarFormInput) => {
    let updateData: UpdateBarInput = {
      id: bar.id,
      name: bar.name, // Default values
      address: bar.address || '',
      phone: bar.phone || '',
      location: bar.location || '',
    };

    // Only include the edited field
    if (currentField === 'name') updateData.name = data.name;
    else if (currentField === 'address') updateData.address = data.address;
    else if (currentField === 'phone') updateData.phone = data.phone;
    else if (currentField === 'website') updateData.website = data.website || undefined;
    else if (currentField === 'description') updateData.description = data.description || undefined;
    else if (currentField === 'location') {
      updateData.location = toWKTLocation(data.longitude, data.latitude);
    }

    mutation.mutate(updateData);
  };

  return (
    <View className="flex-1 bg-black">
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View className="px-5 pt-12 pb-4 bg-zinc-900 border-b border-zinc-800 shadow-sm">
        <Text className="text-2xl font-bold text-gray-100 text-center">Bar Details</Text>
        <Text className="text-purple-400 text-sm mt-1 text-center">{bar.name}</Text>
      </View>
      
      {/* Content */}
      <ScrollView className="flex-1 px-4">
        <View className="pt-4 pb-8">
          {fields.map((field) => (
            <View 
              key={field.key} 
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-sm text-gray-400 mb-1">{field.label}</Text>
                  <Text 
                    className={`text-base ${getFieldValue(field.key) === 'Not set' ? 'text-gray-500 italic' : 'text-gray-200'}`}
                    numberOfLines={field.key === 'description' ? 3 : 1}
                  >
                    {getFieldValue(field.key)}
                  </Text>
                </View>
                <TouchableOpacity
                  className="p-2 bg-zinc-800 rounded-lg ml-3"
                  onPress={() => openEditModal(field.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${field.label}`}
                  activeOpacity={0.7}
                >
                  {getFieldValue(field.key) === 'Not set' ? 
                    <Plus size={18} color="#a855f7" /> : 
                    <Edit2 size={18} color="#a855f7" />
                  }
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
        {/* Seat Options Section */}
        <View className="mt-8">
          <SeatOptionsSection
            barId={bar.id}
            onDirtyStateChange={setSeatDirty}
            isSaving={seatSaving}
            onSaveComplete={() => setSeatSaving(false)}
          />
        </View>
        {seatDirty && (
          <View className="absolute left-0 right-0 bottom-0 w-full pb-6 pt-3 z-50 flex items-center justify-center bg-gradient-to-t from-black to-transparent">
            <View className="w-full max-w-md flex items-center px-5">
              <SaveButton
                onPress={() => setSeatSaving(true)}
                loading={seatSaving}
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Edit Modal */}
      {modalOpen && currentField && (
        <View className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50" style={{ paddingBottom: keyboardOffset }}>
          <View className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl mx-4 px-6 py-6">
            <Text className="text-xl font-bold mb-5 text-purple-300">
              {getFieldValue(currentField) === 'Not set' ? `Add ${fields.find(f => f.key === currentField)?.label}` : `Edit ${fields.find(f => f.key === currentField)?.label}`}
            </Text>

            {/* Single field edit */}
            {currentField === 'name' && (
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
            )}

            {currentField === 'address' && (
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
            )}

            {currentField === 'phone' && (
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
            )}

            {currentField === 'website' && (
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
            )}

            {currentField === 'description' && (
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
                      numberOfLines={4}
                      style={{ minHeight: 100, textAlignVertical: 'top' }}
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
            )}

            {currentField === 'location' && (
              <View className="mb-4">
                <View className="flex-row gap-3 mb-2">
                  <View className="flex-1">
                    <Text className="text-gray-400 text-xs mb-1 pl-1">Latitude</Text>
                    <Controller
                      control={control}
                      name="latitude"
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          className="border border-zinc-700 rounded-lg px-4 py-3.5 text-base bg-zinc-800 text-gray-200"
                          placeholder="Latitude"
                          placeholderTextColor="#71717a"
                          onBlur={onBlur}
                          onChangeText={(text) => onChange(parseFloat(text) || 0)}
                          value={String(value)}
                          editable={!mutation.isPending}
                          accessibilityLabel="Bar latitude input"
                          keyboardType="decimal-pad"
                          returnKeyType="done"
                        />
                      )}
                    />
                    {errors.latitude && (
                      <View className="flex-row items-center mt-1">
                        <AlertCircle size={14} color="#f87171" />
                        <Text className="text-red-400 ml-1 text-xs">{errors.latitude.message}</Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-400 text-xs mb-1 pl-1">Longitude</Text>
                    <Controller
                      control={control}
                      name="longitude"
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          className="border border-zinc-700 rounded-lg px-4 py-3.5 text-base bg-zinc-800 text-gray-200"
                          placeholder="Longitude"
                          placeholderTextColor="#71717a"
                          onBlur={onBlur}
                          onChangeText={(text) => onChange(parseFloat(text) || 0)}
                          value={String(value)}
                          editable={!mutation.isPending}
                          accessibilityLabel="Bar longitude input"
                          keyboardType="decimal-pad"
                          returnKeyType="done"
                        />
                      )}
                    />
                    {errors.longitude && (
                      <View className="flex-row items-center mt-1">
                        <AlertCircle size={14} color="#f87171" />
                        <Text className="text-red-400 ml-1 text-xs">{errors.longitude.message}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}
            
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
                  onPress={handleSubmit(handleSave)}
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