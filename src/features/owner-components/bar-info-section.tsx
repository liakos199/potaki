import React from 'react';
import { View, Text, TextInput, Platform, ScrollView } from 'react-native'; // Added ScrollView
import { Controller, Control, FieldErrors } from 'react-hook-form';
import { z } from 'zod';
import SaveButton from '@/src/features/owner-components/SaveButton';
import { AlertCircle, Info } from 'lucide-react-native';

// Zod schema (remains the same)
export const barFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  address: z.string().min(1, 'Address is required').max(255, 'Address too long'),
  location: z.string().min(1, 'Location is required').max(100, 'Location too long'),
  description: z.string().max(500, 'Description too long (max 500 chars)').optional(),
});
export type BarFormValues = z.infer<typeof barFormSchema>;

// FormInput Helper Component (remains the same)
type FormInputProps = {
  label: string;
  name: keyof BarFormValues;
  control: Control<BarFormValues>;
  errors: FieldErrors<BarFormValues>;
  placeholder?: string;
  multiline?: boolean;
  numberOfLines?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  secureTextEntry?: boolean;
};

const FormInput: React.FC<FormInputProps> = ({
  label, name, control, errors, placeholder, multiline = false, numberOfLines = 1,
  autoCapitalize = 'sentences', keyboardType = 'default', secureTextEntry = false,
}) => {
  const hasError = !!errors[name];
  return (
    <View className="mb-5">
      <Text className="text-sm font-medium text-gray-700 mb-1.5">{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className={`
              border rounded-lg px-4 py-3 bg-gray-50 text-base text-gray-900
              min-h-[50px]
              ${multiline ? 'min-h-[100px]' : ''}
              ${hasError ? 'border-red-400' : 'border-gray-300'}
              focus:border-blue-500 focus:ring-1 focus:ring-blue-500
            `}
            placeholder={placeholder} placeholderTextColor="#9ca3af"
            value={value ?? ''} onChangeText={onChange} onBlur={onBlur}
            accessibilityLabel={label} multiline={multiline}
            numberOfLines={multiline ? numberOfLines : 1}
            textAlignVertical={multiline ? 'top' : 'center'}
            autoCapitalize={autoCapitalize} keyboardType={keyboardType}
            secureTextEntry={secureTextEntry}
          />
        )}
      />
      {hasError && (
        <View className="flex-row items-center mt-1.5">
          <AlertCircle size={14} color="#dc2626" className="mr-1" />
          <Text className="text-red-600 text-xs">{errors[name]?.message}</Text>
        </View>
      )}
    </View>
  );
};

// --- Main Component ---
type BarInfoSectionProps = {
  control: Control<BarFormValues>;
  errors: FieldErrors<BarFormValues>;
  onSubmit: () => void;
  isSubmitting: boolean;
  isDirty: boolean;
};

const BarInfoSection = ({
  control, errors, onSubmit, isSubmitting, isDirty
}: BarInfoSectionProps): JSX.Element => {
  return (
    // Add flex-1 if this component should fill parent's height, otherwise remove it.
    // The key is the structure *inside* this View.
    <View className="bg-white rounded-xl shadow-md mx-4 mt-4 mb-6 overflow-hidden">
      {/* Wrap content that might scroll */}
       {/* Apply padding to the content container, not the outermost */}
       <View className="p-6 pb-0">
          {/* Header */}
          <View className="border-b border-gray-200 pb-4 mb-5">
            <Text className="text-lg font-bold text-gray-900">Bar Information</Text>
            <Text className="text-sm text-gray-600 mt-1">Update your bar's basic details.</Text>
          </View>

           {/* Form Inputs */}
          <FormInput
            label="Bar Name" name="name" control={control} errors={errors}
            placeholder="Enter bar name" autoCapitalize="words"
          />
          <FormInput
            label="Address" name="address" control={control} errors={errors}
            placeholder="e.g., 123 Main St, Anytown, USA" autoCapitalize="words"
          />
          <FormInput
            label="Location" name="location" control={control} errors={errors}
            placeholder="e.g., Anytown, USA or 40.7128, -74.0060" autoCapitalize="words"
          />
          <FormInput
            label="Description" name="description" control={control} errors={errors}
            placeholder="Tell customers about your bar (optional)"
            multiline={true} numberOfLines={4} autoCapitalize="sentences"
          />
          {/* Removed mb-5 from the last FormInput to let the footer handle spacing */}
       </View>

      {/* --- Footer Area (Save Button) --- */}
      {/* This View is now outside the main content flow, positioned last */}
      {/* Add top border and padding for separation */}
      <View className="mt-auto px-6 py-4 border-t border-gray-200 bg-white">
         {/* Note: mt-auto might only work effectively if the parent container uses flex and this component expands */}
         {/* If the card height is fixed by content, mt-auto won't push down. Adding pt-4 ensures space. */}
        <SaveButton
          onPress={onSubmit}
          loading={isSubmitting}
          disabled={!isDirty || isSubmitting}
        />
        {!isDirty && !isSubmitting && (
          <View className="flex-row items-center justify-center mt-3 bg-gray-50 p-2 rounded-md">
             <Info size={14} color="#6b7280" />
             <Text className="text-gray-600 text-xs text-center ml-1.5 italic">
               No changes detected.
             </Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default BarInfoSection;