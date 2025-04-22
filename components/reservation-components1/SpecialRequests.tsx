import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { MessageSquare } from 'lucide-react-native';

type SpecialRequestsProps = {
  specialRequests: string;
  onSpecialRequestsChange: (text: string) => void;
};

const SpecialRequests: React.FC<SpecialRequestsProps> = ({ 
  specialRequests, 
  onSpecialRequestsChange 
}) => {
  return (
    <View className="mb-6">
      <Text className="text-lg font-semibold text-white mb-2">Special Requests (Optional)</Text>
      <Text className="text-gray-400 mb-4">
        Let us know if you have any special requirements or preferences
      </Text>
      
      <View className="bg-[#1f1f27] p-4 rounded-xl">
        <TextInput
          className="text-white min-h-[120px] text-base"
          placeholder="Enter any special requests here..."
          placeholderTextColor="#6b7280"
          multiline
          textAlignVertical="top"
          value={specialRequests}
          onChangeText={onSpecialRequestsChange}
        />
      </View>
      
      <View className="bg-[#ff4d6d]/10 p-4 rounded-xl mt-4 flex-row items-start">
        <MessageSquare size={18} color="#ff4d6d" className="mr-2 mt-0.5" />
        <Text className="text-gray-300 flex-1">
          Examples: Dietary restrictions, accessibility needs, celebration details, or seating preferences.
        </Text>
      </View>
    </View>
  );
};

export default SpecialRequests;