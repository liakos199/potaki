import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { fetchSeatOptions, updateSeatOption, createSeatOption, deleteSeatOption } from '@/src/features/seat-options/api';
import type { SeatOption, SeatOptionType } from '@/src/features/seat-options/types';
import { forwardRef, useImperativeHandle } from 'react';
import { Plus, X, Trash2, ToggleLeft, ToggleRight, ChevronDown, Undo2, AlertCircle, Check } from 'lucide-react-native';

const SEAT_TYPES = ['bar', 'table', 'vip'] as const;

type Props = {
  barId: string;
};

export type SeatOptionsSectionHandle = {
  getCurrentOptions: () => SeatOption[];
  initialOptions: SeatOption[];
};

export const SeatOptionsSection = forwardRef<SeatOptionsSectionHandle, Props & {
  onDirtyStateChange: (dirty: boolean) => void;
  isSaving: boolean;
  onRequestSave: () => void;
}>(({ barId, onDirtyStateChange, isSaving }, ref) => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['seat-options', barId],
    queryFn: () => fetchSeatOptions(barId),
    enabled: !!barId,
  });
  const [options, setOptions] = useState<SeatOption[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [initialOptions, setInitialOptions] = useState<SeatOption[]>([]);

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

  // Track dirty state
  useEffect(() => {
    const isDirty = JSON.stringify(options) !== JSON.stringify(initialOptions);
    onDirtyStateChange(isDirty);
  }, [options, initialOptions]);

  // Revert local changes to initial options
  const handleRevert = () => {
    setOptions(initialOptions);
    setFormError(null);
    onDirtyStateChange(false);
  };

  const handleChange = (type: SeatOptionType, field: keyof SeatOption, value: any) => {
    setOptions((prev) => prev.map((opt) =>
      opt.type === type ? { ...opt, [field]: value } : opt
    ));
    setDirty(true);
  };

  const validate = () => {
    for (const opt of options) {
      if (!opt.enabled) continue;
      if (
        !Number.isFinite(opt.available_count) || opt.available_count <= 0 ||
        !Number.isFinite(opt.min_people) || opt.min_people <= 0 ||
        !Number.isFinite(opt.max_people) || opt.max_people <= 0 ||
        opt.min_people > opt.max_people
      ) {
        setFormError('Please enter valid numbers for all enabled seat options.');
        return false;
      }
    }
    setFormError(null);
    return true;
  };

  const mutation = useMutation({
    mutationFn: async () => {
      setSaving(true);
      for (const opt of options) {
        await updateSeatOption(opt);
      }
      setSaving(false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-options', barId] });
      setDirty(false);
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to save seat options');
      setSaving(false);
    }
  });

  // Loading state
  if (isLoading) return (
    <View className="mt-8 flex items-center justify-center py-8">
      <ActivityIndicator size="large" color="#4F46E5" />
      <Text className="text-gray-600 mt-2 font-medium">Loading seat options...</Text>
    </View>
  );

  // Error state
  if (error) return (
    <View className="mt-8 bg-red-50 px-4 py-5 rounded-xl border border-red-200 flex-row items-center">
      <AlertCircle size={20} color="#EF4444" />
      <Text className="text-red-600 ml-2 font-medium">Failed to load seat options</Text>
    </View>
  );

  // Empty state
  if (!options.length) return (
    <View className="mt-8 bg-blue-50 rounded-xl p-6 items-center border border-blue-100">
      <Text className="text-gray-700 mb-4 text-center font-medium">No seat options found for this bar</Text>
      <TouchableOpacity
        className="bg-indigo-600 px-6 py-3 rounded-lg mb-2 shadow-sm flex-row items-center"
        onPress={() => setDrawerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Add seat option"
        activeOpacity={0.85}
        disabled={saving}
      >
        <Plus size={20} color="#ffffff" />
        <Text className="text-white font-semibold text-base ml-2">Add Seat Option</Text>
      </TouchableOpacity>
      {formError && (
        <View className="mt-4 bg-red-50 p-3 rounded-lg border border-red-200 w-full flex-row items-center">
          <AlertCircle size={16} color="#EF4444" />
          <Text className="text-red-600 ml-2">{formError}</Text>
        </View>
      )}
      
      {/* Drawer for adding seat option */}
      {drawerOpen && (
        <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-gray-200 p-6 z-50 shadow-2xl rounded-t-3xl">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-lg font-semibold text-gray-900">Add Seat Option</Text>
            <TouchableOpacity
              onPress={() => setDrawerOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close drawer"
            >
              <X size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          
          {SEAT_TYPES.filter(t => !options.find(o => o.type === t)).length === 0 ? (
            <View className="items-center py-6">
              <Text className="text-gray-600">All seat types are already added</Text>
            </View>
          ) : (
            SEAT_TYPES.filter(t => !options.find(o => o.type === t)).map((type) => (
              <TouchableOpacity
                key={type}
                className="w-full py-4 mb-3 rounded-xl bg-indigo-600 items-center shadow-sm flex-row justify-center"
                onPress={() => {
                  setOptions(prev => [
                    ...prev,
                    {
                      id: `local-${type}-${Date.now()}`,
                      bar_id: barId,
                      type,
                      enabled: true,
                      available_count: 10,
                      min_people: 1,
                      max_people: 2,
                    },
                  ]);
                  setDrawerOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Add ${type} seat option`}
                activeOpacity={0.85}
                disabled={saving}
              >
                <Plus size={18} color="#ffffff" />
                <Text className="text-white font-semibold text-base ml-2 capitalize">
                  {saving ? 'Adding...' : `${type} Seating`}
                </Text>
              </TouchableOpacity>
            ))
          )}
          
          <TouchableOpacity
            className="w-full py-3 mt-3 rounded-xl border border-gray-300 items-center"
            onPress={() => setDrawerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            activeOpacity={0.85}
          >
            <Text className="text-gray-700 font-medium text-base">Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // --- Main content view ---
  const isDirty = JSON.stringify(options) !== JSON.stringify(initialOptions);
  const hasMissingSeatTypes = SEAT_TYPES.filter(t => !options.find(o => o.type === t)).length > 0;

  return (
    <View className="mt-8 overflow-hidden">
      {/* Header */}
      <View className="px-5 py-4 bg-indigo-50 rounded-t-xl border-t border-x border-indigo-200 flex-row justify-between items-center">
        <Text className="text-lg font-bold text-indigo-900">Seat Options</Text>
        {hasMissingSeatTypes && (
          <TouchableOpacity
            className="bg-indigo-600 px-3 py-2 rounded-lg shadow-sm flex-row items-center"
            onPress={() => setDrawerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Add seat option"
            activeOpacity={0.85}
          >
            <Plus size={16} color="#ffffff" />
            <Text className="text-white font-medium text-sm ml-1">Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <View className="bg-white border-x border-gray-200 px-4 py-2">
        {SEAT_TYPES.map((type) => {
          const opt = options.find((o) => o.type === type);
          if (!opt) return null;
          
          // Get icon based on seat type
          const getSeatIcon = () => {
            switch(type) {
              case 'bar': return '🍸';
              case 'table': return '🪑';
              case 'vip': return '✨';
              default: return '🪑';
            }
          };
          
          return (
            <View key={type} className="mb-4 p-4 border border-gray-200 rounded-xl bg-gray-50 shadow-sm">
              {/* Header row */}
              <View className="flex-row items-center justify-between mb-4 pb-2 border-b border-gray-200">
                <View className="flex-row items-center">
                  <Text className="mr-2 text-2xl">{getSeatIcon()}</Text>
                  <Text className="text-lg font-semibold capitalize text-gray-800">{type}</Text>
                </View>
                <View className="flex-row">
                  <TouchableOpacity
                    className={`px-3 py-1 rounded-full flex-row items-center ${opt.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                    onPress={() => {
                      Alert.alert(
                        `${opt.enabled ? 'Disable' : 'Enable'} ${type} seating`,
                        `Are you sure you want to ${opt.enabled ? 'disable' : 'enable'} the ${type} seat option?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Yes', onPress: () => handleChange(type, 'enabled', !opt.enabled) },
                        ],
                      );
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Toggle ${type} enabled`}
                    activeOpacity={0.85}
                  >
                    {opt.enabled ? (
                      <ToggleRight size={16} color="#ffffff" />
                    ) : (
                      <ToggleLeft size={16} color="#ffffff" />
                    )}
                    <Text className="text-white font-medium ml-1 text-sm">
                      {opt.enabled ? 'Enabled' : 'Disabled'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="ml-2 p-1 rounded-full bg-red-100"
                    onPress={() => {
                      Alert.alert(
                        'Delete Seat Option',
                        `Are you sure you want to delete the ${type} seat option? This cannot be undone until you save.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => setOptions(prev => prev.filter(o => o.type !== type)) },
                        ],
                      );
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${type} seat option`}
                    activeOpacity={0.85}
                  >
                    <Trash2 size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Form fields */}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-xs text-gray-600 mb-1 font-medium">Available Seats</Text>
                  <TextInput
                    className={`border rounded-lg px-3 py-2 text-base ${opt.enabled ? 'bg-white border-gray-300' : 'bg-gray-100 border-gray-200 text-gray-500'}`}
                    value={String(opt.available_count)}
                    onChangeText={v => handleChange(type, 'available_count', Number(v.replace(/[^0-9]/g, '')))}
                    keyboardType="numeric"
                    editable={opt.enabled}
                    accessibilityLabel={`${type} available count`}
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs text-gray-600 mb-1 font-medium">Min People</Text>
                  <TextInput
                    className={`border rounded-lg px-3 py-2 text-base ${opt.enabled ? 'bg-white border-gray-300' : 'bg-gray-100 border-gray-200 text-gray-500'}`}
                    value={String(opt.min_people)}
                    onChangeText={v => handleChange(type, 'min_people', Number(v.replace(/[^0-9]/g, '')))}
                    keyboardType="numeric"
                    editable={opt.enabled}
                    accessibilityLabel={`${type} min people`}
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs text-gray-600 mb-1 font-medium">Max People</Text>
                  <TextInput
                    className={`border rounded-lg px-3 py-2 text-base ${opt.enabled ? 'bg-white border-gray-300' : 'bg-gray-100 border-gray-200 text-gray-500'}`}
                    value={String(opt.max_people)}
                    onChangeText={v => handleChange(type, 'max_people', Number(v.replace(/[^0-9]/g, '')))}
                    keyboardType="numeric"
                    editable={opt.enabled}
                    accessibilityLabel={`${type} max people`}
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* Footer */}
      <View className="bg-gray-50 px-4 py-3 border-b border-x border-gray-200 rounded-b-xl">
        {formError && (
          <View className="mb-3 bg-red-50 p-3 rounded-lg border border-red-200 flex-row items-center">
            <AlertCircle size={16} color="#EF4444" />
            <Text className="text-red-600 ml-2 flex-1">{formError}</Text>
          </View>
        )}

        {/* Revert Button (only if dirty) */}
        {isDirty && (
          <TouchableOpacity
            className="flex-row items-center justify-center py-3 mb-3 rounded-lg bg-gray-200 shadow-sm"
            onPress={handleRevert}
            accessibilityRole="button"
            accessibilityLabel="Revert seat option changes"
            activeOpacity={0.85}
          >
            <Undo2 size={16} color="#4B5563" />
            <Text className="text-gray-700 font-medium text-base ml-2">Revert Changes</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Drawer for adding seat option */}
      {drawerOpen && (
        <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-gray-200 p-6 z-50 shadow-2xl rounded-t-3xl">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-lg font-semibold text-gray-900">Add Seat Option</Text>
            <TouchableOpacity
              onPress={() => setDrawerOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close drawer"
            >
              <X size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          
          {SEAT_TYPES.filter(t => !options.find(o => o.type === t)).length === 0 ? (
            <View className="items-center py-6">
              <Check size={32} color="#4ADE80" />
              <Text className="text-gray-600 mt-2">All seat types are already added</Text>
            </View>
          ) : (
            SEAT_TYPES.filter(t => !options.find(o => o.type === t)).map((type) => (
              <TouchableOpacity
                key={type}
                className="w-full py-4 mb-3 rounded-xl bg-indigo-600 items-center shadow-sm flex-row justify-center"
                onPress={() => {
                  setOptions(prev => [
                    ...prev,
                    {
                      id: `local-${type}-${Date.now()}`,
                      bar_id: barId,
                      type,
                      enabled: true,
                      available_count: 10,
                      min_people: 1,
                      max_people: 2,
                    },
                  ]);
                  setDrawerOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Add ${type} seat option`}
                activeOpacity={0.85}
                disabled={saving}
              >
                <Plus size={18} color="#ffffff" />
                <Text className="text-white font-semibold text-base ml-2 capitalize">
                  {saving ? 'Adding...' : `${type} Seating`}
                </Text>
              </TouchableOpacity>
            ))
          )}
          
          <TouchableOpacity
            className="w-full py-3 mt-3 rounded-xl border border-gray-300 items-center"
            onPress={() => setDrawerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            activeOpacity={0.85}
          >
            <Text className="text-gray-700 font-medium text-base">Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});