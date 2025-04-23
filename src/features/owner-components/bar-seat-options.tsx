"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Switch,
  ScrollView,
  Platform,
  Keyboard,
  StyleSheet,
} from "react-native"
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated"
import {
  ChevronDown,
  ChevronUp,
  Save,
  AlertCircle,
  Edit2,
  RotateCcw,
  Bot,
  Package,
  Users,
  BarChart2,
  Ban,
  Armchair,
} from "lucide-react-native"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "../../lib/supabase"
import { Constants } from "../../lib/database.types"
import { useToast } from "@/src/components/general/Toast"

// Types
const seatOptionTypes = Constants.public.Enums.seat_option_type
export type SeatOptionType = (typeof seatOptionTypes)[number]
export type SeatOptionRestrictions = {
  require_bottle_drink?: boolean
  min_consumption?: number | null
  min_bottles?: number | null
}
export type SeatOption = {
  id: string
  bar_id: string
  type: SeatOptionType
  enabled: boolean
  available_count: number
  min_people: number
  max_people: number
  restrictions: SeatOptionRestrictions | null
}
export type SeatOptionFormValues = {
  type: SeatOptionType
  available_count: number | null
  min_people: number | null
  max_people: number | null
  enabled: boolean
  restrictions: {
    require_bottle_drink: boolean
    min_consumption_enabled: boolean
    min_consumption: number | null
    min_bottles_enabled: boolean
    min_bottles: number | null
  }
}
export type LocalSeatOption = {
  exists: boolean
  isNew: boolean
  toDelete: boolean
  values: SeatOptionFormValues
  originalId?: string
}
type BarSeatOptionsProps = { barId: string; onChange?: () => void }
type SeatOptionEditFormProps = {
  type: SeatOptionType
  typeName: string
  displayValues: SeatOptionFormValues
  isAvailableCountInvalid: boolean
  isMaxLessThanMin: boolean
  isMinConsumptionInvalid: boolean
  isMinBottlesInvalid: boolean
  updateFieldValue: (type: SeatOptionType, field: keyof Omit<SeatOptionFormValues, "restrictions">, value: any) => void
  updateRestrictionValue: <K extends keyof SeatOptionFormValues["restrictions"]>(
    type: SeatOptionType,
    restrictionKey: K,
    value: any,
  ) => void
}

// Helper functions
const defaultRestrictions = (): SeatOptionFormValues["restrictions"] => ({
  require_bottle_drink: false,
  min_consumption_enabled: false,
  min_consumption: null,
  min_bottles_enabled: false,
  min_bottles: null,
})

const defaultFormValues = (type: SeatOptionType): SeatOptionFormValues => ({
  type,
  available_count: null,
  min_people: null,
  max_people: null,
  enabled: true,
  restrictions: defaultRestrictions(),
})

const getEffectiveMinConsumption = (restrictions: SeatOptionFormValues["restrictions"]): number | null => {
  return restrictions.min_consumption_enabled && restrictions.min_consumption && restrictions.min_consumption > 0
    ? restrictions.min_consumption
    : null
}

const getEffectiveMinBottles = (restrictions: SeatOptionFormValues["restrictions"]): number | null => {
  return restrictions.min_bottles_enabled && restrictions.min_bottles && restrictions.min_bottles > 0
    ? restrictions.min_bottles
    : null
}

const formatTypeName = (type: string): string =>
  type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

// Form component
const SeatOptionEditForm = React.memo(
  ({
    type,
    typeName,
    displayValues,
    isAvailableCountInvalid,
    isMaxLessThanMin,
    isMinConsumptionInvalid,
    isMinBottlesInvalid,
    updateFieldValue,
    updateRestrictionValue,
  }: SeatOptionEditFormProps) => {
    return (
      <View style={styles.formContainer}>
        <View style={styles.formSection}>
          <View style={styles.switchContainer}>
            <View style={styles.switchLabelContainer}>
              <Ban size={16} color="#ff4d6d" style={styles.iconMarginRight} />
              <Text style={styles.switchLabel}>Temporarily Disable</Text>
            </View>
            <Switch
              value={!displayValues.enabled}
              onValueChange={(value) => updateFieldValue(type, "enabled", !value)}
              trackColor={{ false: "#2a2a35", true: "#ff4d6d40" }}
              thumbColor={!displayValues.enabled ? "#ff4d6d" : "#9ca3af"}
              ios_backgroundColor="#2a2a35"
              accessibilityLabel={`Temporarily disable ${typeName}`}
              accessibilityHint={displayValues.enabled ? "Switch ON to disable" : "Switch OFF to enable"}
            />
          </View>
          <Text style={styles.helperText}>
            Turn this off to temporarily prevent new bookings for this seat type without deleting its settings.
          </Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Available Count *</Text>
          <View style={[styles.inputContainer, isAvailableCountInvalid && styles.inputError]}>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={displayValues.available_count?.toString() ?? ""}
              onChangeText={(txt) => updateFieldValue(type, "available_count", txt)}
              placeholder="0"
              placeholderTextColor="#6C7A93"
              accessibilityLabel={`Available count for ${typeName}`}
            />
          </View>
          <Text style={styles.helperText}>Total number of this seat type available for booking.</Text>
          {isAvailableCountInvalid && (
            <View style={styles.errorContainer}>
              <AlertCircle size={12} color="#ff4d6d" />
              <Text style={styles.errorText}>Must be greater than 0 when the seat type is enabled.</Text>
            </View>
          )}
        </View>

        <View style={styles.rowContainer}>
          <View style={styles.halfColumn}>
            <Text style={styles.inputLabel}>Min People</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={displayValues.min_people?.toString() ?? ""}
                onChangeText={(txt) => updateFieldValue(type, "min_people", txt)}
                placeholder="0"
                placeholderTextColor="#6C7A93"
                accessibilityLabel={`Minimum people for ${typeName}`}
              />
            </View>
            <Text style={styles.helperText}>Minimum number of people required per booking (0 for no minimum).</Text>
          </View>
          <View style={styles.halfColumn}>
            <Text style={styles.inputLabel}>Max People</Text>
            <View style={[styles.inputContainer, isMaxLessThanMin && styles.inputError]}>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={displayValues.max_people?.toString() ?? ""}
                onChangeText={(txt) => updateFieldValue(type, "max_people", txt)}
                placeholder="0"
                placeholderTextColor="#6C7A93"
                accessibilityLabel={`Maximum people for ${typeName}`}
              />
            </View>
            <Text style={styles.helperText}>Maximum number of people allowed per booking (0 for no maximum).</Text>
            {isMaxLessThanMin && (
              <View style={styles.errorContainer}>
                <AlertCircle size={12} color="#ff4d6d" />
                <Text style={styles.errorText}>Cannot be less than Min.</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.restrictionsHeader}>
          <Text style={styles.sectionTitle}>Restrictions</Text>
        </View>

        <View style={styles.formSection}>
          <View style={styles.switchContainer}>
            <View style={styles.switchLabelContainer}>
              <Bot size={16} color="#ff4d6d" style={styles.iconMarginRight} />
              <Text style={styles.switchLabel}>Require Bottle Service</Text>
            </View>
            <Switch
              value={displayValues.restrictions.require_bottle_drink}
              onValueChange={(value) => updateRestrictionValue(type, "require_bottle_drink", value)}
              trackColor={{ false: "#2a2a35", true: "#ff4d6d40" }}
              thumbColor={displayValues.restrictions.require_bottle_drink ? "#ff4d6d" : "#9ca3af"}
              ios_backgroundColor="#2a2a35"
              accessibilityLabel={`Require bottle drink for ${typeName}`}
              accessibilityHint={
                displayValues.restrictions.require_bottle_drink ? "Switch OFF to disable" : "Switch ON to enable"
              }
            />
          </View>
          <Text style={styles.helperText}>
            If enabled, booking this seat type implies purchase of a bottle service.
          </Text>
        </View>

        <View style={styles.formSection}>
          <View style={styles.switchContainer}>
            <View style={styles.switchLabelContainer}>
              <Package size={16} color="#ff4d6d" style={styles.iconMarginRight} />
              <Text style={styles.switchLabel}>Enable Minimum Bottles</Text>
            </View>
            <Switch
              value={displayValues.restrictions.min_bottles_enabled}
              onValueChange={(value) => updateRestrictionValue(type, "min_bottles_enabled", value)}
              trackColor={{ false: "#2a2a35", true: "#ff4d6d40" }}
              thumbColor={displayValues.restrictions.min_bottles_enabled ? "#ff4d6d" : "#9ca3af"}
              ios_backgroundColor="#2a2a35"
              accessibilityLabel={`Enable minimum bottles for ${typeName}`}
              accessibilityHint={
                displayValues.restrictions.min_bottles_enabled ? "Switch OFF to disable" : "Switch ON to enable"
              }
            />
          </View>
          <Text style={styles.helperText}>Set a minimum number of bottles required for this seat type.</Text>
          {displayValues.restrictions.min_bottles_enabled && (
            <View style={styles.nestedInput}>
              <Text style={styles.nestedInputLabel}>Minimum Bottles Required</Text>
              <View style={[styles.inputContainer, isMinBottlesInvalid && styles.inputError]}>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  value={displayValues.restrictions.min_bottles?.toString() ?? ""}
                  onChangeText={(txt) => updateRestrictionValue(type, "min_bottles", txt)}
                  placeholder="1"
                  placeholderTextColor="#6C7A93"
                  editable={displayValues.restrictions.min_bottles_enabled}
                  accessibilityLabel={`Minimum bottles required input for ${typeName}`}
                />
              </View>
              {isMinBottlesInvalid && (
                <View style={styles.errorContainer}>
                  <AlertCircle size={12} color="#ff4d6d" />
                  <Text style={styles.errorText}>Must be greater than 0 when enabled.</Text>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={styles.formSection}>
          <View style={styles.switchContainer}>
            <View style={styles.switchLabelContainer}>
              <BarChart2 size={16} color="#ff4d6d" style={styles.iconMarginRight} />
              <Text style={styles.switchLabel}>Enable Min. Consumption</Text>
            </View>
            <Switch
              value={displayValues.restrictions.min_consumption_enabled}
              onValueChange={(value) => updateRestrictionValue(type, "min_consumption_enabled", value)}
              trackColor={{ false: "#2a2a35", true: "#ff4d6d40" }}
              thumbColor={displayValues.restrictions.min_consumption_enabled ? "#ff4d6d" : "#9ca3af"}
              ios_backgroundColor="#2a2a35"
              accessibilityLabel={`Enable minimum consumption for ${typeName}`}
              accessibilityHint={
                displayValues.restrictions.min_consumption_enabled ? "Switch OFF to disable" : "Switch ON to enable"
              }
            />
          </View>
          <Text style={styles.helperText}>Set a minimum spending amount required for this seat type.</Text>
          {displayValues.restrictions.min_consumption_enabled && (
            <View style={styles.nestedInput}>
              <Text style={styles.nestedInputLabel}>Minimum Amount (€)</Text>
              <View style={[styles.inputContainer, isMinConsumptionInvalid && styles.inputError]}>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  value={displayValues.restrictions.min_consumption?.toString() ?? ""}
                  onChangeText={(txt) => {
                    updateRestrictionValue(type, "min_consumption", txt)
                  }}
                  placeholder="0"
                  placeholderTextColor="#6C7A93"
                  editable={displayValues.restrictions.min_consumption_enabled}
                  accessibilityLabel={`Minimum consumption amount input for ${typeName}`}
                />
              </View>
              {isMinConsumptionInvalid && (
                <View style={styles.errorContainer}>
                  <AlertCircle size={12} color="#ff4d6d" />
                  <Text style={styles.errorText}>Must be greater than 0 when enabled.</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    )
  },
)

// Main component
export const BarSeatOptions = ({ barId, onChange }: BarSeatOptionsProps): JSX.Element => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editingType, setEditingType] = useState<SeatOptionType | null>(null)
  const [isExpanded, setIsExpanded] = useState(true)
  const toggleExpansion = () => setIsExpanded((prev) => !prev)

  const arrowRotation = useSharedValue(0)
  useEffect(() => {
    arrowRotation.value = withTiming(isExpanded ? 180 : 0, { duration: 200 })
  }, [isExpanded])
  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${arrowRotation.value}deg` }],
  }))

  const [localSeatOptions, setLocalSeatOptions] = useState<Record<SeatOptionType, LocalSeatOption | null>>(
    {} as Record<SeatOptionType, LocalSeatOption | null>,
  )

  const {
    data: seatOptions,
    isLoading,
    error,
  } = useQuery<SeatOption[]>({
    queryKey: ["seat-options", barId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seat_options")
        .select("*")
        .eq("bar_id", barId)
        .order("type", { ascending: true })
      if (error) throw error
      return data as SeatOption[]
    },
    enabled: !!barId,
  })

  useEffect(() => {
    if (seatOptions) {
      resetLocalStateToDbState(seatOptions)
    }
  }, [seatOptions])

  const resetLocalStateToDbState = useCallback((options: SeatOption[]) => {
    const initialLocalState: Record<SeatOptionType, LocalSeatOption | null> = {} as Record<
      SeatOptionType,
      LocalSeatOption | null
    >
    seatOptionTypes.forEach((type) => {
      initialLocalState[type] = null
    })
    options.forEach((option) => {
      const dbRestrictions = option.restrictions || {}
      initialLocalState[option.type] = {
        exists: true,
        isNew: false,
        toDelete: false,
        originalId: option.id,
        values: {
          type: option.type,
          available_count: option.available_count,
          min_people: option.min_people,
          max_people: option.max_people,
          enabled: option.enabled,
          restrictions: {
            require_bottle_drink: dbRestrictions.require_bottle_drink ?? false,
            min_consumption_enabled: !!(dbRestrictions.min_consumption && dbRestrictions.min_consumption > 0),
            min_consumption: dbRestrictions.min_consumption ?? null,
            min_bottles_enabled: !!(dbRestrictions.min_bottles && dbRestrictions.min_bottles > 0),
            min_bottles: dbRestrictions.min_bottles ?? null,
          },
        },
      }
    })
    setLocalSeatOptions(initialLocalState)
  }, [])

  const saveMutation = useMutation({
    mutationFn: async (options: Record<SeatOptionType, LocalSeatOption | null>) => {
      const validationErrors: string[] = []
      Object.entries(options).forEach(([type, option]) => {
        if (option && option.exists && !option.toDelete) {
          const formValues = option.values
          const typeName = formatTypeName(type as SeatOptionType)
          if (formValues.enabled && (formValues.available_count === null || formValues.available_count <= 0)) {
            validationErrors.push(`${typeName}: Available count must be > 0 when enabled.`)
          }
          const minPpl = formValues.min_people ?? 0
          const maxPpl = formValues.max_people ?? 0
          if (formValues.max_people !== null && maxPpl < minPpl) {
            validationErrors.push(`${typeName}: Max people cannot be less than Min people.`)
          }
          if (
            formValues.restrictions.min_consumption_enabled &&
            (formValues.restrictions.min_consumption === null || formValues.restrictions.min_consumption <= 0)
          ) {
            validationErrors.push(`${typeName}: Minimum consumption must be > 0 when enabled.`)
          }
          if (
            formValues.restrictions.min_bottles_enabled &&
            (formValues.restrictions.min_bottles === null || formValues.restrictions.min_bottles <= 0)
          ) {
            validationErrors.push(`${typeName}: Minimum bottles must be > 0 when enabled.`)
          }
        }
      })
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed:\n- ${validationErrors.join("\n- ")}`)
      }
      const toCreate: Omit<SeatOption, "id">[] = []
      const toUpdate: { id: string; values: Partial<SeatOption> }[] = []
      const toDelete: string[] = []
      Object.entries(options).forEach(([type, option]) => {
        if (!option) return
        const seatType = type as SeatOptionType
        const restrictionsPayload: SeatOptionRestrictions = {}
        if (option.values.restrictions.require_bottle_drink) {
          restrictionsPayload.require_bottle_drink = true
        }
        const effectiveLocalMinConsumption = getEffectiveMinConsumption(option.values.restrictions)
        if (effectiveLocalMinConsumption !== null) {
          restrictionsPayload.min_consumption = effectiveLocalMinConsumption
        }
        const effectiveLocalMinBottles = getEffectiveMinBottles(option.values.restrictions)
        if (effectiveLocalMinBottles !== null) {
          restrictionsPayload.min_bottles = effectiveLocalMinBottles
        }
        const finalRestrictions = Object.keys(restrictionsPayload).length > 0 ? restrictionsPayload : null
        const commonValues = {
          available_count: option.values.available_count ?? 0,
          min_people: option.values.min_people ?? 0,
          max_people: option.values.max_people ?? 0,
          enabled: option.values.enabled,
          restrictions: finalRestrictions,
        }
        if (option.isNew && !option.toDelete) {
          toCreate.push({ bar_id: barId, type: seatType, ...commonValues })
        } else if (!option.isNew && option.toDelete) {
          if (option.originalId) {
            toDelete.push(option.originalId)
          }
        } else if (!option.isNew && !option.toDelete) {
          if (option.originalId) {
            const dbOption = seatOptions?.find((opt) => opt.id === option.originalId)
            const dbRestrictions = dbOption?.restrictions || {}
            const effectiveDbMinConsumption = dbRestrictions.min_consumption ?? null
            const effectiveDbMinBottles = dbRestrictions.min_bottles ?? null
            if (
              (dbOption?.available_count ?? 0) !== commonValues.available_count ||
              (dbOption?.min_people ?? 0) !== commonValues.min_people ||
              (dbOption?.max_people ?? 0) !== commonValues.max_people ||
              dbOption?.enabled !== commonValues.enabled ||
              (dbRestrictions.require_bottle_drink ?? false) !== option.values.restrictions.require_bottle_drink ||
              effectiveDbMinConsumption !== effectiveLocalMinConsumption ||
              effectiveDbMinBottles !== effectiveLocalMinBottles
            ) {
              toUpdate.push({ id: option.originalId, values: commonValues })
            }
          }
        }
      })
      const operations = []
      if (toCreate.length > 0) {
        operations.push(supabase.from("seat_options").insert(toCreate as any))
      }
      for (const item of toUpdate) {
        operations.push(supabase.from("seat_options").update(item.values).eq("id", item.id))
      }
      for (const id of toDelete) {
        operations.push(supabase.from("seat_options").delete().eq("id", id))
      }
      if (operations.length === 0) {
        return { message: "No changes to save" }
      }
      const results = await Promise.all(operations)
      const errors = results.filter((r) => r.error).map((r) => r.error)
      if (errors.length > 0) {
        console.error("Supabase Save Errors:", errors)
        throw new Error(errors.map((e) => e?.message).join(", "))
      }
      return {
        created: toCreate.length,
        updated: toUpdate.length,
        deleted: toDelete.length,
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["seat-options", barId] })
      if (data?.message !== "No changes to save") {
        toast.show({ type: "success", text1: "Seat options saved successfully" })
      }
      onChange?.()
      setEditingType(null)
      Keyboard.dismiss()
    },
    onError: (err: any) => {
      let message = "Failed to save seat options."
      if (err instanceof Error) {
        if (err.message.startsWith("Validation failed:")) {
          message = "Please fix the validation errors before saving."
        }
        console.error("Save Error:", err)
      }
      toast.show({ type: "error", text1: "Save Failed", text2: message })
    },
  })

  const toggleSeatOption = useCallback(
    (type: SeatOptionType) => {
      setLocalSeatOptions((prev) => {
        const current = prev[type]
        if (!current) {
          return {
            ...prev,
            [type]: {
              exists: true,
              isNew: true,
              toDelete: false,
              values: defaultFormValues(type),
            },
          }
        } else if (current.exists) {
          if (current.isNew) {
            const newState = { ...prev }
            newState[type] = null
            if (editingType === type) setEditingType(null)
            return newState
          } else {
            return {
              ...prev,
              [type]: { ...current, exists: false, toDelete: true },
            }
          }
        } else {
          const dbOption = seatOptions?.find((opt) => opt.type === type)
          if (dbOption) {
            const dbRestrictions = dbOption.restrictions || {}
            return {
              ...prev,
              [type]: {
                ...current,
                exists: true,
                toDelete: false,
                values: {
                  type: dbOption.type,
                  available_count: dbOption.available_count,
                  min_people: dbOption.min_people,
                  max_people: dbOption.max_people,
                  enabled: dbOption.enabled,
                  restrictions: {
                    require_bottle_drink: dbRestrictions.require_bottle_drink ?? false,
                    min_consumption_enabled: !!(dbRestrictions.min_consumption && dbRestrictions.min_consumption > 0),
                    min_consumption: dbRestrictions.min_consumption ?? null,
                    min_bottles_enabled: !!(dbRestrictions.min_bottles && dbRestrictions.min_bottles > 0),
                    min_bottles: dbRestrictions.min_bottles ?? null,
                  },
                },
              },
            }
          } else {
            return {
              ...prev,
              [type]: {
                exists: true,
                isNew: !current.originalId,
                toDelete: false,
                originalId: current.originalId,
                values: defaultFormValues(type),
              },
            }
          }
        }
      })
      setLocalSeatOptions((currentState) => {
        const nextState = currentState[type]
        if (nextState?.exists && !nextState?.toDelete) {
          setEditingType(type)
        } else if (editingType === type) {
          setEditingType(null)
        }
        return currentState
      })
    },
    [seatOptions, editingType],
  )

  const updateFieldValue = useCallback(
    (type: SeatOptionType, field: keyof Omit<SeatOptionFormValues, "restrictions">, value: any) => {
      setLocalSeatOptions((prev) => {
        const current = prev[type]
        if (!current) return prev
        const newValues = { ...current.values }
        if (field === "enabled") {
          newValues.enabled = !!value
        } else if (field === "available_count" || field === "min_people" || field === "max_people") {
          const cleanedValue = String(value).replace(/[^0-9]/g, "")
          const numValue = Number.parseInt(cleanedValue, 10)
          const valueToUpdate = cleanedValue === "" || isNaN(numValue) ? null : Math.max(0, numValue)
          newValues[field] = valueToUpdate
          const currentMin = newValues.min_people ?? 0
          const currentMax = newValues.max_people ?? 0
          if (field === "min_people" && valueToUpdate !== null) {
            if (newValues.max_people !== null && valueToUpdate > currentMax) {
              newValues.max_people = valueToUpdate
            }
          } else if (field === "max_people" && valueToUpdate !== null) {
            if (newValues.min_people !== null && valueToUpdate < currentMin) {
              newValues.max_people = newValues.min_people
            }
          }
        }
        return { ...prev, [type]: { ...current, values: newValues } }
      })
    },
    [],
  )

  const updateRestrictionValue = useCallback(
    <K extends keyof SeatOptionFormValues["restrictions"]>(type: SeatOptionType, restrictionKey: K, rawValue: any) => {
      setLocalSeatOptions((prev) => {
        const current = prev[type]
        if (!current) return prev
        const updatedRestrictions = { ...current.values.restrictions }
        switch (restrictionKey) {
          case "require_bottle_drink":
            updatedRestrictions.require_bottle_drink = !!rawValue
            break
          case "min_consumption_enabled":
            const consEnabled = !!rawValue
            updatedRestrictions.min_consumption_enabled = consEnabled
            if (!consEnabled) {
              updatedRestrictions.min_consumption = null
            } else if (updatedRestrictions.min_consumption === null) {
              updatedRestrictions.min_consumption = 0
            }
            break
          case "min_bottles_enabled":
            const bottlesEnabled = !!rawValue
            updatedRestrictions.min_bottles_enabled = bottlesEnabled
            if (!bottlesEnabled) {
              updatedRestrictions.min_bottles = null
            } else if (updatedRestrictions.min_bottles === null) {
              updatedRestrictions.min_bottles = 0
            }
            break
          case "min_consumption": {
            const cleanedTxt = String(rawValue).replace(/[^0-9]/g, "")
            const numValue = Number.parseInt(cleanedTxt, 10)
            const valueToUpdate = cleanedTxt === "" || isNaN(numValue) ? null : Math.max(0, numValue)
            updatedRestrictions.min_consumption = valueToUpdate
            if (valueToUpdate !== null && valueToUpdate >= 0) {
              updatedRestrictions.min_consumption_enabled = true
            }
            break
          }
          case "min_bottles": {
            const cleanedTxt = String(rawValue).replace(/[^0-9]/g, "")
            const numValue = Number.parseInt(cleanedTxt, 10)
            const valueToUpdate = cleanedTxt === "" || isNaN(numValue) ? null : Math.max(0, numValue)
            updatedRestrictions.min_bottles = valueToUpdate
            if (valueToUpdate !== null && valueToUpdate >= 0) {
              updatedRestrictions.min_bottles_enabled = true
            }
            break
          }
          default:
            break
        }
        return {
          ...prev,
          [type]: {
            ...current,
            values: { ...current.values, restrictions: updatedRestrictions },
          },
        }
      })
    },
    [],
  )

  const handleEditToggle = useCallback((type: SeatOptionType) => {
    setEditingType((prev) => (prev === type ? null : type))
  }, [])

  const handleSaveChanges = useCallback(() => {
    saveMutation.mutate(localSeatOptions)
  }, [saveMutation, localSeatOptions])

  const handleCancelChanges = useCallback(() => {
    if (seatOptions) {
      resetLocalStateToDbState(seatOptions)
    }
    setEditingType(null)
    Keyboard.dismiss()
  }, [seatOptions, resetLocalStateToDbState])

  const hasPendingChanges = useCallback(() => {
    if (isLoading || !seatOptions || !localSeatOptions) return false
    for (const type of seatOptionTypes) {
      const local = localSeatOptions[type]
      const dbOption = seatOptions.find((opt) => opt.type === type)
      if (local && !dbOption) {
        if (!local.toDelete) return true
      } else if (local && dbOption) {
        if (local.toDelete) return true
        const dbRestrictions = dbOption.restrictions || {}
        const localRestrictions = local.values.restrictions
        const effectiveDbMinConsumption = dbRestrictions.min_consumption ?? null
        const effectiveLocalMinConsumption = getEffectiveMinConsumption(localRestrictions)
        const effectiveDbMinBottles = dbRestrictions.min_bottles ?? null
        const effectiveLocalMinBottles = getEffectiveMinBottles(localRestrictions)
        if (
          (dbOption.available_count ?? 0) !== (local.values.available_count ?? 0) ||
          (dbOption.min_people ?? 0) !== (local.values.min_people ?? 0) ||
          (dbOption.max_people ?? 0) !== (local.values.max_people ?? 0) ||
          dbOption.enabled !== local.values.enabled ||
          (dbRestrictions.require_bottle_drink ?? false) !== localRestrictions.require_bottle_drink ||
          effectiveDbMinConsumption !== effectiveLocalMinConsumption ||
          effectiveDbMinBottles !== effectiveLocalMinBottles
        ) {
          return true
        }
      }
    }
    return false
  }, [isLoading, seatOptions, localSeatOptions])

  const renderSeatOptionCard = useCallback(
    (type: SeatOptionType) => {
      const localOption = localSeatOptions[type]
      const isEnabledLocally = !!localOption?.exists && !localOption?.toDelete
      const isMarkedForDeletion = localOption?.toDelete || false
      const isEditing = editingType === type && isEnabledLocally
      const displayValues = localOption?.values || defaultFormValues(type)
      const typeName = formatTypeName(type)
      const effectiveMinConsumption = getEffectiveMinConsumption(displayValues.restrictions)
      const effectiveMinBottles = getEffectiveMinBottles(displayValues.restrictions)
      const hasUnsavedChangesForType = () => {
        if (!localOption) return false
        const dbOption = seatOptions?.find((opt) => opt.type === type)
        if (localOption.isNew && !localOption.toDelete) return true
        if (localOption.toDelete && !localOption.isNew) return true
        if (!dbOption) return false
        const dbRestrictions = dbOption.restrictions || {}
        const localRestrictions = localOption.values.restrictions
        const effectiveDbMinConsumption = dbRestrictions.min_consumption ?? null
        const localEffectiveMinConsumption = getEffectiveMinConsumption(localRestrictions)
        const effectiveDbMinBottles = dbRestrictions.min_bottles ?? null
        const localEffectiveMinBottles = getEffectiveMinBottles(localRestrictions)
        if (
          (dbOption.available_count ?? 0) !== (localOption.values.available_count ?? 0) ||
          (dbOption.min_people ?? 0) !== (localOption.values.min_people ?? 0) ||
          (dbOption.max_people ?? 0) !== (localOption.values.max_people ?? 0) ||
          dbOption.enabled !== localOption.values.enabled ||
          (dbRestrictions.require_bottle_drink ?? false) !== localRestrictions.require_bottle_drink ||
          effectiveDbMinConsumption !== localEffectiveMinConsumption ||
          effectiveDbMinBottles !== localEffectiveMinBottles
        ) {
          return true
        }
        return false
      }

      const isAvailableCountInvalid =
        isEnabledLocally &&
        displayValues.enabled &&
        (displayValues.available_count === null || displayValues.available_count <= 0)
      const isMaxLessThanMin =
        displayValues.min_people !== null &&
        displayValues.max_people !== null &&
        displayValues.max_people < displayValues.min_people
      const isMinConsumptionInvalid =
        displayValues.restrictions.min_consumption_enabled &&
        (displayValues.restrictions.min_consumption === null || displayValues.restrictions.min_consumption <= 0)
      const isMinBottlesInvalid =
        displayValues.restrictions.min_bottles_enabled &&
        (displayValues.restrictions.min_bottles === null || displayValues.restrictions.min_bottles <= 0)

      return (
        <View
          key={type}
          style={[
            styles.card,
            isEnabledLocally ? styles.enabledCard : styles.disabledCard,
            isMarkedForDeletion && styles.deletedCard,
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleContainer}>
              <Text style={[styles.cardTitle, isMarkedForDeletion && styles.strikethrough]}>{typeName}</Text>
              {isEnabledLocally && hasUnsavedChangesForType() && (
                <View style={styles.unsavedBadge}>
                  <Edit2 size={10} color="#ffffff" style={styles.badgeIcon} />
                  <Text style={styles.unsavedBadgeText}>Unsaved</Text>
                </View>
              )}
              {isMarkedForDeletion && (
                <View style={styles.deleteBadge}>
                  <Text style={styles.deleteBadgeText}>To Delete</Text>
                </View>
              )}
              {isEnabledLocally && !displayValues.enabled && (
                <View style={styles.disabledBadge}>
                  <Text style={styles.disabledBadgeText}>Disabled</Text>
                </View>
              )}
            </View>
            <View style={styles.cardActions}>
              {isEnabledLocally && (
                <TouchableOpacity
                  onPress={() => handleEditToggle(type)}
                  style={styles.editButton}
                  accessibilityLabel={isEditing ? `Hide details for ${typeName}` : `Show details for ${typeName}`}
                >
                  <Animated.View>
                    {isEditing ? <ChevronUp size={20} color="#ff4d6d" /> : <ChevronDown size={20} color="#9ca3af" />}
                  </Animated.View>
                </TouchableOpacity>
              )}
              <Switch
                value={isEnabledLocally}
                onValueChange={() => toggleSeatOption(type)}
                trackColor={{ false: "#2a2a35", true: "#ff4d6d40" }}
                thumbColor={isEnabledLocally ? "#ff4d6d" : "#9ca3af"}
                ios_backgroundColor="#2a2a35"
                disabled={saveMutation.isPending}
                accessibilityLabel={isEnabledLocally ? `Disable seat type ${typeName}` : `Enable seat type ${typeName}`}
              />
            </View>
          </View>

          {isEnabledLocally && !isEditing && (
            <View style={styles.cardSummary}>
              <View style={styles.summaryItem}>
                <Armchair size={14} color="#9ca3af" style={styles.summaryIcon} />
                <Text style={styles.summaryLabel}>Seats:</Text>
                <Text style={[styles.summaryValue, isAvailableCountInvalid && styles.errorValue]}>
                  {displayValues.available_count ?? "0"}
                </Text>
                {isAvailableCountInvalid && <AlertCircle size={12} color="#ff4d6d" style={styles.errorIcon} />}
              </View>
              <View style={styles.summaryItem}>
                <Users size={14} color="#9ca3af" style={styles.summaryIcon} />
                <Text style={styles.summaryLabel}>Min:</Text>
                <Text style={styles.summaryValue}>{displayValues.min_people ?? "0"}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Users size={14} color="#9ca3af" style={styles.summaryIcon} />
                <Text style={styles.summaryLabel}>Max:</Text>
                <Text style={[styles.summaryValue, isMaxLessThanMin && styles.errorValue]}>
                  {displayValues.max_people ?? "0"}
                </Text>
                {isMaxLessThanMin && <AlertCircle size={12} color="#ff4d6d" style={styles.errorIcon} />}
              </View>

              <View style={styles.badgeContainer}>
                {displayValues.restrictions.require_bottle_drink && (
                  <View style={styles.tealBadge}>
                    <Bot size={12} color="#ffffff" style={styles.badgeIcon} />
                    <Text style={styles.tealBadgeText}>Bottle Required</Text>
                  </View>
                )}
                {effectiveMinConsumption && (
                  <View style={styles.yellowBadge}>
                    <Text style={styles.yellowBadgeText}>Min Spend: €{effectiveMinConsumption}</Text>
                  </View>
                )}
                {effectiveMinBottles && (
                  <View style={styles.purpleBadge}>
                    <Package size={12} color="#ffffff" style={styles.badgeIcon} />
                    <Text style={styles.purpleBadgeText}>Min Bottles: {effectiveMinBottles}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {isEditing && (
            <SeatOptionEditForm
              type={type}
              typeName={typeName}
              displayValues={displayValues}
              isAvailableCountInvalid={isAvailableCountInvalid}
              isMaxLessThanMin={isMaxLessThanMin}
              isMinConsumptionInvalid={isMinConsumptionInvalid}
              isMinBottlesInvalid={isMinBottlesInvalid}
              updateFieldValue={updateFieldValue}
              updateRestrictionValue={updateRestrictionValue}
            />
          )}
        </View>
      )
    },
    [
      localSeatOptions,
      editingType,
      seatOptions,
      saveMutation.isPending,
      handleEditToggle,
      toggleSeatOption,
      updateFieldValue,
      updateRestrictionValue,
    ],
  )

  return (
    <View style={styles.container}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={toggleExpansion}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel="Seat Options Section"
        accessibilityHint={isExpanded ? "Tap to collapse" : "Tap to expand"}
      >
        <View style={styles.headerContent}>
          <Armchair size={22} color="#ff4d6d" style={styles.headerIcon} />
          <View>
            <Text style={styles.headerTitle}>Seat Options</Text>
            <Text style={styles.headerSubtitle}>Manage seating types, capacity, and restrictions</Text>
          </View>
        </View>
        <Animated.View style={chevronAnimatedStyle}>
          <ChevronDown size={22} color="#9ca3af" />
        </Animated.View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.content}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollViewContent}
            keyboardShouldPersistTaps="handled"
          >
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#ff4d6d" />
                <Text style={styles.loadingText}>Loading seat options...</Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <AlertCircle size={24} color="#ff4d6d" />
                <Text style={styles.errorTitle}>Error Loading Data</Text>
                <Text style={styles.errorMessage}>{error instanceof Error ? error.message : "Failed to load"}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() =>
                    queryClient.invalidateQueries({
                      queryKey: ["seat-options", barId],
                    })
                  }
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {seatOptionTypes.map((type) => renderSeatOptionCard(type))}
                <View style={styles.scrollPadding} />
              </>
            )}
          </ScrollView>

          {hasPendingChanges() && (
            <View style={styles.actionBar}>
              <TouchableOpacity
                onPress={handleCancelChanges}
                disabled={saveMutation.isPending}
                style={[styles.cancelButton, saveMutation.isPending && styles.disabledButton]}
                accessibilityRole="button"
              >
                <RotateCcw size={16} color="#9ca3af" />
                <Text style={styles.cancelButtonText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveChanges}
                disabled={saveMutation.isPending || isLoading}
                style={[styles.saveButton, (saveMutation.isPending || isLoading) && styles.savingButton]}
                accessibilityRole="button"
              >
                <>
                  {saveMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" style={styles.saveButtonIcon} />
                  ) : (
                    <Save size={16} color="#FFFFFF" style={styles.saveButtonIcon} />
                  )}
                  <Text style={styles.saveButtonText}>{saveMutation.isPending ? "Saving..." : "Save Changes"}</Text>
                </>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

// Styles
const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
    borderRadius: 16,
    backgroundColor: "#1f1f27",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIcon: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 2,
  },
  content: {
    borderTopWidth: 1,
    borderTopColor: "#2a2a35",
  },
  scrollView: {
    maxHeight: 600,
  },
  scrollViewContent: {
    padding: 16,
  },
  scrollPadding: {
    height: Platform.OS === "ios" ? 80 : 60,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#9ca3af",
  },
  errorContainer: {
    backgroundColor: "#2a2a35",
    padding: 16,
    borderRadius: 12,
    margin: 4,
    alignItems: "center",
  },
  errorTitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "600",
    color: "#ff4d6d",
    textAlign: "center",
  },
  errorMessage: {
    marginTop: 4,
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#ff4d6d",
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ffffff",
  },
  card: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  enabledCard: {
    backgroundColor: "#2a2a35",
  },
  disabledCard: {
    backgroundColor: "#2a2a35",
    opacity: 0.7,
  },
  deletedCard: {
    backgroundColor: "#2a2a35",
    opacity: 0.5,
    borderWidth: 1,
    borderColor: "#ff4d6d40",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  cardTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    fontWeight: "600",
    fontSize: 16,
    color: "#ffffff",
    marginRight: 8,
  },
  strikethrough: {
    textDecorationLine: "line-through",
    color: "#9ca3af",
  },
  unsavedBadge: {
    backgroundColor: "#ff4d6d",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginRight: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  unsavedBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#ffffff",
    marginLeft: 4,
  },
  deleteBadge: {
    backgroundColor: "#ff4d6d40",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginRight: 4,
  },
  deleteBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#ff4d6d",
  },
  disabledBadge: {
    backgroundColor: "#ff4d6d20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  disabledBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#ff4d6d",
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  editButton: {
    padding: 8,
    marginRight: 8,
  },
  cardSummary: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    padding: 12,
    backgroundColor: "#1f1f27",
    borderTopWidth: 1,
    borderTopColor: "#2a2a35",
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
    marginBottom: 4,
  },
  summaryIcon: {
    marginRight: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#9ca3af",
    marginRight: 4,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  errorValue: {
    color: "#ff4d6d",
  },
  errorIcon: {
    marginLeft: 4,
  },
  badgeContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    width: "100%",
  },
  tealBadge: {
    backgroundColor: "#ff4d6d",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  tealBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#ffffff",
    marginLeft: 4,
  },
  yellowBadge: {
    backgroundColor: "#ff4d6d40",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
  },
  yellowBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#ff4d6d",
  },
  purpleBadge: {
    backgroundColor: "#ff4d6d40",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  purpleBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#ff4d6d",
    marginLeft: 4,
  },
  badgeIcon: {
    marginRight: 2,
  },
  formContainer: {
    padding: 16,
    backgroundColor: "#1f1f27",
    borderTopWidth: 1,
    borderTopColor: "#2a2a35",
  },
  formSection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: "#2a2a35",
    borderRadius: 8,
  },
  switchContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
    flex: 1,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ffffff",
  },
  helperText: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 6,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ffffff",
    marginBottom: 8,
  },
  inputContainer: {
    backgroundColor: "#1f1f27",
    borderWidth: 1,
    borderColor: "#2a2a35",
    borderRadius: 8,
    overflow: "hidden",
  },
  inputError: {
    borderColor: "#ff4d6d",
  },
  textInput: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: "#ffffff",
    height: 44,
  },
  errorText: {
    fontSize: 12,
    color: "#ff4d6d",
    marginLeft: 4,
  },
  rowContainer: {
    flexDirection: "row",
    marginBottom: 16,
  },
  halfColumn: {
    flex: 1,
    marginRight: 6,
  },
  restrictionsHeader: {
    marginTop: 8,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: "#2a2a35",
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  nestedInput: {
    marginTop: 8,
  },
  nestedInputLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9ca3af",
    marginBottom: 4,
    marginLeft: 4,
  },
  iconMarginRight: {
    marginRight: 8,
  },
  actionBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 16,
    backgroundColor: "#1f1f27",
    borderTopWidth: 1,
    borderTopColor: "#2a2a35",
    paddingBottom: Platform.OS === "ios" ? 20 : 12,
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 12,
  },
  cancelButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "500",
    color: "#9ca3af",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#ff4d6d",
    borderRadius: 8,
  },
  savingButton: {
    backgroundColor: "#ff4d6d",
    opacity: 0.7,
  },
  saveButtonIcon: {
    marginRight: 8,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  disabledButton: {
    opacity: 0.5,
  },
})
