import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Platform, ActivityIndicator, Switch, TextInput,
  TouchableOpacity,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { useToast } from '@/src/components/general/Toast';
import { AlertCircle, ChevronDown } from 'lucide-react-native';
import type { Database } from '@/src/lib/database.types';
import { z } from 'zod';
import { Controller, FieldErrors, Control } from 'react-hook-form';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import EditBarInfoModal, { EditableField } from '@/src/components/general/editModal'; // Adjust path if needed
import DisplayField from '@/src/components/general/display-field';

export type Bar = Database['public']['Tables']['bars']['Row'];
type BarUpdate = Database['public']['Tables']['bars']['Update'];

export const barFormSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
    address: z.string().min(1, 'Address is required').max(255, 'Address too long'),
    location: z.string().min(1, 'Location text is required').max(100, 'Location text too long'),
    description: z.string().max(500, 'Description too long (max 500 chars)').nullable().optional(),
    phone: z.string().max(20, 'Phone number too long').nullable().optional().transform(val => val === '' ? null : val),
    website: z.string().max(255, 'Website URL too long').url({ message: "Invalid URL format (e.g., https://example.com)" }).or(z.literal('')).nullable().optional().transform(val => val === '' ? null : val),
    reservation_hold_until: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Use HH:MM format (e.g., 17:00)' }).or(z.literal('')).nullable().optional().transform(val => val === '' ? null : val),
    live: z.boolean(),
});

export type BarFormValues = z.infer<typeof barFormSchema>;

export type FormInputProps = {
  label: string;
  name: keyof BarFormValues;
  control: Control<BarFormValues>;
  errors: FieldErrors<BarFormValues>;
  placeholder?: string;
  multiline?: boolean;
  numberOfLines?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'url' | 'numbers-and-punctuation';
  secureTextEntry?: boolean;
};

export const FormInput: React.FC<FormInputProps> = ({
  label, name, control, errors, placeholder, multiline = false, numberOfLines = 1,
  autoCapitalize = 'sentences', keyboardType = 'default', secureTextEntry = false,
}) => {
  const hasError = !!errors[name];
  return (
    <View>
      <Text className="block text-xs font-medium text-gray-600 mb-1">{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className={`
              w-full border border-gray-300 rounded-md px-3 py-2 bg-white
              text-sm text-gray-900 placeholder-gray-400
              min-h-[42px]
              ${multiline ? 'h-auto min-h-[84px] align-top' : ''}
              ${hasError ? 'border-red-500 ring-1 ring-red-500' : ''}
              focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500
            `}
            placeholder={placeholder} placeholderTextColor="#9ca3af"
            value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
            onChangeText={onChange} onBlur={onBlur}
            accessibilityLabel={label} multiline={multiline}
            numberOfLines={multiline ? numberOfLines : 1}
            textAlignVertical={multiline ? 'top' : 'center'}
            autoCapitalize={autoCapitalize} keyboardType={keyboardType}
            secureTextEntry={secureTextEntry}
          />
        )}
      />
    </View>
  );
};

export type FormSwitchProps = {
  label: string;
  name: 'live';
  control: Control<BarFormValues>;
  labelDescription?: string;
};

export const FormSwitch: React.FC<FormSwitchProps> = ({ label, name, control, labelDescription }) => {
  return (
    <View className="flex-row items-center justify-between py-2">
      <View className="flex-shrink mr-3">
        <Text className="text-sm font-medium text-gray-800">{label}</Text>
        {labelDescription && <Text className="text-xs text-gray-500 mt-0.5">{labelDescription}</Text>}
      </View>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, value } }) => (
          <Switch
            trackColor={{ false: '#d1d5db', true: '#a5b4fc' }}
            thumbColor={value ? '#4f46e5' : '#f9fafb'}
            ios_backgroundColor="#d1d5db"
            onValueChange={onChange}
            value={value ?? false}
            accessibilityLabel={label}
          />
        )}
      />
    </View>
  );
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type BarInfoSectionProps = {
  barId: string;
};

const BarInfoSection = ({ barId }: BarInfoSectionProps): JSX.Element | null => {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingField, setEditingField] = useState<EditableField | null>(null);

  const {
    data: bar,
    isPending: barLoading,
    error: barError,
    refetch, // Destructure refetch from useQuery result
  } = useQuery<Bar | null>({
    queryKey: ['bar', barId],
    enabled: !!barId && !!profile,
    queryFn: async () => {
        if (!barId || !profile) return null;
        const { data, error } = await supabase.from('bars').select('*').eq('id', barId).single();
        if (error) { if (error.code === 'PGRST116') return null; throw new Error(error.message || 'Failed to fetch bar data.'); }
        if (data && data.owner_id !== profile.id) { toast.show({ type: 'error', text1: 'Access denied', text2: 'You do not own this bar.' }); router.replace('/(admin)/admin-panel'); return null; }
        return data;
    },
    retry: false,
  });

  const updateBar = useMutation({
    mutationFn: async (values: Partial<BarUpdate>) => {
      const updatePayload = { ...values, updated_at: new Date().toISOString() };
      const { error } = await supabase.from('bars').update(updatePayload).eq('id', barId);
      if (error) { throw new Error(error.message || 'Failed to update bar.'); }
    },
    onSuccess: async () => {
      // Invalidate first to mark as stale
      await queryClient.invalidateQueries({ queryKey: ['bar', barId] });
      // Then explicitly refetch to ensure fresh data is loaded
      await refetch(); // <<<====== ADDED REFETCH
      toast.show({ type: 'success', text1: 'Bar information updated!' });
      setModalVisible(false);
      setEditingField(null);
    },
    onError: (err: Error) => {
      toast.show({ type: 'error', text1: 'Update failed', text2: err?.message });
    },
  });

  const handleEditPress = (field: EditableField) => { setEditingField(field); setModalVisible(true); };
  const handleCloseModal = () => { setModalVisible(false); setEditingField(null); };
  const handleSaveChanges = async (data: Partial<BarFormValues>) => { await updateBar.mutateAsync(data as Partial<BarUpdate>); };
  const toggleExpansion = useCallback(() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setIsExpanded(prev => !prev); }, []);

  // Chevron animation with Reanimated
  const arrowRotation = useSharedValue(0);
  useEffect(() => {
    arrowRotation.value = withTiming(isExpanded ? 180 : 0, { duration: 200 });
  }, [isExpanded]);
  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${arrowRotation.value}deg` }],
  }));

  if (barLoading || !profile) {
    return (
      <View className="bg-white rounded-lg border border-gray-200 mx-2 my-2">
        <View className="flex-row justify-between items-center p-3 min-h-[56px]">
          <Text className="text-sm font-medium text-gray-700">Bar Information</Text>
          <ActivityIndicator size="small" color="#4f46e5" />
        </View>
      </View>
    );
  }

  if (barError || !bar) {
     return (
      <View className="bg-white rounded-lg border border-red-200 mx-2 my-2 p-3.5 items-center justify-center min-h-[110px]">
         <AlertCircle size={18} className="text-red-500 mb-1.5"/>
         <Text className="text-red-600 mb-1 text-center font-medium text-sm">
             {barError ? 'Error Loading' : 'Not Found/Access Denied'}
         </Text>
         {barError && <Text className="text-gray-500 text-xs text-center">{barError.message}</Text>}
         <TouchableOpacity onPress={() => refetch()} className="mt-2.5 py-1 px-2.5 bg-red-50 rounded-md">
             <Text className="text-red-700 text-xs font-medium">Try Again</Text>
         </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <View className="flex-1 bg-white rounded-xl shadow-sm m-2">
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={toggleExpansion}
          className={`p-3 flex-row justify-between items-center`}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          accessibilityLabel="Bar Information Section"
          accessibilityHint={isExpanded ? "Tap to collapse" : "Tap to expand"}
        >
         <View>
                 <Text className="text-xl font-bold text-gray-800">Bar Information</Text>
                 <Text className="text-sm text-gray-500 mt-1">Manage bar details and settings.</Text>
               </View>
           <Animated.View style={chevronAnimatedStyle}>
             <ChevronDown size={18} color={isExpanded ? '#4f46e5' : '#6b7280'} />
           </Animated.View>
        </TouchableOpacity>

        {isExpanded && (
          <View className="px-4 pt-2 pb-1 border-t border-gray-100">
            <DisplayField
                label="Bar Status"
                value={bar.live}
                formatValue={(val): string => (typeof val === 'boolean' ? (val ? 'Live' : 'Not Live') : 'N/A')}
                onEditPress={() => handleEditPress('live')}
            />
            <DisplayField label="Bar Name" value={bar.name} onEditPress={() => handleEditPress('name')} />
            <DisplayField label="Address" value={bar.address} onEditPress={() => handleEditPress('address')} />
            <DisplayField
              label="Location Info / Coordinates"
              value={typeof bar.location === 'string' ? bar.location : JSON.stringify(bar.location)}
              onEditPress={() => handleEditPress('location')}
            />
            <DisplayField label="Phone Number" value={bar.phone} onEditPress={() => handleEditPress('phone')} />
            <DisplayField label="Website" value={bar.website} onEditPress={() => handleEditPress('website')} />
            <DisplayField
                label="Reservation Hold Time"
                value={bar.reservation_hold_until}
                formatValue={(val): string => val ? String(val).substring(0, 5) : 'Not set'}
                onEditPress={() => handleEditPress('reservation_hold_until')}
            />
            <DisplayField
                label="Description"
                value={bar.description}
                formatValue={(val): string => val ? String(val) : 'Not set'}
                onEditPress={() => handleEditPress('description')}
            />
            
          </View>
        )}
      </View>

      <EditBarInfoModal
        visible={modalVisible}
        onClose={handleCloseModal}
        onSave={handleSaveChanges}
        barData={bar}
        editingField={editingField}
        isSaving={updateBar.isPending}
      />
    </>
  );
};

export default BarInfoSection;