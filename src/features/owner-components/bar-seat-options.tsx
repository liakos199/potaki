"use client"

import { useState, useEffect } from "react"
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Switch, ScrollView } from "react-native"
import { ChevronDown, ChevronUp, Save, AlertCircle, Edit2,RotateCcw } from "lucide-react-native"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "../../lib/supabase"
import { Constants } from "../../lib/database.types"
import { useToast } from "@/src/components/general/Toast"

// --- Types & Schema ---
const seatOptionTypes = Constants.public.Enums.seat_option_type

export type SeatOptionType = (typeof seatOptionTypes)[number]

export type SeatOption = {
  id: string
  bar_id: string
  type: SeatOptionType
  enabled: boolean
  available_count: number
  min_people: number
  max_people: number
}

export type SeatOptionFormValues = {
  type: SeatOptionType
  available_count: number
  min_people: number
  max_people: number
  enabled: boolean
}

export type LocalSeatOption = {
  exists: boolean
  isNew: boolean
  toDelete: boolean
  values: SeatOptionFormValues
  originalId?: string
}

// --- Props ---
type BarSeatOptionsProps = {
  barId: string
  onChange?: () => void
}

export const BarSeatOptions = ({ barId, onChange }: BarSeatOptionsProps): JSX.Element => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editingType, setEditingType] = useState<SeatOptionType | null>(null)

  // State to track local changes before saving
  const [localSeatOptions, setLocalSeatOptions] = useState<Record<SeatOptionType, LocalSeatOption | null>>(
    {} as Record<SeatOptionType, LocalSeatOption | null>,
  )

  // --- Fetch seat options ---
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

  // Initialize local state from database data
  useEffect(() => {
    if (seatOptions) {
      resetLocalStateToDbState(seatOptions)
    }
  }, [seatOptions])

  // Reset local state to match DB state
  const resetLocalStateToDbState = (options: SeatOption[]) => {
    const initialLocalState: Record<SeatOptionType, LocalSeatOption | null> = {} as Record<
      SeatOptionType,
      LocalSeatOption | null
    >

    // Initialize all types as non-existent
    seatOptionTypes.forEach((type) => {
      initialLocalState[type] = null
    })

    // Update with existing options from database
    options.forEach((option) => {
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
        },
      }
    })

    setLocalSeatOptions(initialLocalState)
  }

  // --- Mutations ---
  const saveMutation = useMutation({
    mutationFn: async (options: Record<SeatOptionType, LocalSeatOption | null>) => {
      // Collect operations
      const toCreate: any[] = []
      const toUpdate: { id: string; values: any }[] = []
      const toDelete: string[] = []

      Object.entries(options).forEach(([type, option]) => {
        if (!option) return

        const seatType = type as SeatOptionType

        if (option.isNew && !option.toDelete) {
          // Create new
          toCreate.push({
            bar_id: barId,
            ...option.values,
            type: seatType,
          })
        } else if (!option.isNew && option.toDelete) {
          // Delete existing
          if (option.originalId) {
            toDelete.push(option.originalId)
          }
        } else if (!option.isNew && !option.toDelete) {
          // Update existing
          if (option.originalId) {
            toUpdate.push({
              id: option.originalId,
              values: option.values,
            })
          }
        }
      })

      // Execute operations in parallel
      const operations = []

      if (toCreate.length > 0) {
        operations.push(supabase.from("seat_options").insert(toCreate))
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
        throw new Error(errors.map((e) => e?.message).join(", "))
      }

      return {
        created: toCreate.length,
        updated: toUpdate.length,
        deleted: toDelete.length,
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seat-options", barId] })
      toast.show({
        type: "success",
        text1: "Seat options saved successfully",
      })
      onChange?.()
      setEditingType(null)
    },
    onError: (err: any) => {
      toast.show({ type: "error", text1: "Failed to save seat options", text2: err?.message })
    },
  })

  // --- Handlers ---
  // Toggle option existence locally
  const toggleSeatOption = (type: SeatOptionType) => {
    setLocalSeatOptions((prev) => {
      const current = prev[type]

      if (!current) {
        // Option doesn't exist locally or in DB, create it
        return {
          ...prev,
          [type]: {
            exists: true,
            isNew: true,
            toDelete: false,
            values: {
              type,
              available_count: 0,
              min_people: 1,
              max_people: 1,
              enabled: true,
            },
          },
        }
      } else if (current.exists) {
        // Option exists, mark for deletion if it's in DB, or remove if it's new
        if (current.isNew) {
          // It's new and not saved to DB yet, just remove it
          const newState = { ...prev }
          newState[type] = null
          return newState
        } else {
          // It exists in DB, mark for deletion
          return {
            ...prev,
            [type]: {
              ...current,
              exists: false,
              toDelete: true,
            },
          }
        }
      } else {
        // Option was marked for deletion, unmark it
        return {
          ...prev,
          [type]: {
            ...current,
            exists: true,
            toDelete: false,
          },
        }
      }
    })

    // If enabling a type, start editing it
    setEditingType(type)
  }

  // Update field value locally
  const updateFieldValue = (type: SeatOptionType, field: keyof SeatOptionFormValues, value: any) => {
    setLocalSeatOptions((prev) => {
      const current = prev[type]
      if (!current) return prev

      // Perform validation for min/max people
      let validatedValue = value

      if (field === "min_people" && value > (current.values.max_people || 1)) {
        // If min exceeds max, adjust max to match
        return {
          ...prev,
          [type]: {
            ...current,
            values: {
              ...current.values,
              min_people: value,
              max_people: value,
            },
          },
        }
      }

      if (field === "max_people" && value < (current.values.min_people || 1)) {
        // Invalid: max less than min
        validatedValue = current.values.min_people
      }

      // Ensure numeric fields are always at least their minimum values
      if (field === "available_count" && value < 0) validatedValue = 0
      if (field === "min_people" && value < 1) validatedValue = 1
      if (field === "max_people" && value < 1) validatedValue = 1

      return {
        ...prev,
        [type]: {
          ...current,
          values: {
            ...current.values,
            [field]: validatedValue,
          },
        },
      }
    })
  }

  // Handle edit toggle
  const handleEditToggle = (type: SeatOptionType) => {
    if (editingType === type) {
      setEditingType(null)
    } else {
      setEditingType(type)
    }
  }

  // Handle save all changes
  const handleSaveChanges = () => {
    saveMutation.mutate(localSeatOptions)
  }

  // Handle cancel all changes
  const handleCancelChanges = () => {
    if (seatOptions) {
      resetLocalStateToDbState(seatOptions)
    }
    setEditingType(null)
  }

  // --- Check if there are any pending changes ---
  const hasPendingChanges = () => {
    if (!seatOptions || Object.keys(localSeatOptions).length === 0) return false

    // Check for new or deleted options
    for (const type of seatOptionTypes) {
      const local = localSeatOptions[type]
      const dbOption = seatOptions.find((opt) => opt.type === type)

      // New option
      if (local && local.isNew) return true

      // Deleted option
      if (local && local.toDelete) return true

      // Modified existing option
      if (local && !local.isNew && !local.toDelete && dbOption) {
        if (
          dbOption.available_count !== local.values.available_count ||
          dbOption.min_people !== local.values.min_people ||
          dbOption.max_people !== local.values.max_people ||
          dbOption.enabled !== local.values.enabled
        ) {
          return true
        }
      }
    }

    return false
  }

  // Format type name for display
  const formatTypeName = (type: string): string => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  // --- Render Each Seat Option Type ---
  const renderSeatOptionCard = (type: SeatOptionType) => {
    const localOption = localSeatOptions[type]

    // Determine if this option is active based on local state
    const isEnabled = localOption?.exists || false
    const isEditing = editingType === type

    // Get values to display - either from local state or default
    const displayValues = localOption?.values || {
      type,
      available_count: 0,
      min_people: 1,
      max_people: 1,
      enabled: true,
    }

    // Determine if this option has unsaved changes
    const hasUnsavedChanges = () => {
      if (!localOption) return false
      if (localOption.isNew) return true
      if (localOption.toDelete) return true

      const dbOption = seatOptions?.find((opt) => opt.type === type)
      if (dbOption && !localOption.toDelete) {
        return (
          dbOption.available_count !== localOption.values.available_count ||
          dbOption.min_people !== localOption.values.min_people ||
          dbOption.max_people !== localOption.values.max_people ||
          dbOption.enabled !== localOption.values.enabled
        )
      }

      return false
    }

    return (
      <View
        key={type}
        className={`bg-white rounded-lg border border-slate-200 mb-3 overflow-hidden shadow-sm ${isEnabled ? "" : "opacity-70 bg-slate-50"}`}
      >
        {/* Header with Type and Toggle */}
        <View className="flex-row items-center justify-between p-3 border-b border-slate-100">
          <View className="flex-row items-center flex-wrap">
            <Text className="font-semibold text-slate-900 text-base mr-2">{formatTypeName(type)}</Text>

            {hasUnsavedChanges() && (
              <View className="bg-amber-100 px-2 py-0.5 rounded-full mr-1">
                <Text className="text-xs font-medium text-amber-800">Unsaved</Text>
              </View>
            )}

            {isEnabled && !displayValues.enabled && (
              <View className="bg-red-100 px-2 py-0.5 rounded-full">
                <Text className="text-xs font-medium text-red-800">Disabled</Text>
              </View>
            )}
          </View>

          <View className="flex-row items-center">
            {isEnabled && (
              <TouchableOpacity
                onPress={() => handleEditToggle(type)}
                className="p-2 mr-2"
                accessibilityLabel={isEditing ? "Hide details" : "Show details"}
              >
                {isEditing ? <ChevronUp size={20} color="#0891b2" /> : <ChevronDown size={20} color="#0891b2" />}
              </TouchableOpacity>
            )}

            <Switch
              value={isEnabled}
              onValueChange={() => toggleSeatOption(type)}
              accessibilityLabel={isEnabled ? "Enabled" : "Disabled"}
              trackColor={{ false: "#e2e8f0", true: "#bae6fd" }}
              thumbColor={isEnabled ? "#0891b2" : "#94a3b8"}
            />
          </View>
        </View>

        {/* Brief info for enabled but not editing */}
        {isEnabled && !isEditing && (
          <View className="flex-row items-center p-3 bg-slate-50">
            <View className="flex-row items-center">
              <Text className="text-sm text-slate-500 mr-1">Available:</Text>
              <Text className="text-sm font-semibold text-slate-900">{displayValues.available_count}</Text>
            </View>

            <View className="w-px h-4 bg-slate-200 mx-3" />

            <View className="flex-row items-center">
              <Text className="text-sm text-slate-500 mr-1">Min:</Text>
              <Text className="text-sm font-semibold text-slate-900">{displayValues.min_people}</Text>
            </View>

            <View className="w-px h-4 bg-slate-200 mx-3" />

            <View className="flex-row items-center">
              <Text className="text-sm text-slate-500 mr-1">Max:</Text>
              <Text className="text-sm font-semibold text-slate-900">{displayValues.max_people}</Text>
            </View>

            {hasUnsavedChanges() && (
              <View className="ml-auto bg-cyan-100 rounded-full w-6 h-6 items-center justify-center">
                <Edit2 size={14} color="#0891b2" />
              </View>
            )}
          </View>
        )}

        {/* Form for editing */}
        {isEnabled && isEditing && (
          <View className="p-3 bg-slate-50">
            {/* Temporary Disable Switch */}
            <View className="flex-row items-center justify-between mb-3 p-2 bg-white rounded-lg border border-slate-200">
              <Text className="text-sm font-medium text-slate-700">Temporarily Disable</Text>
              <Switch
                value={!displayValues.enabled}
                onValueChange={(value) => updateFieldValue(type, "enabled", !value)}
                trackColor={{ false: "#bae6fd", true: "#fecaca" }}
                thumbColor={!displayValues.enabled ? "#ef4444" : "#0891b2"}
              />
            </View>

            {/* Available Count */}
            <View className="mb-3">
              <Text className="text-sm font-medium text-slate-700 mb-1">Available Count</Text>
              <View className="bg-white border border-slate-300 rounded-lg overflow-hidden">
                <TextInput
                  className="px-3 py-2 text-base text-slate-900"
                  keyboardType="numeric"
                  value={displayValues.available_count.toString()}
                  onChangeText={(txt) => {
                    const numValue = Number(txt.replace(/[^0-9]/g, ""))
                    updateFieldValue(type, "available_count", numValue)
                  }}
                  placeholder="0"
                />
              </View>
            </View>

            {/* Min/Max People */}
            <View className="flex-row space-x-2 mb-3">
              <View className="flex-1">
                <Text className="text-sm font-medium text-slate-700 mb-1">Min People</Text>
                <View className="bg-white border border-slate-300 rounded-lg overflow-hidden">
                  <TextInput
                    className="px-3 py-2 text-base text-slate-900"
                    keyboardType="numeric"
                    value={displayValues.min_people.toString()}
                    onChangeText={(txt) => {
                      const numValue = Number(txt.replace(/[^0-9]/g, ""))
                      updateFieldValue(type, "min_people", numValue || 1)
                    }}
                    placeholder="1"
                  />
                </View>
              </View>

              <View className="flex-1">
                <Text className="text-sm font-medium text-slate-700 mb-1">Max People</Text>
                <View className="bg-white border border-slate-300 rounded-lg overflow-hidden">
                  <TextInput
                    className="px-3 py-2 text-base text-slate-900"
                    keyboardType="numeric"
                    value={displayValues.max_people.toString()}
                    onChangeText={(txt) => {
                      const numValue = Number(txt.replace(/[^0-9]/g, ""))
                      updateFieldValue(type, "max_people", numValue || 1)
                    }}
                    placeholder="1"
                  />
                </View>
              </View>
            </View>
          </View>
        )}
      </View>
    )
  }

  // --- Main Render ---
  return (
    <View className="flex-1 bg-slate-50 rounded-xl overflow-hidden">
      {/* Header */}
      <View className="p-4 bg-white border-b border-slate-200 flex-row justify-between items-center">
        <View>
          <Text className="text-xl font-bold text-slate-900">Seat Options</Text>
          <Text className="text-sm text-slate-500 mt-1">Configure available seating options for your bar</Text>
        </View>

         
      </View>

      {/* Content */}
      <ScrollView className="flex-1 p-3">
        {isLoading ? (
          <View className="items-center justify-center py-10">
            <ActivityIndicator size="large" color="#0891b2" />
            <Text className="mt-3 text-sm text-slate-500">Loading seat options...</Text>
          </View>
        ) : error ? (
          <View className="bg-red-50 p-6 rounded-lg m-3 items-center">
            <AlertCircle size={24} color="#ef4444" />
            <Text className="mt-3 text-sm text-red-700 text-center">
              {error instanceof Error ? error.message : "Failed to load seat options"}
            </Text>
            <TouchableOpacity
              className="mt-4 px-4 py-2 bg-white border border-red-400 rounded-lg"
              onPress={() => queryClient.invalidateQueries({ queryKey: ["seat-options", barId] })}
            >
              <Text className="text-sm font-medium text-red-600">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Always render all option types */}
            {seatOptionTypes.map((type) => renderSeatOptionCard(type))}
          </>
        )}
      </ScrollView>

      {/* Save/Cancel Action Bar */}
      {hasPendingChanges() && (
        <View className="flex-row justify-end p-3 bg-white border-t border-slate-200">
          <TouchableOpacity
            onPress={handleCancelChanges}
            disabled={saveMutation.isPending}
            className="flex-row items-center px-4 py-2.5 bg-white border border-slate-300 rounded-lg mr-2"
          >
            <RotateCcw size={16} color="#64748b" />
            <Text className="ml-1.5 text-sm font-medium text-slate-600">Revert</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSaveChanges}
            disabled={saveMutation.isPending}
            className={`flex-row items-center px-4 py-2.5 rounded-lg ${
              saveMutation.isPending ? "bg-cyan-400" : "bg-cyan-600"
            }`}
          >
            {saveMutation.isPending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Save size={16} color="#ffffff" />
                <Text className="ml-1.5 text-sm font-medium text-white">Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}
