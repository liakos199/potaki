"use client";

import type React from "react";
import { useState } from "react";
import {
  View,
  Text,
  Platform,
  ActivityIndicator,
  Switch,
  TextInput,
  TouchableOpacity,
  UIManager,
  // StyleSheet is removed
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase";
import { useAuthStore } from "@/src/features/auth/store/auth-store";
import { useToast } from "@/src/components/general/Toast";
import {
  AlertCircle,
  Edit2,
  AlertTriangle,
  Plus,
} from "lucide-react-native";
import type { Database } from "@/src/lib/database.types";
import { z } from "zod";
import { Controller, type FieldErrors, type Control } from "react-hook-form";
import EditBarInfoModal, { type EditableField } from "@/src/components/general/editModal";

export type Bar = Database["public"]["Tables"]["bars"]["Row"];
type BarUpdate = Database["public"]["Tables"]["bars"]["Update"];

export const barFormSchema = z.object({
  name: z
    .string({ required_error: "Name is required." })
    .min(1, "Name cannot be empty.")
    .max(100, "Name cannot exceed 100 characters."),

  address: z
    .string({ required_error: "Address is required." })
    .min(1, "Address cannot be empty.")
    .max(255, "Address cannot exceed 255 characters."),

  location: z
    .string({ required_error: "Location info is required." })
    .min(1, "Location info cannot be empty.")
    .max(255, "Location info too long (max 255 chars)."),

  description: z
    .string()
    .max(500, "Description cannot exceed 500 characters.")
    .nullable()
    .optional()
    .transform((val) => (val === "" ? null : val)),

  phone: z
    .string()
    .max(20, "Phone cannot exceed 20 characters.")
    .nullable()
    .optional()
    .transform((val) => (val === "" ? null : val)),

  website: z
    .string()
    .url({ message: "Invalid URL format (e.g., https://example.com)." })
    .max(255, "Website URL cannot exceed 255 characters.")
    .or(z.literal(""))
    .nullable()
    .optional()
    .transform((val) => (val === "" ? null : val)),

  reservation_hold_until: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: "Use 24-hour HH:MM format (e.g., 17:00)." })
    .or(z.literal(""))
    .nullable()
    .optional()
    .transform((val) => (val === "" ? null : val)),
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
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad" | "url" | "numbers-and-punctuation";
  secureTextEntry?: boolean;
  maxLength?: number;
};

export const FormInput: React.FC<FormInputProps> = ({
  label,
  name,
  control,
  errors,
  placeholder,
  multiline = false,
  numberOfLines = 1,
  autoCapitalize = "sentences",
  keyboardType = "default",
  secureTextEntry = false,
  maxLength,
}) => {
  const hasError = !!errors[name];
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-gray-400 mb-1.5">{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className={`bg-[#2a2a35] text-slate-200 rounded-lg px-3 py-2.5 text-sm border border-[#3a3a45] ${multiline ? 'h-20 pt-2.5' : ''} ${hasError ? 'border-[#F87171]' : 'border-[#3a3a45]'}`}
            placeholder={placeholder}
            placeholderTextColor="#6C7A93"
            value={value !== null && value !== undefined ? String(value) : ""}
            onChangeText={onChange}
            onBlur={onBlur}
            accessibilityLabel={label}
            multiline={multiline}
            numberOfLines={multiline ? numberOfLines : 1}
            textAlignVertical={multiline ? "top" : "center"}
            autoCapitalize={autoCapitalize}
            keyboardType={keyboardType}
            secureTextEntry={secureTextEntry}
            maxLength={maxLength}
          />
        )}
      />
      {hasError && errors[name]?.message && (
        <Text className="text-[#F87171] text-xs mt-1">{errors[name]?.message as string}</Text>
      )}
    </View>
  );
};

export type FormSwitchProps = {
  label: string;
  name: "live";
  control: Control<BarFormValues>;
  labelDescription?: string;
};

export const FormSwitch: React.FC<FormSwitchProps> = ({ label, name, control, labelDescription }) => {
  return (
    <View className="flex-row justify-between items-center py-2.5">
      <View className="flex-1 mr-2.5">
        <Text className="text-sm font-medium text-slate-200">{label}</Text>
        {labelDescription && <Text className="text-xs text-gray-400 mt-0.5">{labelDescription}</Text>}
      </View>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, value } }) => (
          <Switch
            trackColor={{ false: "#3e3e4a", true: "#ff4d6d55" }}
            thumbColor={value ? "#ff4d6d" : "#A0AEC0"}
            ios_backgroundColor="#3e3e4a"
            onValueChange={onChange}
            value={value ?? false}
            accessibilityLabel={label}
          />
        )}
      />
    </View>
  );
};

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
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
  const [modalVisible, setModalVisible] = useState(false);
  const [editingField, setEditingField] = useState<EditableField | null>(null);

  const {
    data: bar,
    isPending: barLoading,
    error: barError,
    refetch,
  } = useQuery<Bar | null>({
    queryKey: ["bar", barId],
    enabled: !!barId && !!profile,
    queryFn: async () => {
      if (!barId || !profile) return null;
      const { data, error } = await supabase.from("bars").select("*").eq("id", barId).single();
      if (error) {
        if (error.code === "PGRST116") return null;
        throw new Error(error.message || "Failed to fetch bar data.");
      }
      if (data && data.owner_id !== profile.id) {
        toast.show({ type: "error", text1: "Access denied", text2: "You do not own this bar." });
        router.replace("/(admin)/admin-panel");
        return null;
      }
      return data;
    },
    retry: 1,
  });

  const updateBar = useMutation({
    mutationFn: async (values: Partial<BarUpdate>) => {
      const updatePayload = { ...values, updated_at: new Date().toISOString() };
      const { error } = await supabase.from("bars").update(updatePayload).eq("id", barId);
      if (error) {
        console.error("Supabase update error:", error);
        throw new Error(error.message || "Failed to update bar information.");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bar", barId] });
      await refetch();
      toast.show({ type: "success", text1: "Bar information updated!" });
      setModalVisible(false);
      setEditingField(null);
    },
    onError: (err: Error) => {
      toast.show({ type: "error", text1: "Update failed", text2: err?.message || "An unknown error occurred." });
    },
  });

  const handleEditPress = (field: EditableField) => {
    setEditingField(field);
    setModalVisible(true);
  };
  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingField(null);
  };
  const handleSaveChanges = async (data: Partial<BarFormValues>) => {
    await updateBar.mutateAsync(data as Partial<BarUpdate>);
  };

  if (barLoading || !profile) {
    return (
      <View className="bg-[#1f1f27] rounded-xl mb-4 overflow-hidden border border-[#2a2a35]">
        <View className="flex-row justify-between items-center p-4">
          <Text className="text-base font-semibold text-slate-200">Bar Information</Text>
          <ActivityIndicator size="small" color="#ff4d6d" />
        </View>
      </View>
    );
  }

  if (barError || !bar) {
    return (
      <View className="flex-1 justify-center items-center p-5 bg-[#1f1f27]">
        <AlertCircle size={24} color="#ff4d6d" style={{ marginBottom: 8 }} />
        <Text className="text-lg font-semibold text-slate-200 mb-2 text-center">
          {barError ? "Error Loading Bar" : "Bar Not Found"}
        </Text>
        {barError && <Text className="text-sm text-gray-400 text-center mb-4">{barError.message}</Text>}
        {!barError && !bar && <Text className="text-sm text-gray-400 text-center mb-4">Could not load bar details or access denied.</Text>}
        <TouchableOpacity onPress={() => refetch()} className="bg-[#ff4d6d] py-2.5 px-5 rounded-lg">
          <Text className="text-white text-sm font-medium">Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <View className="bg-[#1f1f27] rounded-xl mb-4 overflow-hidden border border-[#2a2a35]">
        <View>
          <View className="p-4 border-b border-white/10">
            <Text className="text-2xl font-semibold text-white mb-1">Bar Information</Text>
            <Text className="text-base text-gray-400">Manage essential bar details.</Text>
          </View>
        </View>

          <View className="p-4">
            <DisplayFieldStyled
              label="Bar Status"
              value={bar.live}
              onEditPress={() => handleEditPress("live")}
              isLive={bar.live}
            />
             <DisplayFieldStyled
              label="Bar Name"
              value={bar.name}
              onEditPress={() => handleEditPress("name")}
            />
            <DisplayFieldStyled
              label="Address"
              value={bar.address}
              onEditPress={() => handleEditPress("address")}
            />
            <DisplayFieldStyled
              label="Location Info"
              value={bar.location}
              formatValue={(val) => (val !== null && val !== undefined && val !== "" ? (typeof val === 'string' ? val : JSON.stringify(val)) : "Not set")}
              onEditPress={() => handleEditPress("location")}
            />
            <DisplayFieldStyled
              label="Phone Number"
              value={bar.phone}
              onEditPress={() => handleEditPress("phone")}
            />
            <DisplayFieldStyled
              label="Website"
              value={bar.website}
              onEditPress={() => handleEditPress("website")}
            />
            <DisplayFieldStyled
              label="Reservation Hold Time"
              value={bar.reservation_hold_until}
              formatValue={(val) => (val ? String(val).substring(0, 5) : "Not set")}
              onEditPress={() => handleEditPress("reservation_hold_until")}
            />
            <DisplayFieldStyled
              label="Description"
              value={bar.description}
              onEditPress={() => handleEditPress("description")}
            />
          </View>
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

const DisplayFieldStyled = ({
  label,
  value,
  formatValue = (val) => (val !== null && val !== undefined && val !== "" ? String(val) : "Not set"),
  onEditPress,
  isLive,
}: {
  label: string;
  value: any;
  formatValue?: (val: any) => string;
  onEditPress: () => void;
  isLive?: boolean;
}) => {
  const isEmptyOrNull = value === null || value === undefined || value === "";
  const EditOrAddIcon = isEmptyOrNull ? Plus : Edit2;
  const accessibilityActionLabel = isEmptyOrNull ? `Add ${label}` : `Edit ${label}`;
  const displayValue = formatValue(value);
  const isStatusField = label === "Bar Status";

  return (
    <View className="flex-row justify-between items-center bg-[#2a2a35] py-2.5 px-3 rounded-lg mb-2.5">
      <View className="flex-1 mr-2.5">
        <View className="flex-row items-center mb-1">
          {isEmptyOrNull && !isStatusField && (
            <AlertTriangle size={14} color="#FFC107" className="mr-1.5" />
          )}
          <Text className="text-xs text-gray-400 uppercase tracking-wide">{label}</Text>
        </View>
        {isStatusField && isLive !== undefined ? (
          <View className={`px-2 py-1 rounded-full self-start ${isLive ? 'bg-green-500/15' : 'bg-red-500/15'}`}>
            <Text className={`text-xs font-medium ${isLive ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
              {isLive ? "Live" : "Not Live"}
            </Text>
          </View>
        ) : (
          <Text className={`text-sm leading-5 ${isEmptyOrNull ? 'text-gray-500 italic' : 'text-slate-200'}`}>
            {displayValue}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={onEditPress}
        className="p-2 rounded-full bg-[#3a3a45]"
        accessibilityLabel={accessibilityActionLabel}
      >
        <EditOrAddIcon size={16} color="#ff4d6d" />
      </TouchableOpacity>
    </View>
  );
};


export default BarInfoSection;