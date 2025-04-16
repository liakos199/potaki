import { useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TextInput,
  Pressable,
  ScrollView, // Import ScrollView
  KeyboardAvoidingView, // Import KeyboardAvoidingView
  Platform, // Import Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBar } from '@/src/features/bars/api';
import type { CreateBarInput } from '@/src/features/bars/types';

import { useForm, Controller, SubmitHandler, Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

// Validation Schema (coerces lat/lon to number)
const createBarSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long'),
  address: z.string().min(5, 'Address must be at least 5 characters long'),
  phone: z.string().min(5, 'Phone number must be at least 5 characters long'),
  latitude: z.coerce
    .number({ invalid_type_error: 'Latitude must be a number' })
    .min(-90, 'Latitude must be >= -90')
    .max(90, 'Latitude must be <= 90'),
  longitude: z.coerce
    .number({ invalid_type_error: 'Longitude must be a number' })
    .min(-180, 'Longitude must be >= -180')
    .max(180, 'Longitude must be <= 180'),
});

// Type for the Zod schema's OUTPUT (validated data with numbers)
type BarFormData = z.infer<typeof createBarSchema>;


const CreateBarScreen = (): JSX.Element => {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const createBarMutation = useMutation({
    mutationFn: (input: CreateBarInput) => {
      if (!profile?.id) {
        // This should ideally not happen if the auth check passes, but good for safety
        return Promise.reject(new Error("User profile not loaded or missing ID."));
      }
      return createBar(input, profile.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-bars', profile?.id] });
      router.replace('/(admin)/admin-panel');
    },
    onError: (err: any) => {
       const message = err?.details || err?.message || 'Failed to create bar. Please check your input and try again.';
       setError(message);
       console.error("Create Bar Error:", err);
    },
  });

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<BarFormData>({
    resolver: zodResolver(createBarSchema) as Resolver<BarFormData>,
    defaultValues: {
      name: '',
      address: '',
      phone: '',
      latitude: '' as unknown as number,
      longitude: '' as unknown as number,
    },
    mode: 'onBlur', // Validate on blur
  });

  const handleFormSubmit: SubmitHandler<BarFormData> = (validatedData) => {
    setError(null);
    const inputData: CreateBarInput = {
      name: validatedData.name,
      address: validatedData.address,
      phone: validatedData.phone,
      // Supabase/Postgres expects 'POINT(longitude latitude)' (WKT format)
      location: `POINT(${validatedData.longitude} ${validatedData.latitude})`,
    };
    createBarMutation.mutate(inputData);
  };

  const isLoading = createBarMutation.isPending;

  // Authorization check
  if (!profile || profile.role !== 'owner') {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-4">
        <View className="bg-white p-6 rounded-lg shadow-md">
          <Text className="text-lg text-center text-red-600 font-semibold mb-2">Unauthorized Access</Text>
          <Text className="text-gray-600 text-center">
            Only bar owners can create new venues. Please log in with an owner account.
          </Text>
        </View>
      </View>
    );
  }

  return (
    // Use KeyboardAvoidingView and ScrollView for better form usability
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0} // Adjust offset if needed
    >
      <ScrollView
        className="flex-1 bg-gray-50"
        contentContainerStyle={{ flexGrow: 1 }} // Ensure ScrollView grows
        keyboardShouldPersistTaps="handled" // Dismiss keyboard on tap outside inputs
      >
        {/* Header */}
        <View className="bg-white px-4 pt-12 pb-4 border-b border-gray-200 shadow-sm">
          <Text className="text-xl font-bold text-gray-800">Create a New Bar</Text>
          <Text className="text-sm text-gray-500 mt-1">
            Enter details about your new venue
          </Text>
        </View>

        {/* Form Container */}
        <View className="flex-1 px-4 py-6">
          {/* Global Error Display Area */}
          {error && !isLoading && (
            <View className="mb-4 bg-red-100 p-3 rounded-lg border border-red-300">
              <Text className="text-red-700 font-medium">Error Creating Bar</Text>
              {/* Ensure 'error' state is always rendered within Text */}
              <Text className="text-red-600 mt-1">{error}</Text>
            </View>
          )}

          {isLoading ? (
            <View className="flex-1 items-center justify-center py-8">
              <ActivityIndicator size="large" color="#4f46e5" />
              <Text className="text-gray-600 mt-4 text-lg">Creating your bar...</Text>
            </View>
          ) : (
            <View className="bg-white rounded-lg shadow-sm p-4">
              {/* --- Start: Form JSX --- */}
              <View className="w-full">
                {/* Name Input */}
                <View className="mb-3">
                  <Text className="text-sm font-medium text-gray-700 mb-1 ml-1">Bar Name</Text>
                  <Controller
                    control={control}
                    name="name"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        className={`border ${errors.name ? 'border-red-500' : 'border-gray-300'} rounded-md px-3 py-2.5 text-base bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500`}
                        placeholder="e.g., The Tipsy Tavern"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value ?? ''} // Ensures value is always a string
                        editable={!isLoading}
                        accessibilityLabel="Bar name input"
                        placeholderTextColor="#9ca3af"
                        autoCapitalize="words"
                      />
                    )}
                  />
                  {/* Explicitly check and render error message within Text */}
                  {errors.name?.message && (
                    <Text className="text-red-600 text-xs mt-1 ml-1">
                      {errors.name.message}
                    </Text>
                  )}
                </View>

                {/* Address Input */}
                <View className="mb-3">
                  <Text className="text-sm font-medium text-gray-700 mb-1 ml-1">Address</Text>
                  <Controller
                    control={control}
                    name="address"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        className={`border ${errors.address ? 'border-red-500' : 'border-gray-300'} rounded-md px-3 py-2.5 text-base bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500`}
                        placeholder="e.g., 123 Main Street, Anytown"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value ?? ''} // Ensures value is always a string
                        editable={!isLoading}
                        accessibilityLabel="Bar address input"
                        placeholderTextColor="#9ca3af"
                        autoCapitalize="words"
                      />
                    )}
                  />
                  {/* Explicitly check and render error message within Text */}
                  {errors.address?.message && (
                    <Text className="text-red-600 text-xs mt-1 ml-1">
                      {errors.address.message}
                    </Text>
                  )}
                </View>

                {/* Phone Input */}
                <View className="mb-3">
                  <Text className="text-sm font-medium text-gray-700 mb-1 ml-1">Phone Number</Text>
                  <Controller
                    control={control}
                    name="phone"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        className={`border ${errors.phone ? 'border-red-500' : 'border-gray-300'} rounded-md px-3 py-2.5 text-base bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500`}
                        placeholder="(555) 123-4567"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value ?? ''} // Ensures value is always a string
                        editable={!isLoading}
                        accessibilityLabel="Bar phone input"
                        keyboardType="phone-pad"
                        placeholderTextColor="#9ca3af"
                        textContentType="telephoneNumber"
                      />
                    )}
                  />
                  {/* Explicitly check and render error message within Text */}
                  {errors.phone?.message && (
                    <Text className="text-red-600 text-xs mt-1 ml-1">
                      {errors.phone.message}
                    </Text>
                  )}
                </View>

                {/* Lat/Lon Inputs */}
                <View className="mb-3">
                  <Text className="text-sm font-medium text-gray-700 mb-1 ml-1">Location Coordinates</Text>
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Controller
                        control={control}
                        name="latitude"
                        render={({ field: { onChange, onBlur, value } }) => (
                          <TextInput
                            className={`border ${errors.latitude ? 'border-red-500' : 'border-gray-300'} rounded-md px-3 py-2.5 text-base bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500`}
                            placeholder="Latitude"
                            onBlur={onBlur}
                            onChangeText={onChange}
                            // More robust check for value before String conversion
                            value={(value === null || value === undefined) ? '' : String(value)}
                            editable={!isLoading}
                            accessibilityLabel="Bar latitude input"
                            keyboardType="default"
                            placeholderTextColor="#9ca3af"
                            autoCapitalize="none"
                            autoCorrect={false}
                          />
                        )}
                      />
                      {/* Explicitly check and render error message within Text */}
                      {errors.latitude?.message && (
                        <Text className="text-red-600 text-xs mt-1 ml-1">
                          {errors.latitude.message}
                        </Text>
                      )}
                    </View>
                    <View className="flex-1">
                      <Controller
                        control={control}
                        name="longitude"
                        render={({ field: { onChange, onBlur, value } }) => (
                          <TextInput
                            className={`border ${errors.longitude ? 'border-red-500' : 'border-gray-300'} rounded-md px-3 py-2.5 text-base bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500`}
                            placeholder="Longitude"
                            onBlur={onBlur}
                            onChangeText={onChange}
                             // More robust check for value before String conversion
                            value={(value === null || value === undefined) ? '' : String(value)}
                            editable={!isLoading}
                            accessibilityLabel="Bar longitude input"
                            keyboardType="default"
                            placeholderTextColor="#9ca3af"
                            autoCapitalize="none"
                            autoCorrect={false}
                          />
                        )}
                      />
                      {/* Explicitly check and render error message within Text */}
                      {errors.longitude?.message && (
                        <Text className="text-red-600 text-xs mt-1 ml-1">
                          {errors.longitude.message}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Text className="text-xs text-gray-500 mt-1 ml-1">Enter precise GPS coordinates. Use '-' for West/South.</Text>
                </View>

                {/* Submit Button */}
                <Pressable
                  className={`py-3 rounded-md items-center mt-4 ${isLoading ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'}`}
                  onPress={handleSubmit(handleFormSubmit)}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Create bar button"
                  accessibilityState={{ disabled: isLoading }}
                >
                  <Text className="text-white font-semibold text-base">
                    {isLoading ? 'Creating...' : 'Create Bar'}
                  </Text>
                </Pressable>
              </View>
              {/* --- End: Form JSX --- */}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default CreateBarScreen;