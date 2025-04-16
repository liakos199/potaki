import { useQuery } from '@tanstack/react-query';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { z } from 'zod';
import { fetchDrinkOptions } from '@/src/features/drink-options/api';
import { DRINK_TYPES, DrinkOptionSchema, type DrinkOption } from '@/src/features/drink-options/types';
import { AlertCircle, Trash2, Plus, Undo2 } from 'lucide-react-native';

// --- Types ---
type Props = {
  barId: string;
  onDirtyStateChange: (dirty: boolean) => void;
  isSaving?: boolean;
};

export type DrinkOptionsSectionHandle = {
  getCurrentOptions: () => DrinkOption[];
  initialOptions: DrinkOption[];
};

export const DrinkOptionsSection = forwardRef<DrinkOptionsSectionHandle, Props>(
  ({ barId, onDirtyStateChange, isSaving }, ref) => {
    const [options, setOptions] = useState<DrinkOption[]>([]);
    const [initialOptions, setInitialOptions] = useState<DrinkOption[]>([]);
    const [formError, setFormError] = useState<string | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editBottle, setEditBottle] = useState<DrinkOption | null>(null);

    // Fetch drinks
    const { data, isLoading, error } = useQuery({
      queryKey: ['drink-options', barId],
      queryFn: () => fetchDrinkOptions(barId),
      enabled: !!barId,
    });

    useEffect(() => {
      if (data) {
        setOptions(data);
        setInitialOptions(data);
        onDirtyStateChange(false);
      }
    }, [data]);

    useImperativeHandle(ref, () => ({
      getCurrentOptions: () => options,
      initialOptions,
    }));

    // Dirty state
    useEffect(() => {
      const isDirty = JSON.stringify(options) !== JSON.stringify(initialOptions);
      onDirtyStateChange(isDirty);
    }, [options, initialOptions]);

    // --- UI handlers ---
    const handleAddSingleDrink = () => {
      if (options.find(o => o.type === 'single-drink')) {
        setFormError('Only one single-drink allowed per bar.');
        return;
      }
      setOptions(prev => [
        ...prev,
        {
          id: `local-single-drink-${Date.now()}`,
          bar_id: barId,
          type: 'single-drink',
          name: '',
          price: 5,
        },
      ]);
    };
    const handleAddBottle = () => {
      setDrawerOpen(true);
      setEditBottle({
        id: `local-bottle-${Date.now()}`,
        bar_id: barId,
        type: 'bottle',
        name: '',
        price: 50,
      });
    };
    const handleCancelBottle = () => {
      setDrawerOpen(false);
      setEditBottle(null);
      setFormError(null);
    };
    const handleSaveBottle = (bottle: DrinkOption) => {
      if (!bottle.name || !bottle.price) {
        setFormError('Bottle name and price required.');
        return;
      }
      setOptions(prev => {
        const exists = prev.find(o => o.id === bottle.id);
        if (exists) {
          return prev.map(o => (o.id === bottle.id ? bottle : o));
        }
        return [...prev, bottle];
      });
      setEditBottle(null);
      setDrawerOpen(false);
      setFormError(null);
    };
    const handleDelete = (id: string) => {
      Alert.alert('Delete Drink', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => setOptions(prev => prev.filter(o => o.id !== id)) },
      ]);
    };
    const handleRevert = () => {
      setOptions(initialOptions);
      setFormError(null);
      onDirtyStateChange(false);
    };

    // --- Render ---
    if (isLoading) return (
      <View className="mt-4 items-center justify-center py-6">
        <ActivityIndicator size="small" color="#6366F1" />
        <Text className="text-gray-500 mt-2 text-sm">Loading drinks</Text>
      </View>
    );
    if (error) return (
      <View className="mt-4 px-3 py-3 rounded-md bg-red-50 border border-red-100 flex-row items-center">
        <AlertCircle size={16} color="#DC2626" />
        <Text className="text-red-600 ml-2 text-sm">Failed to load drinks</Text>
      </View>
    );

    const singleDrink = options.find(o => o.type === 'single-drink');
    const bottles = options.filter(o => o.type === 'bottle');
    const isDirty = JSON.stringify(options) !== JSON.stringify(initialOptions);

    return (
      <View className="mt-6">
        <Text className="text-base font-semibold text-gray-800 mb-3">Drinks</Text>
        
        {/* Single Drink */}
        <View className="mb-4 p-3 border border-gray-200 rounded-md bg-white">
          <Text className="text-sm font-medium text-gray-700 mb-2">Single Drink</Text>
          {singleDrink ? (
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50 mr-2"
                value={String(singleDrink.price)}
                onChangeText={v => setOptions(prev => prev.map(o => o.type === 'single-drink' ? { ...o, price: Number(v.replace(/[^0-9.]/g, '')) } : o))}
                keyboardType="numeric"
                editable={!isSaving}
                accessibilityLabel="Single drink price"
                placeholder="Price"
              />
              <TouchableOpacity
                className="p-2 rounded-md bg-gray-100"
                onPress={() => handleDelete(singleDrink.id)}
                accessibilityRole="button"
                accessibilityLabel="Delete single drink"
                activeOpacity={0.7}
                disabled={isSaving}
              >
                <Trash2 size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              className="border border-gray-200 px-3 py-2 rounded-md flex-row items-center justify-center"
              onPress={handleAddSingleDrink}
              accessibilityRole="button"
              accessibilityLabel="Add single drink"
              activeOpacity={0.7}
              disabled={isSaving}
            >
              <Plus size={14} color="#6366F1" />
              <Text className="text-indigo-600 font-medium ml-1 text-sm">Add Single Drink</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Bottles */}
        <View className="mb-4 p-3 border border-gray-200 rounded-md bg-white">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-sm font-medium text-gray-700">Bottles</Text>
            <TouchableOpacity
              className="border border-indigo-200 px-2 py-1 rounded-md flex-row items-center bg-indigo-50"
              onPress={handleAddBottle}
              accessibilityRole="button"
              accessibilityLabel="Add bottle"
              activeOpacity={0.7}
              disabled={isSaving}
            >
              <Plus size={14} color="#6366F1" />
              <Text className="text-indigo-600 font-medium ml-1 text-xs">Add</Text>
            </TouchableOpacity>
          </View>
          
          {bottles.length === 0 ? (
            <Text className="text-gray-400 text-sm">No bottles added</Text>
          ) : (
            bottles.map(bottle => (
              <View key={bottle.id} className="flex-row items-center mb-2">
                <TextInput
                  className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50 mr-2"
                  value={bottle.name}
                  onChangeText={v => setOptions(prev => prev.map(o => o.id === bottle.id ? { ...o, name: v } : o))}
                  editable={!isSaving}
                  accessibilityLabel="Bottle name"
                  placeholder="Bottle name"
                />
                <TextInput
                  className="w-20 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50 mr-2"
                  value={String(bottle.price)}
                  onChangeText={v => setOptions(prev => prev.map(o => o.id === bottle.id ? { ...o, price: Number(v.replace(/[^0-9.]/g, '')) } : o))}
                  keyboardType="numeric"
                  editable={!isSaving}
                  accessibilityLabel="Bottle price"
                  placeholder="Price"
                />
                <TouchableOpacity
                  className="p-2 rounded-md bg-gray-100"
                  onPress={() => handleDelete(bottle.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete bottle ${bottle.name}`}
                  activeOpacity={0.7}
                  disabled={isSaving}
                >
                  <Trash2 size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))
          )}
          
          {/* Bottle Drawer/Modal */}
          {drawerOpen && (
            <View className="absolute left-0 right-0 top-0 bottom-0 z-50 bg-black/30 justify-center items-center" style={{ minHeight: '100%' }}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                className="w-full max-w-md"
                style={{ width: '100%', maxWidth: 350 }}
              >
                <View className="bg-white border border-gray-200 rounded-md shadow-lg mx-4">
                  <ScrollView
                    className="p-4"
                    contentContainerStyle={{ flexGrow: 1 }}
                    keyboardShouldPersistTaps="handled"
                  >
                    <Text className="text-base font-medium text-gray-800 mb-4">Add Bottle</Text>
                    <TextInput
                      className="border border-gray-200 rounded-md px-3 py-2 mb-3 text-sm bg-gray-50"
                      value={editBottle?.name || ''}
                      onChangeText={v => setEditBottle(b => b ? { ...b, name: v } : b)}
                      placeholder="Bottle name"
                      accessibilityLabel="Bottle name input"
                      autoFocus
                    />
                    <TextInput
                      className="border border-gray-200 rounded-md px-3 py-2 mb-4 text-sm bg-gray-50"
                      value={editBottle?.price ? String(editBottle.price) : ''}
                      onChangeText={v => setEditBottle(b => b ? { ...b, price: Number(v.replace(/[^0-9.]/g, '')) } : b)}
                      placeholder="Price"
                      keyboardType="numeric"
                      accessibilityLabel="Bottle price input"
                    />
                    {formError && (
                      <View className="mb-4 px-3 py-2 rounded-md bg-red-50 border border-red-100 flex-row items-center">
                        <AlertCircle size={14} color="#DC2626" />
                        <Text className="text-red-600 ml-2 text-xs flex-1">{formError}</Text>
                      </View>
                    )}
                    <View className="flex-row gap-2">
                      <TouchableOpacity
                        className="flex-1 py-2 rounded-md bg-gray-100 items-center"
                        onPress={handleCancelBottle}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel bottle"
                        activeOpacity={0.7}
                      >
                        <Text className="text-gray-700 font-medium text-sm">Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        className="flex-1 py-2 rounded-md bg-indigo-600 items-center"
                        onPress={() => {
                          if (editBottle) handleSaveBottle(editBottle);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Save bottle"
                        activeOpacity={0.7}
                      >
                        <Text className="text-white font-medium text-sm">Save</Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </View>
              </KeyboardAvoidingView>
            </View>
          )}
        </View>
        
        {/* Error Display */}
        {formError && (
          <View className="mb-3 px-3 py-2 rounded-md bg-red-50 border border-red-100 flex-row items-center">
            <AlertCircle size={14} color="#DC2626" />
            <Text className="text-red-600 ml-2 text-xs flex-1">{formError}</Text>
          </View>
        )}
        
        {/* Revert Button (only if dirty) */}
        {isDirty && (
          <TouchableOpacity
            className="flex-row items-center justify-center py-2 rounded-md border border-gray-200 bg-white"
            onPress={handleRevert}
            accessibilityRole="button"
            accessibilityLabel="Revert drink changes"
            activeOpacity={0.7}
          >
            <Undo2 size={14} color="#6B7280" />
            <Text className="text-gray-600 font-medium text-sm ml-2">Revert Changes</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
);