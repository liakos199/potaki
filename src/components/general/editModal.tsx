import React, { useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Platform,
  ScrollView,
  ActivityIndicator,
  // KeyboardAvoidingView, // Keep in mind if needed
} from 'react-native';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, AlertCircle } from 'lucide-react-native';

import {
  Bar,
  barFormSchema,
  BarFormValues,
  FormInput,
  FormSwitch
} from '../../features/owner-components/bar-info-section'; // Adjust path

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

type EditModalProps = {
  visible: boolean;
  onClose: () => void;
  onSave: (data: Partial<BarFormValues>) => Promise<void>;
  barData: Bar | null;
  editingField: EditableField | null;
  isSaving: boolean;
};

const EditModal: React.FC<EditModalProps> = ({
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
           name: barData.name ?? '',
           address: barData.address ?? '',
           location: typeof barData.location === 'string' ? barData.location : barData.location ? JSON.stringify(barData.location) : '',
           description: barData.description ?? '',
           phone: barData.phone ?? '',
           website: barData.website ?? '',
           reservation_hold_until: barData.reservation_hold_until ? barData.reservation_hold_until.substring(0, 5) : '',
           live: barData.live ?? false,
       };
      reset(defaultValues);
    } else if (!visible) {
       reset({ name: '', address: '', location: '', description: '', phone: '', website: '', reservation_hold_until: '', live: false });
    }
  }, [visible, barData, reset]);

  const onSubmit: SubmitHandler<BarFormValues> = async (data) => {
    if (!editingField) return;
    const updatedValue = { [editingField]: data[editingField] };
    try {
        await onSave(updatedValue);
    } catch (error) {
        console.error("Save failed in modal:", error);
    }
  };

  const renderHelperText = (field: EditableField) => {
    const helper = fieldHelperText[field];
    if (!helper) return null;
    return (
      <View className="mt-2 px-1">
         <Text className="text-sm text-gray-400">
           {helper.purpose}
           {helper.format && <Text className="text-gray-500"> {helper.format}</Text>}
         </Text>
      </View>
    );
  };

  const renderErrorText = (field: EditableField) => {
    if (!errors[field]) return null;
    return (
      <View className="mt-1.5 px-1 flex-row items-center">
        <AlertCircle size={14} color="#f87171" className="mr-1.5" />
        <Text className="text-sm text-red-400">{String(errors[field]?.message)}</Text>
      </View>
    );
  }

  const renderContent = () => {
    if (!editingField || !barData) {
      return (
        <View className="py-12 items-center">
          <ActivityIndicator size="large" color="#ff4d6d" />
        </View>
      );
    }

    let inputComponent: React.ReactNode = null;

    switch (editingField) {
      // Cases remain the same...
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
        inputComponent = <FormInput label="Reservation Hold Time (HH:MM)" name="reservation_hold_until" control={control} errors={errors} placeholder="e.g., 17:00" keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'} autoCapitalize="none" maxLength={5} />;
        break;
      case 'live':
        inputComponent = <FormSwitch label="Bar Status" name="live" control={control} labelDescription="Visible to public?" />;
        break;
      default:
        const exhaustiveCheck: never = editingField;
        inputComponent = <Text className="text-red-400 text-sm">Unknown field type: {exhaustiveCheck}</Text>;
    }

    return (
      <>
        <View className="mb-4">
          {inputComponent}
          {renderErrorText(editingField)}
          {renderHelperText(editingField)}
        </View>
        <View className="flex-row items-center mt-8 mb-6">
          {/* Cancel Button: Added flex-1 to grow, added flex items-center justify-center */}
          <TouchableOpacity
            onPress={onClose}
            disabled={isSaving}
            className={`flex-1 py-3 rounded-lg border border-[#5a5a65] bg-[#3a3a45] mr-2 flex items-center justify-center ${isSaving ? 'opacity-60' : 'active:bg-[#4a4a55]'}`}
            // Note: mr-2 provides half the gap, ml-2 on the other button provides the other half
          >
            <Text className="text-base font-medium text-gray-200 text-center">Cancel</Text>
          </TouchableOpacity>

          {/* Save Button: Added flex-1 to grow, added flex items-center justify-center */}
          <TouchableOpacity
            onPress={handleSubmit(onSubmit)}
            disabled={!isDirty || isSaving}
            className={`flex-1 py-3 rounded-lg bg-[#ff4d6d] ml-2 flex items-center justify-center ${(!isDirty || isSaving) ? 'opacity-60' : 'active:bg-[#e64463]'}`}
             // Note: ml-2 provides half the gap
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-base font-medium text-white text-center">Save</Text>
            )}
          </TouchableOpacity>
        </View>
        {/* --- End Button Row --- */}
      </>
    );
  };

  const getModalTitle = () => {
    if (!editingField) return "Edit Information";
    let title = editingField.charAt(0).toUpperCase() + editingField.slice(1).replace(/_/g, ' ');
    if (title === "Reservation hold until") title = "Hold Time";
    return `Edit ${title}`;
  };

  // Modal structure remains the same
  return (
    <Modal
      animationType="slide"
      transparent={false}
      presentationStyle="pageSheet"
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-[#1f1f27]">
        <View className="flex-row justify-between items-center p-4 pb-3 border-b border-[#2a2a35]">
          <Text className="text-xl font-semibold text-white">{getModalTitle()}</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            className="p-2 rounded-full bg-[#2a2a35] active:bg-[#3a3a45]"
          >
            <X size={22} className="text-gray-300" />
          </TouchableOpacity>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
              paddingHorizontal: 16, // Keep horizontal padding for the overall scroll view
              paddingTop: 20,
              paddingBottom: 40
          }}
          className="flex-1"
        >
          {renderContent()}
        </ScrollView>
      </View>
    </Modal>
  );
};

export default EditModal;