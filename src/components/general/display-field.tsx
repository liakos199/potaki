"use client"

import React from "react"
import { View, Text, TouchableOpacity } from "react-native"
// Import necessary icons
import { Edit3, AlertTriangle, Plus } from "lucide-react-native"

type DisplayFieldProps = {
  label: string
  // Keep the original value type
  value: string | number | boolean | null | undefined
  onEditPress: () => void
  isEditable?: boolean
  // Keep the original formatValue type signature
  formatValue?: (value: string | number | boolean | null | undefined) => string
}

const DisplayField: React.FC<DisplayFieldProps> = ({ label, value, onEditPress, isEditable = true, formatValue }) => {
  // Determine if the field is considered empty BEFORE formatting
  const isEmptyOrNull = value === null || value === undefined || value === "";

  const displayValue = React.useMemo((): string => {
    // Apply formatting if provided
    if (formatValue) {
      // Pass the original value to the formatter
      return formatValue(value)
    }
    // Default formatting based on the original value
    if (isEmptyOrNull) {
      return "Not set" // Keep this default text for empty values
    }
    if (typeof value === "boolean") {
      return value ? "Live" : "Not Live"
    }
    return String(value) // Convert non-empty, non-boolean to string
  }, [value, formatValue, isEmptyOrNull]) // Add isEmptyOrNull to dependency array

  const isLiveStatus = label.toLowerCase() === "status" && typeof value === "boolean"

  // Determine icon and accessibility label based on emptiness
  const EditIcon = isEmptyOrNull ? Plus : Edit3;
  const accessibilityActionLabel = isEmptyOrNull ? `Add ${label}` : `Edit ${label}`;

  return (
    <View className="mb-4 flex-row justify-between items-start bg-[#2a2a35] p-3 rounded-xl">
      <View className="flex-1 mr-2">
        {/* Label Row with conditional warning icon */}
        <View className="flex-row items-center mb-1">
          {isEmptyOrNull && (
            <AlertTriangle size={12} className="text-yellow-400 mr-1.5" />
          )}
          <Text className="text-xs text-gray-400">{label}</Text>
        </View>

        {/* Value Display */}
        {isLiveStatus ? (
          <View className="flex-row items-center">
            <View className={`w-2 h-2 rounded-full mr-1.5 ${value ? "bg-green-500" : "bg-red-500"}`} />
            <Text className={`text-sm font-medium ${value ? "text-green-400" : "text-red-400"}`}>{displayValue}</Text>
          </View>
        ) : (
          <Text
            // Adjust styling based on the original check for emptiness
            className={`text-sm text-white leading-snug ${isEmptyOrNull ? "text-gray-500 italic" : ""}`}
          >
            {displayValue}
          </Text>
        )}
      </View>

      {/* Editable Button with conditional icon */}
      {isEditable && (
        <TouchableOpacity
          onPress={onEditPress}
          className="p-2 rounded-full bg-[#3a3a45] active:bg-[#4a4a55] -mr-1"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={accessibilityActionLabel} // Use dynamic label
        >
          <EditIcon size={16} className="text-[#ff4d6d]" />
        </TouchableOpacity>
      )}
    </View>
  )
}

export default DisplayField