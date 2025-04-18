import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, ActivityIndicator, KeyboardAvoidingView, Alert, Platform, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import type { Database } from '@/src/lib/database.types';
import { useToast } from '@/src/components/general/Toast';

// Types
const drinkTypes = ['single-drink', 'bottle'] as const;
type DrinkType = typeof drinkTypes[number];




type Drink = Database['public']['Tables']['drink_options']['Row'];

type DrinkFormValues = {
  name: string;
  type: DrinkType;
  price: number;
};

const drinkFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(drinkTypes),
  price: z.coerce.number().min(0.01, 'Price must be greater than 0'),
});

// Drink Item Component
const DrinkItem = ({ 
  drink, 
  onEdit, 
  onDelete 
}: { 
  drink: Drink; 
  onEdit: (drink: Drink) => void; 
  onDelete: (id: string) => void; 
}) => (
  <View
    key={drink.id}
    className="flex-row items-center justify-between bg-white rounded-lg shadow px-4 py-3 mb-3"
  >
    <View>
      <Text className="text-lg font-semibold">{drink.name}</Text>
      <Text className="text-base mt-1">€{drink.price.toFixed(2)}</Text>
    </View>
    <View className="flex-row gap-2">
      <TouchableOpacity
        className="px-3 py-1 bg-yellow-500 rounded-lg"
        onPress={() => onEdit(drink)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${drink.name}`}
      >
        <Text className="text-white">Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity
        className="px-3 py-1 bg-red-500 rounded-lg"
        onPress={() => onDelete(drink.id)}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${drink.name}`}
        accessibilityHint="Double tap to delete this drink"
      >
        <Text className="text-white">Delete</Text>
      </TouchableOpacity>
    </View>
  </View>
);

// Modify the formatPrice function to limit input to 5 digits
const formatPrice = (text: string): number => {
    const sanitized = text.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    
    // Limit to 5 digits total (including decimal part)
    let integerPart = parts[0];
    if (integerPart.length > 5) {
      integerPart = integerPart.slice(0, 5);
    }
    
    const formattedParts = [integerPart];
    
    // Handle decimal part if exists
    if (parts.length > 1) {
      const decimalPart = parts.slice(1).join('');
      const digitsLeft = 5 - integerPart.length;
      formattedParts.push(decimalPart.slice(0, Math.max(digitsLeft, 2)));
    }
    
    const formatted = formattedParts.length > 1 ? formattedParts.join('.') : formattedParts[0];
    const numericValue = parseFloat(formatted);
    return formatted === '' ? 0 : isNaN(numericValue) ? 0 : numericValue;
  };

// Single Drink Form Modal Component
const SingleDrinkFormModal = ({ 
  visible, 
  onClose, 
  onSubmit, 
  control, 
  handleSubmit, 
  errors, 
  isSubmitting, 
  editingDrink
}: { 
  visible: boolean; 
  onClose: () => void; 
  onSubmit: (values: DrinkFormValues) => void; 
  control: any;
  handleSubmit: any;
  errors: any;
  isSubmitting: boolean;
  editingDrink: Drink | null;
}) => (
  <Modal visible={visible} animationType="slide" transparent>
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 justify-center items-center bg-black/40 px-4">
          <View className="bg-white rounded-lg p-6 w-full max-w-md">
            <Text className="text-lg font-bold mb-4">{editingDrink ? 'Edit Single Drink' : 'Add Single Drink'}</Text>
            {/* Name - Fixed for single drink */}
            <View className="mb-2">
              <Text className="mb-1 text-gray-700">Name</Text>
              <View className="py-2 px-3 bg-gray-100 rounded-lg border border-gray-300">
                <Text className="text-gray-700">single-drink</Text>
              </View>
              <Text className="text-xs text-gray-500 mt-1">Name is fixed for single drink type</Text>
            </View>
            {/* Price */}
            <Controller
              control={control}
              name="price"
              render={({ field: { value, onChange } }) => (
                <View>
                  <Text className="mb-1 text-gray-700">Price (€)</Text>
                  <TextInput
                    className={`border ${errors.price ? 'border-red-500' : 'border-gray-300'} rounded-lg px-3 py-2 mb-2`}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    value={value === 0 ? '' : String(value)}
                    onChangeText={(text) => onChange(formatPrice(text))}
                    accessibilityLabel="Drink Price"
                    accessibilityHint="Enter the price of the single drink in Euros"
                  />
                  {errors.price && <Text className="text-red-500 text-xs mb-2">{errors.price.message}</Text>}
                </View>
              )}
            />
            
            {/* Actions */}
            <View className="flex-row justify-end gap-2 mt-4">
              <TouchableOpacity
                className="px-4 py-2 rounded-lg bg-gray-100"
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text className="text-gray-700 font-medium">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`px-4 py-2 rounded-lg ${isSubmitting ? 'bg-indigo-400' : 'bg-indigo-600'}`}
                onPress={handleSubmit(onSubmit)}
                accessibilityRole="button"
                accessibilityLabel="Save Single Drink"
                disabled={isSubmitting}
              >
                <Text className="text-white font-medium">{isSubmitting ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>
);

// Bottle Form Modal Component
const BottleFormModal = ({ 
  visible, 
  onClose, 
  onSubmit, 
  control, 
  handleSubmit, 
  errors, 
  isSubmitting, 
  editingDrink,
  existingBottleNames
}: { 
  visible: boolean; 
  onClose: () => void; 
  onSubmit: (values: DrinkFormValues) => void; 
  control: any;
  handleSubmit: any;
  errors: any;
  isSubmitting: boolean;
  editingDrink: Drink | null;
  existingBottleNames: string[];
}) => (
  <Modal visible={visible} animationType="slide" transparent>
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 justify-center items-center bg-black/40 px-4">
          <View className="bg-white rounded-lg p-6 w-full max-w-md">
            <Text className="text-lg font-bold mb-4">{editingDrink ? 'Edit Bottle' : 'Add Bottle'}</Text>
            {/* Name */}
            <Controller
              control={control}
              name="name"
              render={({ field: { value, onChange, onBlur } }) => (
                <View>
                  <Text className="mb-1 text-gray-700">Name</Text>
                  <TextInput
                    className={`border ${errors.name ? 'border-red-500' : 'border-gray-300'} rounded-lg px-3 py-2 mb-2`}
                    placeholder="Bottle Name"
                    value={value}
                    onChangeText={onChange}
                    accessibilityLabel="Bottle Name"
                    accessibilityHint="Enter the name of the bottle"
                    autoFocus={!editingDrink}
                  />
                  {errors.name && <Text className="text-red-500 text-xs mb-2">{errors.name.message}</Text>}
                </View>
              )}
            />
            {/* Price */}
            <Controller
              control={control}
              name="price"
              render={({ field: { value, onChange } }) => (
                <View>
                  <Text className="mb-1 text-gray-700">Price (€)</Text>
                  <TextInput
                    className={`border ${errors.price ? 'border-red-500' : 'border-gray-300'} rounded-lg px-3 py-2 mb-2`}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    value={value === 0 ? '' : String(value)}
                    onChangeText={(text) => onChange(formatPrice(text))}
                    accessibilityLabel="Bottle Price"
                    accessibilityHint="Enter the price of the bottle in Euros"
                  />
                  {errors.price && <Text className="text-red-500 text-xs mb-2">{errors.price.message}</Text>}
                </View>
              )}
            />
            
            {/* Actions */}
            <View className="flex-row justify-end gap-2 mt-4">
              <TouchableOpacity
                className="px-4 py-2 rounded-lg bg-gray-100"
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text className="text-gray-700 font-medium">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`px-4 py-2 rounded-lg ${isSubmitting ? 'bg-indigo-400' : 'bg-indigo-600'}`}
                onPress={handleSubmit((values: DrinkFormValues) => {
                  // Check for duplicates before submitting
                  if (!editingDrink && existingBottleNames.includes(values.name)) {
                    Alert.alert(
                      "Duplicate Name",
                      `A bottle with the name "${values.name}" already exists. Please choose a different name.`
                    );
                  } else {
                    onSubmit(values);
                  }
                })}
                accessibilityRole="button"
                accessibilityLabel="Save Bottle"
                disabled={isSubmitting}
              >
                <Text className="text-white font-medium">{isSubmitting ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>
);

export const DrinksScreen = (): JSX.Element | null => {
  const router = useRouter();
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [singleDrinkModalVisible, setSingleDrinkModalVisible] = useState(false);
  const [bottleModalVisible, setBottleModalVisible] = useState(false);
  const [editingDrink, setEditingDrink] = useState<Drink | null>(null);

  // Form setup
  const { 
    control, 
    handleSubmit, 
    reset, 
    formState: { errors } 
  } = useForm<DrinkFormValues>({
    resolver: zodResolver(drinkFormSchema),
    defaultValues: { name: '', type: 'single-drink', price: 0 },
  });

  // Fetch drinks
  const {
    data: drinks,
    isPending: drinksLoading,
    error: drinksError
  } = useQuery<Drink[]>({
    queryKey: ['drinks', barId],
    enabled: !!barId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drink_options')
        .select('*')
        .eq('bar_id', barId);
      if (error) throw error;
      return data as Drink[];
    },
  });

  // Single-drink logic
  const singleDrink = drinks?.find((d: Drink) => d.type === 'single-drink');
  const isEditingSingleDrink = editingDrink?.type === 'single-drink';
  const toast = useToast();
  // Bottles list
  const bottlesList = drinks?.filter((d) => d.type === 'bottle') || [];
  const bottleNames: string[] = bottlesList
  .map(bottle => bottle.name)
  .filter(Boolean) as string[];

  // Add/Edit Drink mutation
  const upsertDrink = useMutation<void, Error, DrinkFormValues & { id?: string }>({
    mutationFn: async (values: DrinkFormValues & { id?: string }) => {
      // When editing, preserve the original type
      const input = { 
        ...values, 
        bar_id: barId,
        // If editing, preserve the original type
        type: editingDrink ? editingDrink.type : values.type
      };
      
      if (values.id) {
        // Update
        const { error } = await supabase
          .from('drink_options')
          .update(input)
          .eq('id', values.id);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from('drink_options')
          .insert(input);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drinks', barId] });
    },
    onError: (err: Error) => {
      toast.show({ type: 'error', text1: 'Error', text2: err.message });
    },
  });

  // Delete Drink mutation
  const deleteDrink = useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('drink_options')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drinks', barId] });
      toast.show({ type: 'success', text1: 'Drink deleted successfully' });
    },
    onError: (err: Error) => {
      toast.show({ type: 'error', text1: 'Error', text2: err.message });
    },
  });

  const openAddSingleDrinkModal = () => {
    setEditingDrink(null);
    reset({ name: 'single-drink', type: 'single-drink', price: 0 });
    setSingleDrinkModalVisible(true);
  };

  const openAddBottleModal = () => {
    setEditingDrink(null);
    reset({ name: '', type: 'bottle', price: 0 });
    setBottleModalVisible(true);
  };

  const openEditModal = (drink: Drink) => {
    setEditingDrink(drink);
    // When editing, we keep the original type and don't allow changing it
    reset({ 
        name: drink.type === 'single-drink' ? 'single-drink' : (drink.name ?? ''), 
        type: (drinkTypes.includes(drink.type as DrinkType) ? drink.type : 'single-drink') as DrinkType, 
        price: drink.price ?? 0 
      });
    
    if (drink.type === 'single-drink') {
      setSingleDrinkModalVisible(true);
    } else {
      setBottleModalVisible(true);
    }
  };

  const closeModals = () => {
    setSingleDrinkModalVisible(false);
    setBottleModalVisible(false);
    setEditingDrink(null);
  };

  const confirmDelete = (id: string) => {
    const drinkToDelete = drinks?.find(d => d.id === id);
    if (!drinkToDelete) return;
    
    const message = drinkToDelete.type === 'single-drink'
      ? 'Are you sure you want to delete the single drink option? This will affect all orders.'
      : `Are you sure you want to delete "${drinkToDelete.name}"?`;
    
    Alert.alert('Delete Drink', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDrink.mutate(id) },
    ]);
  };

  const onSubmitSingleDrink = (values: DrinkFormValues) => {
    // The name and type are already set correctly during modal open
    // If editing single drink, confirm changes
    if (isEditingSingleDrink && editingDrink && editingDrink.price !== values.price) {
      Alert.alert(
        'Update Single Drink',
        'Changing the single drink price will affect all orders. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Update', 
            style: 'default',
            onPress: () => processDrinkSubmission(values)
          },
        ]
      );
    } else {
      processDrinkSubmission(values);
    }
  };
  
  const onSubmitBottle = (values: DrinkFormValues) => {
    // Type is already set as 'bottle' when the modal is opened
    processDrinkSubmission(values);
  };
  
  const processDrinkSubmission = (values: DrinkFormValues) => {
    // Ensure values has the correct structure
    const submissionValues = {
      ...values,
      // When editing single-drink, ensure we keep the name field
      name: editingDrink?.type === 'single-drink' ? 'single-drink' : values.name,
      // Ensure type is preserved
      type: editingDrink ? editingDrink.type : values.type
    };
    
    upsertDrink.mutate(
      editingDrink ? { ...submissionValues, id: editingDrink.id } : submissionValues, 
      {
        onSuccess: () => {
          closeModals();
          toast.show({ 
            type: 'success', 
            text1: editingDrink ? 'Drink updated' : 'Drink added'
          });
        }
      }
    );
  };

  if (!profile || !barId) return null;

  return (
    <View className="flex-1 bg-white">
      <View className="px-4 pt-8 pb-2 border-b border-gray-100">
        <Text className="text-xl font-bold">Manage Drinks</Text>
      </View>
      
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Single Drink Section */}
        <View className="px-4 py-4 mb-2">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-lg font-bold">Single Drink</Text>
            {!singleDrink && !drinksLoading && !drinksError && (
              <TouchableOpacity
                className="bg-indigo-600 px-3 py-2 rounded-lg"
                onPress={openAddSingleDrinkModal}
                accessibilityRole="button"
                accessibilityLabel="Add Single Drink"
                accessibilityHint="Add a single drink option for your bar"
              >
                <Text className="text-white font-medium">Add Single Drink</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {drinksLoading ? (
            <ActivityIndicator className="mt-4" />
          ) : drinksError ? (
            <View className="items-center mt-4">
              <Text className="text-red-500">Failed to load drinks.</Text>
            </View>
          ) : singleDrink ? (
            <DrinkItem 
              drink={singleDrink} 
              onEdit={openEditModal}
              onDelete={confirmDelete}
            />
          ) : (
            <Text className="text-gray-500 mt-2">No single drink added yet.</Text>
          )}
        </View>

        {/* Bottles Section */}
        <View className="px-4 py-2">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-lg font-bold">Bottles</Text>
            <TouchableOpacity
              className="bg-indigo-600 px-3 py-2 rounded-lg"
              onPress={openAddBottleModal}
              accessibilityRole="button"
              accessibilityLabel="Add Bottle"
              accessibilityHint="Add a new bottle option for your bar"
            >
              <Text className="text-white font-medium">Add Bottle</Text>
            </TouchableOpacity>
          </View>
          
          {drinksLoading ? (
            <ActivityIndicator className="mt-4" />
          ) : drinksError ? (
            <View className="items-center mt-4">
              <Text className="text-red-500">Failed to load bottles.</Text>
            </View>
          ) : bottlesList.length === 0 ? (
            <Text className="text-gray-500 mt-2">No bottles added yet.</Text>
          ) : (
            bottlesList.map((drink) => (
              <DrinkItem 
                key={drink.id}
                drink={drink} 
                onEdit={openEditModal} 
                onDelete={confirmDelete}
              />
            ))
          )}
        </View>
      </ScrollView>
      
      {/* Single Drink Form Modal */}
      <SingleDrinkFormModal 
        visible={singleDrinkModalVisible}
        onClose={closeModals}
        onSubmit={onSubmitSingleDrink}
        control={control}
        handleSubmit={handleSubmit}
        errors={errors}
        isSubmitting={upsertDrink.isPending}
        editingDrink={isEditingSingleDrink ? editingDrink : null}
      />
      
      {/* Bottle Form Modal */}
      <BottleFormModal 
        visible={bottleModalVisible}
        onClose={closeModals}
        onSubmit={onSubmitBottle}
        control={control}
        handleSubmit={handleSubmit}
        errors={errors}
        isSubmitting={upsertDrink.isPending}
        editingDrink={!isEditingSingleDrink ? editingDrink : null}
        existingBottleNames={bottleNames}
      />
    </View>
  );
};

export default DrinksScreen;