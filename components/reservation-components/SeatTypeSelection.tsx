import React from 'react';
import { View, Text, Pressable, Image } from 'react-native'; // Note: Image is imported but not used, consider removing if not needed.
import { Sofa, Users, Crown } from 'lucide-react-native';

type SeatTypeSelectionProps = {
  selectedSeatType: 'table' | 'bar' | 'vip' | null;
  onSeatTypeChange: (seatType: 'table' | 'bar' | 'vip') => void;
};

const SeatTypeSelection: React.FC<SeatTypeSelectionProps> = ({
  selectedSeatType,
  onSeatTypeChange
}) => {
  return (
    <View className="mb-6">
      <Text className="text-lg font-semibold text-white mb-4">Select Seating Type</Text>

      {/* Table Selection */}
      <Pressable
        className={`mb-4 p-4 rounded-xl border ${
          selectedSeatType === 'table'
            ? 'border-[#ff4d6d] bg-[#ff4d6d]/10'
            : 'border-[#2a2a35] bg-[#1f1f27]'
        }`}
        onPress={() => onSeatTypeChange('table')}
      >
        <View className="flex-row items-center mb-2">
          <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${ // Added mr-3 for spacing
            selectedSeatType === 'table' ? 'bg-[#ff4d6d]' : 'bg-[#2a2a35]'
          }`}>
            <Sofa size={20} color={selectedSeatType === 'table' ? "#fff" : "#9ca3af"} />
          </View>
          {/* Added a View to wrap the texts for better layout control */}
          <View className="flex-1">
            <Text className={`text-lg font-medium ${
              selectedSeatType === 'table' ? 'text-white' : 'text-white' // Both conditions result in text-white, could simplify
            }`}>
              Table
            </Text>
            <Text className="text-gray-400 mt-1">
              Standard table seating for your party
            </Text>
          </View>
        </View>
      </Pressable>

      {/* Bar Selection */}
      <Pressable
        className={`mb-4 p-4 rounded-xl border ${
          selectedSeatType === 'bar'
            ? 'border-[#ff4d6d] bg-[#ff4d6d]/10'
            : 'border-[#2a2a35] bg-[#1f1f27]'
        }`}
        onPress={() => onSeatTypeChange('bar')}
      >
        <View className="flex-row items-center mb-2">
          <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${ // Added mr-3 for spacing
            selectedSeatType === 'bar' ? 'bg-[#ff4d6d]' : 'bg-[#2a2a35]'
          }`}>
            <Users size={20} color={selectedSeatType === 'bar' ? "#fff" : "#9ca3af"} />
          </View>
          {/* Added a View to wrap the texts */}
          <View className="flex-1">
            <Text className={`text-lg font-medium ${
              selectedSeatType === 'bar' ? 'text-white' : 'text-white' // Both conditions result in text-white, could simplify
            }`}>
              Bar
            </Text>
            <Text className="text-gray-400 mt-1">
              Seating at the bar counter
            </Text>
          </View>
        </View> {/* Corrected closing tag */}
      </Pressable>

      {/* VIP Selection */}
      <Pressable
        className={`mb-4 p-4 rounded-xl border ${
          selectedSeatType === 'vip'
            ? 'border-[#ff4d6d] bg-[#ff4d6d]/10'
            : 'border-[#2a2a35] bg-[#1f1f27]'
        }`}
        onPress={() => onSeatTypeChange('vip')}
      >
        <View className="flex-row items-center mb-2">
          <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${ // Added mr-3 for spacing
            selectedSeatType === 'vip' ? 'bg-[#ff4d6d]' : 'bg-[#2a2a35]'
          }`}>
            <Crown size={20} color={selectedSeatType === 'vip' ? "#fff" : "#9ca3af"} />
          </View>
          {/* Added a View to wrap the texts */}
          <View className="flex-1">
            <Text className={`text-lg font-medium ${
              selectedSeatType === 'vip' ? 'text-white' : 'text-white' // Both conditions result in text-white, could simplify
            }`}>
              VIP
            </Text>
            <Text className="text-gray-400 mt-1">
              Premium seating in a private area
            </Text>
          </View>
        </View> {/* Corrected closing tag */}
      </Pressable>

      {/* Info Section */}
      <View className="bg-[#1f1f27] p-4 rounded-xl mt-2">
        <Text className="text-gray-300">
          VIP seating includes priority service, complimentary welcome drinks, and a dedicated server for your party.
        </Text>
      </View>
    </View>
  );
};

export default SeatTypeSelection;