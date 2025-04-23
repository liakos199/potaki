"use client";

import type React from "react";
import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Platform,
  ActivityIndicator,
  Switch,
  TextInput,
  TouchableOpacity,
  LayoutAnimation,
  UIManager,
  StyleSheet, // Make sure StyleSheet is imported if you define styles later
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase";
import { useAuthStore } from "@/src/features/auth/store/auth-store";
import { useToast } from "@/src/components/general/Toast";
import {
  AlertCircle,
  ChevronDown,
  Edit2, // Use Edit2 consistently if preferred over Edit3
  AlertTriangle,
  Plus,
} from "lucide-react-native";
import type { Database } from "@/src/lib/database.types";
import { z } from "zod";
import { Controller, type FieldErrors, type Control } from "react-hook-form";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";

import EditBarInfoModal, { type EditableField } from "@/src/components/general/editModal";

export type Bar = Database["public"]["Tables"]["bars"]["Row"];
type BarUpdate = Database["public"]["Tables"]["bars"]["Update"];

// --- Improved Form Schema (barFormSchema) ---
export const barFormSchema = z.object({
  // Required fields matching DB `NOT NULL`
  name: z
    .string({ required_error: "Name is required." }) // Explicit required error message
    .min(1, "Name cannot be empty.")                 // Ensure non-empty
    .max(100, "Name cannot exceed 100 characters."), // Max length (adjust if DB differs)

  address: z
    .string({ required_error: "Address is required." })
    .min(1, "Address cannot be empty.")
    .max(255, "Address cannot exceed 255 characters."), // Match DB varchar(255)

  location: z
    .string({ required_error: "Location info is required." })
    .min(1, "Location info cannot be empty.") // Match DB `NOT NULL geography`
    .max(255, "Location info too long (max 255 chars)."), // Reasonable limit, backend parsing is key

  // Optional fields matching DB `NULL` allowed
  description: z
    .string()
    .max(500, "Description cannot exceed 500 characters.")
    .nullable() // Allow null
    .optional() // Allow undefined
    .transform((val) => (val === "" ? null : val)), // Convert empty string to null for DB

  phone: z
    .string()
    .max(20, "Phone cannot exceed 20 characters.") // Match DB varchar(20)
    .nullable()
    .optional()
    .transform((val) => (val === "" ? null : val)), // Convert empty string to null

  website: z
    .string()
    // Use .url() for basic format check, *then* allow empty string transformed to null
    .url({ message: "Invalid URL format (e.g., https://example.com)." })
    .max(255, "Website URL cannot exceed 255 characters.") // Match DB varchar(255)
    .or(z.literal("")) // Allow empty string specifically
    .nullable()
    .optional()
    .transform((val) => (val === "" ? null : val)), // Ensure final value is null if empty

  reservation_hold_until: z
    .string()
    // Use regex for HH:MM format, *then* allow empty string transformed to null
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: "Use 24-hour HH:MM format (e.g., 17:00)." })
    .or(z.literal("")) // Allow empty string specifically
    .nullable()
    .optional()
    .transform((val) => (val === "" ? null : val)), // Ensure final value is null if empty

  // Boolean field matching DB `boolean NOT NULL`
  live: z.boolean(),
});
// --- End of Improved Form Schema ---

export type BarFormValues = z.infer<typeof barFormSchema>;

// --- FormInput Component (Keep as is) ---
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
}) => {
  const hasError = !!errors[name];
  return (
    // Assuming styles.formGroup etc. are defined elsewhere
    <View style={styles.formGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            style={[styles.textInput, multiline && styles.multilineInput, hasError && styles.inputError]}
            placeholder={placeholder}
            placeholderTextColor="#6C7A93"
            // Ensure value is stringifiable or empty for TextInput
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
          />
        )}
      />
      {hasError && errors[name]?.message && (
         // Assuming styles.errorText is defined
        <Text style={styles.errorText}>{errors[name]?.message as string}</Text>
      )}
    </View>
  );
};

// --- FormSwitch Component (Keep as is) ---
export type FormSwitchProps = {
  label: string;
  name: "live"; // Only for the 'live' field
  control: Control<BarFormValues>;
  labelDescription?: string;
};

export const FormSwitch: React.FC<FormSwitchProps> = ({ label, name, control, labelDescription }) => {
  return (
    // Assuming styles.switchContainer etc. are defined
    <View style={styles.switchContainer}>
      <View style={styles.switchLabelContainer}>
        <Text style={styles.switchLabel}>{label}</Text>
        {labelDescription && <Text style={styles.switchDescription}>{labelDescription}</Text>}
      </View>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, value } }) => (
          <Switch
            trackColor={{ false: "#3e3e4a", true: "#ff4d6d55" }} // Adjusted colors slightly
            thumbColor={value ? "#ff4d6d" : "#A0AEC0"}
            ios_backgroundColor="#3e3e4a"
            onValueChange={onChange}
            value={value ?? false} // Default to false if somehow undefined
            accessibilityLabel={label}
          />
        )}
      />
    </View>
  );
};
// --- End of Form Schema section ---

// Enable layout animations on Android
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingField, setEditingField] = useState<EditableField | null>(null);

  // --- React Query hooks (Keep as is) ---
  const {
    data: bar,
    isPending: barLoading,
    error: barError,
    refetch,
  } = useQuery<Bar | null>({
    queryKey: ["bar", barId],
    enabled: !!barId && !!profile,
    queryFn: async () => {
      // Fetch logic remains the same
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
    retry: 1, // Allow one retry on failure
  });

  const updateBar = useMutation({
    mutationFn: async (values: Partial<BarUpdate>) => {
       // Zod schema handles transformations (like "" to null) before this point
      const updatePayload = { ...values, updated_at: new Date().toISOString() };
      const { error } = await supabase.from("bars").update(updatePayload).eq("id", barId);
      if (error) {
        console.error("Supabase update error:", error); // Log detailed error
        throw new Error(error.message || "Failed to update bar information.");
      }
    },
    onSuccess: async () => {
      // Invalidation and refetch remain the same
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
  // --- End React Query hooks ---

  // --- Event Handlers (Keep as is) ---
  const handleEditPress = (field: EditableField) => {
    setEditingField(field);
    setModalVisible(true);
  };
  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingField(null);
  };
  const handleSaveChanges = async (data: Partial<BarFormValues>) => {
    // The Zod schema (via react-hook-form resolver) validates and transforms `data`.
    // `data` here should already have "" replaced with null for optional fields.
    await updateBar.mutateAsync(data as Partial<BarUpdate>);
  };
  const toggleExpansion = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded((prev) => !prev);
  }, []);
  // --- End Event Handlers ---

  // --- Reanimated setup (Keep as is) ---
  const arrowRotation = useSharedValue(0);
  useEffect(() => {
    arrowRotation.value = withTiming(isExpanded ? 180 : 0, { duration: 200 });
  }, [isExpanded, arrowRotation]);
  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${arrowRotation.value}deg` }],
  }));
  // --- End Reanimated setup ---

  // --- Loading/Error states (Keep as is, maybe add styles) ---
  if (barLoading || !profile) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingHeader}>
          <Text style={styles.headerTitle}>Bar Information</Text>
          <ActivityIndicator size="small" color="#ff4d6d" />
        </View>
      </View>
    );
  }

  if (barError || !bar) {
    return (
      <View style={styles.errorContainer}>
        <AlertCircle size={24} color="#ff4d6d" style={{ marginBottom: 8 }} />
        <Text style={styles.errorTitle}>{barError ? "Error Loading Bar" : "Bar Not Found"}</Text>
        {barError && <Text style={styles.errorMessage}>{barError.message}</Text>}
        {!barError && !bar && <Text style={styles.errorMessage}>Could not load bar details or access denied.</Text>}
        <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }
  // --- End Loading/Error states ---

  // --- Main component render ---
  return (
    <>
      <View style={styles.container}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={toggleExpansion}
          style={styles.header}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          accessibilityLabel="Bar Information Section"
          accessibilityHint={isExpanded ? "Tap to collapse" : "Tap to expand"}
        >
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Bar Information</Text>
            <Text style={styles.headerSubtitle}>Manage essential bar details.</Text>
          </View>
          <Animated.View style={chevronAnimatedStyle}>
            <ChevronDown size={20} color={isExpanded ? "#ff4d6d" : "#A0AEC0"} />
          </Animated.View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.content}>
            {/* --- Fields using DisplayFieldStyled --- */}
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
              label="Location Info" // Simplified label
              value={bar.location}
              // Handles potential 'unknown' type from DB - needs robust parsing on backend
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
        )}
      </View>

      {/* --- Modal --- */}
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

// --- DisplayFieldStyled Component (Keep as is) ---
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
     // Assuming styles.displayField etc. are defined
    <View style={styles.displayField}>
      <View style={styles.displayFieldContent}>
        <View style={styles.labelRow}>
          {isEmptyOrNull && !isStatusField && (
            <AlertTriangle size={14} color="#FFC107" style={styles.warningIcon} />
          )}
          <Text style={styles.displayFieldLabel}>{label}</Text>
        </View>
        {isStatusField && isLive !== undefined ? (
          <View style={[styles.statusBadge, isLive ? styles.statusLive : styles.statusNotLive]}>
            <Text style={[styles.statusText, isLive ? styles.statusTextLive : styles.statusTextNotLive]}>
              {isLive ? "Live" : "Not Live"}
            </Text>
          </View>
        ) : (
          <Text style={[styles.displayFieldValue, isEmptyOrNull && styles.displayFieldValueEmpty]}>
            {displayValue}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={onEditPress}
        style={styles.editButton}
        accessibilityLabel={accessibilityActionLabel}
      >
        <EditOrAddIcon size={16} color="#ff4d6d" />
      </TouchableOpacity>
    </View>
  );
};

// --- Example StyleSheet (Define your styles here) ---
const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1f1f27', // Dark background for the section container
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden', // Ensures content clipping within rounded corners
    borderWidth: 1,
    borderColor: '#2a2a35', // Subtle border
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#2a2a35', // Slightly different header background
  },
  headerTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  loadingHeader: { // Style for loading state header
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E2E8F0', // Light text
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#A0AEC0', // Lighter gray subtitle
    marginTop: 2,
  },
  content: {
    padding: 16, // Padding for the content area when expanded
  },
  // Display Field Styles
  displayField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center', // Align items vertically center
    backgroundColor: '#2a2a35',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 10, // Space between fields
  },
  displayFieldContent: {
    flex: 1, // Allow content to take available space
    marginRight: 10, // Space before the edit button
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  displayFieldLabel: {
    fontSize: 12,
    color: '#A0AEC0', // Gray label
    textTransform: 'uppercase', // Optional: make labels uppercase
    letterSpacing: 0.5,     // Optional: add letter spacing
  },
  warningIcon: {
    marginRight: 6,
  },
  displayFieldValue: {
    fontSize: 14,
    color: '#E2E8F0', // White/light value text
    lineHeight: 20,    // Improve readability
  },
  displayFieldValueEmpty: {
    color: '#718096', // Dimmer color for "Not set"
    fontStyle: 'italic',
  },
  editButton: {
    padding: 8, // Make tap area larger
    borderRadius: 20, // Circular background
    backgroundColor: '#3a3a45',
  },
  // Status Badge Styles
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12, // Pill shape
    alignSelf: 'flex-start', // Don't stretch full width
  },
  statusLive: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)', // Light green background
  },
  statusNotLive: {
    backgroundColor: 'rgba(248, 113, 113, 0.15)', // Light red background
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusTextLive: {
    color: '#4ADE80', // Bright green text
  },
  statusTextNotLive: {
    color: '#F87171', // Bright red text
  },
  // Error/Loading Styles
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#1f1f27',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E2E8F0',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#A0AEC0',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#ff4d6d',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
   // Form Input/Switch Styles (Add your specific styles here)
  formGroup: {
     marginBottom: 16,
  },
  inputLabel: {
     fontSize: 14,
     fontWeight: '500',
     color: '#A0AEC0',
     marginBottom: 6,
  },
  textInput: {
     backgroundColor: '#2a2a35',
     color: '#E2E8F0',
     borderRadius: 8,
     paddingHorizontal: 12,
     paddingVertical: 10, // Adjust vertical padding
     fontSize: 14,       // Ensure text size matches display value
     borderWidth: 1,
     borderColor: '#3a3a45', // Subtle border
  },
  multilineInput: {
     height: 80, // Example height for multiline
     textAlignVertical: 'top', // Align text to top for multiline
     paddingTop: 10, // Adjust top padding for multiline
  },
  inputError: {
     borderColor: '#F87171', // Red border for errors
  },
  errorText: {
     color: '#F87171',
     fontSize: 12,
     marginTop: 4,
  },
  switchContainer: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     paddingVertical: 10, // Consistent padding
     // Add other styling as needed, e.g., background, border
  },
  switchLabelContainer: {
     flex: 1,
     marginRight: 10,
  },
  switchLabel: {
     fontSize: 14, // Match other input labels
     fontWeight: '500',
     color: '#E2E8F0', // Use light text color
  },
  switchDescription: {
     fontSize: 12,
     color: '#A0AEC0', // Lighter description text
     marginTop: 2,
  },
});

export default BarInfoSection;