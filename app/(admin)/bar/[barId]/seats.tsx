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
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // Import for safe area handling
import { useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronUp, Save, RotateCcw, Wine, Users, DollarSign, AlertCircle, Power, PowerOff } from 'lucide-react-native'; // Added Power icons
import cloneDeep from 'lodash/cloneDeep';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/src/lib/supabase";
import { Constants } from "@/src/lib/database.types";
import { useToast } from "@/src/components/general/Toast";

// --- Types (Keep as is) ---
const seatOptionTypes = Constants.public.Enums.seat_option_type;
export type SeatOptionType = (typeof seatOptionTypes)[number];

export type SeatOptionRestrictions = {
  require_bottle_drink?: boolean;
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
  enabled: boolean; // This now represents the *actual* enabled state for the DB
  available_count: number | null;
  min_people: number | null;
  max_people: number | null;
  restrictions: {
    require_bottle_drink: boolean;
    min_consumption_enabled: boolean;
    min_consumption: number | null;
    min_bottles_enabled: boolean;
    min_bottles: number | null;
  };
};

// --- Helper Functions ---

// Convert DB to Form: Initialize 'enabled' from DB
const convertDbToFormValues = (dbOption: SeatOption): SeatOptionFormValues => {
  const dbRestrictions = dbOption.restrictions || {};
  return {
    type: dbOption.type,
    enabled: dbOption.enabled, // Use DB enabled state
    available_count: dbOption.available_count,
    min_people: dbOption.min_people,
    max_people: dbOption.max_people,
    restrictions: {
      require_bottle_drink: dbRestrictions.require_bottle_drink ?? false,
      min_consumption_enabled: !!(dbRestrictions.min_consumption && dbRestrictions.min_consumption > 0),
      min_consumption: dbRestrictions.min_consumption ?? null,
      min_bottles_enabled: !!(dbRestrictions.min_bottles && dbRestrictions.min_bottles > 0),
      min_bottles: dbRestrictions.min_bottles ?? null,
    },
  };
};

// Create Default: Default 'enabled' to true when first configured
const createDefaultFormValues = (type: SeatOptionType): SeatOptionFormValues => ({
  type: type,
  enabled: true, // Default to enabled when first configured
  available_count: 0,
  min_people: null,
  max_people: null,
  restrictions: {
    require_bottle_drink: false,
    min_consumption_enabled: false,
    min_consumption: null,
    min_bottles_enabled: false,
    min_bottles: null,
  },
});

const getEffectiveMinConsumption = (restrictions: SeatOptionFormValues['restrictions']): number | null => {
  return restrictions.min_consumption_enabled && restrictions.min_consumption && restrictions.min_consumption > 0
    ? restrictions.min_consumption
    : null;
};

const getEffectiveMinBottles = (restrictions: SeatOptionFormValues['restrictions']): number | null => {
  return restrictions.min_bottles_enabled && restrictions.min_bottles && restrictions.min_bottles > 0
    ? restrictions.min_bottles
    : null;
};

// areStatesEqual: Now compares the full form state (including 'enabled') to the DB state
const areStatesEqual = (formState: SeatOptionFormValues | null | undefined, dbState: SeatOption | null | undefined): boolean => {
    if (!formState && !dbState) return true; // Both null/undefined
    if (!formState || !dbState) return false; // One exists, the other doesn't

    // Compare all fields, including 'enabled'
    const dbRestrictions = dbState.restrictions || {};
    const formRestrictions = formState.restrictions;
    const effectiveDbMinConsumption = dbRestrictions.min_consumption ?? null;
    const effectiveFormMinConsumption = getEffectiveMinConsumption(formRestrictions);
    const effectiveDbMinBottles = dbRestrictions.min_bottles ?? null;
    const effectiveFormMinBottles = getEffectiveMinBottles(formRestrictions);

    return (
        formState.enabled === dbState.enabled && // Compare enabled status
        (formState.available_count ?? 0) === (dbState.available_count ?? 0) &&
        (formState.min_people ?? 0) === (dbState.min_people ?? 0) &&
        (formState.max_people ?? 0) === (dbState.max_people ?? 0) &&
        formRestrictions.require_bottle_drink === (dbRestrictions.require_bottle_drink ?? false) &&
        effectiveFormMinConsumption === effectiveDbMinConsumption &&
        effectiveFormMinBottles === effectiveDbMinBottles
    );
};


// --- Validation Function ---
// Validation needs context: only validate thoroughly if configured and enabled
// --- START OF FIX 1: Updated validateFormValues ---
const validateFormValues = (formValues: SeatOptionFormValues, isConfigured: boolean): string[] => {
    const errors: string[] = [];
    // Only run validations if the type is configured
    if (!isConfigured) {
        return errors; // No validation needed if not configured
    }

    const typeName = formValues.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    // Only validate counts/restrictions if the *internal* enabled switch is ON
    if (formValues.enabled) {
        if (formValues.available_count === null || formValues.available_count <= 0) {
            errors.push(`${typeName}: Available count must be > 0 when enabled.`);
        }
        if (formValues.restrictions.min_consumption_enabled && (formValues.restrictions.min_consumption === null || formValues.restrictions.min_consumption <= 0)) {
            errors.push(`${typeName}: Min consumption amount must be > 0 when enabled.`);
        }
        if (formValues.restrictions.min_bottles_enabled && (formValues.restrictions.min_bottles === null || formValues.restrictions.min_bottles <= 0)) {
            errors.push(`${typeName}: Min bottles amount must be > 0 when enabled.`);
        }
    }

    // These validations apply regardless of the internal enabled switch (if configured)
    const minPpl = formValues.min_people;
    const maxPpl = formValues.max_people;

    // Check min/max consistency
    if (minPpl !== null) { // If Min People is set...
         if (maxPpl === null) { // ...but Max People is not...
             errors.push(`${typeName}: Max people is required when Min people is set.`);
         } else if (maxPpl < minPpl) { // ...or Max People is less than Min People...
             errors.push(`${typeName}: Max people (${maxPpl}) cannot be < Min people (${minPpl}).`);
         }
     }

    return errors;
};
// --- END OF FIX 1 ---


// --- SeatOptionForm Props Interface ---
interface SeatOptionFormProps {
  values: SeatOptionFormValues;
  onChange: (values: SeatOptionFormValues) => void;
  isDisabled: boolean; // Renamed: This now means "Is the entire form disabled because not configured?"
  isAvailableCountInvalid: boolean;
  isMaxPeopleInvalid: boolean;
  isMinConsumptionAmountInvalid: boolean;
  isMinBottlesAmountInvalid: boolean;
  originalRecordExists: boolean; // NEW PROP: To control the "Enabled" switch visibility/state
}

// --- SeatOptionForm Component ---
const SeatOptionForm = ({
  values,
  onChange,
  isDisabled, // Is the whole form disabled (not configured)?
  isAvailableCountInvalid,
  isMaxPeopleInvalid,
  isMinConsumptionAmountInvalid,
  isMinBottlesAmountInvalid,
  originalRecordExists, // Does the DB record exist?
}: SeatOptionFormProps) => {

  // Keep updateField and updateRestriction as they are, they modify the 'values' object
   const updateField = (field: keyof Omit<SeatOptionFormValues, 'restrictions' | 'type'>, value: any) => {
     let processedValue = value;
      // Special handling for the 'enabled' field (controlled by the internal switch)
      if (field === 'enabled') {
          processedValue = !!value;
      } else if (field === 'available_count' || field === 'min_people' || field === 'max_people') {
          const cleaned = String(value).replace(/[^0-9]/g, "");
          processedValue = cleaned === "" ? null : Math.max(0, parseInt(cleaned, 10));
      }
    onChange({ ...values, [field]: processedValue });
  };

  const updateRestriction = (field: keyof SeatOptionFormValues['restrictions'], value: any) => {
    const updatedRestrictions = { ...values.restrictions };
    if (field === 'require_bottle_drink' || field === 'min_consumption_enabled' || field === 'min_bottles_enabled') {
        updatedRestrictions[field] = !!value;
        if (field === 'min_consumption_enabled' && !value) updatedRestrictions.min_consumption = null;
        if (field === 'min_bottles_enabled' && !value) updatedRestrictions.min_bottles = null;
    } else if (field === 'min_consumption' || field === 'min_bottles') {
        const cleaned = String(value).replace(/[^0-9]/g, "");
        const numValue = cleaned === "" ? null : Math.max(0, parseInt(cleaned, 10));
        updatedRestrictions[field] = numValue;
        if (field === 'min_consumption' && numValue !== null && numValue > 0) updatedRestrictions.min_consumption_enabled = true;
        if (field === 'min_bottles' && numValue !== null && numValue > 0) updatedRestrictions.min_bottles_enabled = true;
    }
    onChange({ ...values, restrictions: updatedRestrictions });
  };

  const disabledInputStyle = isDisabled ? 'opacity-50' : '';

  return (
    // Entire form respects the isDisabled prop (passed from whether it's configured)
    <View className={`pt-4 px-4 border-t border-white/10 ${isDisabled ? 'opacity-60' : ''}`}>

       {/* --- NEW "Enabled" Switch --- */}
       <View className={`flex-row items-center justify-between mb-4 ${isDisabled ? 'opacity-50' : ''}`}>
           <View className="flex-row items-center">
               {values.enabled ? <Power size={16} color="#34d399" /> : <PowerOff size={16} color="#9ca3af" />}
               <Text className={`text-sm ml-2 ${values.enabled ? 'text-white' : 'text-gray-400'}`}>
                   {values.enabled ? 'Seat Option Enabled' : 'Seat Option Disabled'}
               </Text>
           </View>
           <Switch
               value={values.enabled}
               // Use updateField directly to change the 'enabled' property in the form values
               onValueChange={(v) => updateField('enabled', v)}
               trackColor={{ false: '#374151', true: '#34d39940' }}
               thumbColor={values.enabled ? '#34d399' : '#9ca3af'}
               // This switch is disabled if the entire form is disabled (i.e., not configured)
               disabled={isDisabled}
               ios_backgroundColor="#374151"
           />
       </View>
       {/* --- End NEW Switch --- */}

       {/* --- Existing Form Fields --- */}
       {/* These fields respect isDisabled, but also consider internal 'values.enabled' for validation styles */}
       <View className={`mb-4 ${disabledInputStyle}`}>
         <Text className="text-sm text-white mb-2">Available Count *</Text>
         {/* Validation border depends on internal 'enabled' state AND form being configured */}
         <View className={`bg-[#2A2A35] rounded-lg border ${isAvailableCountInvalid && values.enabled && !isDisabled ? 'border-red-500' : 'border-white/10'}`}>
           <TextInput className="text-white p-3 text-base" keyboardType="numeric" value={values.available_count?.toString() ?? ''} onChangeText={(text) => updateField('available_count', text)} placeholder="0" placeholderTextColor="#6C7A93" editable={!isDisabled}/>
         </View>
         {/* Error message depends on internal 'enabled' state AND form being configured */}
         {isAvailableCountInvalid && values.enabled && !isDisabled && (<View className="flex-row items-center mt-1"><AlertCircle size={12} color="#f87171" /><Text className="text-red-400 text-xs ml-1 w-full">Value must be greater than 0 when enabled.</Text></View>)}
       </View>

       {/* Min/Max People */}
       <View className={`flex-row mb-6 ${disabledInputStyle}`}>
         <View className="flex-1 mr-2">
             <Text className="text-sm text-white mb-2">Min People</Text>
             <View className="bg-[#2A2A35] rounded-lg border border-white/10"><TextInput className="text-white p-3 text-base" keyboardType="numeric" value={values.min_people?.toString() ?? ''} onChangeText={(text) => updateField('min_people', text)} placeholder="Any" placeholderTextColor="#6C7A93" editable={!isDisabled} /></View>
         </View>
         <View className="flex-1 ml-2">
           <Text className="text-sm text-white mb-2">Max People</Text>
            <View className={`bg-[#2A2A35] rounded-lg border ${isMaxPeopleInvalid && !isDisabled ? 'border-red-500' : 'border-white/10'}`}>
             <TextInput className="text-white p-3 text-base" keyboardType="numeric" value={values.max_people?.toString() ?? ''} onChangeText={(text) => updateField('max_people', text)} placeholder="Any" placeholderTextColor="#6C7A93" editable={!isDisabled} />
           </View>
           {/* --- START OF FIX 2: Updated Error Message for Max People --- */}
           {isMaxPeopleInvalid && !isDisabled && (
               <View className="flex-row items-center mt-1">
                   <AlertCircle size={12} color="#f87171" />
                   <Text className="text-red-400 text-xs ml-1 w-full">
                       Required if Min is set & must be ≥ Min People.
                   </Text>
               </View>
           )}
           {/* --- END OF FIX 2 --- */}
         </View>
       </View>

       {/* Restrictions */}
       <View className={`mb-1 ${disabledInputStyle}`}>
         <Text className="text-base font-semibold text-white mb-4">Restrictions</Text>
         {/* Switches inside restrictions respect isDisabled */}
         <View className="flex-row items-center justify-between mb-4"><View className="flex-row items-center"><Wine size={16} color="#ff4d6d" className="mr-2" /><Text className="text-sm text-white ml-2">Require Bottle Service</Text></View><Switch value={values.restrictions.require_bottle_drink} onValueChange={(v) => updateRestriction('require_bottle_drink', v)} trackColor={{ false: '#2a2a35', true: '#ff4d6d40' }} thumbColor={values.restrictions.require_bottle_drink ? '#ff4d6d' : '#9ca3af'} disabled={isDisabled} ios_backgroundColor="#2a2a35" /></View>
         <View className="flex-row items-center justify-between mb-4"><View className="flex-row items-center"><DollarSign size={16} color="#ff4d6d" className="mr-2" /><Text className="text-sm text-white ml-2">Minimum Consumption</Text></View><Switch value={values.restrictions.min_consumption_enabled} onValueChange={(v) => updateRestriction('min_consumption_enabled', v)} trackColor={{ false: '#2a2a35', true: '#ff4d6d40' }} thumbColor={values.restrictions.min_consumption_enabled ? '#ff4d6d' : '#9ca3af'} disabled={isDisabled} ios_backgroundColor="#2a2a35" /></View>
         {/* Text inputs respect isDisabled */}
         {values.restrictions.min_consumption_enabled && (
           <View className={`mt-[-8px] mb-4 ml-6 ${isDisabled ? 'opacity-50' : ''}`}>
             <Text className="text-xs text-gray-400 mb-1">Amount (€)</Text>
             {/* Validation border depends on internal restriction enabled state AND form being configured */}
             <View className={`bg-[#2A2A35] rounded-lg border ${isMinConsumptionAmountInvalid && values.restrictions.min_consumption_enabled && !isDisabled ? 'border-red-500' : 'border-white/10'}`}>
               <TextInput className="text-white p-3 text-base" keyboardType="numeric" value={values.restrictions.min_consumption?.toString() ?? ''} onChangeText={(text) => updateRestriction('min_consumption', text)} placeholder="e.g., 100" placeholderTextColor="#6C7A93" editable={!isDisabled}/>
             </View>
             {/* Error message depends on internal restriction enabled state AND form being configured */}
             {isMinConsumptionAmountInvalid && values.restrictions.min_consumption_enabled && !isDisabled && (<View className="flex-row items-center mt-1"><AlertCircle size={12} color="#f87171" /><Text className="text-red-400 text-xs ml-1">Required when Min Consumption is enabled.</Text></View>)}
           </View>
         )}
          <View className="flex-row items-center justify-between mb-4"><View className="flex-row items-center"><Wine size={16} color="#8b5cf6" className="mr-2" /><Text className="text-sm text-white ml-2">Minimum Bottles</Text></View><Switch value={values.restrictions.min_bottles_enabled} onValueChange={(v) => updateRestriction('min_bottles_enabled', v)} trackColor={{ false: '#2a2a35', true: '#8b5cf640' }} thumbColor={values.restrictions.min_bottles_enabled ? '#8b5cf6' : '#9ca3af'} disabled={isDisabled} ios_backgroundColor="#2a2a35" /></View>
          {values.restrictions.min_bottles_enabled && (
            <View className={`mt-[-8px] mb-4 ml-6 ${isDisabled ? 'opacity-50' : ''}`}>
              <Text className="text-xs text-gray-400 mb-1">Number of Bottles</Text>
              <View className={`bg-[#2A2A35] rounded-lg border ${isMinBottlesAmountInvalid && values.restrictions.min_bottles_enabled && !isDisabled ? 'border-red-500' : 'border-white/10'}`}>
                <TextInput className="text-white p-3 text-base" keyboardType="numeric" value={values.restrictions.min_bottles?.toString() ?? ''} onChangeText={(text) => updateRestriction('min_bottles', text)} placeholder="e.g., 2" placeholderTextColor="#6C7A93" editable={!isDisabled}/>
              </View>
              {isMinBottlesAmountInvalid && values.restrictions.min_bottles_enabled && !isDisabled && (<View className="flex-row items-center mt-1"><AlertCircle size={12} color="#f87171" /><Text className="text-red-400 text-xs ml-1">Required when Min Bottles is enabled.</Text></View>)}
            </View>
          )}
       </View>
    </View>
   );
};


// --- Main component ---
export default function Seats() {
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [openDrawers, setOpenDrawers] = useState<Set<SeatOptionType>>(new Set());
  const safeAreaInsets = useSafeAreaInsets();

  // --- NEW State: Track configured types (Main Switch state) ---
  const [configuredTypes, setConfiguredTypes] = useState<Set<SeatOptionType>>(new Set());

  // --- Data Fetching (Keep as is) ---
  const {
    data: dbSeatOptions,
    isLoading: isQueryLoading,
    error: queryError,
    refetch: refetchSeatOptions,
  } = useQuery<SeatOption[]>({
    queryKey: ["seat-options", barId],
    queryFn: async () => {
        if (!barId) return [];
        const { data, error } = await supabase.from("seat_options").select("*").eq("bar_id", barId).order("type", { ascending: true });
        if (error) { console.error("Supabase fetch error:", error); throw new Error(error.message || "Failed to fetch seat options"); }
        return data as SeatOption[];
    },
    enabled: !!barId,
    staleTime: 1 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // --- Form and Original State (Keep as is) ---
  const [seatOptions, setSeatOptions] = useState<Record<SeatOptionType, SeatOptionFormValues>>(
    () => Object.fromEntries(seatOptionTypes.map(type => [type, createDefaultFormValues(type)])) as Record<SeatOptionType, SeatOptionFormValues>
  );
  const [originalSeatOptions, setOriginalSeatOptions] = useState<Record<SeatOptionType, SeatOption | null>>(
    () => Object.fromEntries(seatOptionTypes.map(type => [type, null])) as Record<SeatOptionType, SeatOption | null>
  );

  // --- Effects ---
  // Update state when DB data loads or changes
  useEffect(() => {
    const initialFormState = seatOptionTypes.reduce((acc, type) => ({ ...acc, [type]: createDefaultFormValues(type) }), {} as Record<SeatOptionType, SeatOptionFormValues>);
    const initialOriginalState = seatOptionTypes.reduce((acc, type) => ({ ...acc, [type]: null }), {} as Record<SeatOptionType, SeatOption | null>);
    const initialConfiguredTypes = new Set<SeatOptionType>(); // Initialize empty

    if (dbSeatOptions) {
        dbSeatOptions.forEach(dbOption => {
            if (seatOptionTypes.includes(dbOption.type)) {
                initialOriginalState[dbOption.type] = cloneDeep(dbOption);
                initialFormState[dbOption.type] = convertDbToFormValues(dbOption);
                initialConfiguredTypes.add(dbOption.type); // Mark existing types as configured
            }
        });
    }
    setOriginalSeatOptions(initialOriginalState);
    setSeatOptions(initialFormState);
    setConfiguredTypes(initialConfiguredTypes); // Set the configured types state
    setOpenDrawers(new Set()); // Reset open drawers
  }, [dbSeatOptions, barId]);

  // --- Memoized Derived State ---

  // Calculate dirty types based on configuration status and state comparison
  const dirtyTypes = useMemo(() => {
      return seatOptionTypes.filter(type => {
          const isConfigured = configuredTypes.has(type);
          const originalRecord = originalSeatOptions[type];
          const formState = seatOptions[type];

          if (isConfigured && !originalRecord) {
              return true; // Configured but not in DB yet -> Dirty (Create intent)
          }
          if (!isConfigured && originalRecord) {
              return true; // Not configured but exists in DB -> Dirty (Delete intent)
          }
          if (isConfigured && originalRecord && formState) {
              // Configured and exists in DB, check if form state differs
              return !areStatesEqual(formState, originalRecord);
          }
          // If !isConfigured and !originalRecord, it's not dirty
          // If isConfigured but !formState (shouldn't happen), not dirty
          return false;
      });
  }, [seatOptions, originalSeatOptions, configuredTypes]);

  const isAnyFormInvalid = useMemo(() => {
      // Validate only types that are currently configured
      return seatOptionTypes.some(type => {
           const isConfigured = configuredTypes.has(type);
           if (!isConfigured) return false; // Don't validate if not configured

           const formValues = seatOptions[type];
           // Only validate if the formValues exist (safety check)
           return formValues ? validateFormValues(formValues, isConfigured).length > 0 : false;
      });
  }, [seatOptions, configuredTypes]); // Depends on form values and configured status


  const hasUnsavedChanges = dirtyTypes.length > 0;

  // --- Save Mutation (MODIFIED LOGIC) ---
  const saveMutation = useMutation({
      mutationFn: async (typesToSave: SeatOptionType[]) => { // typesToSave are the dirtyTypes
          console.log(`Initiating save mutation for types: ${typesToSave.join(', ')}`);

          type MutationResult = { type: SeatOptionType; action: 'create' | 'update' | 'delete' | 'none'; record?: SeatOption | null; };
          const results: MutationResult[] = [];
          const errors: { type: SeatOptionType, message: string }[] = [];
          let validationFailed = false;

          type Operation = { type: SeatOptionType; action: 'create' | 'update' | 'delete' | 'none'; formValues?: SeatOptionFormValues; originalDbRecord?: SeatOption | null; error?: string; };

          // Determine action based on configured state and original record existence
          const operations: Operation[] = typesToSave.map(type => {
              const isConfigured = configuredTypes.has(type);
              const formValues = seatOptions[type];
              const originalDbRecord = originalSeatOptions[type];

              let currentAction: 'create' | 'update' | 'delete' | 'none' = 'none';

              if (isConfigured && !originalDbRecord) {
                  currentAction = 'create';
              } else if (!isConfigured && originalDbRecord) {
                  currentAction = 'delete';
              } else if (isConfigured && originalDbRecord) {
                  // It's configured and exists, check if it's actually dirty before updating
                  if (!areStatesEqual(formValues, originalDbRecord)) {
                      currentAction = 'update';
                  } else {
                      currentAction = 'none'; // Configured, exists, but no changes
                  }
              } else {
                   // !isConfigured && !originalDbRecord -> 'none'
                   currentAction = 'none';
              }

              if (currentAction === 'none') return { type, action: 'none' };

              // Validate before create or update
              if ((currentAction === 'create' || currentAction === 'update') && formValues) {
                  const validationErrors = validateFormValues(formValues, isConfigured);
                  if (validationErrors.length > 0) {
                      validationFailed = true;
                      const errorMsg = `Validation failed: ${validationErrors.join('; ')}`;
                      errors.push({ type, message: errorMsg });
                      return { type, action: currentAction, error: errorMsg };
                  }
              }
              return { type, action: currentAction, formValues, originalDbRecord };
          });

          if (validationFailed) {
              console.error("Validation failed for one or more types:", errors);
              const errorSummary = errors.map(e => `${e.type}: ${e.message}`).join('\n');
              throw new Error(`Validation failed. Please fix errors:\n${errorSummary}`);
          }

          // Execute DB operations
          for (const op of operations) {
              if (op.action === 'none' || op.error) continue;

              const { type, action, formValues, originalDbRecord } = op;
              let dbError: any = null; let dbData: any = null;

              try {
                  let commonPayload: {
                    enabled: boolean;
                    available_count: number;
                    min_people: number;
                    max_people: number;
                    restrictions: SeatOptionRestrictions | null;
                  } | null = null;
                  if (action === 'create' || action === 'update') {
                      if (!formValues) throw new Error(`Missing form values for ${action} on ${type}`);
                      const restrictionsPayload: SeatOptionRestrictions = {};
                      if (formValues.restrictions.require_bottle_drink) restrictionsPayload.require_bottle_drink = true;
                      const effMinCons = getEffectiveMinConsumption(formValues.restrictions); if (effMinCons !== null) restrictionsPayload.min_consumption = effMinCons;
                      const effMinBot = getEffectiveMinBottles(formValues.restrictions); if (effMinBot !== null) restrictionsPayload.min_bottles = effMinBot;
                      const finalRestrictions = Object.keys(restrictionsPayload).length > 0 ? restrictionsPayload : null;

                      // Payload includes the 'enabled' state from the form
                      commonPayload = {
                          enabled: formValues.enabled, // Use form's enabled state
                          available_count: formValues.available_count ?? 0,
                          min_people: formValues.min_people ?? 0,
                          max_people: formValues.max_people ?? 0,
                          restrictions: finalRestrictions
                      };
                  }

                  console.log(`Executing ${action} for ${type}`);
                  switch (action) {
                      case 'create':
                          if (!barId || !commonPayload) throw new Error('Missing data for create');
                          const { data: iData, error: iError } = await supabase.from("seat_options").insert({ bar_id: barId, type: type, ...commonPayload }).select().single(); dbError = iError; dbData = iData; break;
                      case 'update':
                          if (!originalDbRecord?.id || !commonPayload) throw new Error(`Missing data for update on ${type}`);
                          // Perform update using the commonPayload which includes 'enabled'
                          const { error: uError } = await supabase.from("seat_options").update(commonPayload).eq("id", originalDbRecord.id); dbError = uError; dbData = { ...originalDbRecord, ...commonPayload, id: originalDbRecord.id, bar_id: originalDbRecord.bar_id, type: originalDbRecord.type }; break;
                      case 'delete':
                          if (!originalDbRecord?.id) throw new Error(`Missing original ID for delete on ${type}`);
                          const { error: dError } = await supabase.from("seat_options").delete().eq("id", originalDbRecord.id); dbError = dError; dbData = null; break;
                  }
                  if (dbError) throw dbError;
                  results.push({ type, action: action as 'create' | 'update' | 'delete', record: dbData as SeatOption | null });
                  console.log(`Success: ${action} for ${type}`);
              } catch (error: any) {
                  console.error(`Failed ${action} for ${type}:`, error);
                  errors.push({ type, message: error.message || `Failed to ${action} ${type}` });
                  // Don't necessarily abort all saves on one failure, let others proceed if possible?
                  // For simplicity, let's keep aborting on first error.
                  throw new Error(`Operation failed for ${type}. Aborting remaining saves.`);
              }
          }
          console.log("All operations completed successfully.");
          return results;
      },
      onSuccess: (results) => {
          console.log("Save Mutation onSuccess:", results);
          let changesMade = results.some(r => r.action !== 'none');
          const updatedOriginals = { ...originalSeatOptions };
          const updatedFormState = { ...seatOptions };
          const updatedConfiguredTypes = new Set(configuredTypes); // Copy current configured

          results.forEach(({ type, action, record }) => {
              if (action === 'create' || action === 'update') {
                  updatedOriginals[type] = cloneDeep(record ?? null);
                  updatedFormState[type] = record ? convertDbToFormValues(record) : createDefaultFormValues(type);
                  updatedConfiguredTypes.add(type); // Ensure it's marked configured
              } else if (action === 'delete') {
                  updatedOriginals[type] = null;
                  updatedFormState[type] = createDefaultFormValues(type); // Reset form state
                  updatedConfiguredTypes.delete(type); // Mark as not configured
              }
          });

          if (changesMade) {
              setOriginalSeatOptions(updatedOriginals);
              setSeatOptions(updatedFormState);
              setConfiguredTypes(updatedConfiguredTypes); // Update configured state
              setOpenDrawers(new Set()); // Close all drawers on successful save
              queryClient.invalidateQueries({ queryKey: ["seat-options", barId] });
              toast.show({ type: "success", text1: "Changes Saved", text2: `${results.filter(r => r.action !== 'none').length} item(s) affected.` });
          } else {
               toast.show({ type: "info", text1: "No Changes", text2: `No modifications needed saving.` });
          }
      },
      onError: (error: Error) => {
           console.error("Save Mutation onError:", error);
           toast.show({
               type: "error",
               text1: "Save Failed",
               text2: error.message || "An unknown error occurred during save."
           });
      },
  });
  // --- End of Save Mutation ---

  // --- Event Handlers ---
  const handleGlobalSave = useCallback(() => {
    if (isAnyFormInvalid) {
        toast.show({ type: 'error', text1: 'Invalid Data', text2: 'Please fix validation errors before saving.' });
        return;
    }
    if (dirtyTypes.length > 0) {
        saveMutation.mutate(dirtyTypes);
    } else {
         toast.show({ type: 'info', text1: 'No Changes', text2: 'Nothing to save.' });
    }
  }, [saveMutation, dirtyTypes, isAnyFormInvalid, toast]);

  const handleGlobalRevert = useCallback(() => {
    console.log("Reverting changes for types:", dirtyTypes);
    if (dirtyTypes.length === 0) return;

    const revertedState = { ...seatOptions };
    const revertedConfigured = new Set(configuredTypes); // Start with current

    dirtyTypes.forEach(type => {
        const originalDbState = originalSeatOptions[type];
        if (originalDbState) {
            // Revert form state to match DB
            revertedState[type] = convertDbToFormValues(originalDbState);
            // Ensure it's marked as configured since it exists in DB
            revertedConfigured.add(type);
        } else {
            // Revert form state to default
            revertedState[type] = createDefaultFormValues(type);
            // Mark as not configured since it didn't exist in DB
            revertedConfigured.delete(type);
        }
    });
    setSeatOptions(revertedState);
    setConfiguredTypes(revertedConfigured); // Revert configured state as well
    setOpenDrawers(new Set()); // Close all drawers on revert
    toast.show({ type: 'info', text1: 'Changes Reverted', text2: 'Modifications have been discarded.' });
  }, [seatOptions, originalSeatOptions, configuredTypes, dirtyTypes, toast]); // Add configuredTypes dependency

  // --- NEW Handler for the Main/Header Switch ---
  const handleConfigureToggle = useCallback((type: SeatOptionType, value: boolean) => {
      setConfiguredTypes(prev => {
          const newConfigured = new Set(prev);
          if (value) {
              newConfigured.add(type);
              // If configuring for the first time (no original record), set default enabled state
              if (!originalSeatOptions[type]) {
                  setSeatOptions(prevForm => ({
                      ...prevForm,
                      [type]: { ...prevForm[type], enabled: true } // Default to enabled: true
                  }));
              }
              // Automatically open drawer when configuring ON
              setOpenDrawers(prevOpen => new Set(prevOpen).add(type));
          } else {
              newConfigured.delete(type);
              // Automatically close drawer when configuring OFF
              setOpenDrawers(prevOpen => {
                  const newOpen = new Set(prevOpen);
                  newOpen.delete(type);
                  return newOpen;
              });
          }
          return newConfigured;
      });
  }, [originalSeatOptions]); // Depends on original options to set default enabled


  // --- Handler for Chevron Toggle (Open/Close Drawer) ---
  const handleChevronToggle = useCallback((type: SeatOptionType) => {
      // Only allow opening the drawer if the type is configured
      const isConfigured = configuredTypes.has(type);

      setOpenDrawers(prevOpenDrawers => {
          const newOpenDrawers = new Set(prevOpenDrawers);
          if (newOpenDrawers.has(type)) {
              newOpenDrawers.delete(type); // Close if open
          } else if (isConfigured) { // Only open if configured
              newOpenDrawers.add(type);
          }
          return newOpenDrawers;
      });
  }, [configuredTypes]); // Depends on configuredTypes


  // --- Render Logic ---
  const renderSeatOption = useCallback((type: SeatOptionType) => {
    const currentFormValues = seatOptions[type];
    const isConfigured = configuredTypes.has(type); // Main switch state
    const originalRecord = originalSeatOptions[type];
    const originalRecordExists = !!originalRecord;
    const isCurrentlyOpen = openDrawers.has(type);

    if (!currentFormValues) return (<View key={type} className="bg-[#1E1E1E] rounded-xl m-4 p-4 border border-white/10 opacity-50"><ActivityIndicator color="#9ca3af" /></View>);

    const isInternallyEnabled = currentFormValues.enabled; // Second switch state

    // Validation based on configured status and internal enabled status
    const validationErrors = validateFormValues(currentFormValues, isConfigured);
    const isAvailableCountInvalid = validationErrors.some(e => e.includes('Available count'));
    const isMaxPeopleInvalid = validationErrors.some(e => e.includes('Max people')); // This will now be true if min is set and max isn't, or if max < min
    const isMinConsumptionAmountInvalid = validationErrors.some(e => e.includes('Min consumption'));
    const isMinBottlesAmountInvalid = validationErrors.some(e => e.includes('Min bottles'));

    // Check if this specific type is dirty
    const isThisTypeDirty = dirtyTypes.includes(type);

    // Card opacity based on configuration status
    const cardOpacityClass = !isConfigured ? 'opacity-50' : '';

    return (
      <View key={type} className={`bg-[#1E1E1E] rounded-xl m-4 overflow-hidden border ${isThisTypeDirty ? 'border-yellow-400/50' : 'border-white/10'} ${cardOpacityClass}`}>
        {/* Card Header: Controls Configuration (Main Switch) */}
        <TouchableOpacity
          // Chevron toggle only works if configured
          onPress={() => handleChevronToggle(type)}
          disabled={!isConfigured || saveMutation.isPending}
          className={`flex-row justify-between items-center p-4`}
          activeOpacity={0.8}
        >
          {/* Title and Chevron */}
          <View className="flex-row items-center flex-1 mr-2">
              <Text className={`text-lg font-semibold mr-2 ${isConfigured ? 'text-white' : 'text-gray-500'}`}>
                  {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </Text>
              <View className="p-1">
                  {/* Chevron indicates drawer state, colored based on configured status */}
                  {isCurrentlyOpen && isConfigured
                      ? <ChevronUp size={20} color="#ff4d6d" />
                      : <ChevronDown size={20} color={isConfigured ? "#9ca3af" : "#6b7280"} />
                  }
              </View>
               {/* Dirty indicator */}
               {isThisTypeDirty && !saveMutation.isPending && (
                  <View className="w-2 h-2 bg-yellow-400 rounded-full ml-2"></View>
               )}
          </View>

          {/* Main Switch (Configure Toggle) */}
          <View className="flex-row items-center">
              <Text className={`text-xs mr-2 ${isConfigured ? 'text-pink-400' : 'text-gray-500'}`}>
                  {isConfigured ? 'Configured' : 'Off'}
              </Text>
              <Switch
                  value={isConfigured}
                  onValueChange={(value) => handleConfigureToggle(type, value)}
                  trackColor={{ false: '#374151', true: '#ff4d6d40' }} // Use pinkish color for configure
                  thumbColor={isConfigured ? '#ff4d6d' : '#9ca3af'}
                  disabled={saveMutation.isPending}
                  ios_backgroundColor="#374151"
              />
          </View>
        </TouchableOpacity>

        {/* Card Summary (Show if NOT open and IS configured) */}
        {!isCurrentlyOpen && isConfigured && (
            <View className={`p-4 border-t border-white/10 flex-row flex-wrap`}>
                {/* Display internal enabled status */}
                <View className={`flex-row items-center mr-4 mb-2 ${isInternallyEnabled ? 'opacity-100' : 'opacity-60'}`}>
                    {isInternallyEnabled ? <Power size={14} color="#34d399" /> : <PowerOff size={14} color="#9ca3af" />}
                    <Text className={`ml-1 text-sm ${isInternallyEnabled ? 'text-green-400' : 'text-gray-400'}`}>
                        {isInternallyEnabled ? 'Enabled' : 'Disabled'}
                    </Text>
                </View>
                {/* Other summary items - show based on form values, validate based on internal enabled state */}
                <View className="flex-row items-center mr-4 mb-2">
                    <Users size={14} color="#9ca3af" />
                    <Text className={`ml-2 text-sm ${isAvailableCountInvalid && isInternallyEnabled ? 'text-red-400' : 'text-gray-400'}`}>
                        {currentFormValues.available_count ?? 0} seats
                    </Text>
                    {isAvailableCountInvalid && isInternallyEnabled && <AlertCircle size={14} color="#f87171" style={{ marginLeft: 4 }}/>}
                </View>
                {/* Conditionally render Min/Max People Summary */}
                 {(currentFormValues.min_people !== null || currentFormValues.max_people !== null) && (
                     <View className="flex-row items-center mr-4 mb-2">
                        <Users size={14} color="#9ca3af" />
                        <Text className={`ml-2 text-sm ${isMaxPeopleInvalid ? 'text-red-400' : 'text-gray-400'}`}>
                            {currentFormValues.min_people ?? 'Any'}-{currentFormValues.max_people ?? 'Any'} ppl
                        </Text>
                        {/* The AlertCircle will show if isMaxPeopleInvalid is true */}
                        {isMaxPeopleInvalid && <AlertCircle size={14} color="#f87171" style={{ marginLeft: 4 }}/>}
                    </View>
                )}
                {/* Restriction Badges - show based on form values, validate based on internal enabled state */}
                {currentFormValues.restrictions.require_bottle_drink && (<View style={[styles.badge, styles.tealBadge]}><Wine size={12} color="#FFF" style={styles.badgeIcon} /><Text style={styles.badgeText}>Bottle Req.</Text></View>)}
                {getEffectiveMinConsumption(currentFormValues.restrictions) !== null && (
                    <View style={[styles.badge, styles.yellowBadge]}>
                        <DollarSign size={12} color="#FFF" style={styles.badgeIcon}/>
                        <Text style={styles.badgeText}>Min €{getEffectiveMinConsumption(currentFormValues.restrictions)}</Text>
                        {isMinConsumptionAmountInvalid && currentFormValues.restrictions.min_consumption_enabled && isInternallyEnabled && <AlertCircle size={12} color="#92400e" style={{ marginLeft: 4 }}/>}
                    </View>
                )}
                {getEffectiveMinBottles(currentFormValues.restrictions) !== null && (
                    <View style={[styles.badge, styles.purpleBadge]}>
                        <Wine size={12} color="#FFF" style={styles.badgeIcon}/>
                        <Text style={styles.badgeText}>Min {getEffectiveMinBottles(currentFormValues.restrictions)} Bottles</Text>
                        {isMinBottlesAmountInvalid && currentFormValues.restrictions.min_bottles_enabled && isInternallyEnabled && <AlertCircle size={12} color="#581c87" style={{ marginLeft: 4 }}/>}
                    </View>
                )}
           </View>
        )}

        {/* Edit Form (Show if currently open AND configured) */}
        {isCurrentlyOpen && isConfigured && (
          <SeatOptionForm
            values={currentFormValues}
            // Pass the form update handler
            onChange={(values) => setSeatOptions((prev) => ({ ...prev, [type]: values }))}
            // Form is only disabled if not configured (isDisabled = !isConfigured)
            // However, the component is only rendered if isConfigured is true, so isDisabled should always be false here. Let's pass false.
            isDisabled={false} // The form itself is active if rendered
            isAvailableCountInvalid={isAvailableCountInvalid}
            isMaxPeopleInvalid={isMaxPeopleInvalid}
            isMinConsumptionAmountInvalid={isMinConsumptionAmountInvalid}
            isMinBottlesAmountInvalid={isMinBottlesAmountInvalid}
            originalRecordExists={originalRecordExists} // Pass this info
          />
        )}
      </View>
    );
  }, [
      seatOptions,
      originalSeatOptions,
      configuredTypes, // Add configuredTypes
      openDrawers,
      dirtyTypes,
      handleConfigureToggle, // Add new handler
      handleChevronToggle, // Keep chevron handler
      saveMutation.isPending,
      toast,
      styles // Include styles in dependencies if it's defined outside and could change
  ]);

   // --- Loading/Error States (Keep as is) ---
   if (isQueryLoading && !dbSeatOptions) {
        return (<View className="flex-1 bg-[#121212] items-center justify-center"><ActivityIndicator size="large" color="#ff4d6d" /><Text className="text-gray-400 mt-4">Loading Seat Options...</Text></View>);
   }
   if (queryError) {
       return (<View className="flex-1 bg-[#121212] items-center justify-center p-4"><AlertCircle size={40} color="#ff4d6d" /><Text className="text-red-400 mt-4 text-lg font-semibold">Error Loading Data</Text><Text className="text-gray-400 mt-2 text-center">{queryError instanceof Error ? queryError.message : "An unexpected error occurred."}</Text><TouchableOpacity className="mt-6 bg-[#ff4d6d] py-2 px-6 rounded-lg" onPress={() => refetchSeatOptions()}><Text className="text-white font-medium">Retry</Text></TouchableOpacity></View>);
   }

   // --- Main Render (Keep structure as is) ---
   return (
     <View className="flex-1 bg-[#121212]">
       <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
       >
         <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: hasUnsavedChanges ? (safeAreaInsets.bottom > 0 ? safeAreaInsets.bottom + 70 : 82) : 20 }} // Adjust padding dynamically
          >
          {/* Header */}
           <View className="p-4 border-b border-white/10">
           <Text className="text-2xl font-semibold text-white mb-1">Seat Management</Text>
           <Text className="text-base text-gray-400">Configure seat types using the main switch. Then, set details and enable/disable specific options inside.</Text>
           </View>
           {seatOptionTypes.map(renderSeatOption)}
         </ScrollView>
       </KeyboardAvoidingView>

       {/* Floating Save/Revert Bar */}
       {hasUnsavedChanges && (
         <View style={[
             styles.floatingBar,
             { paddingBottom: safeAreaInsets.bottom > 0 ? safeAreaInsets.bottom : 12 }
             ]}
             className="bg-[#1E1E1E] border-t border-white/20 shadow-lg"
         >
            {/* Revert Button */}
            <TouchableOpacity
                className={`flex-row items-center p-3 mr-3 ${saveMutation.isPending ? 'opacity-50' : ''}`}
                onPress={handleGlobalRevert}
                disabled={saveMutation.isPending}
            >
                <RotateCcw size={18} color="#9ca3af" />
                <Text className="text-gray-400 ml-2 text-base font-medium">Revert</Text>
            </TouchableOpacity>
            {/* Save Button */}
            <TouchableOpacity
                className={`flex-row items-center bg-[#ff4d6d] py-3 px-5 rounded-lg ${
                    // Save button is disabled if mutation is pending OR if any configured form is invalid
                    (saveMutation.isPending || isAnyFormInvalid) ? 'opacity-50 bg-gray-600' : ''
                }`}
                onPress={handleGlobalSave}
                disabled={saveMutation.isPending || isAnyFormInvalid} // Use the updated isAnyFormInvalid check
            >
                {saveMutation.isPending ? (
                   <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }}/>
                ) : (
                   <Save size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                )}
                <Text className="text-white text-base font-medium">
                   {saveMutation.isPending ? 'Saving...' : `Save Changes (${dirtyTypes.length})`}
               </Text>
            </TouchableOpacity>
         </View>
       )}
     </View>
   );
}


// --- Styles (Keep as is) ---
const styles = StyleSheet.create({
    badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, marginRight: 8, marginBottom: 4, },
    badgeIcon: { marginRight: 4, },
    badgeText: { fontSize: 11, fontWeight: '500', color: '#FFFFFF', },
    tealBadge: { backgroundColor: '#14b8a6', },
    yellowBadge: { backgroundColor: '#f59e0b', },
    purpleBadge: { backgroundColor: '#8b5cf6', },
    floatingBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
});