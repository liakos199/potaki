import { useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/features/auth/store/auth-store'; // Adjust path as needed
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBar } from '@/src/features/bars/api'; // Adjust path as needed
import type { CreateBarInput } from '@/src/features/bars/types'; // Adjust path as needed

import { useForm, Controller, SubmitHandler, Resolver, FieldValues } from 'react-hook-form'; // Import FieldValues
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

// --- Helper function for Zod preprocess step ---
const preprocessEmptyStringToUndefined = (val: unknown): unknown => {
  if (typeof val === 'string' && val.trim() === '') {
    return undefined; // Convert empty string to undefined so Zod sees it as missing
  }
  return val; // Pass other values through
};

// --- Validation Schema (Defines Input -> Output transformation) ---
const createBarSchemaMinimal = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters long'),
  address: z.string().trim().min(5, 'Address must be at least 5 characters long'),
  latitude: z.preprocess(preprocessEmptyStringToUndefined, z.coerce
    .number({
      required_error: "Latitude is required",
      invalid_type_error: "Latitude must be a valid number",
     })
    .min(-90, 'Latitude must be >= -90')
    .max(90, 'Latitude must be <= 90')),
  longitude: z.preprocess(preprocessEmptyStringToUndefined, z.coerce
    .number({
      required_error: "Longitude is required",
      invalid_type_error: "Longitude must be a valid number",
     })
    .min(-180, 'Longitude must be >= -180')
    .max(180, 'Longitude must be <= 180')),
});

// --- Type Definitions ---
// 1. Type for the raw form input values (matches TextInputs)
type BarFormInputData = {
    name: string;
    address: string;
    latitude: string;
    longitude: string;
};

// 2. Type inferred from Zod schema (represents validated data with numbers)
type BarFormDataMinimalValidated = z.infer<typeof createBarSchemaMinimal>;
// Should be: { name: string; address: string; latitude: number; longitude: number; }


const CreateBarScreen = (): JSX.Element => {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const createBarMutation = useMutation({
    mutationFn: (input: CreateBarInput) => createBar(input),
    onSuccess: (newBarData) => {
      console.log('Bar created successfully with minimal input:', newBarData);
      queryClient.invalidateQueries({ queryKey: ['owner-bars', profile?.id] });
      queryClient.invalidateQueries({ queryKey: ['bars'] });
      router.replace('/(admin)/admin-panel');
    },
    onError: (err: any) => {
       const message = err?.message || err?.details || 'Failed to create bar. Please check your input and try again.';
       setError(message);
       console.error("Create Bar Error:", err);
    },
  });

  // --- Use the INPUT type for useForm ---
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<BarFormInputData>({ // Use the input type (strings for lat/lon)
    // --- Cast the resolver to align with useForm's expectation ---
    // We tell TS "trust me, this resolver works with BarFormInputData"
    // The internal workings of zodResolver handle the actual transformation.
    resolver: zodResolver(createBarSchemaMinimal) as unknown as Resolver<BarFormInputData, any>,
    // --- Default values match the INPUT type ---
    defaultValues: {
      name: '',
      address: '',
      latitude: '', // string default
      longitude: '', // string default
    },
    mode: 'onBlur',
  });

  // --- Submit handler type also matches useForm ---
  // We will cast the data *inside* the handler after Zod confirms validity
  const handleFormSubmit: SubmitHandler<BarFormInputData> = (formData) => {
    // At this point, Zod validation has passed.
    // We know the underlying data structure corresponds to BarFormDataMinimalValidated,
    // even though TypeScript thinks formData is BarFormInputData.
    // We cast it here to use the correct types (numbers) for the API call.
    const validatedData = formData as unknown as BarFormDataMinimalValidated;

    setError(null);

    if (!profile?.id) {
        setError("Cannot create bar: User profile is not loaded or missing ID.");
        console.error("User profile missing ID in handleFormSubmit");
        return;
    }

    // Use the cast validatedData with number types
    const inputData: CreateBarInput = {
      name: validatedData.name,
      address: validatedData.address,
      location: `POINT(${validatedData.longitude} ${validatedData.latitude})`,
      owner_id: profile.id,
    };

    console.log("Submitting minimal data:", inputData);
    createBarMutation.mutate(inputData);
  };

  const isLoading = createBarMutation.isPending;

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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <ScrollView
        className="flex-1 bg-gray-50"
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-white px-4 pt-12 pb-4 border-b border-gray-200 shadow-sm">
           <Text className="text-xl font-bold text-gray-800">Create a New Bar</Text>
           <Text className="text-sm text-gray-500 mt-1">Enter the required details for your new venue (* required).</Text>
        </View>

        <View className="flex-1 px-4 py-6">
          {error && !isLoading && (
            <View className="mb-4 bg-red-100 p-3 rounded-lg border border-red-300">
              <Text className="text-red-700 font-medium">Error Creating Bar</Text>
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
              <View className="w-full">
                {/* Name Input */}
                <View className="mb-3">
                  <Text className="text-sm font-medium text-gray-700 mb-1 ml-1">Bar Name *</Text>
                  <Controller control={control} name="name" render={({ field: { onChange, onBlur, value } }) => ( <TextInput className={`border ${errors.name ? 'border-red-500' : 'border-gray-300'} rounded-md px-3 py-2.5 text-base bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500`} placeholder="e.g., The Tipsy Tavern" onBlur={onBlur} onChangeText={onChange} value={value} editable={!isLoading} placeholderTextColor="#9ca3af" autoCapitalize="words" accessibilityLabel="Bar name input"/> )}/>
                  {errors.name?.message && <Text className="text-red-600 text-xs mt-1 ml-1">{errors.name.message}</Text>}
                </View>

                {/* Address Input */}
                <View className="mb-3">
                  <Text className="text-sm font-medium text-gray-700 mb-1 ml-1">Address *</Text>
                   <Controller control={control} name="address" render={({ field: { onChange, onBlur, value } }) => ( <TextInput className={`border ${errors.address ? 'border-red-500' : 'border-gray-300'} rounded-md px-3 py-2.5 text-base bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500`} placeholder="e.g., 123 Main Street, Anytown" onBlur={onBlur} onChangeText={onChange} value={value} editable={!isLoading} placeholderTextColor="#9ca3af" autoCapitalize="words" accessibilityLabel="Bar address input"/> )}/>
                   {errors.address?.message && <Text className="text-red-600 text-xs mt-1 ml-1">{errors.address.message}</Text>}
                </View>

                {/* Location Coordinates Inputs */}
                <View className="mb-3">
                   <Text className="text-sm font-medium text-gray-700 mb-1 ml-1">Location Coordinates *</Text>
                   <View className="flex-row gap-3">
                     {/* Latitude Input */}
                     <View className="flex-1">
                       <Controller
                         control={control}
                         name="latitude" // Corresponds to BarFormInputData.latitude (string)
                         render={({ field: { onChange, onBlur, value } }) => (
                           <TextInput
                             className={`border ${errors.latitude ? 'border-red-500' : 'border-gray-300'} rounded-md px-3 py-2.5 text-base bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500`}
                             placeholder="Latitude"
                             onBlur={onBlur}
                             onChangeText={onChange}
                             // Value is string from useForm state
                             value={value}
                             editable={!isLoading}
                             keyboardType="default"
                             placeholderTextColor="#9ca3af"
                             autoCapitalize="none"
                             autoCorrect={false}
                             accessibilityLabel="Bar latitude input"
                           />
                         )}
                       />
                       {errors.latitude?.message && <Text className="text-red-600 text-xs mt-1 ml-1">{errors.latitude.message}</Text>}
                     </View>
                     {/* Longitude Input */}
                     <View className="flex-1">
                       <Controller
                         control={control}
                         name="longitude" // Corresponds to BarFormInputData.longitude (string)
                         render={({ field: { onChange, onBlur, value } }) => (
                           <TextInput
                             className={`border ${errors.longitude ? 'border-red-500' : 'border-gray-300'} rounded-md px-3 py-2.5 text-base bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500`}
                             placeholder="Longitude"
                             onBlur={onBlur}
                             onChangeText={onChange}
                             // Value is string from useForm state
                             value={value}
                             editable={!isLoading}
                             keyboardType="default"
                             placeholderTextColor="#9ca3af"
                             autoCapitalize="none"
                             autoCorrect={false}
                             accessibilityLabel="Bar longitude input"
                           />
                         )}
                       />
                       {errors.longitude?.message && <Text className="text-red-600 text-xs mt-1 ml-1">{errors.longitude.message}</Text>}
                     </View>
                   </View>
                   <Text className="text-xs text-gray-500 mt-1 ml-1">Enter precise GPS coordinates. Use '-' for West/South.</Text>
                </View>

                {/* Submit Button */}
                <Pressable
                  className={`py-3 rounded-md items-center mt-4 ${isLoading ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'}`}
                  // handleSubmit takes the handler matching the useForm type
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
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default CreateBarScreen;