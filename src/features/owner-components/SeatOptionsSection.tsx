import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { fetchSeatOptions, updateSeatOption, createSeatOption, deleteSeatOption } from '@/src/features/seat-options/api';
import type { SeatOption, SeatOptionType } from '@/src/features/seat-options/types';

import { Plus, X, Trash2, ToggleLeft, ToggleRight, ChevronDown, Undo2, AlertCircle, Check } from 'lucide-react-native';


const SEAT_TYPES = ['bar', 'table', 'vip'] as const;

type Props = {
  barId: string;
  onDirtyStateChange: (dirty: boolean) => void;
  isSaving: boolean;
  onSaveComplete?: () => void;
};

export const SeatOptionsSection = (props: Props) => {
  const { barId, onDirtyStateChange, isSaving, onSaveComplete } = props;
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



  // Track dirty state
  useEffect(() => {
    const isDirty = JSON.stringify(options) !== JSON.stringify(initialOptions);
    onDirtyStateChange(isDirty);
  }, [options, initialOptions]);

  // Trigger save when isSaving becomes true
  const prevSaving = useRef(false);
  useEffect(() => {
    if (isSaving && !prevSaving.current) {
      // Only trigger on rising edge
      if (!validate()) {
        onSaveComplete?.();
        prevSaving.current = isSaving;
        return;
      }
      setSaving(true);
      mutation.mutate(undefined, {
        onSettled: () => {
          setSaving(false);
          onSaveComplete?.();
        },
      });
    }
    prevSaving.current = isSaving;
  }, [isSaving]);

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
    <View className="mt-6 items-center justify-center py-12 bg-[#0f0f13] rounded-2xl">
      <View className="bg-[#1c1c24] rounded-2xl p-6 mb-4">
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
      <Text className="text-gray-300 text-base">Loading seat options...</Text>
    </View>
  );

  // Error state
  if (error) return (
    <View className="mt-6 bg-[#1c1c24] p-6 rounded-2xl border border-red-800">
      <View className="flex-row items-center mb-2">
        <AlertCircle size={24} color="#EF4444" />
        <Text className="text-xl font-bold text-red-500 ml-2">Connection Error</Text>
      </View>
      <Text className="text-gray-300 mb-4">
        We couldn't load your seat options. Please check your connection and try again.
      </Text>
      <TouchableOpacity
        className="bg-purple-700 py-3 rounded-xl items-center"
        onPress={() => queryClient.invalidateQueries({ queryKey: ['seat-options', barId] })}
      >
        <Text className="text-white font-semibold text-base">Retry</Text>
      </TouchableOpacity>
    </View>
  );

  // Empty state
  if (!options.length) return (
    <View className="mt-6 bg-[#1c1c24] rounded-2xl p-6 border border-[#2d2d3a]">
      <View className="items-center py-6">
        <View className="w-16 h-16 rounded-full bg-purple-900/20 items-center justify-center mb-4">
          <Text className="text-3xl">🪑</Text>
        </View>
        <Text className="text-xl font-semibold text-white mb-2">No Seat Options</Text>
        <Text className="text-gray-400 text-center mb-6">
          You haven't added any seat options for this bar yet.
        </Text>
        <TouchableOpacity
          className="bg-purple-700 px-6 py-3.5 rounded-xl mb-2 shadow-sm flex-row items-center"
          onPress={() => setDrawerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Add seat option"
          activeOpacity={0.85}
          disabled={saving}
        >
          <Plus size={20} color="#ffffff" />
          <Text className="text-white font-semibold text-base ml-2">Add Seat Option</Text>
        </TouchableOpacity>
      </View>
      
      {formError && (
        <View className="mt-4 bg-red-900/30 p-4 rounded-xl border border-red-800 flex-row items-center">
          <AlertCircle size={20} color="#EF4444" />
          <Text className="text-red-400 ml-2 flex-1">{formError}</Text>
        </View>
      )}
      
      {/* Drawer for adding seat option */}
      {drawerOpen && (
        <View className="absolute left-0 right-0 bottom-0 bg-[#1c1c24] border-t border-[#2d2d3a] p-6 z-50 shadow-2xl rounded-t-3xl">
          <View

            className="absolute top-0 left-0 right-0 h-2 rounded-t-3xl"
          />
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-xl font-bold text-white">Add Seat Option</Text>
            <TouchableOpacity
              className="p-2 rounded-full bg-[#2d2d3a]"
              onPress={() => setDrawerOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close drawer"
            >
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          
          {SEAT_TYPES.filter(t => !options.find(o => o.type === t)).length === 0 ? (
            <View className="items-center py-8">
              <View className="w-16 h-16 rounded-full bg-green-900/20 items-center justify-center mb-4">
                <Check size={32} color="#4ADE80" />
              </View>
              <Text className="text-gray-300 text-center">All seat types are already added</Text>
            </View>
          ) : (
            SEAT_TYPES.filter(t => !options.find(o => o.type === t)).map((type) => (
              <TouchableOpacity
                key={type}
                className="w-full py-4 mb-3 rounded-xl bg-purple-700 items-center shadow-sm flex-row justify-center"
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
            className="w-full py-3.5 mt-3 rounded-xl border border-[#2d2d3a] items-center"
            onPress={() => setDrawerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            activeOpacity={0.85}
          >
            <Text className="text-gray-300 font-medium text-base">Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // --- Main content view ---
  const isDirty = JSON.stringify(options) !== JSON.stringify(initialOptions);
  const hasMissingSeatTypes = SEAT_TYPES.filter(t => !options.find(o => o.type === t)).length > 0;

  return (
    <View className="mt-6 overflow-hidden">
      {/* Header */}
      <View

        className="py-4 px-5 rounded-t-2xl"
      >
        <View className="flex-row justify-between items-center">
          <Text className="text-xl font-bold text-white">Seat Options</Text>
          {hasMissingSeatTypes && (
            <TouchableOpacity
              className="bg-purple-800 px-3.5 py-2 rounded-lg shadow-sm flex-row items-center"
              onPress={() => setDrawerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Add seat option"
              activeOpacity={0.85}
            >
              <Plus size={16} color="#ffffff" />
              <Text className="text-white font-medium text-sm ml-1.5">Add Option</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text className="text-gray-300 opacity-80 mt-1">
          Configure seating options for your bar
        </Text>
      </View>

      {/* Content */}
      <View className="bg-[#0f0f13] px-4 py-4">
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
            <View 
              key={type} 
              className={`mb-4 p-4 border rounded-xl shadow-sm ${
                opt.enabled 
                  ? 'bg-[#1c1c24] border-[#2d2d3a]' 
                  : 'bg-[#1c1c24]/50 border-[#2d2d3a]/50'
              }`}
            >
              {/* Header row */}
              <View className="flex-row items-center justify-between mb-4 pb-3 border-b border-[#2d2d3a]">
                <View className="flex-row items-center">
                  <View className="w-10 h-10 rounded-full bg-purple-900/20 items-center justify-center mr-3">
                    <Text className="text-xl">{getSeatIcon()}</Text>
                  </View>
                  <Text className="text-lg font-semibold capitalize text-white">{type}</Text>
                </View>
                <View className="flex-row">
                  <TouchableOpacity
                    className={`px-3 py-1.5 rounded-full flex-row items-center ${
                      opt.enabled ? 'bg-green-600' : 'bg-gray-600'
                    }`}
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
                    <Text className="text-white font-medium ml-1.5 text-sm">
                      {opt.enabled ? 'Enabled' : 'Disabled'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="ml-2 p-2 rounded-full bg-red-900/30"
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
                  <Text className="text-xs text-gray-400 mb-1.5 font-medium">Available Seats</Text>
                  <TextInput
                    className={`border rounded-lg px-3 py-2.5 text-base ${
                      opt.enabled 
                        ? 'bg-[#2d2d3a] border-[#3d3d4a] text-white' 
                        : 'bg-[#2d2d3a]/50 border-[#3d3d4a]/50 text-gray-500'
                    }`}
                    value={String(opt.available_count)}
                    onChangeText={v => handleChange(type, 'available_count', Number(v.replace(/[^0-9]/g, '')))}
                    keyboardType="numeric"
                    editable={opt.enabled}
                    accessibilityLabel={`${type} available count`}
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs text-gray-400 mb-1.5 font-medium">Min People</Text>
                  <TextInput
                    className={`border rounded-lg px-3 py-2.5 text-base ${
                      opt.enabled 
                        ? 'bg-[#2d2d3a] border-[#3d3d4a] text-white' 
                        : 'bg-[#2d2d3a]/50 border-[#3d3d4a]/50 text-gray-500'
                    }`}
                    value={String(opt.min_people)}
                    onChangeText={v => handleChange(type, 'min_people', Number(v.replace(/[^0-9]/g, '')))}
                    keyboardType="numeric"
                    editable={opt.enabled}
                    accessibilityLabel={`${type} min people`}
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs text-gray-400 mb-1.5 font-medium">Max People</Text>
                  <TextInput
                    className={`border rounded-lg px-3 py-2.5 text-base ${
                      opt.enabled 
                        ? 'bg-[#2d2d3a] border-[#3d3d4a] text-white' 
                        : 'bg-[#2d2d3a]/50 border-[#3d3d4a]/50 text-gray-500'
                    }`}
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
      <View className="bg-[#1c1c24] px-4 py-4 rounded-b-2xl border-t border-[#2d2d3a]">
        {formError && (
          <View className="mb-4 bg-red-900/30 p-4 rounded-xl border border-red-800 flex-row items-center">
            <AlertCircle size={20} color="#EF4444" />
            <Text className="text-red-400 ml-2 flex-1">{formError}</Text>
          </View>
        )}

        {/* Revert Button (only if dirty) */}
        {isDirty && (
          <TouchableOpacity
            className="flex-row items-center justify-center py-3.5 rounded-xl bg-[#2d2d3a] shadow-sm"
            onPress={handleRevert}
            accessibilityRole="button"
            accessibilityLabel="Revert seat option changes"
            activeOpacity={0.85}
          >
            <Undo2 size={18} color="#d1d5db" />
            <Text className="text-gray-300 font-medium text-base ml-2">Revert Changes</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Drawer for adding seat option */}
      {drawerOpen && (
        <View className="absolute left-0 right-0 bottom-0 bg-[#1c1c24] border-t border-[#2d2d3a] p-6 z-50 shadow-2xl rounded-t-3xl">
          <View

            className="absolute top-0 left-0 right-0 h-2 rounded-t-3xl"
          />
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-xl font-bold text-white">Add Seat Option</Text>
            <TouchableOpacity
              className="p-2 rounded-full bg-[#2d2d3a]"
              onPress={() => setDrawerOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close drawer"
            >
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          
          {SEAT_TYPES.filter(t => !options.find(o => o.type === t)).length === 0 ? (
            <View className="items-center py-8">
              <View className="w-16 h-16 rounded-full bg-green-900/20 items-center justify-center mb-4">
                <Check size={32} color="#4ADE80" />
              </View>
              <Text className="text-gray-300 text-center">All seat types are already added</Text>
            </View>
          ) : (
            SEAT_TYPES.filter(t => !options.find(o => o.type === t)).map((type) => (
              <TouchableOpacity
                key={type}
                className="w-full py-4 mb-3 rounded-xl bg-purple-700 items-center shadow-sm flex-row justify-center"
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
            className="w-full py-3.5 mt-3 rounded-xl border border-[#2d2d3a] items-center"
            onPress={() => setDrawerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            activeOpacity={0.85}
          >
            <Text className="text-gray-300 font-medium text-base">Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}