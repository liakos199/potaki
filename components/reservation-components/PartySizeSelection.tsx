// PartySizeSelection.tsx (Improved Version)

import React, { useEffect, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Minus, Plus, Info, Sofa } from 'lucide-react-native'; // Assuming lucide-react-native

// --- Props Definition ---
type PartySizeSelectionProps = {
  /** The currently selected party size, or null if none selected yet. */
  selectedPartySize: number | null;
  /** Callback function when the party size changes. */
  onPartySizeChange: (size: number) => void;
  /** The minimum number of people allowed (can be 0). */
  minSize: number;
  /** The maximum number of people allowed. */
  maxSize: number;
  /** Optional label for the selected seat type (e.g., "Bar Stool", "Booth"). */
  selectedSeatTypeLabel?: string | null; // Made optional
  /** Optional: Maximum number to show as a quick button */
  maxQuickButtonValue?: number;
};

// --- Constants ---
const DEFAULT_MAX_QUICK_BUTTON_VALUE = 6; // Show quick buttons up to 6 by default

const PartySizeSelection: React.FC<PartySizeSelectionProps> = ({
  selectedPartySize,
  onPartySizeChange,
  minSize,
  maxSize,
  selectedSeatTypeLabel = null, // Default value
  maxQuickButtonValue = DEFAULT_MAX_QUICK_BUTTON_VALUE,
}) => {
  // --- Input Validation & Derived State ---

  // Validate min/max props early
  const areBoundsValid = useMemo(() => {
      const valid = typeof minSize === 'number' && !isNaN(minSize) &&
             typeof maxSize === 'number' && !isNaN(maxSize) &&
             minSize <= maxSize &&
             maxSize > 0; // Max size must be at least 1 for a selection to be possible
      if (!valid) {
          console.warn(`PartySizeSelection: Invalid min/max props received (${minSize}, ${maxSize}). Defaulting might occur.`);
      }
      return valid;
  }, [minSize, maxSize]);

  // Determine the effective minimum size for UI interaction (must be at least 1)
  const effectiveMinSize = useMemo(() => {
      // If bounds are invalid, default to 1 to prevent errors
      if (!areBoundsValid) return 1;
      // Treat minSize 0 as 1 for selection purposes
      return Math.max(1, minSize);
  }, [minSize, areBoundsValid]);

  // Use the valid maxSize, or default to effectiveMinSize if bounds were invalid
  const effectiveMaxSize = useMemo(() => {
      if (!areBoundsValid) return effectiveMinSize; // Ensure max >= min
      return maxSize;
  }, [maxSize, effectiveMinSize, areBoundsValid]);


  // --- Effect for Initialization and Clamping ---
  useEffect(() => {
    // Only run logic if bounds are valid
    if (!areBoundsValid) {
        // If bounds invalid and nothing selected, try setting to 1
        if (selectedPartySize === null) {
            onPartySizeChange(1);
        }
        return;
    }

    let targetSize = selectedPartySize;

    if (targetSize === null) {
      // Initialize to effectiveMinSize if null
      targetSize = effectiveMinSize;
    } else {
      // Clamp existing selection between effectiveMinSize and effectiveMaxSize
      targetSize = Math.max(effectiveMinSize, Math.min(targetSize, effectiveMaxSize));
    }

    // Only call onPartySizeChange if the value needs to be updated
    if (targetSize !== selectedPartySize) {
      onPartySizeChange(targetSize);
    }
  // Rerun if bounds change, validity changes, or selection becomes null externally
  }, [effectiveMinSize, effectiveMaxSize, selectedPartySize, onPartySizeChange, areBoundsValid]);

  // --- Event Handlers ---
  const handleIncrement = () => {
    // Use effectiveMinSize as fallback if selectedPartySize is somehow null
    const currentSize = selectedPartySize ?? effectiveMinSize;
    if (currentSize < effectiveMaxSize) {
      onPartySizeChange(currentSize + 1);
    }
  };

  const handleDecrement = () => {
    // Decrement is only possible if a size is selected
    if (selectedPartySize && selectedPartySize > effectiveMinSize) {
      onPartySizeChange(selectedPartySize - 1);
    }
  };

  // --- Quick Selection Button Generation ---
  // Generate quick buttons from 1 up to maxQuickButtonValue
  const quickButtonSizes = useMemo(() => {
      const buttons: number[] = [];
      for (let i = 1; i <= maxQuickButtonValue; i++) {
          buttons.push(i);
      }
      return buttons;
  }, [maxQuickButtonValue]);


  // --- Display Logic ---
  // Display the selected size, falling back to effectiveMinSize if null (should be handled by useEffect)
  const displayPartySize = selectedPartySize ?? effectiveMinSize;

  // Determine if buttons should be disabled based on effective bounds
  const isDecrementDisabled = !selectedPartySize || selectedPartySize <= effectiveMinSize;
  const isIncrementDisabled = !selectedPartySize || selectedPartySize >= effectiveMaxSize;

  // Helper text for large ranges
  const showAdjusterHint = effectiveMaxSize > maxQuickButtonValue;

  // --- Render ---
  return (
    <View className="mb-6">
      {/* Title Area */}
      <View className="mb-4">
         <Text className="text-lg font-semibold text-white">How many guests?</Text>
         {selectedSeatTypeLabel && (
             <View className="flex-row items-center mt-1 opacity-80">
                 <View className="mr-1.5">
                     <Sofa size={14} color="#a0a0a0" />
                 </View>
                 <Text className="text-sm text-gray-400">
                     For selected seating: <Text className="font-medium text-gray-300">{selectedSeatTypeLabel}</Text>
                 </Text>
             </View>
         )}
      </View>

      {/* Quick selection buttons */}
      <View className="flex-row flex-wrap mb-6 justify-start">
        {quickButtonSizes.map((size) => {
          // A quick button is disabled if it's outside the *effective* allowed range
          const isQuickButtonDisabled = !areBoundsValid || size < effectiveMinSize || size > effectiveMaxSize;
          const isSelected = areBoundsValid && selectedPartySize === size;

          return (
            <Pressable
              key={size}
              disabled={isQuickButtonDisabled}
              // Apply Tailwind classes conditionally
              className={`
                mr-3 mb-3 px-5 py-3 rounded-xl transition-colors duration-150 ease-in-out
                ${isSelected ? 'bg-[#ff4d6d]' : 'bg-[#1f1f27]'}
                ${isQuickButtonDisabled ? 'opacity-40 bg-gray-700/30' : ''}
                ${!isQuickButtonDisabled && !isSelected ? 'active:bg-[#2a2a33]' : ''}
              `}
              onPress={() => { if (!isQuickButtonDisabled) { onPartySizeChange(size); } }}
            >
              <Text className={`
                text-center font-medium
                ${isSelected ? 'text-white' : ''}
                ${!isSelected && isQuickButtonDisabled ? 'text-gray-500' : ''}
                ${!isSelected && !isQuickButtonDisabled ? 'text-gray-300' : ''}
              `}>
                {size}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Manual Adjuster */}
      <View className="bg-[#1f1f27] p-4 rounded-xl">
        <View className="flex-row items-center justify-between">
           {/* Decrement Button */}
           <Pressable
             className={`w-12 h-12 rounded-full bg-[#2a2a35] items-center justify-center transition-opacity duration-150 ease-in-out ${isDecrementDisabled ? 'opacity-50' : 'active:bg-[#3a3a45]'}`}
             onPress={handleDecrement}
             disabled={isDecrementDisabled}
            >
             <Minus size={20} color={isDecrementDisabled ? "#666777" : "#ffffff"} /> {/* Adjusted disabled color */}
          </Pressable>

          {/* Display Value */}
          <View className="bg-[#2a2a35] min-w-[70px] px-6 py-3 rounded-xl items-center">
            {/* Show the effective size, ensure it's valid before rendering */}
            <Text className="text-white text-xl font-bold text-center">
                {areBoundsValid ? displayPartySize : '-'}
            </Text>
          </View>

          {/* Increment Button */}
          <Pressable
            className={`w-12 h-12 rounded-full bg-[#2a2a35] items-center justify-center transition-opacity duration-150 ease-in-out ${isIncrementDisabled ? 'opacity-50' : 'active:bg-[#3a3a45]'}`}
            onPress={handleIncrement}
            disabled={isIncrementDisabled}
          >
             <Plus size={20} color={isIncrementDisabled ? "#666777" : "#ffffff"} /> {/* Adjusted disabled color */}
          </Pressable>
        </View>
        {/* Optional hint for large ranges */}
        {showAdjusterHint && areBoundsValid && (
            <Text className="text-xs text-gray-400 text-center mt-3">
                Use +/- buttons to select sizes above {maxQuickButtonValue}.
            </Text>
        )}
      </View>

      {/* Informational Text */}
      {areBoundsValid && ( // Only show info if bounds are valid
          <View className="bg-[#ff4d6d]/10 p-4 rounded-xl mt-4 flex-row items-start">
            <View className="mr-2 mt-0.5 flex-shrink-0">
  <Info size={18} color="#ff4d6d" />
</View>
            <Text className="text-gray-300 text-sm flex-1">
               Party size must be between <Text className="font-bold">{effectiveMinSize}</Text> and <Text className="font-bold">{effectiveMaxSize}</Text> for the selected seating.
            </Text>
          </View>
      )}
       {!areBoundsValid && ( // Show error if bounds are invalid
          <View className="bg-yellow-900/30 border border-yellow-700 p-4 rounded-xl mt-4 flex-row items-start">
            <View className="mr-2 mt-0.5 flex-shrink-0">
  <Info size={18} color="#ff4d6d" />
</View>
            <Text className="text-yellow-300 text-sm flex-1">
               Seating capacity information is currently unavailable or invalid. Defaulting to 1 guest.
            </Text>
          </View>
      )}
    </View>
  );
};

export default PartySizeSelection;