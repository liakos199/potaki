import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Alert, StatusBar } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import SaveButton from '@/src/features/owner-components/SaveButton';
import { createDrinkOption, updateDrinkOption, deleteDrinkOption, fetchDrinkOptions } from '@/src/features/drink-options/api';
import { AlertCircle, Trash2, Plus, Undo2, Edit2 } from 'lucide-react-native';
import type { DrinkOption } from '@/src/features/drink-options/types';

const BarDrinksScreen = (): JSX.Element => {
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const queryClient = useQueryClient();
  const [options, setOptions] = useState<DrinkOption[]>([]);
  const [initialOptions, setInitialOptions] = useState<DrinkOption[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDrink, setEditingDrink] = useState<DrinkOption | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savePending, setSavePending] = useState(false);

  // Fetch drinks
  const { data, isLoading, error } = useQuery<DrinkOption[]>({
    queryKey: ['drink-options', barId],
    queryFn: () => fetchDrinkOptions(barId as string),
    enabled: !!barId,
  });

  // Sync local state when data changes
  useEffect(() => {
    if (data) {
      setOptions(data);
      setInitialOptions(data);
      setDirty(false);
    }
  }, [data]);

  // Dirty state detection
  const checkDirty = (opts: DrinkOption[]) => {
    setDirty(JSON.stringify(opts) !== JSON.stringify(initialOptions));
  };

  // --- Modal actions ---
  const openAddSingleDrinkModal = () => {
    if (options.find(o => o.type === 'single-drink')) {
      setFormError('Only one single-drink allowed per bar.');
      return;
    }
    setModalOpen(true);
    setEditingDrink({
      id: `local-single-drink-${Date.now()}`,
      bar_id: barId as string,
      type: 'single-drink',
      name: 'Standard drink',
      price: 5,
    } as DrinkOption);
  };

  const openEditSingleDrinkModal = (drink: DrinkOption) => {
    setModalOpen(true);
    setEditingDrink({ ...drink });
  };

  const openAddBottleModal = () => {
    setModalOpen(true);
    setEditingDrink({
      id: `local-bottle-${Date.now()}`,
      bar_id: barId as string,
      type: 'bottle',
      name: '',
      price: 50,
    } as DrinkOption);
  };

  const openEditBottleModal = (bottle: DrinkOption) => {
    setModalOpen(true);
    setEditingDrink({ ...bottle });
  };

  const handleCancelModal = () => {
    setModalOpen(false);
    setEditingDrink(null);
    setFormError(null);
  };

  const handleSaveModal = () => {
    if (!editingDrink) return;
    
    // Validate fields based on type
    if (editingDrink.type === 'bottle') {
      if (!editingDrink.name || !editingDrink.price) {
        setFormError('Bottle name and price required.');
        return;
      }
      
      // Prevent duplicate bottle names (case-insensitive, trimmed, excluding current bottle)
      const nameToCheck = editingDrink.name.trim().toLowerCase();
      const duplicate = options.some(
        (o: DrinkOption) => o.type === 'bottle' &&
          o.id !== editingDrink.id &&
          (o.name?.trim().toLowerCase() === nameToCheck)
      );
      
      if (duplicate) {
        setFormError('A bottle with this name already exists.');
        return;
      }
    } else if (editingDrink.type === 'single-drink') {
      if (!editingDrink.price && editingDrink.price !== 0) {
        setFormError('Price is required.');
        return;
      }
    }
    
    // Update or add the drink to options
    const exists = options.find((o: DrinkOption) => o.id === editingDrink.id);
    let newOptions: DrinkOption[];
    
    if (exists) {
      newOptions = options.map((o: DrinkOption) => (o.id === editingDrink.id ? editingDrink : o));
    } else {
      newOptions = [...options, editingDrink];
    }
    
    setOptions(newOptions);
    checkDirty(newOptions);
    setEditingDrink(null);
    setModalOpen(false);
    setFormError(null);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Drink', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        const newOptions = options.filter(o => o.id !== id);
        setOptions(newOptions);
        checkDirty(newOptions);
      } },
    ]);
  };
  
  const handleRevert = () => {
    setOptions(initialOptions);
    setFormError(null);
    setDirty(false);
  };

  // Save handler for drink options
  const handleSave = async () => {
    setSavePending(true);
    try {
      // 1. Deletions: in initialOptions but not in options (by id, and not local)
      const deleted = initialOptions.filter(
        (o: any) => !options.some((opt: any) => opt.id === o.id)
      );
      // 2. Additions: in options but not in initialOptions (local id)
      const added = options.filter(
        (o: any) => !initialOptions.some((opt: any) => opt.id === o.id) && o.id.toString().startsWith('local-')
      );
      // 3. Updates: in both, but changed fields (and not local)
      const updated = options.filter((o: any) => {
        const orig = initialOptions.find((opt: any) => opt.id === o.id);
        return orig && JSON.stringify(orig) !== JSON.stringify(o) && !o.id.toString().startsWith('local-');
      });
      // Delete removed
      await Promise.all(deleted.map((opt: any) => {
        if (opt.id && typeof opt.id === 'string' && !opt.id.toString().startsWith('local-')) {
          return deleteDrinkOption(opt.id);
        }
        return null;
      }));
      // Create new
      await Promise.all(added.map((opt: any) => {
        const { id, ...rest } = opt;
        return createDrinkOption(rest);
      }));
      // Update changed
      await Promise.all(updated.map((opt: any) => updateDrinkOption(opt)));
      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ['drink-options', barId] });
      setDirty(false);
      setInitialOptions(options);
    } catch (err) {
      // Optionally: show error toast
    } finally {
      setSavePending(false);
    }
  };

  if (!barId) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <StatusBar barStyle="light-content" />
        <Text className="text-lg text-red-400">No bar selected.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <StatusBar barStyle="light-content" />
        <Text className="text-red-400">Failed to load drinks.</Text>
      </View>
    );
  }

  const singleDrink = options.find(o => o.type === 'single-drink');
  const bottles = options.filter(o => o.type === 'bottle');

  return (
    <View className="flex-1 bg-black">
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View className="px-5 pt-12 pb-4 bg-zinc-900 border-b border-zinc-800 shadow-sm">
        <Text className="text-2xl font-bold text-gray-100 text-center">Manage Drinks</Text>
        <Text className="text-purple-400 text-sm mt-1 text-center">Set up drinks and pricing options</Text>
      </View>
      
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 70 }} keyboardShouldPersistTaps="handled">
        {/* Single Drink */}
        <View className="my-5 p-4 border border-zinc-800 rounded-xl bg-zinc-900 shadow-md">
          <View className="flex-row items-center mb-3">
            <View className="h-4 w-1 bg-purple-500 rounded-full mr-2" />
            <Text className="text-base font-semibold text-gray-200">Single Drink</Text>
          </View>
          
          {singleDrink ? (
            <View className="flex-row items-center bg-zinc-800 p-3 rounded-lg">
              <Text className="flex-1 text-gray-300 text-sm mr-2">Standard drink</Text>
              <Text className="text-gray-200 text-sm mr-2">${singleDrink.price}</Text>
              <TouchableOpacity
                onPress={() => openEditSingleDrinkModal(singleDrink)}
                className="mr-2 p-2 bg-zinc-700 rounded-lg"
                accessibilityRole="button"
                accessibilityLabel="Edit single drink"
                activeOpacity={0.7}
                disabled={savePending}
              >
                <Edit2 size={16} color="#a855f7" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(singleDrink.id)}
                className="p-2 bg-zinc-700 rounded-lg"
                accessibilityRole="button"
                accessibilityLabel="Delete single drink"
                activeOpacity={0.7}
                disabled={savePending}
              >
                <Trash2 size={16} color="#f87171" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              className="border border-zinc-700 px-4 py-3 rounded-lg flex-row items-center justify-center bg-zinc-800"
              onPress={openAddSingleDrinkModal}
              accessibilityRole="button"
              accessibilityLabel="Add single drink"
              activeOpacity={0.7}
              disabled={savePending}
            >
              <Plus size={16} color="#a855f7" />
              <Text className="text-purple-400 font-medium ml-2">Add Single Drink</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Bottles */}
        <View className="mb-6 p-4 border border-zinc-800 rounded-xl bg-zinc-900 shadow-md">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <View className="h-4 w-1 bg-purple-500 rounded-full mr-2" />
              <Text className="text-base font-semibold text-gray-200">Bottles</Text>
            </View>
            <TouchableOpacity
              className="border border-purple-700 px-3 py-2 rounded-lg flex-row items-center bg-purple-900"
              onPress={openAddBottleModal}
              accessibilityRole="button"
              accessibilityLabel="Add bottle"
              activeOpacity={0.7}
              disabled={savePending}
            >
              <Plus size={14} color="#d8b4fe" />
              <Text className="text-purple-300 font-medium ml-1 text-sm">Add Bottle</Text>
            </TouchableOpacity>
          </View>
          
          {bottles.length === 0 ? (
            <View className="py-4 items-center bg-zinc-800 rounded-lg border border-zinc-700">
              <Text className="text-gray-400 text-sm">No bottles added</Text>
            </View>
          ) : (
            <View className="space-y-3">
              {bottles.map(bottle => (
                <View key={bottle.id} className="flex-row items-center p-3 bg-zinc-800 rounded-lg border border-zinc-700">
                  <Text className="flex-1 text-gray-200 text-sm">{bottle.name}</Text>
                  <Text className="text-gray-200 text-sm mr-2">${bottle.price}</Text>
                  <TouchableOpacity
                    onPress={() => openEditBottleModal(bottle)}
                    className="mr-2 p-2 bg-zinc-700 rounded-lg"
                    accessibilityRole="button"
                    accessibilityLabel="Edit bottle"
                    activeOpacity={0.7}
                    disabled={savePending}
                  >
                    <Edit2 size={16} color="#a855f7" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(bottle.id)}
                    className="p-2 bg-zinc-700 rounded-lg"
                    accessibilityRole="button"
                    accessibilityLabel="Delete bottle"
                    activeOpacity={0.7}
                    disabled={savePending}
                  >
                    <Trash2 size={16} color="#f87171" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
        
        {/* Error Display */}
        {formError && !modalOpen && (
          <View className="mb-4 px-4 py-3 rounded-lg bg-red-900 border border-red-800 flex-row items-center">
            <AlertCircle size={16} color="#fca5a5" />
            <Text className="text-red-300 ml-2 text-sm flex-1">{formError}</Text>
          </View>
        )}
        
        {/* Revert Button (only if dirty) */}
        {dirty && (
          <TouchableOpacity
            className="flex-row items-center justify-center py-3 rounded-lg border border-zinc-700 bg-zinc-800 mb-6"
            onPress={handleRevert}
            accessibilityRole="button"
            accessibilityLabel="Revert drink changes"
            activeOpacity={0.7}
          >
            <Undo2 size={16} color="#9ca3af" />
            <Text className="text-gray-300 font-medium text-sm ml-2">Revert Changes</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      
      {/* Modal for adding/editing drinks */}
      {modalOpen && editingDrink && (
        <View className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <View className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl mx-4 px-6 py-6">
            <View className="flex-row items-center mb-5">
              {editingDrink.id && !editingDrink.id.startsWith('local-') ? (
                <Edit2 size={20} color="#a855f7" />
              ) : (
                <Plus size={20} color="#a855f7" />
              )}
              <Text className="text-lg font-bold text-purple-300 ml-2">
                {editingDrink.id && !editingDrink.id.startsWith('local-') ? 'Edit' : 'Add'} {editingDrink.type === 'bottle' ? 'Bottle' : 'Single Drink'}
              </Text>
            </View>
            
            {editingDrink.type === 'bottle' && (
              <TextInput
                className="border border-zinc-700 rounded-lg px-4 py-3.5 mb-4 text-base bg-zinc-800 text-gray-200"
                value={editingDrink.name || ''}
                onChangeText={v => setEditingDrink(prev => prev ? { ...prev, name: v } : prev)}
                placeholder="Bottle name"
                placeholderTextColor="#71717a"
                accessibilityLabel="Bottle name input"
                autoFocus
              />
            )}
            
            {editingDrink.type === 'single-drink' && (
              <View className="mb-4">
                <Text className="text-gray-300 mb-2">Standard drink price:</Text>
              </View>
            )}
            
            <TextInput
              className="border border-zinc-700 rounded-lg px-4 py-3.5 mb-5 text-base bg-zinc-800 text-gray-200"
              value={editingDrink.price ? String(editingDrink.price) : ''}
              onChangeText={v => setEditingDrink(prev => prev ? { ...prev, price: Number(v.replace(/[^0-9.]/g, '')) } : prev)}
              placeholder="Price"
              placeholderTextColor="#71717a"
              keyboardType="numeric"
              accessibilityLabel="Price input"
            />
            
            {formError && (
              <View className="mb-5 px-4 py-3 rounded-lg bg-red-900 border border-red-800 flex-row items-center">
                <AlertCircle size={16} color="#fca5a5" />
                <Text className="text-red-300 ml-2 text-sm flex-1">{formError}</Text>
              </View>
            )}
            
            <View className="flex-row gap-3 mt-2">
              <TouchableOpacity
                className="flex-1 py-3.5 rounded-lg bg-zinc-800 items-center border border-zinc-700"
                onPress={handleCancelModal}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                activeOpacity={0.7}
              >
                <Text className="text-gray-300 font-semibold text-base">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-3.5 rounded-lg bg-purple-700 items-center"
                onPress={handleSaveModal}
                accessibilityRole="button"
                accessibilityLabel="Save"
                activeOpacity={0.7}
              >
                <Text className="text-white font-semibold text-base">Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      
      {/* Save Button - absolutely positioned and always visible above safe area */}
      {dirty && (
        <View className="absolute left-0 right-0 bottom-0 w-full pb-6 pt-3 z-50 flex items-center justify-center bg-gradient-to-t from-black to-transparent">
          <View className="w-full max-w-md flex items-center px-5">
            <SaveButton
              onPress={handleSave}
              loading={savePending}
            />
          </View>
        </View>
      )}
    </View>
  );
};

export default BarDrinksScreen;