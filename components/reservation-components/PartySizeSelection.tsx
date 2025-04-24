// PartySizeSelection.tsx (Corrected - includes display for seat type)

import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
// Import Sofa or relevant icon if you want an icon next to the selected type
import { Minus, Plus, Info, Sofa } from 'lucide-react-native';

// Define the props the component expects
type PartySizeSelectionProps = {
  selectedPartySize: number | null;
  onPartySizeChange: (size: number) => void;
  minSize: number;
  maxSize: number;
  selectedSeatTypeLabel: string | null; // Added prop for display
};

const PartySizeSelection: React.FC<PartySizeSelectionProps> = ({
  selectedPartySize,
  onPartySizeChange,
  minSize,
  maxSize,
  selectedSeatTypeLabel // Destructure the new prop
}) => {

  // --- Effect to adjust selection (Keep as is) ---
  useEffect(() => {
    // Validate min/max props
    if (typeof minSize !== 'number' || isNaN(minSize) || typeof maxSize !== 'number' || isNaN(maxSize) || minSize > maxSize) {
      console.warn(`PartySizeSelection: Invalid min/max props (${minSize}, ${maxSize})`);
      if (selectedPartySize === null) onPartySizeChange(1); // Default if bounds invalid
      return;
    }

    if (selectedPartySize !== null) {
      // Clamp existing selection
      const clampedSize = Math.max(minSize, Math.min(selectedPartySize, maxSize));
      if (clampedSize !== selectedPartySize) {
        onPartySizeChange(clampedSize);
      }
    } else {
      // Initialize to minSize if null
      onPartySizeChange(minSize);
    }
  }, [minSize, maxSize, selectedPartySize, onPartySizeChange]); // Rerun if bounds change

  // --- Increment/Decrement Handlers (Keep as is) ---
  const handleIncrement = () => {
    const currentSize = selectedPartySize ?? minSize -1;
    if (currentSize < maxSize) {
      onPartySizeChange(currentSize + 1);
    }
  };

  const handleDecrement = () => {
    if (selectedPartySize && selectedPartySize > minSize) {
      onPartySizeChange(selectedPartySize - 1);
    }
  };

  // --- Static Quick Selection Sizes (Keep as is) ---
  const quickButtonSizes = [1, 2, 3, 4, 5, 6];

  // --- Display Value and Button Disabled Logic (Keep as is) ---
  const displayPartySize = selectedPartySize ?? minSize;
  const isDecrementDisabled = !selectedPartySize || selectedPartySize <= minSize;
  const isIncrementDisabled = !selectedPartySize || selectedPartySize >= maxSize;

  return (
    <View className="mb-6">
      {/* --- Title Area - ADDED display for selected seat type --- */}
      <View className="mb-4">
         <Text className="text-lg font-semibold text-white">How many guests?</Text>
         {/* Display Selected Seat Type if available */}
         {selectedSeatTypeLabel && (
             <View className="flex-row items-center mt-1 opacity-80">
                 {/* Optional: Add Sofa icon */}
                 <Sofa size={14} color="#a0a0a0" className="mr-1.5" />
                 <Text className="text-sm text-gray-400">
                     For selected seating: <Text className="font-medium text-gray-300">{selectedSeatTypeLabel}</Text>
                 </Text>
             </View>
         )}
      </View>


      {/* Quick selection buttons (Keep as is) */}
      <View className="flex-row flex-wrap mb-6 justify-start">
        {quickButtonSizes.map((size) => {
          const isQuickButtonDisabled = size < minSize || size > maxSize;
          const isSelected = selectedPartySize === size;
          return (
            <Pressable
              key={size}
              disabled={isQuickButtonDisabled}
              className={`mr-3 mb-3 px-5 py-3 rounded-xl ${isSelected ? 'bg-[#ff4d6d]' : 'bg-[#1f1f27]'} ${isQuickButtonDisabled ? 'opacity-40 bg-gray-700/30' : ''} ${!isQuickButtonDisabled && !isSelected ? 'active:bg-[#2a2a33]' : ''}`}
              onPress={() => { if (!isQuickButtonDisabled) { onPartySizeChange(size) } }}
            >
              <Text className={`text-center font-medium ${isSelected ? 'text-white' : ''} ${!isSelected && isQuickButtonDisabled ? 'text-gray-500' : ''} ${!isSelected && !isQuickButtonDisabled ? 'text-gray-300' : ''}`}>
                {size}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Manual Adjuster (Keep as is) */}
      <View className="bg-[#1f1f27] p-4 rounded-xl">
        <Text className="text-white mb-3">Adjust party size</Text>
        <View className="flex-row items-center justify-between">
          <Pressable className={`w-12 h-12 rounded-full bg-[#2a2a35] items-center justify-center ${isDecrementDisabled ? 'opacity-50' : 'active:bg-[#3a3a45]'}`} onPress={handleDecrement} disabled={isDecrementDisabled}>
             <Minus size={20} color={isDecrementDisabled ? "#667" : "#fff"} />
          </Pressable>
          <View className="bg-[#2a2a35] min-w-[70px] px-6 py-3 rounded-xl items-center">
            <Text className="text-white text-xl font-bold text-center">{displayPartySize}</Text>
          </View>
          <Pressable className={`w-12 h-12 rounded-full bg-[#2a2a35] items-center justify-center ${isIncrementDisabled ? 'opacity-50' : 'active:bg-[#3a3a45]'}`} onPress={handleIncrement} disabled={isIncrementDisabled}>
             <Plus size={20} color={isIncrementDisabled ? "#666" : "#fff"} />
          </Pressable>
        </View>
      </View>

      {/* Informational Text (Keep as is) */}
      <View className="bg-[#ff4d6d]/10 p-4 rounded-xl mt-4 flex-row items-start">
        <Info size={18} color="#ff4d6d" className="mr-2 mt-0.5 flex-shrink-0" />
        <Text className="text-gray-300 text-sm flex-1">
           Party size must be between <Text className="font-bold">{minSize}</Text> and <Text className="font-bold">{maxSize}</Text> for the selected seating.
        </Text>
      </View>
    </View>
  );
};

export default PartySizeSelection;