import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react-native';
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

const seatOptionSchema = z.object({
  type: z.enum(["bar", "table", "vip"] as const),
  available_count: z.coerce.number().int().min(0, 'Must be ≥ 0'),
  min_people: z.coerce.number().int().min(1, 'Must be ≥ 1'),
  max_people: z.coerce.number().int().min(1, 'Must be ≥ 1'),
  enabled: z.boolean().optional(),
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
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const toast = useToast();

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

  // --- Mutations ---
  const addMutation = useMutation({
    mutationFn: async (values: SeatOptionFormValues) => {
      const { error, data } = await supabase
        .from('seat_options')
        .insert({ ...values, bar_id: barId })
        .select('*')
        .single();
      if (error) throw error;
      return data as SeatOption;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-options', barId] });
      toast.show({ type: 'success', text1: 'Seat option added!' });
      setAdding(false);
      onChange?.();
    },
    onError: (err: any) => {
      toast.show({ type: 'error', text1: 'Failed to add seat option', text2: err?.message });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: SeatOptionFormValues }) => {
      const { error, data } = await supabase
        .from('seat_options')
        .update(values)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as SeatOption;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-options', barId] });
      toast.show({ type: 'success', text1: 'Seat option updated!' });
      setEditing(null);
      onChange?.();
    },
    onError: (err: any) => {
      toast.show({ type: 'error', text1: 'Failed to update seat option', text2: err?.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('seat_options')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-options', barId] });
      toast.show({ type: 'success', text1: 'Seat option deleted!' });
      onChange?.();
    },
    onError: (err: any) => {
      toast.show({ type: 'error', text1: 'Failed to delete seat option', text2: err?.message });
    },
  });

  // --- Form Logic ---
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<SeatOptionFormValues>({
    resolver: zodResolver(seatOptionSchema),
    defaultValues: {
      type: seatOptionTypes[0],
      available_count: 0,
      min_people: 1,
      max_people: 1,
      enabled: true,
    },
    mode: 'onChange',
  });

  // --- Handlers ---
  const onAdd = (data: SeatOptionFormValues) => {
    if (seatOptions?.some(opt => opt.type === data.type)) {
      toast.show({ type: 'error', text1: 'Type already exists for this bar.' });
      return;
    }
    addMutation.mutate(data);
  };

  const onEdit = (data: SeatOptionFormValues) => {
    if (!editing) return;
    const current = seatOptions?.find(opt => opt.id === editing);
    if (data.type !== current?.type && seatOptions?.some(opt => opt.type === data.type)) {
      toast.show({ type: 'error', text1: 'Type already exists for this bar.' });
      return;
    }
    editMutation.mutate({ id: editing, values: data });
  };

  const startEdit = (opt: SeatOption) => {
    setEditing(opt.id);
    reset({
      type: opt.type,
      available_count: opt.available_count,
      min_people: opt.min_people,
      max_people: opt.max_people,
      enabled: opt.enabled,
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    reset();
  };

  const startAdd = () => {
    setAdding(true);
    reset();
  };

  const cancelAdd = () => {
    setAdding(false);
    reset();
  };

  // --- Render Form ---
  const renderForm = (mode: 'add' | 'edit') => (
    <View className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200">
      {/* Type Select */}
      <View className="mb-3">
        <Text className="text-sm font-medium text-gray-700 mb-1">Type</Text>
        <Controller
          control={control}
          name="type"
          render={({ field: { onChange, value } }) => (
            <View className="flex-row space-x-2">
              {seatOptionTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => onChange(type)}
                  disabled={mode === 'add' && seatOptions?.some(opt => opt.type === type)}
                  className={`px-3 py-1.5 rounded-lg border ${value === type ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}${mode === 'add' && seatOptions?.some(opt => opt.type === type) ? ' opacity-50' : ''}`}
                  accessibilityLabel={`Type: ${type}`}
                >
                  <Text className={value === type ? 'text-white font-semibold' : 'text-gray-700'}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />
        {errors.type && <Text className="text-red-600 text-xs mt-1">{errors.type.message as string}</Text>}
      </View>
      {/* Available Count */}
      <View className="mb-3">
        <Text className="text-sm font-medium text-gray-700 mb-1">Available Count</Text>
        <Controller
          control={control}
          name="available_count"
          render={({ field: { onChange, value } }) => (
            <TextInput
              className="border rounded-lg px-3 py-2 bg-white text-base text-gray-900"
              keyboardType="numeric"
              value={value?.toString() ?? ''}
              onChangeText={txt => onChange(Number(txt.replace(/[^0-9]/g, '')))}
              accessibilityLabel="Available Count"
              placeholder="0"
            />
          )}
        />
        {errors.available_count && <Text className="text-red-600 text-xs mt-1">{errors.available_count.message as string}</Text>}
      </View>
      {/* Min/Max People */}
      <View className="flex-row space-x-2 mb-3">
        <View className="flex-1">
          <Text className="text-sm font-medium text-gray-700 mb-1">Min People</Text>
          <Controller
            control={control}
            name="min_people"
            render={({ field: { onChange, value } }) => (
              <TextInput
                className="border rounded-lg px-3 py-2 bg-white text-base text-gray-900"
                keyboardType="numeric"
                value={value?.toString() ?? ''}
                onChangeText={txt => onChange(Number(txt.replace(/[^0-9]/g, '')))}
                accessibilityLabel="Min People"
                placeholder="1"
              />
            )}
          />
          {errors.min_people && <Text className="text-red-600 text-xs mt-1">{errors.min_people.message as string}</Text>}
        </View>
        <View className="flex-1">
          <Text className="text-sm font-medium text-gray-700 mb-1">Max People</Text>
          <Controller
            control={control}
            name="max_people"
            render={({ field: { onChange, value } }) => (
              <TextInput
                className="border rounded-lg px-3 py-2 bg-white text-base text-gray-900"
                keyboardType="numeric"
                value={value?.toString() ?? ''}
                onChangeText={txt => onChange(Number(txt.replace(/[^0-9]/g, '')))}
                accessibilityLabel="Max People"
                placeholder="1"
              />
            )}
          />
          {errors.max_people && <Text className="text-red-600 text-xs mt-1">{errors.max_people.message as string}</Text>}
        </View>
      </View>
      {/* Enabled Toggle */}
      <View className="mb-4 flex-row items-center">
        <Controller
          control={control}
          name="enabled"
          render={({ field: { onChange, value } }) => (
            <TouchableOpacity
              onPress={() => onChange(!value)}
              className="flex-row items-center"
              accessibilityLabel={value ? 'Enabled' : 'Disabled'}
            >
              {value ? <Eye size={18} color="#059669" /> : <EyeOff size={18} color="#b91c1c" />}
              <Text className={value ? 'text-green-700 ml-2' : 'text-red-700 ml-2'}>
                {value ? 'Enabled' : 'Disabled'}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
      {/* Form Actions */}
      <View className="flex-row justify-end space-x-2">
        <TouchableOpacity
          onPress={mode === 'add' ? cancelAdd : cancelEdit}
          className="bg-gray-200 rounded-lg px-4 py-2"
          accessibilityLabel="Cancel"
        >
          <Text className="text-gray-700 font-medium">Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSubmit(mode === 'add' ? onAdd : onEdit)}
          disabled={isSubmitting}
          className={`rounded-lg px-4 py-2 ${isSubmitting ? 'bg-gray-400' : 'bg-blue-600'}`}
          accessibilityLabel={mode === 'add' ? 'Add' : 'Save'}
        >
          {isSubmitting ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-white font-medium">{mode === 'add' ? 'Add' : 'Save'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  // --- Render ---
  return (
    <View className="bg-white rounded-xl shadow-md mx-4 mt-4 mb-6 overflow-hidden">
      {/* Header */}
      <View className="border-b border-gray-200 px-6 pt-6 pb-4 mb-2">
        <Text className="text-lg font-bold text-gray-900">Seat Options</Text>
        <Text className="text-sm text-gray-600 mt-1">Manage seat types, capacity, and availability.</Text>
      </View>
      <View className="px-6 pb-6">
        {/* Add Button */}
        {!adding && !editing && (
          <TouchableOpacity
            onPress={startAdd}
            className="flex-row items-center justify-end mb-4"
            accessibilityLabel="Add seat option"
          >
            <Plus size={18} color="#2563eb" />
            <Text className="text-blue-600 font-semibold ml-2">Add Seat Option</Text>
          </TouchableOpacity>
        )}
        {/* Add/Edit Form */}
        {adding && renderForm('add')}
        {editing && renderForm('edit')}
        {/* List Seat Options */}
        {isLoading ? (
          <ActivityIndicator size="large" color="#2563eb" className="mt-8" />
        ) : error ? (
          <Text className="text-red-600 text-center mt-6">Failed to load seat options.</Text>
        ) : seatOptions?.length === 0 ? (
          <Text className="text-gray-500 text-center mt-6">No seat options defined yet.</Text>
        ) : (
          <>
            {seatOptions?.map(item => (
              <View key={item.id} className="flex-row items-center border-b border-gray-100 py-3">
                <View className="flex-1">
                  <Text className="font-semibold text-gray-900">{item.type.charAt(0).toUpperCase() + item.type.slice(1)}</Text>
                  <Text className="text-xs text-gray-500">{item.enabled ? 'Enabled' : 'Disabled'}</Text>
                  <Text className="text-xs text-gray-700 mt-0.5">Available: {item.available_count} | Min: {item.min_people} | Max: {item.max_people}</Text>
                </View>
                <View className="flex-row items-center space-x-2">
                  <TouchableOpacity
                    onPress={() => startEdit(item)}
                    className="p-2"
                    accessibilityLabel="Edit seat option"
                  >
                    <Pencil size={16} color="#2563eb" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert('Delete Seat Option', 'Are you sure you want to delete this seat option?', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete', style: 'destructive',
                          onPress: () => deleteMutation.mutate(item.id),
                        },
                      ]);
                    }}
                    className="p-2"
                    accessibilityLabel="Delete seat option"
                  >
                    <Trash2 size={16} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <View style={{ height: 10 }} />
          </>
        )}
      </View>
    </View>
  );
};
