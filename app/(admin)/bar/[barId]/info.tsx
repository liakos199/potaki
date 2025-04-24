import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Platform,
  ActivityIndicator,
  Switch,
  TextInput,
  TouchableOpacity,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, type FieldErrors, type Control } from "react-hook-form";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { z } from "zod";
import { supabase } from "@/src/lib/supabase"; // Adjust path if needed
import { useAuthStore } from "@/src/features/auth/store/auth-store"; // Adjust path if needed
import { useToast } from "@/src/components/general/Toast"; // Adjust path if needed
import {
  AlertCircle,
  ChevronDown,
  Edit2,
  AlertTriangle,
  Plus,
} from "lucide-react-native";
import type { Database } from "@/src/lib/database.types"; // Adjust path if needed

// Assuming EditBarInfoModal and EditableField are correctly imported or defined elsewhere
import EditBarInfoModal, { type EditableField } from "@/src/components/general/editModal"; // Adjust path if needed

// --- Type Definitions ---
export type Bar = Database["public"]["Tables"]["bars"]["Row"];
type BarUpdate = Database["public"]["Tables"]["bars"]["Update"];

// --- Improved Form Schema (barFormSchema) ---
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

// --- Form Input/Switch Prop Types ---
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

export type FormSwitchProps = {
  label: string;
  name: "live"; // Only for the 'live' field
  control: Control<BarFormValues>;
  labelDescription?: string;
};

// --- Android Layout Animation Setup ---
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// --- Helper Components Defined In-File ---

// --- FormInput Component ---
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
      <Text className="text-sm font-medium text-[#A0AEC0] mb-1.5">{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className={`bg-[#2a2a35] text-[#E2E8F0] rounded-lg px-3 text-sm border ${
              multiline ? 'h-20 text-top py-2.5' : 'py-2.5' // Apply multiline specific styles
            } ${
              hasError ? 'border-[#F87171]' : 'border-[#3a3a45]' // Apply error border
            }`}
            placeholder={placeholder}
            placeholderTextColor="#6C7A93"
            value={value !== null && value !== undefined ? String(value) : ""}
            onChangeText={onChange}
            onBlur={onBlur}
            accessibilityLabel={label}
            multiline={multiline}
            numberOfLines={multiline ? numberOfLines : 1}
            textAlignVertical={multiline ? "top" : "center"} // Still might need style prop for this depending on NativeWind version
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

// --- FormSwitch Component ---
export const FormSwitch: React.FC<FormSwitchProps> = ({ label, name, control, labelDescription }) => {
  return (
    <View className="flex-row justify-between items-center py-2.5 bg-[#2a2a35] rounded-lg px-3 border border-[#3a3a45] mb-4">
      <View className="flex-1 mr-2.5">
        <Text className="text-sm font-medium text-[#E2E8F0]">{label}</Text>
        {labelDescription && <Text className="text-xs text-[#A0AEC0] mt-0.5">{labelDescription}</Text>}
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

// --- DisplayFieldStyled Component ---
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
          <Text className="text-xs text-[#A0AEC0] uppercase tracking-wide">{label}</Text>
        </View>
        {isStatusField && isLive !== undefined ? (
          <View className={`px-2 py-[3px] rounded-xl self-start ${isLive ? 'bg-green-500/15' : 'bg-red-400/15'}`}>
            <Text className={`text-xs font-medium ${isLive ? 'text-green-400' : 'text-red-400'}`}>
              {isLive ? "Live" : "Not Live"}
            </Text>
          </View>
        ) : (
          <Text className={`text-sm leading-5 ${isEmptyOrNull ? 'text-[#718096] italic' : 'text-[#E2E8F0]'}`}>
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

// --- BarInfoSection Component (Internal) ---
type BarInfoSectionProps = {
  barId: string;
};

const BarInfoSection = ({ barId }: BarInfoSectionProps): JSX.Element | null => {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false); // Keep state for potential future use (like collapsible sections)
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
        if (error.code === "PGRST116") return null; // Bar not found is not necessarily a throw error
        console.error("Supabase fetch error:", error);
        throw new Error(error.message || "Failed to fetch bar data.");
      }
      // Authorization check
      if (data && data.owner_id !== profile.id) {
        toast.show({ type: "error", text1: "Access denied", text2: "You do not own this bar." });
        router.replace("/(admin)/admin-panel"); // Redirect if not owner
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
      // No need to call refetch explicitly here, invalidateQueries handles it
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
    // Zod schema applied via react-hook-form resolver in the modal handles validation/transformation
    await updateBar.mutateAsync(data as Partial<BarUpdate>);
  };

  // Reanimated setup (kept in case needed later)
  const arrowRotation = useSharedValue(0);
  useEffect(() => {
    arrowRotation.value = withTiming(isExpanded ? 180 : 0, { duration: 200 });
  }, [isExpanded, arrowRotation]);
  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${arrowRotation.value}deg` }],
  }));

  // --- Loading/Error states ---
  if (barLoading || !profile) { // Show loading if bar data or profile is loading
    return (
      <View className="bg-[#1f1f27] rounded-xl mb-4 overflow-hidden border border-[#2a2a35]">
        <View className="flex-row justify-between items-center p-4">
          <Text className="text-base font-semibold text-[#E2E8F0]">Bar Information</Text>
          <ActivityIndicator size="small" color="#ff4d6d" />
        </View>
      </View>
    );
  }

  if (barError || !bar) { // Show error if fetch failed or bar is null (not found/access denied)
    return (
      <View className="justify-center items-center p-5 bg-[#1f1f27] rounded-xl border border-[#2a2a35] mb-4">
         <AlertCircle size={24} color="#ff4d6d" className="mb-2" />
        <Text className="text-lg font-semibold text-[#E2E8F0] mb-2 text-center">{barError ? "Error Loading Bar" : "Bar Not Found"}</Text>
        {barError && <Text className="text-sm text-[#A0AEC0] text-center mb-4">{barError.message}</Text>}
        {!barError && !bar && <Text className="text-sm text-[#A0AEC0] text-center mb-4">Could not load details or access denied.</Text>}
        <TouchableOpacity onPress={() => refetch()} className="bg-[#ff4d6d] py-2.5 px-5 rounded-lg">
          <Text className="text-white text-sm font-medium">Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Main component render ---
  return (
    <>
      <View className="bg-[#1f1f27] rounded-xl mb-4 overflow-hidden border border-[#2a2a35]">
        {/* Header - Removed collapsible functionality for now, simplify */}
        <View className="py-3 px-4 bg-[#2a2a35] border-b border-b-[#3a3a45]">
            <Text className="text-base font-semibold text-[#E2E8F0]">Bar Information</Text>
            <Text className="text-xs text-[#A0AEC0] mt-0.5">Manage essential bar details.</Text>
        </View>

        <View className="p-4">
          {/* --- Fields using DisplayFieldStyled --- */}
          <DisplayFieldStyled
            label="Bar Status"
            value={bar.live}
            onEditPress={() => handleEditPress("live")}
            isLive={bar.live} // Pass the boolean directly
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
            formatValue={(val) => (val ? String(val).substring(0, 5) : "Not set")} // Extracts HH:MM
            onEditPress={() => handleEditPress("reservation_hold_until")}
          />
          <DisplayFieldStyled
            label="Description"
            value={bar.description}
            onEditPress={() => handleEditPress("description")}
          />
        </View>
      </View>

      {/* --- Modal --- */}
      {/* Ensure EditBarInfoModal is correctly imported and handles form logic */}
      <EditBarInfoModal
        visible={modalVisible}
        onClose={handleCloseModal}
        onSave={handleSaveChanges}
        barData={bar} // Pass the fetched bar data
        editingField={editingField}
        isSaving={updateBar.isPending}
        // Make sure the modal uses the barFormSchema for validation (e.g., via react-hook-form resolver)
      />
    </>
  );
};


// --- Main Screen Component (Exported) ---
const BarInfoScreen = (): JSX.Element | null => {
  const { barId } = useLocalSearchParams<{ barId: string }>();

  // Initial check for barId before rendering the section
  if (!barId) {
    return (
      <View className="flex-1 justify-center items-center bg-[#1A202C] p-4">
        <Text className="text-[#FF5A5A] mb-2 text-base font-semibold">Error: Bar ID is missing.</Text>
        <Text className="text-[#A0AEC0] text-xs">Cannot load bar information.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#121826]">
      <ScrollView className="flex-1 p-4">
        {/* Render the internal BarInfoSection component */}
        <BarInfoSection barId={barId} />
      </ScrollView>
    </View>
  );
};


export default BarInfoScreen; // Export the main screen component