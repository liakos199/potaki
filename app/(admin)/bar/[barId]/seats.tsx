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
    KeyboardAvoidingView, // Keep import
    Platform,          // Keep import
    Dimensions,        // Import Dimensions for potential adjustments if needed
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // Import for safe area handling
import { useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronUp, Save, RotateCcw, Wine, Users, DollarSign, AlertCircle } from 'lucide-react-native';
import cloneDeep from 'lodash/cloneDeep';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/src/lib/supabase"; // Adjust path
import { Constants } from "@/src/lib/database.types"; // Adjust path
import { useToast } from "@/src/components/general/Toast"; // Adjust path

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
  enabled: boolean;
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

// --- Helper Functions (Keep as is) ---
const convertDbToFormValues = (dbOption: SeatOption): SeatOptionFormValues => {
  const dbRestrictions = dbOption.restrictions || {};
  return {
    type: dbOption.type,
    enabled: dbOption.enabled,
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

const createDefaultFormValues = (type: SeatOptionType): SeatOptionFormValues => ({
  type: type,
  enabled: false,
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

const areStatesEqual = (formState: SeatOptionFormValues | null | undefined, dbState: SeatOption | null | undefined): boolean => {
    if (formState && dbState) {
        const dbRestrictions = dbState.restrictions || {};
        const formRestrictions = formState.restrictions;
        const effectiveDbMinConsumption = dbRestrictions.min_consumption ?? null;
        const effectiveFormMinConsumption = getEffectiveMinConsumption(formRestrictions);
        const effectiveDbMinBottles = dbRestrictions.min_bottles ?? null;
        const effectiveFormMinBottles = getEffectiveMinBottles(formRestrictions);
        return (
            formState.enabled === dbState.enabled &&
            (formState.available_count ?? 0) === (dbState.available_count ?? 0) &&
            (formState.min_people ?? 0) === (dbState.min_people ?? 0) &&
            (formState.max_people ?? 0) === (dbState.max_people ?? 0) &&
            formRestrictions.require_bottle_drink === (dbRestrictions.require_bottle_drink ?? false) &&
            effectiveFormMinConsumption === effectiveDbMinConsumption &&
            effectiveFormMinBottles === effectiveDbMinBottles
        );
    }
    // Handle comparison when one state exists but the other doesn't, considering default state
    if (formState && !dbState) {
        // If form is enabled but no DB record, they are not equal
        if (formState.enabled) return false;
        // If form is not enabled and no DB record, compare form to default disabled state
        const defaultState = createDefaultFormValues(formState.type);
        // Need to compare against a representation of the default state as if it were a dbState
        return areStatesEqual(formState, { id: '', bar_id: '', type: formState.type, enabled: defaultState.enabled, available_count: defaultState.available_count ?? 0, min_people: defaultState.min_people ?? 0, max_people: defaultState.max_people ?? 0, restrictions: null });
    }
    if (!formState && dbState) {
        // If no form state but DB record exists, they are not equal (unless DB record is effectively default disabled?) - Safer to say not equal.
        return false;
    }
    // If both are null/undefined, they are equal
    return true;
};


// --- Validation Function (Keep as is) ---
const validateFormValues = (formValues: SeatOptionFormValues): string[] => {
    const errors: string[] = [];
    const typeName = formValues.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    if (formValues.enabled && (formValues.available_count === null || formValues.available_count <= 0)) {
        errors.push(`${typeName}: Available count must be > 0 when enabled.`);
    }
    const minPpl = formValues.min_people;
    const maxPpl = formValues.max_people;
    if (minPpl !== null && maxPpl !== null && maxPpl < minPpl) {
        errors.push(`${typeName}: Max people (${maxPpl}) cannot be < Min people (${minPpl}).`);
    }
    if (formValues.restrictions.min_consumption_enabled && (formValues.restrictions.min_consumption === null || formValues.restrictions.min_consumption <= 0)) {
        errors.push(`${typeName}: Min consumption amount must be > 0 when enabled.`);
    }
    if (formValues.restrictions.min_bottles_enabled && (formValues.restrictions.min_bottles === null || formValues.restrictions.min_bottles <= 0)) {
        errors.push(`${typeName}: Min bottles amount must be > 0 when enabled.`);
    }
    return errors;
};


// --- SeatOptionForm Props Interface (Keep as is) ---
interface SeatOptionFormProps {
  values: SeatOptionFormValues;
  onChange: (values: SeatOptionFormValues) => void;
  isDisabled: boolean;
  isAvailableCountInvalid: boolean;
  isMaxPeopleInvalid: boolean;
  isMinConsumptionAmountInvalid: boolean;
  isMinBottlesAmountInvalid: boolean;
}

// --- SeatOptionForm Component (Keep as is) ---
const SeatOptionForm = ({
  values,
  onChange,
  isDisabled,
  isAvailableCountInvalid,
  isMaxPeopleInvalid,
  isMinConsumptionAmountInvalid,
  isMinBottlesAmountInvalid,
}: SeatOptionFormProps) => {

  const updateField = (field: keyof Omit<SeatOptionFormValues, 'restrictions' | 'type'>, value: any) => {
     let processedValue = value;
      if (field === 'available_count' || field === 'min_people' || field === 'max_people') {
          const cleaned = String(value).replace(/[^0-9]/g, "");
          processedValue = cleaned === "" ? null : Math.max(0, parseInt(cleaned, 10));
      } else if (field === 'enabled') {
          processedValue = !!value;
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
    <View className="pt-4 px-4 border-t border-white/10">
      {/* Available Count */}
      <View className={`mb-4 ${disabledInputStyle}`}>
        <Text className="text-sm text-white mb-2">Available Count *</Text>
        <View className={`bg-[#2A2A35] rounded-lg border ${isAvailableCountInvalid && !isDisabled ? 'border-red-500' : 'border-white/10'}`}>
          <TextInput className="text-white p-3 text-base" keyboardType="numeric" value={values.available_count?.toString() ?? ''} onChangeText={(text) => updateField('available_count', text)} placeholder="0" placeholderTextColor="#6C7A93" editable={!isDisabled}/>
        </View>
        {isAvailableCountInvalid && !isDisabled && (<View className="flex-row items-center mt-1"><AlertCircle size={12} color="#f87171" /><Text className="text-red-400 text-xs ml-1 w-full">Value must be greater than 0.</Text></View>)}
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
          {isMaxPeopleInvalid && !isDisabled && (<View className="flex-row items-center mt-1"><AlertCircle size={12} color="#f87171" /><Text className="text-red-400 text-xs ml-1">Must be ≥ Min People.</Text></View>)}
        </View>
      </View>

      {/* Restrictions */}
      <View className={`mb-1 ${disabledInputStyle}`}>
        <Text className="text-base font-semibold text-white mb-4">Restrictions</Text>
        <View className="flex-row items-center justify-between mb-4"><View className="flex-row items-center"><Wine size={16} color="#ff4d6d" className="mr-2" /><Text className="text-sm text-white ml-2">Require Bottle Service</Text></View><Switch value={values.restrictions.require_bottle_drink} onValueChange={(v) => updateRestriction('require_bottle_drink', v)} trackColor={{ false: '#2a2a35', true: '#ff4d6d40' }} thumbColor={values.restrictions.require_bottle_drink ? '#ff4d6d' : '#9ca3af'} disabled={isDisabled} ios_backgroundColor="#2a2a35" /></View>
        <View className="flex-row items-center justify-between mb-4"><View className="flex-row items-center"><DollarSign size={16} color="#ff4d6d" className="mr-2" /><Text className="text-sm text-white ml-2">Minimum Consumption</Text></View><Switch value={values.restrictions.min_consumption_enabled} onValueChange={(v) => updateRestriction('min_consumption_enabled', v)} trackColor={{ false: '#2a2a35', true: '#ff4d6d40' }} thumbColor={values.restrictions.min_consumption_enabled ? '#ff4d6d' : '#9ca3af'} disabled={isDisabled} ios_backgroundColor="#2a2a35" /></View>
        {values.restrictions.min_consumption_enabled && (
          <View className={`mt-[-8px] mb-4 ml-6 ${isDisabled ? 'opacity-50' : ''}`}>
            <Text className="text-xs text-gray-400 mb-1">Amount (€)</Text>
            <View className={`bg-[#2A2A35] rounded-lg border ${isMinConsumptionAmountInvalid && !isDisabled ? 'border-red-500' : 'border-white/10'}`}>
              <TextInput className="text-white p-3 text-base" keyboardType="numeric" value={values.restrictions.min_consumption?.toString() ?? ''} onChangeText={(text) => updateRestriction('min_consumption', text)} placeholder="e.g., 100" placeholderTextColor="#6C7A93" editable={!isDisabled}/>
            </View>
            {isMinConsumptionAmountInvalid && !isDisabled && (<View className="flex-row items-center mt-1"><AlertCircle size={12} color="#f87171" /><Text className="text-red-400 text-xs ml-1">Required when Min Consumption is enabled.</Text></View>)}
          </View>
        )}
         <View className="flex-row items-center justify-between mb-4"><View className="flex-row items-center"><Wine size={16} color="#8b5cf6" className="mr-2" /><Text className="text-sm text-white ml-2">Minimum Bottles</Text></View><Switch value={values.restrictions.min_bottles_enabled} onValueChange={(v) => updateRestriction('min_bottles_enabled', v)} trackColor={{ false: '#2a2a35', true: '#8b5cf640' }} thumbColor={values.restrictions.min_bottles_enabled ? '#8b5cf6' : '#9ca3af'} disabled={isDisabled} ios_backgroundColor="#2a2a35" /></View>
         {values.restrictions.min_bottles_enabled && (
           <View className={`mt-[-8px] mb-4 ml-6 ${isDisabled ? 'opacity-50' : ''}`}>
             <Text className="text-xs text-gray-400 mb-1">Number of Bottles</Text>
             <View className={`bg-[#2A2A35] rounded-lg border ${isMinBottlesAmountInvalid && !isDisabled ? 'border-red-500' : 'border-white/10'}`}>
               <TextInput className="text-white p-3 text-base" keyboardType="numeric" value={values.restrictions.min_bottles?.toString() ?? ''} onChangeText={(text) => updateRestriction('min_bottles', text)} placeholder="e.g., 2" placeholderTextColor="#6C7A93" editable={!isDisabled}/>
             </View>
             {isMinBottlesAmountInvalid && !isDisabled && (<View className="flex-row items-center mt-1"><AlertCircle size={12} color="#f87171" /><Text className="text-red-400 text-xs ml-1">Required when Min Bottles is enabled.</Text></View>)}
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
  // --- *** STATE CHANGE *** ---
  // Replace single editingType with a Set to track multiple open drawers
  // const [editingType, setEditingType] = useState<SeatOptionType | null>(null);
  const [openDrawers, setOpenDrawers] = useState<Set<SeatOptionType>>(new Set());
  // --- *** END STATE CHANGE *** ---
  const safeAreaInsets = useSafeAreaInsets(); // Get safe area insets

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

  // --- State (Keep as is) ---
  const [seatOptions, setSeatOptions] = useState<Record<SeatOptionType, SeatOptionFormValues>>(
    () => Object.fromEntries(seatOptionTypes.map(type => [type, createDefaultFormValues(type)])) as Record<SeatOptionType, SeatOptionFormValues>
  );
  const [originalSeatOptions, setOriginalSeatOptions] = useState<Record<SeatOptionType, SeatOption | null>>(
    () => Object.fromEntries(seatOptionTypes.map(type => [type, null])) as Record<SeatOptionType, SeatOption | null>
  );

  // --- Effects (Keep as is) ---
  useEffect(() => {
    const initialFormState = seatOptionTypes.reduce((acc, type) => ({ ...acc, [type]: createDefaultFormValues(type) }), {} as Record<SeatOptionType, SeatOptionFormValues>);
    const initialOriginalState = seatOptionTypes.reduce((acc, type) => ({ ...acc, [type]: null }), {} as Record<SeatOptionType, SeatOption | null>);

    if (dbSeatOptions) {
        dbSeatOptions.forEach(dbOption => {
            if (seatOptionTypes.includes(dbOption.type)) {
                initialOriginalState[dbOption.type] = cloneDeep(dbOption);
                initialFormState[dbOption.type] = convertDbToFormValues(dbOption);
            }
        });
    }
    setOriginalSeatOptions(initialOriginalState);
    setSeatOptions(initialFormState);
    // Reset open drawers when data reloads
    setOpenDrawers(new Set());
  }, [dbSeatOptions, barId]);

  // --- Memoized Derived State (Keep as is) ---
  const dirtyTypes = useMemo(() => {
      return seatOptionTypes.filter(type =>
          seatOptions[type] && !areStatesEqual(seatOptions[type], originalSeatOptions[type])
      );
  }, [seatOptions, originalSeatOptions]);

  const isAnyFormInvalid = useMemo(() => {
      // Validate only dirty types OR enabled types that haven't been saved yet (don't have original record)
      const typesToValidate = seatOptionTypes.filter(type => {
          const isDirty = dirtyTypes.includes(type);
          const isEnabledNew = seatOptions[type]?.enabled && !originalSeatOptions[type];
          return isDirty || isEnabledNew;
      });

      return typesToValidate.some(type => {
          const formValues = seatOptions[type];
          // Only validate if the formValues exist (safety check)
          return formValues ? validateFormValues(formValues).length > 0 : false;
      });
  }, [dirtyTypes, seatOptions, originalSeatOptions]); // Add originalSeatOptions dependency


  const hasUnsavedChanges = dirtyTypes.length > 0;

  // --- Save Mutation (Keep as is - It saves based on dirtyTypes, which is correct) ---
  const saveMutation = useMutation({
      mutationFn: async (typesToSave: SeatOptionType[]) => {
          console.log(`Initiating save mutation for types: ${typesToSave.join(', ')}`);

          type MutationResult = { type: SeatOptionType; action: 'create' | 'update' | 'delete' | 'none'; record?: SeatOption | null; };
          const results: MutationResult[] = [];
          const errors: { type: SeatOptionType, message: string }[] = [];
          let validationFailed = false;

          type Operation = { type: SeatOptionType; action: 'create' | 'update' | 'delete' | 'none'; formValues?: SeatOptionFormValues; originalDbRecord?: SeatOption | null; error?: string; };
          const operations: Operation[] = typesToSave.map(type => {
              const formValues = seatOptions[type];
              const originalDbRecord = originalSeatOptions[type];
              if (!formValues) return { type, action: 'none', error: `No form data for ${type}` };

              const isCurrentlyDirty = !areStatesEqual(formValues, originalDbRecord);
              let currentAction: 'create' | 'update' | 'delete' | 'none' = 'none';

              if (formValues.enabled && !originalDbRecord) currentAction = 'create';
              else if (!formValues.enabled && originalDbRecord) currentAction = 'delete';
              else if (formValues.enabled && originalDbRecord && isCurrentlyDirty) currentAction = 'update';
              else if (!formValues.enabled && !originalDbRecord) currentAction = 'none'; // Was disabled, still disabled, nothing to do
              else if (isCurrentlyDirty && originalDbRecord) currentAction = 'update'; // Covers case where it was enabled, still enabled, but fields changed
              else if (!isCurrentlyDirty) currentAction = 'none';

               // Last check: If it's meant to be enabled, but somehow we determined 'none', force create/update if dirty
              if (formValues.enabled && currentAction === 'none' && isCurrentlyDirty) {
                  currentAction = originalDbRecord ? 'update' : 'create';
              }

              if (currentAction === 'none') return { type, action: 'none' };

              if (currentAction === 'create' || currentAction === 'update') {
                  const validationErrors = validateFormValues(formValues);
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

          for (const op of operations) {
              if (op.action === 'none' || op.error || !op.formValues) continue;
              const { type, action, formValues, originalDbRecord } = op;
              let dbError: any = null; let dbData: any = null;

              try {
                  const restrictionsPayload: SeatOptionRestrictions = {};
                  if (formValues.restrictions.require_bottle_drink) restrictionsPayload.require_bottle_drink = true;
                  const effMinCons = getEffectiveMinConsumption(formValues.restrictions); if (effMinCons !== null) restrictionsPayload.min_consumption = effMinCons;
                  const effMinBot = getEffectiveMinBottles(formValues.restrictions); if (effMinBot !== null) restrictionsPayload.min_bottles = effMinBot;
                  const finalRestrictions = Object.keys(restrictionsPayload).length > 0 ? restrictionsPayload : null;
                  // Ensure count is 0 if disabled, otherwise use form value or default to 0
                  const finalAvailableCount = formValues.enabled ? (formValues.available_count ?? 0) : 0;
                   // Reset non-applicable fields if disabled
                  const finalMinPeople = formValues.enabled ? (formValues.min_people ?? 0) : 0;
                  const finalMaxPeople = formValues.enabled ? (formValues.max_people ?? 0) : 0;
                  const finalRestrictionsPayload = formValues.enabled ? finalRestrictions : null;

                  const commonPayload = { enabled: formValues.enabled, available_count: finalAvailableCount, min_people: finalMinPeople, max_people: finalMaxPeople, restrictions: finalRestrictionsPayload };

                  console.log(`Executing ${action} for ${type} with payload:`, commonPayload);
                  switch (action) {
                      case 'create':
                          const { data: iData, error: iError } = await supabase.from("seat_options").insert({ bar_id: barId, type: type, ...commonPayload }).select().single(); dbError = iError; dbData = iData; break;
                      case 'update':
                          if (!originalDbRecord?.id) throw new Error(`Missing original ID for update on ${type}`);
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
          const updatedFormState = { ...seatOptions }; // Start with current form state

          results.forEach(({ type, action, record }) => {
              if (action === 'create' || action === 'update') {
                  updatedOriginals[type] = cloneDeep(record ?? null);
                  // Update the form state to match the newly saved DB state
                  updatedFormState[type] = record ? convertDbToFormValues(record) : createDefaultFormValues(type);
              } else if (action === 'delete') {
                  updatedOriginals[type] = null;
                   // Reset the form state to default disabled after delete
                  updatedFormState[type] = createDefaultFormValues(type);
              }
          });

          if (changesMade) {
              setOriginalSeatOptions(updatedOriginals);
              setSeatOptions(updatedFormState); // Apply the updated form state reflecting saved data
              setOpenDrawers(new Set()); // Close all drawers on successful save
              queryClient.invalidateQueries({ queryKey: ["seat-options", barId] });
              toast.show({ type: "success", text1: "Changes Saved", text2: `${results.length} item(s) updated.` });
          } else {
               toast.show({ type: "info", text1: "No Changes", text2: `No modifications needed saving.` });
          }
          // No longer need setEditingType(null);
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
    console.log("Revertling changes for types:", dirtyTypes);
    if (dirtyTypes.length === 0) return;

    const revertedState = { ...seatOptions };
    dirtyTypes.forEach(type => {
        const originalDbState = originalSeatOptions[type];
        if (originalDbState) {
            revertedState[type] = convertDbToFormValues(originalDbState);
        } else {
            revertedState[type] = createDefaultFormValues(type);
        }
    });
    setSeatOptions(revertedState);
    setOpenDrawers(new Set()); // Close all drawers on revert
    toast.show({ type: 'info', text1: 'Changes Reverted', text2: 'Modifications have been discarded.' });
  }, [seatOptions, originalSeatOptions, dirtyTypes, toast]);

  // --- *** UPDATED handleEnableToggle *** ---
  const handleEnableToggle = useCallback((type: SeatOptionType, value: boolean) => {
    // Update the enabled status in the form state
    setSeatOptions(prev => ({ ...prev, [type]: { ...prev[type], enabled: value } }));

    // Update the set of open drawers based on the requirements
    setOpenDrawers(prevOpenDrawers => {
        const newOpenDrawers = new Set(prevOpenDrawers); // Clone the set
        if (value) {
            // Requirement: Open drawer when enabling
            newOpenDrawers.add(type);
        } else {
            // Requirement: Close drawer ONLY when disabling THIS specific type
            newOpenDrawers.delete(type);
        }
        return newOpenDrawers;
    });
  }, []); // No longer depends on editingType

  // --- *** UPDATED handleChevronToggle (new handler) *** ---
  const handleChevronToggle = useCallback((type: SeatOptionType) => {
      setOpenDrawers(prevOpenDrawers => {
          const newOpenDrawers = new Set(prevOpenDrawers);
          if (newOpenDrawers.has(type)) {
              // Requirement: Close drawer when pressing chevron up
              newOpenDrawers.delete(type);
          } else {
              // Requirement: Open drawer when pressing chevron down (if enabled)
              // Check if enabled within the function or rely on the button being disabled
               const currentOption = seatOptions[type]; // Get current state
               if (currentOption?.enabled) { // Only open if enabled
                   newOpenDrawers.add(type);
               }
          }
          return newOpenDrawers;
      });
  }, [seatOptions]); // Depends on seatOptions to check if enabled

  // --- Render Logic ---
  const renderSeatOption = useCallback((type: SeatOptionType) => {
    const currentOption = seatOptions[type];
    // --- *** USE UPDATED STATE *** ---
    const isCurrentlyOpen = openDrawers.has(type); // Check if this specific drawer is in the set
    // --- *** END STATE UPDATE *** ---

    if (!currentOption) return (<View key={type} className="bg-[#1E1E1E] rounded-xl m-4 p-4 border border-white/10 opacity-50"><ActivityIndicator color="#9ca3af" /></View>);

    const isSeatTypeEnabled = currentOption.enabled;
    const originalRecordExists = !!originalSeatOptions[type];

    // Validation flags
    const validationErrors = validateFormValues(currentOption);
    const isAvailableCountInvalid = validationErrors.some(e => e.includes('Available count'));
    const isMaxPeopleInvalid = validationErrors.some(e => e.includes('Max people'));
    const isMinConsumptionAmountInvalid = validationErrors.some(e => e.includes('Min consumption'));
    const isMinBottlesAmountInvalid = validationErrors.some(e => e.includes('Min bottles'));
    const isThisTypeDirty = dirtyTypes.includes(type);

    const cardOpacityClass = !isSeatTypeEnabled && !originalRecordExists ? 'opacity-50' : !isSeatTypeEnabled ? 'opacity-70' : '';

    return (
      <View key={type} className={`bg-[#1E1E1E] rounded-xl m-4 overflow-hidden border ${isThisTypeDirty ? 'border-yellow-400/50' : 'border-white/10'} ${cardOpacityClass}`}>
        {/* Card Header */}
        <View className={`flex-row justify-between items-center p-4`}>
           <View className="flex-row items-center flex-1 mr-2">
             <Text className={`text-lg font-semibold mr-2 ${isSeatTypeEnabled ? 'text-white' : 'text-gray-400'}`}>{type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Text>
             {/* --- *** UPDATE CHEVRON HANDLER *** --- */}
             <TouchableOpacity
                 className="p-1"
                 onPress={() => handleChevronToggle(type)} // Use the new toggle handler
                 disabled={!isSeatTypeEnabled || saveMutation.isPending} // Keep disabled logic
             >
                {/* Show ChevronUp if open, ChevronDown otherwise */}
                {isCurrentlyOpen && isSeatTypeEnabled ? <ChevronUp size={20} color="#ff4d6d" /> : <ChevronDown size={20} color={isSeatTypeEnabled ? "#9ca3af" : "#6b7280"} />}
             </TouchableOpacity>
              {/* --- *** END CHEVRON UPDATE *** --- */}
             {isThisTypeDirty && !saveMutation.isPending && <View className="w-2 h-2 bg-yellow-400 rounded-full ml-2"></View>}
          </View>
          <View className="flex-row items-center">
             <Text className={`text-xs mr-2 ${isSeatTypeEnabled ? 'text-green-400' : 'text-gray-500'}`}>{isSeatTypeEnabled ? 'Enabled' : 'Disabled'}</Text>
             {/* Use handleEnableToggle for the Switch */}
             <Switch value={isSeatTypeEnabled} onValueChange={(value) => handleEnableToggle(type, value)} trackColor={{ false: '#374151', true: '#34d39940' }} thumbColor={isSeatTypeEnabled ? '#34d399' : '#9ca3af'} disabled={saveMutation.isPending} ios_backgroundColor="#374151" />
          </View>
        </View>

        {/* Card Summary (Show if NOT currently open) */}
        {!isCurrentlyOpen && (
           <View className={`p-4 border-t border-white/10 flex-row flex-wrap ${!isSeatTypeEnabled ? 'opacity-70' : ''}`}>
             <View className="flex-row items-center mr-4 mb-2"><Users size={14} color="#9ca3af" /><Text className={`ml-2 text-sm ${isAvailableCountInvalid && isSeatTypeEnabled ? 'text-red-400' : 'text-gray-400'}`}>{currentOption.available_count ?? 0} seats</Text>{isAvailableCountInvalid && isSeatTypeEnabled && <AlertCircle size={14} color="#f87171" style={{ marginLeft: 4 }}/>}</View>
             {(currentOption.min_people !== null || currentOption.max_people !== null) && (<View className="flex-row items-center mr-4 mb-2"><Users size={14} color="#9ca3af" /><Text className={`ml-2 text-sm ${isMaxPeopleInvalid && isSeatTypeEnabled ? 'text-red-400' : 'text-gray-400'}`}>{currentOption.min_people ?? 'Any'}-{currentOption.max_people ?? 'Any'} ppl</Text>{isMaxPeopleInvalid && isSeatTypeEnabled && <AlertCircle size={14} color="#f87171" style={{ marginLeft: 4 }}/>}</View>)}
             {currentOption.restrictions.require_bottle_drink && (<View style={[styles.badge, styles.tealBadge]}><Wine size={12} color="#FFF" style={styles.badgeIcon} /><Text style={styles.badgeText}>Bottle Req.</Text></View>)}
             {getEffectiveMinConsumption(currentOption.restrictions) !== null && (<View style={[styles.badge, styles.yellowBadge]}><DollarSign size={12} color="#FFF" style={styles.badgeIcon}/><Text style={styles.badgeText}>Min €{getEffectiveMinConsumption(currentOption.restrictions)}</Text>{isMinConsumptionAmountInvalid && currentOption.restrictions.min_consumption_enabled && isSeatTypeEnabled && <AlertCircle size={12} color="#92400e" style={{ marginLeft: 4 }}/>}</View>)}
             {getEffectiveMinBottles(currentOption.restrictions) !== null && (<View style={[styles.badge, styles.purpleBadge]}><Wine size={12} color="#FFF" style={styles.badgeIcon}/><Text style={styles.badgeText}>Min {getEffectiveMinBottles(currentOption.restrictions)} Bottles</Text>{isMinBottlesAmountInvalid && currentOption.restrictions.min_bottles_enabled && isSeatTypeEnabled && <AlertCircle size={12} color="#581c87" style={{ marginLeft: 4 }}/>}</View>)}
           </View>
        )}

        {/* Edit Form (Show if currently open) */}
        {isCurrentlyOpen && (
          <SeatOptionForm
            values={currentOption}
            onChange={(values) => setSeatOptions((prev) => ({ ...prev, [type]: values }))}
            isDisabled={!isSeatTypeEnabled} // Form is disabled if the seat type itself is disabled
            isAvailableCountInvalid={isAvailableCountInvalid}
            isMaxPeopleInvalid={isMaxPeopleInvalid}
            isMinConsumptionAmountInvalid={isMinConsumptionAmountInvalid}
            isMinBottlesAmountInvalid={isMinBottlesAmountInvalid}
          />
        )}
      </View>
    );
  }, [
      // --- *** UPDATE DEPENDENCIES *** ---
      openDrawers, // Use the Set of open drawers
      // editingType, // Remove old state
      // --- *** END DEPENDENCY UPDATE *** ---
      seatOptions,
      originalSeatOptions,
      dirtyTypes,
      handleEnableToggle,
      handleChevronToggle, // Add new handler
      saveMutation.isPending,
      toast,
      styles // Keep styles if used directly
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
           <View className="p-4 border-b border-white/10"><Text className="text-2xl font-semibold text-white mb-1">Seat Management</Text><Text className="text-base text-gray-400">Enable/disable and configure options. Save changes below.</Text></View>
           {seatOptionTypes.map(renderSeatOption)}
         </ScrollView>
       </KeyboardAvoidingView>

       {hasUnsavedChanges && (
         <View style={[
             styles.floatingBar,
             { paddingBottom: safeAreaInsets.bottom > 0 ? safeAreaInsets.bottom : 12 }
             ]}
             className="bg-[#1E1E1E] border-t border-white/20 shadow-lg"
         >
            <TouchableOpacity
                className={`flex-row items-center p-3 mr-3 ${saveMutation.isPending ? 'opacity-50' : ''}`}
                onPress={handleGlobalRevert}
                disabled={saveMutation.isPending}
            >
                <RotateCcw size={18} color="#9ca3af" />
                <Text className="text-gray-400 ml-2 text-base font-medium">Revert</Text>
            </TouchableOpacity>
            <TouchableOpacity
                className={`flex-row items-center bg-[#ff4d6d] py-3 px-5 rounded-lg ${
                    (saveMutation.isPending || isAnyFormInvalid) ? 'opacity-50 bg-gray-600' : ''
                }`}
                onPress={handleGlobalSave}
                disabled={saveMutation.isPending || isAnyFormInvalid}
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