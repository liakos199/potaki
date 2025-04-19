import React, { useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, AlertCircle } from 'lucide-react-native'; // Added AlertCircle

import {
  Bar,
  barFormSchema,
  BarFormValues,
  FormInput,
  FormSwitch
} from '../../features/owner-components/bar-info-section'; // Ensure path is correct
import SaveButton from './SaveButton';

export type EditableField = keyof BarFormValues;

const fieldHelperText: { [key in EditableField]?: { purpose: string; format?: string } } = {
  name: { purpose: "Displayed publicly as the bar's name." },
  address: { purpose: "The full street address.", format: "e.g., 123 Main St, Anytown, CA 91234" },
  location: { purpose: "Text description or coordinates for map placement.", format: "e.g., Downtown Anytown or 40.7128, -74.0060" },
  description: { purpose: "A short public description (max 500 chars)." },
  phone: { purpose: "Public contact phone number.", format: "e.g., (555) 123-4567" },
  website: { purpose: "The bar's official website URL.", format: "Must start with http:// or https://" },
  reservation_hold_until: { purpose: "Time tables are held if patrons are late.", format: "Use 24-hour format (HH:MM)." },
  live: { purpose: "Controls if the bar appears in public listings.", format: "'Live' means visible, 'Not Live' means hidden." },
};

type myModalProps = {
  visible: boolean;
  onClose: () => void;
  onSave: (data: Partial<BarFormValues>) => Promise<void>;
  barData: Bar | null;
  editingField: EditableField | null;
  isSaving: boolean;
};

const myModal: React.FC<myModalProps> = ({
  visible,
  onClose,
  onSave,
  barData,
  editingField,
  isSaving,
}) => {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<BarFormValues>({
    resolver: zodResolver(barFormSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (visible && barData) {
       const defaultValues: BarFormValues = {
           name: barData.name ?? '', address: barData.address ?? '',
           location: typeof barData.location === 'string' ? barData.location : barData.location ? JSON.stringify(barData.location) : '',
           description: barData.description ?? '', phone: barData.phone ?? '', website: barData.website ?? '',
           reservation_hold_until: barData.reservation_hold_until ? barData.reservation_hold_until.substring(0, 5) : '',
           live: barData.live ?? false,
       };
      reset(defaultValues);
    } else {
       reset({ name: '', address: '', location: '', description: '', phone: '', website: '', reservation_hold_until: '', live: false });
    }
  }, [visible, barData, reset]);

  const onSubmit: SubmitHandler<BarFormValues> = async (data) => {
    if (!editingField) return;
    const updatedValue = { [editingField]: data[editingField] };
    try { await onSave(updatedValue); } catch (error) {/* Handled by parent */}
  };

  const renderHelperText = () => {
    if (!editingField) return null;
    const helper = fieldHelperText[editingField];
    if (!helper) return null;
    return (
      <View className="mt-1.5 px-1">
         <Text className="text-xs text-gray-500">
           {helper.purpose}
           {helper.format && <Text className="text-gray-400"> {helper.format}</Text>}
         </Text>
      </View>
    );
  };

   const renderErrorText = () => {
        if (!editingField || !errors[editingField]) return null;
        return (
            <View className="mt-1 px-1 flex-row items-center">
                <AlertCircle size={12} className="text-red-500 mr-1" />
                <Text className="text-xs text-red-600">{String(errors[editingField]?.message)}</Text>
            </View>
        );
   }

  const renderInputField = () => {
    if (!editingField || !barData) return ( <View className="py-8 items-center"><ActivityIndicator/></View> );
    let inputComponent: React.ReactNode = null;

    switch (editingField) {
      case 'name':
        inputComponent = <FormInput label="Bar Name" name="name" control={control} errors={errors} placeholder="Enter bar name" autoCapitalize="words" />;
        break;
      case 'address':
        inputComponent = <FormInput label="Address" name="address" control={control} errors={errors} placeholder="e.g., 123 Main St, Anytown" autoCapitalize="words" />;
        break;
      case 'location':
        inputComponent = <FormInput label="Location Info / Coordinates" name="location" control={control} errors={errors} placeholder="e.g., Downtown or 40.7,-74.0" autoCapitalize="words" />;
        break;
      case 'description':
        inputComponent = <FormInput label="Description" name="description" control={control} errors={errors} placeholder="Public description..." multiline={true} numberOfLines={4} autoCapitalize="sentences" />;
        break;
      case 'phone':
        inputComponent = <FormInput label="Phone Number" name="phone" control={control} errors={errors} placeholder="(555) 123-4567" keyboardType="phone-pad" />;
        break;
      case 'website':
        inputComponent = <FormInput label="Website" name="website" control={control} errors={errors} placeholder="https://example.com" keyboardType="url" autoCapitalize="none" />;
        break;
      case 'reservation_hold_until':
        inputComponent = <FormInput label="Reservation Hold Time (HH:MM)" name="reservation_hold_until" control={control} errors={errors} placeholder="e.g., 17:00" keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'} autoCapitalize="none" />;
        break;
      case 'live':
        inputComponent = <FormSwitch label="Bar Status" name="live" control={control} labelDescription="Visible to public?" />;
        break;
      default:
        const exhaustiveCheck: never = editingField;
        inputComponent = <Text className="text-red-500 text-xs">Unknown field: {exhaustiveCheck}</Text>;
    }

    return (
        <View className="mb-3">
            {inputComponent}
            {renderErrorText()}
            {renderHelperText()}
        </View>
    );
  };

  const getModalTitle = () => {
    if (!editingField) return "Edit Information";
    let title = editingField.charAt(0).toUpperCase() + editingField.slice(1).replace(/_/g, ' ');
    if (title === "Reservation hold until") title = "Hold Time";
    return `Edit ${title}`;
  };

  return (
    <Modal
      animationType="slide"
      transparent={false}
      presentationStyle="pageSheet"
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-white">
        <View className="flex-row justify-between items-center p-4 border-b border-gray-200">
          <Text className="text-base font-medium text-gray-800">{getModalTitle()}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} className="p-1">
            <X size={20} className="text-gray-500" />
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16 }}>
            {renderInputField()}
        </ScrollView>

        <View className="px-4 py-3 border-t border-gray-200 bg-white flex-row justify-end items-center space-x-3">
           <TouchableOpacity
              onPress={onClose}
              disabled={isSaving}
              className={`py-2 px-4 rounded-md border border-gray-300 bg-white ${isSaving ? 'opacity-60' : 'hover:bg-gray-50 active:bg-gray-100'}`}
            >
              <Text className="text-sm font-medium text-gray-700">Cancel</Text>
            </TouchableOpacity>
          <SaveButton
            title="Save Changes"
            onPress={handleSubmit(onSubmit)}
            loading={isSaving}
            disabled={!isDirty || isSaving}
          />
        </View>
      </View>
    </Modal>
  );
};

export default myModal;