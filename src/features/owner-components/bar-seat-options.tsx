import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, Switch } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { Constants } from '../../lib/database.types';
import { useToast } from '@/src/components/general/Toast';

// --- Types & Schema ---
const seatOptionTypes = Constants.public.Enums.seat_option_type;

export type SeatOptionType = typeof seatOptionTypes[number];

export type SeatOption = {
  id: string;
  bar_id: string;
  type: SeatOptionType;
  enabled: boolean;
  available_count: number;
  min_people: number;
  max_people: number;
};

// Define the schema with all required fields to avoid type errors
const seatOptionSchema = z.object({
  type: z.enum(["bar", "table", "vip"] as const),
  available_count: z.coerce.number().int().min(0, 'Must be ≥ 0'),
  min_people: z.coerce.number().int().min(1, 'Must be ≥ 1'),
  max_people: z.coerce.number().int().min(1, 'Must be ≥ 1'),
  enabled: z.boolean(),
}).refine((data) => data.max_people >= data.min_people, {
  message: 'Max people must be ≥ min people',
  path: ['max_people'],
});

export type SeatOptionFormValues = z.infer<typeof seatOptionSchema>;

// --- Props ---
type BarSeatOptionsProps = {
  barId: string;
  onChange?: () => void;
};

export const BarSeatOptions = ({ barId, onChange }: BarSeatOptionsProps): JSX.Element => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editingType, setEditingType] = useState<SeatOptionType | null>(null);
  
  // State to track local changes before saving
  const [localSeatOptions, setLocalSeatOptions] = useState<Record<SeatOptionType, {
    exists: boolean;
    isNew: boolean;
    toDelete: boolean;
    values: SeatOptionFormValues;
    originalId?: string;
  } | null>>({} as any);

  // --- Fetch seat options ---
  const { data: seatOptions, isLoading, error } = useQuery<SeatOption[]>({
    queryKey: ['seat-options', barId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seat_options')
        .select('*')
        .eq('bar_id', barId)
        .order('type', { ascending: true });
      if (error) throw error;
      return data as SeatOption[];
    },
    enabled: !!barId,
  });

  // Initialize local state from database data
  useEffect(() => {
    if (seatOptions) {
      const initialLocalState: Record<SeatOptionType, any> = {} as any;
      
      // Initialize all types as non-existent
      seatOptionTypes.forEach(type => {
        initialLocalState[type] = null;
      });
      
      // Update with existing options from database
      seatOptions.forEach(option => {
        initialLocalState[option.type] = {
          exists: true,
          isNew: false,
          toDelete: false,
          originalId: option.id,
          values: {
            type: option.type,
            available_count: option.available_count,
            min_people: option.min_people,
            max_people: option.max_people,
            enabled: option.enabled,
          }
        };
      });
      
      setLocalSeatOptions(initialLocalState);
    }
  }, [seatOptions]);

  // --- Mutations ---
  const saveMutation = useMutation({
    mutationFn: async (options: Record<SeatOptionType, any>) => {
      // Collect operations
      const toCreate: any[] = [];
      const toUpdate: {id: string, values: any}[] = [];
      const toDelete: string[] = [];
      
      Object.entries(options).forEach(([type, option]) => {
        if (!option) return;
        
        const seatType = type as SeatOptionType;
        
        if (option.isNew && !option.toDelete) {
          // Create new
          toCreate.push({
            bar_id: barId,
            type: seatType,
            ...option.values
          });
        } else if (!option.isNew && option.toDelete) {
          // Delete existing
          if (option.originalId) {
            toDelete.push(option.originalId);
          }
        } else if (!option.isNew && !option.toDelete) {
          // Update existing
          if (option.originalId) {
            toUpdate.push({
              id: option.originalId,
              values: option.values
            });
          }
        }
      });
      
      // Execute operations in parallel
      const operations = [];
      
      if (toCreate.length > 0) {
        operations.push(
          supabase.from('seat_options').insert(toCreate)
        );
      }
      
      for (const item of toUpdate) {
        operations.push(
          supabase.from('seat_options')
            .update(item.values)
            .eq('id', item.id)
        );
      }
      
      for (const id of toDelete) {
        operations.push(
          supabase.from('seat_options').delete().eq('id', id)
        );
      }
      
      if (operations.length === 0) {
        return { message: "No changes to save" };
      }
      
      const results = await Promise.all(operations);
      const errors = results.filter(r => r.error).map(r => r.error);
      
      if (errors.length > 0) {
        throw new Error(errors.map(e => e?.message).join(", "));
      }
      
      return { 
        created: toCreate.length,
        updated: toUpdate.length,
        deleted: toDelete.length
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['seat-options', barId] });
      toast.show({ 
        type: 'success', 
        text1: 'Seat options saved successfully',
        text2: `Created: ${data.created}, Updated: ${data.updated}, Deleted: ${data.deleted}`
      });
      onChange?.();
      setEditingType(null);
    },
    onError: (err: any) => {
      toast.show({ type: 'error', text1: 'Failed to save seat options', text2: err?.message });
    },
  });

  // --- Handlers ---
  // Toggle option existence locally
  const toggleSeatOption = (type: SeatOptionType) => {
    setLocalSeatOptions(prev => {
      const current = prev[type];
      
      if (!current) {
        // Option doesn't exist locally or in DB, create it
        return {
          ...prev,
          [type]: {
            exists: true,
            isNew: true,
            toDelete: false,
            values: {
              type,
              available_count: 0,
              min_people: 1,
              max_people: 1,
              enabled: true
            }
          }
        };
      } else if (current.exists) {
        // Option exists, mark for deletion if it's in DB, or remove if it's new
        if (current.isNew) {
          // It's new and not saved to DB yet, just remove it
          const newState = {...prev};
          newState[type] = null;
          return newState;
        } else {
          // It exists in DB, mark for deletion
          return {
            ...prev,
            [type]: {
              ...current,
              exists: false,
              toDelete: true
            }
          };
        }
      } else {
        // Option was marked for deletion, unmark it
        return {
          ...prev,
          [type]: {
            ...current,
            exists: true,
            toDelete: false
          }
        };
      }
    });
    
    // If enabling a type, start editing it
    setEditingType(type);
  };

  // Update field value locally
  const updateFieldValue = (type: SeatOptionType, field: keyof SeatOptionFormValues, value: any) => {
    setLocalSeatOptions(prev => {
      const current = prev[type];
      if (!current) return prev;
      
      return {
        ...prev,
        [type]: {
          ...current,
          values: {
            ...current.values,
            [field]: value
          }
        }
      };
    });
  };

  // Handle edit toggle
  const handleEditToggle = (type: SeatOptionType) => {
    if (editingType === type) {
      setEditingType(null);
    } else {
      setEditingType(type);
    }
  };

  // Handle save all changes
  const handleSaveChanges = () => {
    saveMutation.mutate(localSeatOptions);
  };

  // Handle cancel all changes
  const handleCancelChanges = () => {
    // Reset to original db state
    if (seatOptions) {
      const resetState: Record<SeatOptionType, any> = {} as any;
      
      // Initialize all types as non-existent
      seatOptionTypes.forEach(type => {
        resetState[type] = null;
      });
      
      // Update with existing options from database
      seatOptions.forEach(option => {
        resetState[option.type] = {
          exists: true,
          isNew: false,
          toDelete: false,
          originalId: option.id,
          values: {
            type: option.type,
            available_count: option.available_count,
            min_people: option.min_people,
            max_people: option.max_people,
            enabled: option.enabled,
          }
        };
      });
      
      setLocalSeatOptions(resetState);
    }
    
    setEditingType(null);
  };

  // --- Check if there are any pending changes ---
  const hasPendingChanges = () => {
    if (!seatOptions || !localSeatOptions) return false;
    
    // Check for new or deleted options
    const dbOptions = new Set(seatOptions.map(opt => opt.type));
    
    for (const type of seatOptionTypes) {
      const local = localSeatOptions[type];
      
      // New option
      if (local && local.isNew) return true;
      
      // Deleted option
      if (local && local.toDelete) return true;
      
      // Modified option
      if (local && !local.isNew && !local.toDelete) {
        const dbOption = seatOptions.find(opt => opt.type === type);
        if (dbOption) {
          if (
            dbOption.available_count !== local.values.available_count ||
            dbOption.min_people !== local.values.min_people ||
            dbOption.max_people !== local.values.max_people ||
            dbOption.enabled !== local.values.enabled
          ) {
            return true;
          }
        }
      }
    }
    
    return false;
  };

  // --- Render Each Seat Option Type ---
  const renderSeatOptionCard = (type: SeatOptionType) => {
    const dbOption = seatOptions?.find(opt => opt.type === type);
    const localOption = localSeatOptions[type];
    
    // Determine if this option is active based on local state
    const isEnabled = localOption?.exists || false;
    const isEditing = editingType === type;
    
    // Get values to display - either from local state or DB
    const displayValues = localOption?.values || {
      type,
      available_count: 0,
      min_people: 1,
      max_people: 1,
      enabled: true
    };

    return (
      <View key={type} className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        {/* Header with Type and Toggle */}
        <View className="flex-row items-center justify-between mb-2">
          <Text className="font-bold text-gray-900 text-base">
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </Text>
          
          <View className="flex-row items-center">
            {isEnabled && (
              <TouchableOpacity
                onPress={() => handleEditToggle(type)}
                className="p-2 mr-2"
              >
                {isEditing ? (
                  <Eye size={20} color="#2563eb" />
                ) : (
                  <EyeOff size={20} color="#64748b" />
                )}
              </TouchableOpacity>
            )}
            
            <Switch
              value={isEnabled}
              onValueChange={() => toggleSeatOption(type)}
              accessibilityLabel={isEnabled ? 'Enabled' : 'Disabled'}
              trackColor={{ false: '#f87171', true: '#4ade80' }}
              thumbColor={isEnabled ? '#059669' : '#b91c1c'}
            />
          </View>
        </View>
        
        {/* Status Indicator */}
        <View className="flex-row flex-wrap gap-2 mb-3">
          <View
            className={`px-2 py-1 rounded-full ${
              displayValues.enabled ? 'bg-green-100' : 'bg-red-100'
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                displayValues.enabled ? 'text-green-800' : 'text-red-800'
              }`}
            >
              {displayValues.enabled ? 'Active' : 'Temporarily Disabled'}
            </Text>
          </View>
          
          {/* Show pending status if different from DB */}
          {(localOption?.isNew || localOption?.toDelete || 
           (dbOption && localOption && 
            (dbOption.available_count !== localOption.values.available_count ||
             dbOption.min_people !== localOption.values.min_people ||
             dbOption.max_people !== localOption.values.max_people ||
             dbOption.enabled !== localOption.values.enabled)
           )) && (
            <View className="px-2 py-1 rounded-full bg-yellow-100">
              <Text className="text-xs text-yellow-800">Unsaved Changes</Text>
            </View>
          )}
        </View>
        
        {/* Brief info for enabled but not editing */}
        {isEnabled && !isEditing && (
          <View className="mt-1">
            <Text className="text-sm text-gray-600">
              Seats: {displayValues.available_count} / People Min: {displayValues.min_people} • Max: {displayValues.max_people}
            </Text>
          </View>
        )}
        
        {/* Form for editing */}
        {isEnabled && isEditing && (
          <View className="mt-2">
            {/* Temporary Disable Switch */}
            <View className="flex-row items-center justify-between mb-3 p-2 bg-gray-50 rounded-lg">
              <Text className="text-sm font-medium text-gray-700">Temporary Disable</Text>
              <Switch
                value={!displayValues.enabled}
                onValueChange={(value) => updateFieldValue(type, 'enabled', !value)}
                trackColor={{ false: '#4ade80', true: '#f87171' }}
                thumbColor={!displayValues.enabled ? '#b91c1c' : '#059669'}
              />
            </View>

            {/* Available Count */}
            <View className="mb-3">
              <Text className="text-sm font-medium text-gray-700 mb-1">Available Count</Text>
              <TextInput
                className="border border-gray-300 rounded-lg px-3 py-2 bg-white text-base text-gray-900"
                keyboardType="numeric"
                value={displayValues.available_count.toString()}
                onChangeText={txt => {
                  const numValue = Number(txt.replace(/[^0-9]/g, ''));
                  updateFieldValue(type, 'available_count', numValue);
                }}
                placeholder="0"
              />
            </View>

            {/* Min/Max People */}
            <View className="flex-row space-x-2 mb-3">
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-700 mb-1">Min People</Text>
                <TextInput
                  className="border border-gray-300 rounded-lg px-3 py-2 bg-white text-base text-gray-900"
                  keyboardType="numeric"
                  value={displayValues.min_people.toString()}
                  onChangeText={txt => {
                    const numValue = Number(txt.replace(/[^0-9]/g, ''));
                    updateFieldValue(type, 'min_people', numValue || 1);
                  }}
                  placeholder="1"
                />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-700 mb-1">Max People</Text>
                <TextInput
                  className="border border-gray-300 rounded-lg px-3 py-2 bg-white text-base text-gray-900"
                  keyboardType="numeric"
                  value={displayValues.max_people.toString()}
                  onChangeText={txt => {
                    const numValue = Number(txt.replace(/[^0-9]/g, ''));
                    updateFieldValue(type, 'max_people', numValue || 1);
                  }}
                  placeholder="1"
                />
              </View>
            </View>
          </View>
        )}
      </View>
    );
  };

  // --- Main Render ---
  return (
    <View className="bg-white rounded-xl shadow-md p-4">
      {/* Header */}
      <View className="border-b border-gray-200 pb-4 mb-4">
        <Text className="text-xl font-bold text-gray-900">Seat Options</Text>
        <Text className="text-sm text-gray-600 mt-1">
          Toggle options to enable or disable them
        </Text>
      </View>
      
      {/* Content */}
      <View>
        {isLoading ? (
          <View className="items-center py-8">
            <ActivityIndicator size="large" color="#2563eb" />
            <Text className="text-gray-500 mt-2">Loading...</Text>
          </View>
        ) : error ? (
          <View className="bg-red-50 p-4 rounded-lg">
            <Text className="text-red-600 text-center">Failed to load seat options</Text>
          </View>
        ) : (
          <>
            {/* Always render all option types */}
            {seatOptionTypes.map(type => renderSeatOptionCard(type))}
            
            {/* Save/Cancel Action Bar */}
            {hasPendingChanges() && (
              <View className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100 flex-row justify-end space-x-3">
                <TouchableOpacity
                  onPress={handleCancelChanges}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg"
                >
                  <Text className="text-gray-700 font-medium">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveChanges}
                  disabled={saveMutation.isPending}
                  className={`px-4 py-2 rounded-lg ${saveMutation.isPending ? 'bg-blue-400' : 'bg-blue-600'}`}
                >
                  {saveMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="text-white font-medium">Save All Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
};