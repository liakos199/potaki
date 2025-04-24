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
import { ChevronDown, ChevronUp, Save, RotateCcw, Wine, Users, DollarSign, AlertCircle, Power, PowerOff } from 'lucide-react-native';
import cloneDeep from 'lodash/cloneDeep';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/src/lib/supabase";
import { Constants } from "@/src/lib/database.types";
import { useToast } from "@/src/components/general/Toast";

// --- Types ---
const seatOptionTypes = Constants.public.Enums.seat_option_type;
export type SeatOptionType = (typeof seatOptionTypes)[number];

// REMOVED: require_bottle_drink from SeatOptionRestrictions
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

// REMOVED: require_bottle_drink from SeatOptionFormValues restrictions
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

// --- Helper Functions ---

// UPDATED: convertDbToFormValues - Remove require_bottle_drink handling
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
      min_bottles_enabled: !!(dbRestrictions.min_bottles && dbRestrictions.min_bottles > 0), // Derive directly from min_bottles
      min_bottles: dbRestrictions.min_bottles ?? null,
    },
  };
};

// UPDATED: createDefaultFormValues - Remove require_bottle_drink
const createDefaultFormValues = (type: SeatOptionType): SeatOptionFormValues => ({
  type: type,
  enabled: true,
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

// UPDATED: areStatesEqual - Remove require_bottle_drink comparison
const areStatesEqual = (formState: SeatOptionFormValues | null | undefined, dbState: SeatOption | null | undefined): boolean => {
    if (!formState && !dbState) return true;
    if (!formState || !dbState) return false;

    const dbRestrictions = dbState.restrictions || {};
    const formRestrictions = formState.restrictions;
    const effectiveDbMinConsumption = dbRestrictions.min_consumption ?? null;
    const effectiveFormMinConsumption = getEffectiveMinConsumption(formRestrictions);
    const effectiveDbMinBottles = dbRestrictions.min_bottles ?? null; // Get effective value from DB
    const effectiveFormMinBottles = getEffectiveMinBottles(formRestrictions); // Get effective value from Form

    return (
        formState.enabled === dbState.enabled &&
        (formState.available_count ?? 0) === (dbState.available_count ?? 0) &&
        (formState.min_people ?? 0) === (dbState.min_people ?? 0) &&
        (formState.max_people ?? 0) === (dbState.max_people ?? 0) &&
        // formRestrictions.require_bottle_drink === (dbRestrictions.require_bottle_drink ?? false) && // REMOVED
        effectiveFormMinConsumption === effectiveDbMinConsumption &&
        effectiveFormMinBottles === effectiveDbMinBottles // Compare effective min bottles
    );
};


// --- Validation Function (No change needed here for this specific modification) ---
const validateFormValues = (formValues: SeatOptionFormValues, isConfigured: boolean): string[] => {
    const errors: string[] = [];
    if (!isConfigured) {
        return errors;
    }
    const typeName = formValues.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    if (formValues.enabled) {
        if (formValues.available_count === null || formValues.available_count <= 0) {
            errors.push(`${typeName}: Available count must be > 0 when enabled.`);
        }
        if (formValues.restrictions.min_consumption_enabled && (formValues.restrictions.min_consumption === null || formValues.restrictions.min_consumption <= 0)) {
            errors.push(`${typeName}: Min consumption amount must be > 0 when enabled.`);
        }
        // This validation correctly handles the combined logic
        if (formValues.restrictions.min_bottles_enabled && (formValues.restrictions.min_bottles === null || formValues.restrictions.min_bottles <= 0)) {
            errors.push(`${typeName}: Min bottles amount must be > 0 when enabled.`);
        }
    }

    const minPpl = formValues.min_people;
    const maxPpl = formValues.max_people;
     if (minPpl !== null) {
         if (maxPpl === null) {
             errors.push(`${typeName}: Max people is required when Min people is set.`);
         } else if (maxPpl < minPpl) {
             errors.push(`${typeName}: Max people (${maxPpl}) cannot be < Min people (${minPpl}).`);
         }
     }
    return errors;
};


// --- SeatOptionForm Props Interface (No change needed) ---
interface SeatOptionFormProps {
  values: SeatOptionFormValues;
  onChange: (values: SeatOptionFormValues) => void;
  isDisabled: boolean;
  isAvailableCountInvalid: boolean;
  isMaxPeopleInvalid: boolean;
  isMinConsumptionAmountInvalid: boolean;
  isMinBottlesAmountInvalid: boolean;
  originalRecordExists: boolean;
}

// --- SeatOptionForm Component ---
const SeatOptionForm = ({
  values,
  onChange,
  isDisabled,
  isAvailableCountInvalid,
  isMaxPeopleInvalid,
  isMinConsumptionAmountInvalid,
  isMinBottlesAmountInvalid,
}: SeatOptionFormProps) => {

   // updateField remains the same
   const updateField = (field: keyof Omit<SeatOptionFormValues, 'restrictions' | 'type'>, value: any) => {
     let processedValue = value;
      if (field === 'enabled') {
          processedValue = !!value;
      } else if (field === 'available_count' || field === 'min_people' || field === 'max_people') {
          const cleaned = String(value).replace(/[^0-9]/g, "");
          processedValue = cleaned === "" ? null : Math.max(0, parseInt(cleaned, 10));
      }
    onChange({ ...values, [field]: processedValue });
  };

  // UPDATED: updateRestriction - Remove require_bottle_drink case
  const updateRestriction = (field: keyof SeatOptionFormValues['restrictions'], value: any) => {
    const updatedRestrictions = { ...values.restrictions };
    // if (field === 'require_bottle_drink' || ... ) // REMOVED require_bottle_drink case
    if (field === 'min_consumption_enabled' || field === 'min_bottles_enabled') {
        updatedRestrictions[field] = !!value;
        if (field === 'min_consumption_enabled' && !value) updatedRestrictions.min_consumption = null;
        if (field === 'min_bottles_enabled' && !value) updatedRestrictions.min_bottles = null;
    } else if (field === 'min_consumption' || field === 'min_bottles') {
        const cleaned = String(value).replace(/[^0-9]/g, "");
        const numValue = cleaned === "" ? null : Math.max(0, parseInt(cleaned, 10));
        updatedRestrictions[field] = numValue;
        if (field === 'min_consumption' && numValue !== null && numValue > 0) updatedRestrictions.min_consumption_enabled = true;
        // This logic remains correct: setting bottles > 0 enables the restriction
        if (field === 'min_bottles' && numValue !== null && numValue > 0) updatedRestrictions.min_bottles_enabled = true;
    }
    onChange({ ...values, restrictions: updatedRestrictions });
  };

  const disabledInputStyle = isDisabled ? 'opacity-50' : '';

  return (
    <View className={`pt-4 px-4 border-t border-white/10 ${isDisabled ? 'opacity-60' : ''}`}>
       {/* "Enabled" Switch (remains the same) */}
       <View className={`flex-row items-center justify-between mb-4 ${isDisabled ? 'opacity-50' : ''}`}>
           <View className="flex-row items-center">
               {values.enabled ? <Power size={16} color="#34d399" /> : <PowerOff size={16} color="#9ca3af" />}
               <Text className={`text-sm ml-2 ${values.enabled ? 'text-white' : 'text-gray-400'}`}>
                   {values.enabled ? 'Seat Option Enabled' : 'Seat Option Disabled'}
               </Text>
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

       {/* Available Count (remains the same) */}
       <View className={`mb-4 ${disabledInputStyle}`}>
         <Text className="text-sm text-white mb-2">Available Count *</Text>
         <View className={`bg-[#2A2A35] rounded-lg border ${isAvailableCountInvalid && values.enabled && !isDisabled ? 'border-red-500' : 'border-white/10'}`}>
           <TextInput className="text-white p-3 text-base" keyboardType="numeric" value={values.available_count?.toString() ?? ''} onChangeText={(text) => updateField('available_count', text)} placeholder="0" placeholderTextColor="#6C7A93" editable={!isDisabled}/>
         </View>
         {isAvailableCountInvalid && values.enabled && !isDisabled && (<View className="flex-row items-center mt-1"><AlertCircle size={12} color="#f87171" /><Text className="text-red-400 text-xs ml-1 w-full">Value must be greater than 0 when enabled.</Text></View>)}
       </View>

       {/* Min/Max People (remains the same) */}
       <View className={`flex-row mb-2 ${disabledInputStyle}`}>
         <View className="flex-1 mr-2">
             <Text className="text-sm text-white mb-2">Min People</Text>
             <View className="bg-[#2A2A35] rounded-lg border border-white/10"><TextInput className="text-white p-3 text-base" keyboardType="numeric" value={values.min_people?.toString() ?? ''} onChangeText={(text) => updateField('min_people', text)} placeholder="Any" placeholderTextColor="#6C7A93" editable={!isDisabled} /></View>
         </View>
         <View className="flex-1 ml-2">
           <Text className="text-sm text-white mb-2">Max People</Text>
            <View className={`bg-[#2A2A35] rounded-lg border ${isMaxPeopleInvalid && !isDisabled ? 'border-red-500' : 'border-white/10'}`}>
             <TextInput className="text-white p-3 text-base" keyboardType="numeric" value={values.max_people?.toString() ?? ''} onChangeText={(text) => updateField('max_people', text)} placeholder="Any" placeholderTextColor="#6C7A93" editable={!isDisabled} />
           </View>
           {isMaxPeopleInvalid && !isDisabled && (
               <View className="flex-row items-center mt-1">
                   <AlertCircle size={12} color="#f87171" />
                   <Text className="text-red-400 text-xs ml-1 w-full">
                       Required if Min is set & must be ≥ Min People.
                   </Text>
               </View>
           )}
         </View>
       </View>
       <Text className="text-xs text-gray-400 mb-4">In case that min and max are equal, it means we dont care about the number of people</Text>

       {/* Restrictions */}
       <View className={`mb-1 ${disabledInputStyle}`}>
         <Text className="text-base font-semibold text-white my-4">Restrictions</Text>

         {/* REMOVED: Require Bottle Service Switch */}
         {/* <View className="flex-row items-center justify-between mb-4"><View className="flex-row items-center"><Wine size={16} color="#ff4d6d" className="mr-2" /><Text className="text-sm text-white ml-2">Require Bottle Service</Text></View><Switch value={values.restrictions.require_bottle_drink} ... /></View> */}

         {/* Minimum Consumption (remains the same) */}
         <View className="flex-row items-center justify-between mb-4"><View className="flex-row items-center"><DollarSign size={16} color="#ff4d6d" className="mr-2" /><Text className="text-sm text-white ml-2">Minimum Consumption</Text></View><Switch value={values.restrictions.min_consumption_enabled} onValueChange={(v) => updateRestriction('min_consumption_enabled', v)} 
         trackColor={{ false: '#374151', true: '#34d39940' }}
         thumbColor={values.restrictions.min_consumption_enabled ? '#34d399' : '#9ca3af'}
         disabled={isDisabled} ios_backgroundColor="#2a2a35" /></View>
         {values.restrictions.min_consumption_enabled && (
           <View className={`mt-[-8px] mb-4 ml-6 ${isDisabled ? 'opacity-50' : ''}`}>
             <Text className="text-xs text-gray-400 mb-1">Amount (€)</Text>
             <View className={`bg-[#2A2A35] rounded-lg border ${isMinConsumptionAmountInvalid && values.restrictions.min_consumption_enabled && !isDisabled ? 'border-red-500' : 'border-white/10'}`}>
               <TextInput className="text-white p-3 text-base" keyboardType="numeric" value={values.restrictions.min_consumption?.toString() ?? ''} onChangeText={(text) => updateRestriction('min_consumption', text)} placeholder="e.g., 100" placeholderTextColor="#6C7A93" editable={!isDisabled}/>
             </View>
             {isMinConsumptionAmountInvalid && values.restrictions.min_consumption_enabled && !isDisabled && (<View className="flex-row items-center mt-1"><AlertCircle size={12} color="#f87171" /><Text className="text-red-400 text-xs ml-1">Required when Min Consumption is enabled.</Text></View>)}
           </View>
         )}
         {/* Minimum Bottles (remains the same, now the sole bottle controller) */}
         <View className="flex-row items-center justify-between mb-4"><View className="flex-row items-center"><Wine size={16} color="#8b5cf6" className="mr-2" /><Text className="text-sm text-white ml-2">Minimum Bottles</Text></View><Switch value={values.restrictions.min_bottles_enabled} onValueChange={(v) => updateRestriction('min_bottles_enabled', v)}
         trackColor={{ false: 'orange', true: '#8b5cf640' }}
         thumbColor={values.restrictions.min_bottles_enabled ? '#8b5cf6' : '#9ca3af'} 
         disabled={isDisabled}
         ios_backgroundColor="#2a2a35" /></View>
         {values.restrictions.min_bottles_enabled && (
           <View className={`mt-[-8px] mb-4 ml-6 ${isDisabled ? 'opacity-50' : ''}`}>
             <Text className="text-xs text-gray-400 mb-1">Number of Bottles</Text>
             <View className={`bg-[#2A2A35] rounded-lg border ${isMinBottlesAmountInvalid && values.restrictions.min_bottles_enabled && !isDisabled ? 'border-red-500' : 'border-white/10'}`}>
               <TextInput className="text-white p-3 text-base" keyboardType="numeric" value={values.restrictions.min_bottles?.toString() ?? ''} onChangeText={(text) => updateRestriction('min_bottles', text)} placeholder="e.g., 1" placeholderTextColor="#6C7A93" editable={!isDisabled}/>
             </View>
             {isMinBottlesAmountInvalid && values.restrictions.min_bottles_enabled && !isDisabled && (<View className="flex-row items-center mt-1"><AlertCircle size={12} color="#f87171" /><Text className="text-red-400 text-xs ml-1">Required when Min Bottles is enabled (must be {'>'} 0).</Text></View>)}
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
  const [configuredTypes, setConfiguredTypes] = useState<Set<SeatOptionType>>(new Set());

  // Data Fetching (remains the same)
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

  // Form and Original State (remains the same structure)
  const [seatOptions, setSeatOptions] = useState<Record<SeatOptionType, SeatOptionFormValues>>(
    () => Object.fromEntries(seatOptionTypes.map(type => [type, createDefaultFormValues(type)])) as Record<SeatOptionType, SeatOptionFormValues>
  );
  const [originalSeatOptions, setOriginalSeatOptions] = useState<Record<SeatOptionType, SeatOption | null>>(
    () => Object.fromEntries(seatOptionTypes.map(type => [type, null])) as Record<SeatOptionType, SeatOption | null>
  );

  // Effects (remains the same logic, types adapt automatically)
  useEffect(() => {
    const initialFormState = seatOptionTypes.reduce((acc, type) => ({ ...acc, [type]: createDefaultFormValues(type) }), {} as Record<SeatOptionType, SeatOptionFormValues>);
    const initialOriginalState = seatOptionTypes.reduce((acc, type) => ({ ...acc, [type]: null }), {} as Record<SeatOptionType, SeatOption | null>);
    const initialConfiguredTypes = new Set<SeatOptionType>();

    if (dbSeatOptions) {
        dbSeatOptions.forEach(dbOption => {
            if (seatOptionTypes.includes(dbOption.type)) {
                initialOriginalState[dbOption.type] = cloneDeep(dbOption);
                initialFormState[dbOption.type] = convertDbToFormValues(dbOption); // Uses updated converter
                initialConfiguredTypes.add(dbOption.type);
            }
        });
    }
    setOriginalSeatOptions(initialOriginalState);
    setSeatOptions(initialFormState);
    setConfiguredTypes(initialConfiguredTypes);
    setOpenDrawers(new Set());
  }, [dbSeatOptions, barId]);

  // Memoized Derived State (remains the same logic, types adapt automatically)
  const dirtyTypes = useMemo(() => {
      return seatOptionTypes.filter(type => {
          const isConfigured = configuredTypes.has(type);
          const originalRecord = originalSeatOptions[type];
          const formState = seatOptions[type];
          if (isConfigured && !originalRecord) return true;
          if (!isConfigured && originalRecord) return true;
          if (isConfigured && originalRecord && formState) {
              return !areStatesEqual(formState, originalRecord); // Uses updated equality check
          }
          return false;
      });
  }, [seatOptions, originalSeatOptions, configuredTypes]);

  const isAnyFormInvalid = useMemo(() => {
      return seatOptionTypes.some(type => {
           const isConfigured = configuredTypes.has(type);
           if (!isConfigured) return false;
           const formValues = seatOptions[type];
           return formValues ? validateFormValues(formValues, isConfigured).length > 0 : false;
      });
  }, [seatOptions, configuredTypes]);

  const hasUnsavedChanges = dirtyTypes.length > 0;

  // --- Save Mutation ---
  const saveMutation = useMutation({
      mutationFn: async (typesToSave: SeatOptionType[]) => {
          console.log(`Initiating save mutation for types: ${typesToSave.join(', ')}`);
          type MutationResult = { type: SeatOptionType; action: 'create' | 'update' | 'delete' | 'none'; record?: SeatOption | null; };
          const results: MutationResult[] = [];
          const errors: { type: SeatOptionType, message: string }[] = [];
          let validationFailed = false;

          type Operation = { type: SeatOptionType; action: 'create' | 'update' | 'delete' | 'none'; formValues?: SeatOptionFormValues; originalDbRecord?: SeatOption | null; error?: string; };

          const operations: Operation[] = typesToSave.map(type => {
              const isConfigured = configuredTypes.has(type);
              const formValues = seatOptions[type];
              const originalDbRecord = originalSeatOptions[type];
              let currentAction: 'create' | 'update' | 'delete' | 'none' = 'none';

              if (isConfigured && !originalDbRecord) currentAction = 'create';
              else if (!isConfigured && originalDbRecord) currentAction = 'delete';
              else if (isConfigured && originalDbRecord) {
                  if (!areStatesEqual(formValues, originalDbRecord)) currentAction = 'update'; // Uses updated equality check
                  else currentAction = 'none';
              } else currentAction = 'none';

              if (currentAction === 'none') return { type, action: 'none' };

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
                    restrictions: SeatOptionRestrictions | null; // Correct type
                  } | null = null;

                  if (action === 'create' || action === 'update') {
                      if (!formValues) throw new Error(`Missing form values for ${action} on ${type}`);
                      // UPDATED: restrictionsPayload construction
                      const restrictionsPayload: SeatOptionRestrictions = {};
                      // if (formValues.restrictions.require_bottle_drink) restrictionsPayload.require_bottle_drink = true; // REMOVED
                      const effMinCons = getEffectiveMinConsumption(formValues.restrictions); if (effMinCons !== null) restrictionsPayload.min_consumption = effMinCons;
                      const effMinBot = getEffectiveMinBottles(formValues.restrictions); if (effMinBot !== null) restrictionsPayload.min_bottles = effMinBot; // Only add min_bottles if effective
                      const finalRestrictions = Object.keys(restrictionsPayload).length > 0 ? restrictionsPayload : null;

                      commonPayload = {
                          enabled: formValues.enabled,
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
          const updatedFormState = { ...seatOptions };
          const updatedConfiguredTypes = new Set(configuredTypes);

          results.forEach(({ type, action, record }) => {
              if (action === 'create' || action === 'update') {
                  updatedOriginals[type] = cloneDeep(record ?? null);
                  updatedFormState[type] = record ? convertDbToFormValues(record) : createDefaultFormValues(type); // Uses updated converter
                  updatedConfiguredTypes.add(type);
              } else if (action === 'delete') {
                  updatedOriginals[type] = null;
                  updatedFormState[type] = createDefaultFormValues(type); // Uses updated creator
                  updatedConfiguredTypes.delete(type);
              }
          });

          if (changesMade) {
              setOriginalSeatOptions(updatedOriginals);
              setSeatOptions(updatedFormState);
              setConfiguredTypes(updatedConfiguredTypes);
              setOpenDrawers(new Set());
              queryClient.invalidateQueries({ queryKey: ["seat-options", barId] });
              toast.show({ type: "success", text1: "Changes Saved", text2: `${results.filter(r => r.action !== 'none').length} item(s) affected.` });
          } else {
               toast.show({ type: "info", text1: "No Changes", text2: `No modifications needed saving.` });
          }
      },
      onError: (error: Error) => {
           console.error("Save Mutation onError:", error);
           toast.show({ type: "error", text1: "Save Failed", text2: error.message || "An unknown error occurred during save." });
      },
  });
  // --- End of Save Mutation ---

  // --- Event Handlers (remain the same logic) ---
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
    const revertedConfigured = new Set(configuredTypes);
    dirtyTypes.forEach(type => {
        const originalDbState = originalSeatOptions[type];
        if (originalDbState) {
            revertedState[type] = convertDbToFormValues(originalDbState); // Uses updated converter
            revertedConfigured.add(type);
        } else {
            revertedState[type] = createDefaultFormValues(type); // Uses updated creator
            revertedConfigured.delete(type);
        }
    });
    setSeatOptions(revertedState);
    setConfiguredTypes(revertedConfigured);
    setOpenDrawers(new Set());
    toast.show({ type: 'info', text1: 'Changes Reverted', text2: 'Modifications have been discarded.' });
  }, [seatOptions, originalSeatOptions, configuredTypes, dirtyTypes, toast]);

  const handleConfigureToggle = useCallback((type: SeatOptionType, value: boolean) => {
      setConfiguredTypes(prev => {
          const newConfigured = new Set(prev);
          if (value) {
              newConfigured.add(type);
              if (!originalSeatOptions[type]) {
                  setSeatOptions(prevForm => ({
                      ...prevForm,
                      [type]: { ...prevForm[type], enabled: true }
                  }));
              }
              setOpenDrawers(prevOpen => new Set(prevOpen).add(type));
          } else {
              newConfigured.delete(type);
              setOpenDrawers(prevOpen => {
                  const newOpen = new Set(prevOpen);
                  newOpen.delete(type);
                  return newOpen;
              });
          }
          return newConfigured;
      });
  }, [originalSeatOptions]);

  const handleChevronToggle = useCallback((type: SeatOptionType) => {
      const isConfigured = configuredTypes.has(type);
      setOpenDrawers(prevOpenDrawers => {
          const newOpenDrawers = new Set(prevOpenDrawers);
          if (newOpenDrawers.has(type)) newOpenDrawers.delete(type);
          else if (isConfigured) newOpenDrawers.add(type);
          return newOpenDrawers;
      });
  }, [configuredTypes]);


  // --- Render Logic ---
  const renderSeatOption = useCallback((type: SeatOptionType) => {
    const currentFormValues = seatOptions[type];
    const isConfigured = configuredTypes.has(type);
    const originalRecord = originalSeatOptions[type];
    const originalRecordExists = !!originalRecord;
    const isCurrentlyOpen = openDrawers.has(type);

    if (!currentFormValues) return (<View key={type} className="bg-[#1E1E1E] rounded-xl m-4 p-4 border border-white/10 opacity-50"><ActivityIndicator color="#9ca3af" /></View>);

    const isInternallyEnabled = currentFormValues.enabled;
    const validationErrors = validateFormValues(currentFormValues, isConfigured);
    const isAvailableCountInvalid = validationErrors.some(e => e.includes('Available count'));
    const isMaxPeopleInvalid = validationErrors.some(e => e.includes('Max people'));
    const isMinConsumptionAmountInvalid = validationErrors.some(e => e.includes('Min consumption'));
    const isMinBottlesAmountInvalid = validationErrors.some(e => e.includes('Min bottles')); // This validation remains relevant
    const isThisTypeDirty = dirtyTypes.includes(type);
    const cardOpacityClass = !isConfigured ? 'opacity-50' : '';

    return (
      <View key={type} className={`bg-[#1E1E1E] rounded-xl m-4 overflow-hidden border ${isThisTypeDirty ? 'border-yellow-400/50' : 'border-white/10'} ${cardOpacityClass}`}>
        {/* Card Header (remains the same) */}
        <TouchableOpacity
          onPress={() => handleChevronToggle(type)}
          disabled={!isConfigured || saveMutation.isPending}
          className={`flex-row justify-between items-center p-4`}
          activeOpacity={0.8}
        >
          <View className="flex-row items-center flex-1 mr-2">
              <Text className={`text-lg font-semibold mr-2 ${isConfigured ? 'text-white' : 'text-gray-500'}`}>
                  {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </Text>
              <View className="p-1">
                  {isCurrentlyOpen && isConfigured
                      ? <ChevronUp size={20} color="#ff4d6d" />
                      : <ChevronDown size={20} color={isConfigured ? "#9ca3af" : "#6b7280"} />
                  }
              </View>
              {isThisTypeDirty && !saveMutation.isPending && (
                  <View className="w-2 h-2 bg-yellow-400 rounded-full ml-2"></View>
               )}
          </View>
          <View className="flex-row items-center">
              <Text className={`text-xs mr-2 ${isConfigured ? 'text-white' : 'text-gray-500'}`}>
                  {isConfigured ? 'On' : 'Off'}
              </Text>
              <Switch
                  value={isConfigured}
                  onValueChange={(value) => handleConfigureToggle(type, value)}
                  trackColor={{ false: '#374151', true: '#34d39940' }}
               thumbColor={isConfigured ? '#34d399' : '#9ca3af'}
                  disabled={saveMutation.isPending}
                  ios_backgroundColor="#374151"
              />
          </View>
        </TouchableOpacity>

        {/* Card Summary (Show if NOT open and IS configured) */}
        {!isCurrentlyOpen && isConfigured && (
            <View className={`p-4 border-t border-white/10 flex-row flex-wrap`}>
                {/* Enabled Status (remains the same) */}
                <View className={`flex-row items-center mr-4 mb-2 ${isInternallyEnabled ? 'opacity-100' : 'opacity-60'}`}>
                    {isInternallyEnabled ? <Power size={14} color="#34d399" /> : <PowerOff size={14} color="#9ca3af" />}
                    <Text className={`ml-1 text-sm ${isInternallyEnabled ? 'text-green-400' : 'text-gray-400'}`}>
                        {isInternallyEnabled ? 'Enabled' : 'Disabled'}
                    </Text>
                </View>
                {/* Seats Summary (remains the same) */}
                <View className="flex-row items-center mr-4 mb-2">
                    <Users size={14} color="#9ca3af" />
                    <Text className={`ml-2 text-sm ${isAvailableCountInvalid && isInternallyEnabled ? 'text-red-400' : 'text-gray-400'}`}>
                        {currentFormValues.available_count ?? 0} seats
                    </Text>
                    {isAvailableCountInvalid && isInternallyEnabled && <AlertCircle size={14} color="#f87171" style={{ marginLeft: 4 }}/>}
                </View>
                {/* People Summary (remains the same) */}
                 {(currentFormValues.min_people !== null || currentFormValues.max_people !== null) && (
                     <View className="flex-row items-center mr-4 mb-2">
                        <Users size={14} color="#9ca3af" />
                        <Text className={`ml-2 text-sm ${isMaxPeopleInvalid ? 'text-red-400' : 'text-gray-400'}`}>
                            {currentFormValues.min_people ?? 'Any'}-{currentFormValues.max_people ?? 'Any'} ppl
                        </Text>
                        {isMaxPeopleInvalid && <AlertCircle size={14} color="#f87171" style={{ marginLeft: 4 }}/>}
                    </View>
                )}
                {/* REMOVED: require_bottle_drink badge */}
                {/* {currentFormValues.restrictions.require_bottle_drink && (<View style={[styles.badge, styles.tealBadge]}><Wine size={12} color="#FFF" style={styles.badgeIcon} /><Text style={styles.badgeText}>Bottle Req.</Text></View>)} */}

                {/* Min Consumption Badge (remains the same) */}
                {getEffectiveMinConsumption(currentFormValues.restrictions) !== null && (
                    <View style={[styles.badge, styles.yellowBadge]}>
                        <DollarSign size={12} color="#FFF" style={styles.badgeIcon}/>
                        <Text style={styles.badgeText}>Min €{getEffectiveMinConsumption(currentFormValues.restrictions)}</Text>
                        {isMinConsumptionAmountInvalid && currentFormValues.restrictions.min_consumption_enabled && isInternallyEnabled && <AlertCircle size={12} color="#92400e" style={{ marginLeft: 4 }}/>}
                    </View>
                )}
                {/* Min Bottles Badge (remains the same, now the sole bottle indicator) */}
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
            onChange={(values) => setSeatOptions((prev) => ({ ...prev, [type]: values }))}
            isDisabled={false}
            isAvailableCountInvalid={isAvailableCountInvalid}
            isMaxPeopleInvalid={isMaxPeopleInvalid}
            isMinConsumptionAmountInvalid={isMinConsumptionAmountInvalid}
            isMinBottlesAmountInvalid={isMinBottlesAmountInvalid} // Pass validation state
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
      styles // Keep dependency if styles object could change
  ]);

   // --- Loading/Error States (remain the same) ---
   if (isQueryLoading && !dbSeatOptions) {
        return (<View className="flex-1 bg-[#121212] items-center justify-center"><ActivityIndicator size="large" color="#ff4d6d" /><Text className="text-gray-400 mt-4">Loading Seat Options...</Text></View>);
   }
   if (queryError) {
       return (<View className="flex-1 bg-[#121212] items-center justify-center p-4"><AlertCircle size={40} color="#ff4d6d" /><Text className="text-red-400 mt-4 text-lg font-semibold">Error Loading Data</Text><Text className="text-gray-400 mt-2 text-center">{queryError instanceof Error ? queryError.message : "An unexpected error occurred."}</Text><TouchableOpacity className="mt-6 bg-[#ff4d6d] py-2 px-6 rounded-lg" onPress={() => refetchSeatOptions()}><Text className="text-white font-medium">Retry</Text></TouchableOpacity></View>);
   }

   // --- Main Render (remains the same) ---
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
            contentContainerStyle={{ paddingBottom: hasUnsavedChanges ? (safeAreaInsets.bottom > 0 ? safeAreaInsets.bottom + 70 : 82) : 20 }}
          >
           <View className="p-4 border-b border-white/10">
           <Text className="text-2xl font-semibold text-white mb-1">Seat Management</Text>
           <Text className="text-base text-gray-400">Configure seat types using the main switch. Then, set details and enable/disable specific options inside.</Text>
           </View>
           {seatOptionTypes.map(renderSeatOption)}
         </ScrollView>
       </KeyboardAvoidingView>

       {/* Floating Bar (remains the same) */}
       {hasUnsavedChanges && (
         <View style={[ styles.floatingBar, { paddingBottom: safeAreaInsets.bottom > 0 ? safeAreaInsets.bottom : 12 } ]} className="bg-[#1E1E1E] border-t border-white/20 shadow-lg">
            <TouchableOpacity className={`flex-row items-center p-3 mr-3 ${saveMutation.isPending ? 'opacity-50' : ''}`} onPress={handleGlobalRevert} disabled={saveMutation.isPending}>
                <RotateCcw size={18} color="#9ca3af" />
                <Text className="text-gray-400 ml-2 text-base font-medium">Revert</Text>
            </TouchableOpacity>
            <TouchableOpacity className={`flex-row items-center bg-[#ff4d6d] py-3 px-5 rounded-lg ${(saveMutation.isPending || isAnyFormInvalid) ? 'opacity-50 bg-gray-600' : ''}`} onPress={handleGlobalSave} disabled={saveMutation.isPending || isAnyFormInvalid}>
                {saveMutation.isPending ? (<ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }}/>) : (<Save size={18} color="#FFFFFF" style={{ marginRight: 8 }} />)}
                <Text className="text-white text-base font-medium">{saveMutation.isPending ? 'Saving...' : `Save Changes (${dirtyTypes.length})`}</Text>
            </TouchableOpacity>
         </View>
       )}
     </View>
   );
}


// --- Styles (remain the same) ---
const styles = StyleSheet.create({
    badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, marginRight: 8, marginBottom: 4, },
    badgeIcon: { marginRight: 4, },
    badgeText: { fontSize: 11, fontWeight: '500', color: '#FFFFFF', },
    yellowBadge: { backgroundColor: '#f59e0b', }, // Min Consumption
    purpleBadge: { backgroundColor: '#8b5cf6', }, // Min Bottles
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