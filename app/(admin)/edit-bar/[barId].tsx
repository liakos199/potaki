import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, SafeAreaView, ScrollView } from 'react-native';
import { useState, useRef } from 'react';
import { fetchOwnerBars, deleteBarAndDemoteStaff, updateBar } from '@/src/features/bars/api';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { SeatOptionsSection, SeatOptionsSectionHandle } from '@/src/features/owner-components/SeatOptionsSection';
import SaveButton from '@/src/features/owner-components/SaveButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { updateSeatOption, createSeatOption, deleteSeatOption } from '@/src/features/seat-options/api';
import { createDrinkOption, updateDrinkOption, deleteDrinkOption } from '@/src/features/drink-options/api';
import { DrinkOptionsSection } from '@/src/features/owner-components/DrinkOptionsSection';

const EditBarScreen = (): JSX.Element => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [editValue, setEditValue] = useState('');
  const [editMode, setEditMode] = useState(false);
  // Seat and drink options dirty/save state
  const [seatOptionsDirty, setSeatOptionsDirty] = useState(false);
  const [drinkOptionsDirty, setDrinkOptionsDirty] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const seatOptionsRef = useRef<SeatOptionsSectionHandle>(null);
  const drinkOptionsRef = useRef<any>(null);

  const {
    data: bar,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['bar', barId],
    queryFn: async () => {
      const bars = await fetchOwnerBars(profile!.id);
      return bars.find((b) => b.id === barId);
    },
    enabled: !!profile?.id && !!barId,
  });

  const updateMutation = useMutation({
    mutationFn: (name: string) => updateBar({ id: barId as string, name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-bars', profile?.id] });
      setEditMode(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteBarAndDemoteStaff(barId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-bars', profile?.id] });
      router.replace('/(admin)/admin-panel');
    },
  });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="small" color="#6366f1" />
      </View>
    );
  }
  
  if (error || !bar) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-red-500 text-sm">Bar not found.</Text>
      </View>
    );
  }

  // Save handler for drink options
  const handleSaveDrinkOptions = async () => {
    if (!drinkOptionsRef.current) return;
    setSavePending(true);
    try {
      const options = drinkOptionsRef.current.getCurrentOptions();
      const initialOptions = drinkOptionsRef.current.initialOptions;
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
    } catch (err) {
      // Optionally: show error toast
    } finally {
      setSavePending(false);
    }
  };

  // Save handler for seat options
  async function handleSaveSeatOptions() {
    if (!seatOptionsRef.current) return;
    setSavePending(true);
    try {
      // Get current and initial options
      const options = seatOptionsRef.current.getCurrentOptions();
      const initialOptions = seatOptionsRef.current.initialOptions;
      // 1. Deletions: in initialOptions but not in options
      const deleted = initialOptions.filter(
        (o: any) => !options.some((opt: any) => opt.type === o.type)
      );
      // 2. Additions: in options but not in initialOptions
      const added = options.filter(
        (o: any) => !initialOptions.some((opt: any) => opt.type === o.type)
      );
      // 3. Updates: in both, but changed fields
      const updated = options.filter((o: any) => {
        const orig = initialOptions.find((opt: any) => opt.type === o.type);
        return orig && JSON.stringify(orig) !== JSON.stringify(o);
      });
      // Delete removed
      await Promise.all(deleted.map((opt: any) => opt.id && typeof opt.id === 'string' && opt.id.toString().startsWith('local-') ? null : deleteSeatOption(opt.id)));
      // Create new
      await Promise.all(added.map((opt: any) => {
        // Remove the id property entirely for createSeatOption
        const { id, ...rest } = opt;
        return createSeatOption(rest);
      }));
      // Update changed
      await Promise.all(updated.filter((opt: any) => !opt.id.toString().startsWith('local-')).map((opt: any) => updateSeatOption(opt)));
      setSeatOptionsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['seat-options', barId] });
    } catch (err) {
      // Optionally: show error toast
    } finally {
      setSavePending(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View style={{ flex: 1, position: 'relative' }}>
        <ScrollView
          className="flex-1 px-4 py-6 w-full"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 96 }}
        >
          <Text className="text-xl font-semibold text-gray-800 mb-4 text-center">Edit Bar</Text>
          
          {editMode ? (
            <>
              <TextInput
                className="border border-gray-200 rounded-md px-3 py-2 mb-3 text-sm bg-gray-50"
                value={editValue}
                onChangeText={setEditValue}
                placeholder="Bar name"
                autoFocus
                editable={!updateMutation.isPending}
                accessibilityLabel="Bar name input"
              />
              <View className="flex-row gap-2 mb-6">
                <TouchableOpacity
                  className="flex-1 py-2 rounded-md bg-gray-100 items-center"
                  onPress={() => setEditMode(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel edit"
                  activeOpacity={0.7}
                >
                  <Text className="text-gray-700 font-medium text-sm">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 py-2 rounded-md bg-indigo-600 items-center"
                  onPress={() => updateMutation.mutate(editValue)}
                  disabled={updateMutation.isPending || editValue.trim().length < 2}
                  accessibilityRole="button"
                  accessibilityLabel="Save bar name"
                  activeOpacity={0.7}
                >
                  <Text className="text-white font-medium text-sm">
                    {updateMutation.isPending ? 'Saving...' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View className="flex-row items-center justify-between mb-6 px-2">
                <Text className="text-sm text-gray-500">Bar Name</Text>
                <Text className="text-base font-medium text-gray-800">{bar.name}</Text>
              </View>
              
              <TouchableOpacity
                className="border border-gray-200 py-2 rounded-md items-center mb-6"
                onPress={() => { setEditValue(bar.name); setEditMode(true); }}
                accessibilityRole="button"
                accessibilityLabel="Edit bar name"
                activeOpacity={0.7}
              >
                <Text className="text-indigo-600 font-medium text-sm">Edit Name</Text>
              </TouchableOpacity>
              
              {/* Seat Options Section */}
              <SeatOptionsSection
                ref={seatOptionsRef}
                barId={barId as string}
                onDirtyStateChange={setSeatOptionsDirty}
                isSaving={savePending}
                onRequestSave={handleSaveSeatOptions}
              />
              
              {/* Drink Options Section */}
              <DrinkOptionsSection
                ref={drinkOptionsRef}
                barId={barId as string}
                onDirtyStateChange={setDrinkOptionsDirty}
                isSaving={savePending}
              />
              
              {/* Delete Button */}
              <TouchableOpacity
                className="py-2 mt-6 border border-red-200 rounded-md items-center bg-red-50"
                onPress={() => {
                  Alert.alert('Delete Bar', 'Are you sure you want to delete this bar?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => deleteMutation.mutate(),
                    },
                  ]);
                }}
                accessibilityRole="button"
                accessibilityLabel="Delete bar"
                activeOpacity={0.7}
              >
                <Text className="text-red-600 font-medium text-sm">Delete Bar</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
        
        {/* Save Button - absolutely positioned */}
        {(seatOptionsDirty || drinkOptionsDirty) && (
          <View 
            className="absolute left-0 right-0 items-center px-4" 
            style={{ bottom: insets.bottom + 16 }}>
            <View className="w-full">
              <SaveButton
                onPress={async () => {
                  setSavePending(true);
                  try {
                    await handleSaveSeatOptions();
                    await handleSaveDrinkOptions();
                    setSeatOptionsDirty(false);
                    setDrinkOptionsDirty(false);
                  } finally {
                    setSavePending(false);
                  }
                }}
                loading={savePending}
              />
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

export default EditBarScreen;