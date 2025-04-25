import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
    Text,
    View,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Switch,
    ActivityIndicator,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import {
    ChevronDown,
    ChevronUp,
    Save,
    RotateCcw,
    Wine,
    Users,
    DollarSign,
    AlertCircle,
    Power,
    PowerOff,
    Hash, // Added for count
    Info, // Added for info icons/sections
} from 'lucide-react-native';
import cloneDeep from 'lodash/cloneDeep';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/src/lib/supabase";
import { Constants } from "@/src/lib/database.types";
import { useToast } from "@/src/components/general/Toast";

// --- Types --- (No changes needed from your provided version)
const seatOptionTypes = Constants.public.Enums.seat_option_type;
export type SeatOptionType = (typeof seatOptionTypes)[number];

export type SeatOptionRestrictions = {
  min_consumption?: number | null;
  min_bottles?: number | null;
};

export type SeatOption = {
  id: string;
  bar_id: string;
  type: SeatOptionType;
  enabled: boolean;
  available_count: number;
  min_people: number;
  max_people: number;
  restrictions: SeatOptionRestrictions | null;
};

export type SeatOptionFormValues = {
  type: SeatOptionType;
  enabled: boolean;
  available_count: number | null;
  min_people: number | null;
  max_people: number | null;
  restrictions: {
    min_consumption_enabled: boolean;
    min_consumption: number | null;
    min_bottles_enabled: boolean;
    min_bottles: number | null;
  };
};

// --- Helper Functions --- (No changes needed from your provided version)

// Converts DB structure to Form structure
const convertDbToFormValues = (dbOption: SeatOption): SeatOptionFormValues => {
  const dbRestrictions = dbOption.restrictions || {};
  return {
    type: dbOption.type,
    enabled: dbOption.enabled,
    available_count: dbOption.available_count,
    min_people: dbOption.min_people,
    max_people: dbOption.max_people,
    restrictions: {
      min_consumption_enabled: !!(dbRestrictions.min_consumption && dbRestrictions.min_consumption > 0),
      min_consumption: dbRestrictions.min_consumption ?? null,
      min_bottles_enabled: !!(dbRestrictions.min_bottles && dbRestrictions.min_bottles > 0),
      min_bottles: dbRestrictions.min_bottles ?? null,
    },
  };
};

// Creates a default state for the form
const createDefaultFormValues = (type: SeatOptionType): SeatOptionFormValues => ({
  type: type,
  enabled: true, // Default to enabled internally when first configured
  available_count: 0,
  min_people: null,
  max_people: null,
  restrictions: {
    min_consumption_enabled: false,
    min_consumption: null,
    min_bottles_enabled: false,
    min_bottles: null,
  },
});

// Gets the effective value for saving/display
const getEffectiveMinConsumption = (restrictions: SeatOptionFormValues['restrictions']): number | null => {
  return restrictions.min_consumption_enabled && restrictions.min_consumption && restrictions.min_consumption > 0
    ? restrictions.min_consumption
    : null;
};

// Gets the effective value for saving/display
const getEffectiveMinBottles = (restrictions: SeatOptionFormValues['restrictions']): number | null => {
  return restrictions.min_bottles_enabled && restrictions.min_bottles && restrictions.min_bottles > 0
    ? restrictions.min_bottles
    : null;
};

// Compares form state to original DB state to detect changes
const areStatesEqual = (formState: SeatOptionFormValues | null | undefined, dbState: SeatOption | null | undefined): boolean => {
    if (!formState && !dbState) return true;
    if (!formState || !dbState) return false;

    const dbRestrictions = dbState.restrictions || {};
    const formRestrictions = formState.restrictions;
    const effectiveDbMinConsumption = dbRestrictions.min_consumption ?? null;
    const effectiveFormMinConsumption = getEffectiveMinConsumption(formRestrictions);
    const effectiveDbMinBottles = dbRestrictions.min_bottles ?? null;
    const effectiveFormMinBottles = getEffectiveMinBottles(formRestrictions);

    return (
        formState.enabled === dbState.enabled &&
        (formState.available_count ?? 0) === (dbState.available_count ?? 0) &&
        (formState.min_people ?? 0) === (dbState.min_people ?? 0) && // Treat null as 0 for comparison if DB stores 0
        (formState.max_people ?? 0) === (dbState.max_people ?? 0) && // Treat null as 0 for comparison if DB stores 0
        effectiveFormMinConsumption === effectiveDbMinConsumption &&
        effectiveFormMinBottles === effectiveDbMinBottles
    );
};


// --- Validation Function ---
// Validates the form values for a *configured* seat type
const validateFormValues = (formValues: SeatOptionFormValues, isConfigured: boolean): string[] => {
    const errors: string[] = [];
    // Only validate if the user intends to configure this type
    if (!isConfigured) {
        return errors;
    }
    // Use a clean name for error messages
    const typeName = formatSeatTypeName(formValues.type);

    // --- General Enablement ---
    if (formValues.enabled) {
        // Available Count: Must be > 0 if the option itself is enabled
        if (formValues.available_count === null || formValues.available_count <= 0) {
            errors.push(`${typeName}: Available count must be greater than 0 when this option is enabled.`);
        }
        // Min Consumption Amount: Must be > 0 if the *restriction* is enabled
        if (formValues.restrictions.min_consumption_enabled && (formValues.restrictions.min_consumption === null || formValues.restrictions.min_consumption <= 0)) {
            errors.push(`${typeName}: Minimum consumption amount must be greater than 0 when the restriction is enabled.`);
        }
        // Min Bottles Amount: Must be > 0 if the *restriction* is enabled
        if (formValues.restrictions.min_bottles_enabled && (formValues.restrictions.min_bottles === null || formValues.restrictions.min_bottles <= 0)) {
            errors.push(`${typeName}: Minimum bottles amount must be greater than 0 when the restriction is enabled.`);
        }
    }

    // --- People Limits ---
    const minPpl = formValues.min_people;
    const maxPpl = formValues.max_people;

    // If Min is set, Max must also be set
     if (minPpl !== null && minPpl > 0) { // Only require max if min is specified and > 0
         if (maxPpl === null || maxPpl === 0) {
             errors.push(`${typeName}: Max people is required when Min people is set (and > 0).`);
         } else if (maxPpl < minPpl) {
             // Max cannot be less than Min
             errors.push(`${typeName}: Max people (${maxPpl}) cannot be less than Min people (${minPpl}).`);
         }
     }
     // If Max is set, it must be >= 0 (though usually we'd expect it > 0 if set)
     if (maxPpl !== null && maxPpl < 0) {
        errors.push(`${typeName}: Max people cannot be negative.`);
     }
     // If Min is set, it must be >= 0
      if (minPpl !== null && minPpl < 0) {
        errors.push(`${typeName}: Min people cannot be negative.`);
     }

    return errors;
};

// --- Utility Function ---
// Formats the enum type string for display
const formatSeatTypeName = (type: SeatOptionType): string => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};


// --- SeatOptionForm Props Interface ---
interface SeatOptionFormProps {
  values: SeatOptionFormValues;
  onChange: (values: SeatOptionFormValues) => void;
  isDisabled: boolean; // Usually false when rendered, controls editability
  isAvailableCountInvalid: boolean;
  isMaxPeopleInvalid: boolean;
  isMinConsumptionAmountInvalid: boolean;
  isMinBottlesAmountInvalid: boolean;
  originalRecordExists: boolean; // Informational, maybe useful later
  typeName: string; // Pass formatted name for labels/errors
}

// --- SeatOptionForm Component ---
// Renders the detailed form for a single seat type when expanded
const SeatOptionForm = React.memo(({
  values,
  onChange,
  isDisabled, // Note: Currently always false when rendered via SeatOptionCard logic
  isAvailableCountInvalid,
  isMaxPeopleInvalid,
  isMinConsumptionAmountInvalid,
  isMinBottlesAmountInvalid,
  typeName, // Use the passed-in formatted name
}: SeatOptionFormProps) => {

   // Generic field update handler
   const updateField = (field: keyof Omit<SeatOptionFormValues, 'restrictions' | 'type'>, value: any) => {
     let processedValue = value;
      if (field === 'enabled') {
          // Ensure boolean
          processedValue = !!value;
      } else if (field === 'available_count' || field === 'min_people' || field === 'max_people') {
          // Clean input to allow only non-negative integers or null
          const cleaned = String(value).replace(/[^0-9]/g, "");
          processedValue = cleaned === "" ? null : Math.max(0, parseInt(cleaned, 10)); // Allow 0, treat empty as null
      }
    onChange({ ...values, [field]: processedValue });
  };

  // Restriction-specific update handler
  const updateRestriction = (field: keyof SeatOptionFormValues['restrictions'], value: any) => {
    const updatedRestrictions = { ...values.restrictions };
    if (field === 'min_consumption_enabled' || field === 'min_bottles_enabled') {
        // Handle enabling/disabling restrictions
        updatedRestrictions[field] = !!value;
        // Reset amount if restriction is disabled
        if (field === 'min_consumption_enabled' && !value) updatedRestrictions.min_consumption = null;
        if (field === 'min_bottles_enabled' && !value) updatedRestrictions.min_bottles = null;
    } else if (field === 'min_consumption' || field === 'min_bottles') {
        // Handle amount changes for restrictions
        const cleaned = String(value).replace(/[^0-9]/g, "");
        const numValue = cleaned === "" ? null : Math.max(0, parseInt(cleaned, 10)); // Allow 0, treat empty as null
        updatedRestrictions[field] = numValue;
        // Automatically enable the toggle if a valid amount > 0 is entered
        if (field === 'min_consumption' && numValue !== null && numValue > 0) updatedRestrictions.min_consumption_enabled = true;
        if (field === 'min_bottles' && numValue !== null && numValue > 0) updatedRestrictions.min_bottles_enabled = true;
    }
    onChange({ ...values, restrictions: updatedRestrictions });
  };

  // Base style for disabled inputs (though currently form is only shown when enabled)
  const disabledInputStyle = isDisabled ? 'opacity-50' : '';

  return (
    <View className={`pt-4 px-4 border-t border-white/10 ${isDisabled ? 'opacity-60' : ''}`}>

       {/* --- General Settings --- */}
       <View className="mb-4 border-b border-white/5 pb-4">
           <Text className="text-base font-semibold text-white mb-3">General Settings</Text>
           {/* "Enabled" Switch */}
           <View className={`flex-row items-center justify-between mb-4 ${isDisabled ? 'opacity-50' : ''}`}>
               <View className="flex-row items-center flex-1 mr-2">
                   {values.enabled ? <Power size={18} color="#34d399" /> : <PowerOff size={18} color="#9ca3af" />}
                   <View className="ml-2">
                        <Text className={`text-sm font-medium ${values.enabled ? 'text-white' : 'text-gray-400'}`}>
                           {values.enabled ? 'Accepting Bookings' : 'Not Accepting Bookings'}
                        </Text>
                        <Text className="text-xs text-gray-500 mt-0.5">Controls if this option appears for users.</Text>
                   </View>
               </View>
               <Switch
                   value={values.enabled}
                   onValueChange={(v) => updateField('enabled', v)}
                   trackColor={{ false: '#374151', true: '#34d39940' }}
                   thumbColor={values.enabled ? '#34d399' : '#9ca3af'}
                   disabled={isDisabled}
                   ios_backgroundColor="#374151"
               />
           </View>

           {/* Available Count */}
           <View className={`mb-4 ${disabledInputStyle}`}>
               <View className="flex-row items-center mb-2">
                  <Hash size={16} color="#9ca3af" className="mr-2"/>
                  <Text className="text-sm text-white">Number of Available Units *</Text>
               </View>
               <View className={`bg-[#2A2A35] rounded-lg border ${isAvailableCountInvalid && values.enabled && !isDisabled ? 'border-red-500' : 'border-white/10'}`}>
                   <TextInput
                       className="text-white p-3 text-base"
                       keyboardType="numeric"
                       value={values.available_count?.toString() ?? ''}
                       onChangeText={(text) => updateField('available_count', text)}
                       placeholder={`e.g., 10 ${typeName}s`}
                       placeholderTextColor="#6C7A93"
                       editable={!isDisabled}
                   />
               </View>
               <Text className="text-xs text-gray-400 mt-1">Total number of this seat type (e.g., tables, stools) available for booking.</Text>
               {isAvailableCountInvalid && values.enabled && !isDisabled && (
                   <View className="flex-row items-center mt-1">
                       <AlertCircle size={12} color="#f87171" />
                       <Text className="text-red-400 text-xs ml-1 w-full">Must be greater than 0 if "Accepting Bookings" is On.</Text>
                   </View>
               )}
           </View>

           {/* Min/Max People */}
           <View className={`mb-2 ${disabledInputStyle}`}>
               <View className="flex-row items-center mb-2">
                  <Users size={16} color="#9ca3af" className="mr-2"/>
                  <Text className="text-sm text-white">Group Size Limits</Text>
               </View>
               <View className={`flex-row`}>
                   <View className="flex-1 mr-2">
                       <Text className="text-xs text-gray-400 mb-1">Min People</Text>
                       <View className={`bg-[#2A2A35] rounded-lg border ${isMaxPeopleInvalid && !isDisabled ? 'border-red-500/50' : 'border-white/10'}`}>
                           <TextInput
                               className="text-white p-3 text-base"
                               keyboardType="numeric"
                               value={values.min_people?.toString() ?? ''}
                               onChangeText={(text) => updateField('min_people', text)}
                               placeholder="Any"
                               placeholderTextColor="#6C7A93"
                               editable={!isDisabled}
                           />
                       </View>
                   </View>
                   <View className="flex-1 ml-2">
                       <Text className="text-xs text-gray-400 mb-1">Max People</Text>
                       <View className={`bg-[#2A2A35] rounded-lg border ${isMaxPeopleInvalid && !isDisabled ? 'border-red-500' : 'border-white/10'}`}>
                           <TextInput
                               className="text-white p-3 text-base"
                               keyboardType="numeric"
                               value={values.max_people?.toString() ?? ''}
                               onChangeText={(text) => updateField('max_people', text)}
                               placeholder="Any"
                               placeholderTextColor="#6C7A93"
                               editable={!isDisabled}
                           />
                       </View>
                   </View>
               </View>
               <Text className="text-xs text-gray-400 mt-1">Leave both blank or set to 0 to allow any group size. If Min is set ({'>'}0), Max is required and must be {'≥'} Min.</Text>
               {isMaxPeopleInvalid && !isDisabled && (
                   <View className="flex-row items-center mt-1">
                       <AlertCircle size={12} color="#f87171" />
                       <Text className="text-red-400 text-xs ml-1 w-full">
                           Max People is required if Min is set ({'>'}0) & must be {'≥'} Min People.
                       </Text>
                   </View>
               )}
           </View>
       </View>


       {/* --- Restrictions --- */}
       <View className={`mb-1 ${disabledInputStyle}`}>
           <View className="flex-row items-center mb-4">
              <Info size={16} color="#9ca3af" className="mr-2"/>
              <Text className="text-base font-semibold text-white">Booking Restrictions</Text>
           </View>
           <Text className="text-xs text-gray-400 mb-4 -mt-2">Optionally set minimum spending or bottle purchase requirements.</Text>

           {/* Minimum Consumption */}
           <View className="flex-row items-center justify-between mb-4">
               <View className="flex-row items-center flex-1 mr-2">
                   <DollarSign size={18} color={values.restrictions.min_consumption_enabled ? "#f59e0b" : "#9ca3af"} />
                   <Text className={`text-sm ml-2 ${values.restrictions.min_consumption_enabled ? 'text-white' : 'text-gray-400'}`}>
                       Minimum Spend
                   </Text>
               </View>
               <Switch
                   value={values.restrictions.min_consumption_enabled}
                   onValueChange={(v) => updateRestriction('min_consumption_enabled', v)}
                   trackColor={{ false: '#374151', true: '#f59e0b40' }} // Amber track
                   thumbColor={values.restrictions.min_consumption_enabled ? '#f59e0b' : '#9ca3af'}
                   disabled={isDisabled}
                   ios_backgroundColor="#2a2a35"
               />
           </View>
           {values.restrictions.min_consumption_enabled && (
               <View className={`mt-[-8px] mb-4 ml-6 pl-2 border-l border-dashed border-gray-600 ${isDisabled ? 'opacity-50' : ''}`}>
                   <Text className="text-xs text-gray-400 mb-1">Required Amount (€)</Text>
                   <View className={`bg-[#2A2A35] rounded-lg border ${isMinConsumptionAmountInvalid && !isDisabled ? 'border-red-500' : 'border-white/10'}`}>
                       <TextInput
                           className="text-white p-3 text-base"
                           keyboardType="numeric"
                           value={values.restrictions.min_consumption?.toString() ?? ''}
                           onChangeText={(text) => updateRestriction('min_consumption', text)}
                           placeholder="e.g., 100"
                           placeholderTextColor="#6C7A93"
                           editable={!isDisabled}
                       />
                   </View>
                   {isMinConsumptionAmountInvalid && !isDisabled && (
                       <View className="flex-row items-center mt-1">
                           <AlertCircle size={12} color="#f87171" />
                           <Text className="text-red-400 text-xs ml-1">Required amount must be greater than 0.</Text>
                       </View>
                   )}
               </View>
           )}

           {/* Minimum Bottles */}
           <View className="flex-row items-center justify-between mb-4">
               <View className="flex-row items-center flex-1 mr-2">
                   <Wine size={18} color={values.restrictions.min_bottles_enabled ? "#8b5cf6" : "#9ca3af"} />
                   <Text className={`text-sm ml-2 ${values.restrictions.min_bottles_enabled ? 'text-white' : 'text-gray-400'}`}>
                       Minimum Bottles
                   </Text>
               </View>
               <Switch
                   value={values.restrictions.min_bottles_enabled}
                   onValueChange={(v) => updateRestriction('min_bottles_enabled', v)}
                   trackColor={{ false: '#374151', true: '#8b5cf640' }} // Purple track
                   thumbColor={values.restrictions.min_bottles_enabled ? '#8b5cf6' : '#9ca3af'}
                   disabled={isDisabled}
                   ios_backgroundColor="#2a2a35"
               />
           </View>
           {values.restrictions.min_bottles_enabled && (
               <View className={`mt-[-8px] mb-4 ml-6 pl-2 border-l border-dashed border-gray-600 ${isDisabled ? 'opacity-50' : ''}`}>
                   <Text className="text-xs text-gray-400 mb-1">Required Number of Bottles</Text>
                   <View className={`bg-[#2A2A35] rounded-lg border ${isMinBottlesAmountInvalid && !isDisabled ? 'border-red-500' : 'border-white/10'}`}>
                       <TextInput
                           className="text-white p-3 text-base"
                           keyboardType="numeric"
                           value={values.restrictions.min_bottles?.toString() ?? ''}
                           onChangeText={(text) => updateRestriction('min_bottles', text)}
                           placeholder="e.g., 1"
                           placeholderTextColor="#6C7A93"
                           editable={!isDisabled}
                       />
                   </View>
                   {isMinBottlesAmountInvalid && !isDisabled && (
                       <View className="flex-row items-center mt-1">
                           <AlertCircle size={12} color="#f87171" />
                           <Text className="text-red-400 text-xs ml-1">Required bottle count must be greater than 0.</Text>
                       </View>
                   )}
               </View>
           )}
       </View>
    </View>
   );
});


// --- Main component ---
export default function Seats() {
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [openDrawers, setOpenDrawers] = useState<Set<SeatOptionType>>(new Set());
  const safeAreaInsets = useSafeAreaInsets();
  // State to track which types the user *intends* to configure (using the main switch)
  const [configuredTypes, setConfiguredTypes] = useState<Set<SeatOptionType>>(new Set());

  // --- Data Fetching ---
  const {
    data: dbSeatOptions, // Data directly from Supabase
    isLoading: isQueryLoading,
    error: queryError,
    refetch: refetchSeatOptions,
  } = useQuery<SeatOption[]>({
    queryKey: ["seat-options", barId],
    queryFn: async () => {
        if (!barId) return [];
        console.log("Fetching seat options for bar:", barId);
        const { data, error } = await supabase
            .from("seat_options")
            .select("*")
            .eq("bar_id", barId)
            .order("type", { ascending: true }); // Keep consistent order

        if (error) {
            console.error("Supabase fetch error:", error);
            throw new Error(error.message || "Failed to fetch seat options");
        }
        console.log("Fetched seat options:", data);
        return data as SeatOption[];
    },
    enabled: !!barId, // Only run query if barId exists
    staleTime: 1 * 60 * 1000, // Cache data for 1 minute
    gcTime: 10 * 60 * 1000, // Keep data in cache for 10 minutes
  });

  // --- Component State ---
  // Holds the current form values for each seat type
  const [seatOptions, setSeatOptions] = useState<Record<SeatOptionType, SeatOptionFormValues>>(
    () => Object.fromEntries(seatOptionTypes.map(type => [type, createDefaultFormValues(type)])) as Record<SeatOptionType, SeatOptionFormValues>
  );
  // Stores the original state fetched from DB for comparison (detecting changes)
  const [originalSeatOptions, setOriginalSeatOptions] = useState<Record<SeatOptionType, SeatOption | null>>(
    () => Object.fromEntries(seatOptionTypes.map(type => [type, null])) as Record<SeatOptionType, SeatOption | null>
  );

  // --- Effects ---
  // Initialize form state when data is fetched or barId changes
  useEffect(() => {
    const initialFormState = seatOptionTypes.reduce((acc, type) => ({ ...acc, [type]: createDefaultFormValues(type) }), {} as Record<SeatOptionType, SeatOptionFormValues>);
    const initialOriginalState = seatOptionTypes.reduce((acc, type) => ({ ...acc, [type]: null }), {} as Record<SeatOptionType, SeatOption | null>);
    const initialConfiguredTypes = new Set<SeatOptionType>();

    if (dbSeatOptions) {
        dbSeatOptions.forEach(dbOption => {
            // Ensure the type from DB is valid according to our enum
            if (seatOptionTypes.includes(dbOption.type)) {
                initialOriginalState[dbOption.type] = cloneDeep(dbOption); // Store original record
                initialFormState[dbOption.type] = convertDbToFormValues(dbOption); // Convert to form structure
                initialConfiguredTypes.add(dbOption.type); // Mark as configured based on existence in DB
            } else {
                console.warn(`Seat option type "${dbOption.type}" from DB is not recognized.`);
            }
        });
    }
    // Update component state
    setOriginalSeatOptions(initialOriginalState);
    setSeatOptions(initialFormState);
    setConfiguredTypes(initialConfiguredTypes);
    setOpenDrawers(new Set()); // Close all drawers on data refresh/init
    console.log("Initialized component state from DB data.");
  }, [dbSeatOptions, barId]); // Rerun when DB data or barId changes

  // --- Memoized Derived State ---
  // Calculates which seat types have unsaved changes
  const dirtyTypes = useMemo(() => {
      return seatOptionTypes.filter(type => {
          const isConfigured = configuredTypes.has(type);
          const originalRecord = originalSeatOptions[type];
          const formState = seatOptions[type];

          // Scenarios indicating a change:
          // 1. User configured it, but it wasn't in DB (new record)
          if (isConfigured && !originalRecord) return true;
          // 2. User un-configured it, but it was in DB (delete record)
          if (!isConfigured && originalRecord) return true;
          // 3. It's configured, was in DB, and the form values differ from original DB values
          if (isConfigured && originalRecord && formState) {
              return !areStatesEqual(formState, originalRecord);
          }
          // Otherwise, no change
          return false;
      });
  }, [seatOptions, originalSeatOptions, configuredTypes]);

  // Checks if any *configured* form has validation errors
  const isAnyFormInvalid = useMemo(() => {
      return seatOptionTypes.some(type => {
           const isConfigured = configuredTypes.has(type);
           // Only validate forms the user intends to save
           if (!isConfigured) return false;
           const formValues = seatOptions[type];
           // If form values exist, run validation
           return formValues ? validateFormValues(formValues, isConfigured).length > 0 : false;
      });
  }, [seatOptions, configuredTypes]);

  // Simple flag indicating if there are changes to save
  const hasUnsavedChanges = dirtyTypes.length > 0;

  // --- Save Mutation ---
  const saveMutation = useMutation({
      mutationFn: async (typesToSave: SeatOptionType[]) => {
          console.log(`Initiating save for types: ${typesToSave.join(', ')}`);
          type MutationResult = { type: SeatOptionType; action: 'create' | 'update' | 'delete' | 'none'; record?: SeatOption | null; };
          const results: MutationResult[] = [];
          const errors: { type: SeatOptionType, message: string }[] = [];
          let validationFailed = false;

          // Determine action (create/update/delete) for each dirty type
          type Operation = {
              type: SeatOptionType;
              action: 'create' | 'update' | 'delete' | 'none';
              formValues?: SeatOptionFormValues;
              originalDbRecord?: SeatOption | null;
              error?: string; // Store validation error here
          };

          const operations: Operation[] = typesToSave.map(type => {
              const isConfigured = configuredTypes.has(type);
              const formValues = seatOptions[type];
              const originalDbRecord = originalSeatOptions[type];
              let currentAction: Operation['action'] = 'none';

              // Determine the action based on configured status and original record existence
              if (isConfigured && !originalDbRecord) currentAction = 'create';
              else if (!isConfigured && originalDbRecord) currentAction = 'delete';
              else if (isConfigured && originalDbRecord) {
                  if (!areStatesEqual(formValues, originalDbRecord)) currentAction = 'update';
              } // Else: action remains 'none'

              // If no action needed, skip further processing
              if (currentAction === 'none') return { type, action: 'none' };

              // Validate before proceeding with create/update
              if ((currentAction === 'create' || currentAction === 'update') && formValues) {
                  const validationErrors = validateFormValues(formValues, isConfigured);
                  if (validationErrors.length > 0) {
                      validationFailed = true;
                      const errorMsg = `Validation failed: ${validationErrors.join('; ')}`;
                      errors.push({ type, message: errorMsg });
                      console.warn(`Validation error for ${type}: ${errorMsg}`);
                      // Return operation with error to prevent DB call
                      return { type, action: currentAction, error: errorMsg };
                  }
              }
              // Return operation details
              return { type, action: currentAction, formValues, originalDbRecord };
          });

          // If any validation failed, stop before hitting DB
          if (validationFailed) {
              console.error("Validation failed during save attempt:", errors);
              const errorSummary = errors.map(e => `${formatSeatTypeName(e.type)}: ${e.message}`).join('\n');
              throw new Error(`Please fix the validation errors:\n${errorSummary}`);
          }

          // Execute DB operations sequentially
          console.log("Executing DB operations...");
          for (const op of operations) {
              // Skip if no action or if validation failed earlier
              if (op.action === 'none' || op.error) continue;

              const { type, action, formValues, originalDbRecord } = op;
              let dbError: any = null;
              let dbData: any = null; // To store the result of create/update for state update

              try {
                  let commonPayload: Omit<SeatOption, 'id' | 'bar_id' | 'type'> | null = null;

                  // Prepare payload for create/update
                  if (action === 'create' || action === 'update') {
                      if (!formValues) throw new Error(`Internal Error: Missing form values for ${action} on ${type}`);

                      // Construct restrictions payload, omitting null/empty values
                      const restrictionsPayload: SeatOptionRestrictions = {};
                      const effMinCons = getEffectiveMinConsumption(formValues.restrictions);
                      if (effMinCons !== null) restrictionsPayload.min_consumption = effMinCons;
                      const effMinBot = getEffectiveMinBottles(formValues.restrictions);
                      if (effMinBot !== null) restrictionsPayload.min_bottles = effMinBot;
                      // Store null in DB if no restrictions apply, otherwise store the object
                      const finalRestrictions = Object.keys(restrictionsPayload).length > 0 ? restrictionsPayload : null;

                      // Prepare the main data payload
                      commonPayload = {
                          enabled: formValues.enabled,
                          // Use 0 as default if null, matching DB expectations (assuming non-nullable integers)
                          available_count: formValues.available_count ?? 0,
                          min_people: formValues.min_people ?? 0,
                          max_people: formValues.max_people ?? 0,
                          restrictions: finalRestrictions
                      };
                  }

                  console.log(`Executing ${action} for ${type}...`);
                  switch (action) {
                      case 'create':
                          if (!barId || !commonPayload) throw new Error('Internal Error: Missing barId or payload for create');
                          const { data: insertData, error: insertError } = await supabase
                              .from("seat_options")
                              .insert({ bar_id: barId, type: type, ...commonPayload })
                              .select() // Select the newly created record
                              .single(); // Expect a single record back
                          dbError = insertError;
                          dbData = insertData;
                          break;
                      case 'update':
                          if (!originalDbRecord?.id || !commonPayload) throw new Error(`Internal Error: Missing ID or payload for update on ${type}`);
                          const { error: updateError } = await supabase
                              .from("seat_options")
                              .update(commonPayload)
                              .eq("id", originalDbRecord.id);
                          dbError = updateError;
                          // Construct the updated record for state update (Supabase update doesn't return the full record easily)
                          dbData = { ...originalDbRecord, ...commonPayload };
                          break;
                      case 'delete':
                          if (!originalDbRecord?.id) throw new Error(`Internal Error: Missing original ID for delete on ${type}`);
                          const { error: deleteError } = await supabase
                              .from("seat_options")
                              .delete()
                              .eq("id", originalDbRecord.id);
                          dbError = deleteError;
                          dbData = null; // Indicate deletion
                          break;
                  }

                  if (dbError) throw dbError; // Throw error to be caught below

                  // Add successful result
                  results.push({ type, action: action as 'create' | 'update' | 'delete', record: dbData as SeatOption | null });
                  console.log(`Success: ${action} for ${type}`);

              } catch (error: any) {
                  console.error(`Failed ${action} operation for ${type}:`, error);
                  // Add specific error for this type
                  errors.push({ type, message: error.message || `Failed to ${action} ${formatSeatTypeName(type)}` });
                  // Rethrow to stop further operations and trigger mutation's onError
                  throw new Error(`Operation failed for ${formatSeatTypeName(type)}. Aborting remaining changes.`);
              }
          }
          console.log("All DB operations completed.");
          return results; // Return the results array
      },
      onSuccess: (results) => {
          console.log("Save Mutation onSuccess. Results:", results);
          const changesMadeCount = results.filter(r => r.action !== 'none').length;

          if (changesMadeCount > 0) {
              // Update local state optimistically based on successful operations
              const updatedOriginals = { ...originalSeatOptions };
              const updatedFormState = { ...seatOptions };
              const updatedConfiguredTypes = new Set(configuredTypes);

              results.forEach(({ type, action, record }) => {
                  if (action === 'create' || action === 'update') {
                      updatedOriginals[type] = cloneDeep(record ?? null); // Update original state with new record
                      updatedFormState[type] = record ? convertDbToFormValues(record) : createDefaultFormValues(type); // Update form state
                      updatedConfiguredTypes.add(type); // Ensure it's marked as configured
                  } else if (action === 'delete') {
                      updatedOriginals[type] = null; // Remove original record
                      updatedFormState[type] = createDefaultFormValues(type); // Reset form state
                      updatedConfiguredTypes.delete(type); // Unmark as configured (though it should already be)
                  }
              });

              setOriginalSeatOptions(updatedOriginals);
              setSeatOptions(updatedFormState);
              setConfiguredTypes(updatedConfiguredTypes);
              setOpenDrawers(new Set()); // Close drawers after save

              // Invalidate query cache to ensure fresh data on next load/refetch
              queryClient.invalidateQueries({ queryKey: ["seat-options", barId] });
              toast.show({ type: "success", text1: "Changes Saved", text2: `${changesMadeCount} seat option(s) updated successfully.` });
          } else {
               // This case should technically not happen if mutationFn only saves dirtyTypes
               toast.show({ type: "info", text1: "No Changes Applied", text2: `No modifications needed saving.` });
          }
      },
      onError: (error: Error) => {
           console.error("Save Mutation onError:", error);
           // Display the specific error message thrown from mutationFn or a generic one
           toast.show({
               type: "error",
               text1: "Save Failed",
               text2: error.message || "An unknown error occurred while saving.",
               duration: 5000 // Show error longer
           });
      },
  });
  // --- End of Save Mutation ---

  // --- Event Handlers ---
  // Handles the global "Save Changes" button press
  const handleGlobalSave = useCallback(() => {
    // Double-check for invalid forms before attempting save
    if (isAnyFormInvalid) {
        toast.show({
            type: 'error',
            text1: 'Invalid Data',
            text2: 'Please fix the highlighted errors before saving.',
            duration: 4000
        });
        // Optionally, auto-open drawers with errors
        const invalidTypes = seatOptionTypes.filter(type => {
            const isConfigured = configuredTypes.has(type);
            if (!isConfigured) return false;
            const formValues = seatOptions[type];
            return formValues ? validateFormValues(formValues, isConfigured).length > 0 : false;
        });
        setOpenDrawers(prev => new Set([...prev, ...invalidTypes]));
        return;
    }
    // Only proceed if there are actual changes
    if (dirtyTypes.length > 0) {
        console.log("Calling save mutation with dirty types:", dirtyTypes);
        saveMutation.mutate(dirtyTypes);
    } else {
         toast.show({ type: 'info', text1: 'No Changes', text2: 'Nothing to save.' });
    }
  }, [saveMutation, dirtyTypes, isAnyFormInvalid, toast, configuredTypes, seatOptions]); // Dependencies

  // Handles the global "Revert" button press
  const handleGlobalRevert = useCallback(() => {
    if (dirtyTypes.length === 0) {
        toast.show({ type: 'info', text1: 'No Changes', text2: 'Nothing to revert.' });
        return;
    }
    console.log("Reverting changes for types:", dirtyTypes);
    const revertedState = { ...seatOptions };
    const revertedConfigured = new Set(configuredTypes);

    dirtyTypes.forEach(type => {
        const originalDbState = originalSeatOptions[type];
        if (originalDbState) {
            // Restore from original DB state if it existed
            revertedState[type] = convertDbToFormValues(originalDbState);
            revertedConfigured.add(type); // Ensure it's marked configured again
        } else {
            // If it was a new item (no original state), reset to default and unconfigure
            revertedState[type] = createDefaultFormValues(type);
            revertedConfigured.delete(type); // Unmark as configured
        }
    });
    setSeatOptions(revertedState);
    setConfiguredTypes(revertedConfigured);
    setOpenDrawers(new Set()); // Close drawers after revert
    toast.show({ type: 'info', text1: 'Changes Reverted', text2: 'Your modifications have been discarded.' });
  }, [seatOptions, originalSeatOptions, configuredTypes, dirtyTypes, toast]); // Dependencies

  // Handles the main "Configure" switch for a seat type
  const handleConfigureToggle = useCallback((type: SeatOptionType, shouldConfigure: boolean) => {
      console.log(`Toggling configuration for ${type} to ${shouldConfigure}`);
      setConfiguredTypes(prev => {
          const newConfigured = new Set(prev);
          if (shouldConfigure) {
              newConfigured.add(type);
              // If configuring a new type not previously in DB, maybe default 'enabled' to true
              if (!originalSeatOptions[type]) {
                  setSeatOptions(prevForm => ({
                      ...prevForm,
                      [type]: { ...prevForm[type], enabled: true } // Default internal switch to ON
                  }));
              }
              // Automatically open the drawer when configuring
              setOpenDrawers(prevOpen => new Set(prevOpen).add(type));
          } else {
              newConfigured.delete(type);
              // Close the drawer when un-configuring
              setOpenDrawers(prevOpen => {
                  const newOpen = new Set(prevOpen);
                  newOpen.delete(type);
                  return newOpen;
              });
          }
          return newConfigured;
      });
  }, [originalSeatOptions]); // Dependency

  // Handles the chevron press to open/close the details drawer
  const handleChevronToggle = useCallback((type: SeatOptionType) => {
      const isConfigured = configuredTypes.has(type);
      // Only allow opening/closing if the type is configured
      if (isConfigured) {
          setOpenDrawers(prevOpenDrawers => {
              const newOpenDrawers = new Set(prevOpenDrawers);
              if (newOpenDrawers.has(type)) {
                  newOpenDrawers.delete(type); // Close it
              } else {
                  newOpenDrawers.add(type); // Open it
              }
              return newOpenDrawers;
          });
      } else {
          // Optional: Show a toast if user tries to open unconfigured?
          // toast.show({ type: 'info', text1: 'Not Configured', text2: 'Enable configuration first using the switch.' });
      }
  }, [configuredTypes]); // Dependency


  // --- Render Logic ---

  // Renders a single Seat Option Card (Header, Summary/Form)
  const renderSeatOption = useCallback((type: SeatOptionType) => {
    const currentFormValues = seatOptions[type];
    const isConfigured = configuredTypes.has(type); // Is the main switch ON?
    const originalRecord = originalSeatOptions[type];
    const originalRecordExists = !!originalRecord;
    const isCurrentlyOpen = openDrawers.has(type); // Is the details form visible?
    const typeName = formatSeatTypeName(type); // Get user-friendly name

    // Loading state for individual card (shouldn't happen often with current structure)
    if (!currentFormValues) {
        return (
            <View key={type} className="bg-[#1E1E1E] rounded-xl m-4 p-4 border border-white/10 opacity-50">
                <ActivityIndicator color="#9ca3af" />
            </View>
        );
    }

    // Determine validation status for this specific type
    const validationErrors = validateFormValues(currentFormValues, isConfigured);
    const isInvalid = validationErrors.length > 0;
    // Specific error flags for form props
    const isAvailableCountInvalid = validationErrors.some(e => e.includes('Available count'));
    const isMaxPeopleInvalid = validationErrors.some(e => e.includes('Max people'));
    const isMinConsumptionAmountInvalid = validationErrors.some(e => e.includes('Min consumption') || e.includes('Minimum consumption'));
    const isMinBottlesAmountInvalid = validationErrors.some(e => e.includes('Min bottles') || e.includes('Minimum bottles'));

    // Check if this specific type has unsaved changes
    const isThisTypeDirty = dirtyTypes.includes(type);
    // Apply visual indication if not configured
    const cardOpacityClass = !isConfigured ? 'opacity-60' : '';
    // Highlight border if dirty or invalid and configured
    const cardBorderClass = isConfigured
        ? isInvalid ? 'border-red-500/60' : isThisTypeDirty ? 'border-yellow-400/60' : 'border-white/10'
        : 'border-white/10';

    return (
      <View key={type} className={`bg-[#1E1E1E] rounded-xl m-4 overflow-hidden border ${cardBorderClass} ${cardOpacityClass} transition-all duration-150 ease-in-out`}>
        {/* Card Header: Type Name, Chevron, Configure Switch */}
        <TouchableOpacity
          onPress={() => handleChevronToggle(type)}
          // Disable chevron interaction only if not configured OR saving is in progress
          disabled={!isConfigured || saveMutation.isPending}
          className={`flex-row justify-between items-center p-4 ${!isConfigured ? 'cursor-default' : ''}`}
          activeOpacity={isConfigured ? 0.7 : 1.0} // Only provide feedback if interactive
        >
          {/* Left Side: Name, Chevron, Status Indicators */}
          <View className="flex-row items-center flex-1 mr-2">
              <Text className={`text-lg font-semibold mr-2 ${isConfigured ? 'text-white' : 'text-gray-500'}`}>
                  {typeName}
              </Text>
              {/* Chevron indicates open/closed state, only shown colored if configured */}
              <View className="p-1 opacity-80">
                  {isCurrentlyOpen && isConfigured
                      ? <ChevronUp size={20} color="#ff4d6d" />
                      : <ChevronDown size={20} color={isConfigured ? "#9ca3af" : "#6b7280"} />
                  }
              </View>
              {/* Dirty indicator (yellow dot) */}
              {isThisTypeDirty && !saveMutation.isPending && (
                  <View className="w-2 h-2 bg-yellow-400 rounded-full ml-2" />
               )}
              {/* Invalid indicator (red alert) - show only if configured */}
              {isInvalid && isConfigured && !saveMutation.isPending && (
                 <AlertCircle size={16} color="#f87171" className="ml-2" />
               )}
          </View>

          {/* Right Side: Configure Switch */}
          <View className="flex-row items-center">
              <Text className={`text-xs mr-2 font-medium ${isConfigured ? 'text-green-400' : 'text-gray-500'}`}>
                  {isConfigured ? 'Configured' : 'Not Configured'}
              </Text>
              <Switch
                  value={isConfigured}
                  onValueChange={(value) => handleConfigureToggle(type, value)}
                  trackColor={{ false: '#374151', true: '#34d39940' }} // Green track when ON
                  thumbColor={isConfigured ? '#34d399' : '#9ca3af'}
                  disabled={saveMutation.isPending} // Disable while saving
                  ios_backgroundColor="#374151"
              />
          </View>
        </TouchableOpacity>

        {/* Card Summary (Shown when CLOSED and CONFIGURED) */}
        {!isCurrentlyOpen && isConfigured && (
            <View className={`p-4 border-t border-white/10 flex-row flex-wrap items-center`}>
                {/* Internal Enabled Status */}
                <View className={`flex-row items-center mr-4 mb-2 ${currentFormValues.enabled ? '' : 'opacity-60'}`}>
                    {currentFormValues.enabled ? <Power size={14} color="#34d399" /> : <PowerOff size={14} color="#9ca3af" />}
                    <Text className={`ml-1.5 text-sm ${currentFormValues.enabled ? 'text-green-400' : 'text-gray-400'}`}>
                        {currentFormValues.enabled ? 'Bookable' : 'Not Bookable'}
                    </Text>
                </View>
                {/* Available Seats Summary */}
                <View className="flex-row items-center mr-4 mb-2">
                    <Hash size={14} color="#9ca3af" />
                    <Text className={`ml-1.5 text-sm ${isAvailableCountInvalid && currentFormValues.enabled ? 'text-red-400' : 'text-gray-400'}`}>
                        <Text className="font-medium">{currentFormValues.available_count ?? 0}</Text> Units
                    </Text>
                    {/* Show alert icon if count is invalid *and* the option is meant to be enabled */}
                    {isAvailableCountInvalid && currentFormValues.enabled && <AlertCircle size={14} color="#f87171" style={{ marginLeft: 4 }}/>}
                </View>
                {/* People Summary */}
                <View className="flex-row items-center mr-4 mb-2">
                    <Users size={14} color="#9ca3af" />
                     <Text className={`ml-1.5 text-sm ${isMaxPeopleInvalid ? 'text-red-400' : 'text-gray-400'}`}>
                        {(currentFormValues.min_people ?? 0) === 0 && (currentFormValues.max_people ?? 0) === 0
                          ? 'Any Size Group'
                          : <>
                              <Text className="font-medium">{currentFormValues.min_people ?? 'Any'}</Text>-<Text className="font-medium">{currentFormValues.max_people ?? 'Any'}</Text> ppl
                            </>
                        }
                    </Text>
                    {isMaxPeopleInvalid && <AlertCircle size={14} color="#f87171" style={{ marginLeft: 4 }}/>}
                </View>
                {/* Restrictions Badges */}
                {/* Min Consumption Badge */}
                {getEffectiveMinConsumption(currentFormValues.restrictions) !== null && (
                    <View style={[styles.badge, styles.yellowBadge]} className="mb-2">
                        <DollarSign size={12} color="#FFF" style={styles.badgeIcon}/>
                        <Text style={styles.badgeText}>Min €{getEffectiveMinConsumption(currentFormValues.restrictions)}</Text>
                        {/* Show alert within badge if invalid *and* restriction is enabled */}
                        {isMinConsumptionAmountInvalid && currentFormValues.restrictions.min_consumption_enabled && <AlertCircle size={12} color="#92400e" style={{ marginLeft: 4 }}/>}
                    </View>
                )}
                {/* Min Bottles Badge */}
                {getEffectiveMinBottles(currentFormValues.restrictions) !== null && (
                    <View style={[styles.badge, styles.purpleBadge]} className="mb-2">
                        <Wine size={12} color="#FFF" style={styles.badgeIcon}/>
                        <Text style={styles.badgeText}>Min {getEffectiveMinBottles(currentFormValues.restrictions)} Bottle(s)</Text>
                        {isMinBottlesAmountInvalid && currentFormValues.restrictions.min_bottles_enabled && <AlertCircle size={12} color="#581c87" style={{ marginLeft: 4 }}/>}
                    </View>
                )}
           </View>
        )}

        {/* Edit Form (Shown when OPEN and CONFIGURED) */}
        {isCurrentlyOpen && isConfigured && (
          <SeatOptionForm
            typeName={typeName} // Pass formatted name
            values={currentFormValues}
            onChange={(values) => setSeatOptions((prev) => ({ ...prev, [type]: values }))}
            isDisabled={saveMutation.isPending} // Disable form inputs during save
            isAvailableCountInvalid={isAvailableCountInvalid}
            isMaxPeopleInvalid={isMaxPeopleInvalid}
            isMinConsumptionAmountInvalid={isMinConsumptionAmountInvalid}
            isMinBottlesAmountInvalid={isMinBottlesAmountInvalid}
            originalRecordExists={originalRecordExists}
          />
        )}
      </View>
    );
  }, [
      seatOptions,
      originalSeatOptions,
      configuredTypes,
      openDrawers,
      dirtyTypes,
      handleConfigureToggle,
      handleChevronToggle,
      saveMutation.isPending,
      toast,
      styles // Keep styles as dependency if they could change (though unlikely here)
  ]);

   // --- Loading State ---
   if (isQueryLoading && !dbSeatOptions) { // Show loading only on initial fetch
        return (
            <View className="flex-1 bg-[#121212] items-center justify-center">
                <ActivityIndicator size="large" color="#ff4d6d" />
                <Text className="text-gray-400 mt-4 text-base">Loading Seat Options...</Text>
            </View>
        );
   }

   // --- Error State ---
   if (queryError) {
       return (
           <View className="flex-1 bg-[#121212] items-center justify-center p-6">
               <AlertCircle size={48} color="#ff4d6d" />
               <Text className="text-red-400 mt-4 text-xl font-semibold text-center">Error Loading Seat Options</Text>
               <Text className="text-gray-400 mt-2 text-center mb-6">
                   {queryError instanceof Error ? queryError.message : "An unexpected error occurred while fetching data."}
               </Text>
               <TouchableOpacity
                    className="bg-[#ff4d6d] py-2.5 px-8 rounded-lg flex-row items-center"
                    onPress={() => refetchSeatOptions()}
                    disabled={isQueryLoading} // Prevent multiple clicks while retrying
                >
                    <RotateCcw size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text className="text-white font-medium text-base">Retry</Text>
               </TouchableOpacity>
           </View>
       );
   }

   // --- Empty State (After successful load, but nothing configured) ---
   const noConfiguredOptions = dbSeatOptions && configuredTypes.size === 0;

   // --- Main Render ---
   return (
     <View className="flex-1 bg-[#121212]">
       <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          // Adjust offset if you have a custom header above this screen
          keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
       >
         <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled" // Allows taps on buttons within scrollview while keyboard is up
            contentContainerStyle={{
                paddingBottom: hasUnsavedChanges
                    // Make space for floating bar + safe area
                    ? (safeAreaInsets.bottom > 0 ? safeAreaInsets.bottom + 70 : 82)
                    // Default padding when no changes bar
                    : (safeAreaInsets.bottom > 0 ? safeAreaInsets.bottom + 20 : 30)
            }}
          >
           {/* Page Header */}
           <View className="p-4 pt-6 border-b border-white/10 bg-[#181818]">
               <Text className="text-2xl font-bold text-white mb-1">Seat Management</Text>
               <Text className="text-sm text-gray-400 leading-relaxed">
                   Use the main switch ('Configured' / 'Not Configured') for each seat type you offer.
                   Once configured, expand the card (▼) to set availability, group size, booking status ('Bookable'), and any spending restrictions.
               </Text>
           </View>

           {/* List of Seat Options */}
           {seatOptionTypes.map(renderSeatOption)}

           {/* Empty State Message */}
           {noConfiguredOptions && !isQueryLoading && (
               <View className="items-center justify-center mt-10 p-6">
                  <Info size={32} color="#6b7280" />
                  <Text className="text-gray-500 mt-3 text-center text-base">
                      No seat types are configured yet.
                  </Text>
                  <Text className="text-gray-600 mt-1 text-center text-sm">
                      Use the switches above to start configuring options like 'Tables' or 'Bar Stools'.
                  </Text>
               </View>
           )}

         </ScrollView>
       </KeyboardAvoidingView>

       {/* Floating Save/Revert Bar */}
       {hasUnsavedChanges && (
         <View
            style={[ styles.floatingBar, { paddingBottom: safeAreaInsets.bottom > 0 ? safeAreaInsets.bottom : 12 } ]}
            className="bg-[#1E1E1E]/95 border-t border-white/20 shadow-lg backdrop-blur-sm" // Added backdrop blur for effect
         >
            {/* Revert Button */}
            <TouchableOpacity
                className={`flex-row items-center p-3 mr-3 rounded-lg transition-opacity ${saveMutation.isPending ? 'opacity-50' : 'hover:bg-white/10'}`}
                onPress={handleGlobalRevert}
                disabled={saveMutation.isPending}
            >
                <RotateCcw size={18} color="#9ca3af" />
                <Text className="text-gray-300 ml-2 text-base font-medium">Revert</Text>
            </TouchableOpacity>

            {/* Save Button */}
            <TouchableOpacity
                className={`flex-row items-center py-3 px-5 rounded-lg transition-opacity
                           ${(saveMutation.isPending || isAnyFormInvalid)
                                ? 'bg-gray-600 opacity-60' // Disabled state: Grayed out
                                : 'bg-[#ff4d6d] hover:bg-[#ff3c5a]' // Active state: Pink, slightly darker on hover (web)
                           }`}
                onPress={handleGlobalSave}
                disabled={saveMutation.isPending || isAnyFormInvalid} // Disable if saving or form is invalid
            >
                {/* Show spinner or save icon */}
                {saveMutation.isPending
                    ? <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }}/>
                    : <Save size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                }
                <Text className="text-white text-base font-medium">
                    {saveMutation.isPending ? 'Saving...' : `Save Changes (${dirtyTypes.length})`}
                </Text>
            </TouchableOpacity>
         </View>
       )}
     </View>
   );
}


// --- Styles --- (Mostly unchanged, kept for badges/floating bar)
const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4, // Slightly increased padding
        borderRadius: 12,
        marginRight: 8,
        // Removed marginBottom here, added via className="mb-2" in render
    },
    badgeIcon: {
        marginRight: 5, // Slightly more space
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '500',
        color: '#FFFFFF',
    },
    // Badge colors remain specific
    yellowBadge: { backgroundColor: '#f59e0b' }, // Min Consumption (Amber 600)
    purpleBadge: { backgroundColor: '#8b5cf6' }, // Min Bottles (Violet 500)
    // Floating bar style
    floatingBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'flex-end', // Align buttons to the right
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        // Background and border are applied via className now
    },
});