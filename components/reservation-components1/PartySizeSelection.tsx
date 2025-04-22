import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Users, Minus, Plus } from 'lucide-react-native';

type PartySizeSelectionProps = {
  selectedPartySize: number | null;
  onPartySizeChange: (size: number) => void;
};

const PartySizeSelection: React.FC<PartySizeSelectionProps> = ({ 
  selectedPartySize, 
  onPartySizeChange 
}) => {
  const handleIncrement = () => {
    if (selectedPartySize === null) {
      onPartySizeChange(1);
    } else if (selectedPartySize < 20) {
      onPartySizeChange(selectedPartySize + 1);
    }
  };
  
  const handleDecrement = () => {
    if (selectedPartySize && selectedPartySize > 1) {
      onPartySizeChange(selectedPartySize - 1);
    }
  };
  
  const partySizes = [1, 2, 4, 6, 8, 10];
  
  return (
    <View className="mb-6">
      <Text className="text-lg font-semibold text-white mb-4">How many people?</Text>
      
      {/* Quick selection buttons */}
      <View className="flex-row flex-wrap mb-6">
        {partySizes.map((size) => (
          <Pressable
            key={size}
            className={`mr-3 mb-3 px-5 py-3 rounded-xl ${
              selectedPartySize === size 
                ? 'bg-[#ff4d6d]' 
                : 'bg-[#1f1f27]'
            }`}
            onPress={() => onPartySizeChange(size)}
          >
            <Text className={`text-center ${
              selectedPartySize === size 
                ? 'text-white font-medium' 
                : 'text-gray-300'
            }`}>
              {size}
            </Text>
          </Pressable>
        ))}
      </View>
      
      {/* Custom number selector */}
      <View className="bg-[#1f1f27] p-4 rounded-xl">
        <Text className="text-white mb-3">Custom party size</Text>
        <View className="flex-row items-center justify-between">
          <Pressable
            className="w-12 h-12 rounded-full bg-[#2a2a35] items-center justify-center"
            onPress={handleDecrement}
            disabled={!selectedPartySize || selectedPartySize <= 1}
          >
            <Minus size={20} color={!selectedPartySize || selectedPartySize <= 1 ? "#666" : "#fff"} />
          </Pressable>
          
          <View className="bg-[#2a2a35] px-6 py-3 rounded-xl">
            <Text className="text-white text-xl font-bold text-center">
              {selectedPartySize || 0}
            </Text>
          </View>
          
          <Pressable
            className="w-12 h-12 rounded-full bg-[#2a2a35] items-center justify-center"
            onPress={handleIncrement}
            disabled={selectedPartySize === 20}
          >
            <Plus size={20} color={selectedPartySize === 20 ? "#666" : "#fff"} />
          </Pressable>
        </View>
      </View>
      
      <View className="bg-[#ff4d6d]/10 p-4 rounded-xl mt-4 flex-row items-start">
        <Users size={18} color="#ff4d6d" className="mr-2 mt-0.5" />
        <Text className="text-gray-300 flex-1">
          Some seating types may have restrictions on party size. VIP areas require a minimum of 4 people.
        </Text>
      </View>
    </View>
  );
};

export default PartySizeSelection;