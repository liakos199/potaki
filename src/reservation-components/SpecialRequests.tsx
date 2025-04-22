import React from 'react';
import { View, Text, TextInput } from 'react-native';

// Component props
type SpecialRequestsProps = {
  specialRequests: string;
  onSpecialRequestsChange: (text: string) => void;
  isLoading?: boolean;
};

const SpecialRequests = ({
  specialRequests,
  onSpecialRequestsChange,
  isLoading = false
}: SpecialRequestsProps): JSX.Element => {
  return (
    <View className="mb-6 w-full">
      <Text className="text-gray-700 text-lg font-semibold mb-2">Special Requests (Optional)</Text>
      <View className="border border-gray-200 rounded-lg">
        <TextInput
          value={specialRequests}
          onChangeText={onSpecialRequestsChange}
          className="p-4 text-base"
          placeholder="Any special requests or notes for your reservation"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={!isLoading}
          style={{ minHeight: 120 }}
        />
      </View>
      <Text className="mt-2 text-gray-500 text-sm">
        Let the bar know if you have any special requirements or requests for your visit.
      </Text>
    </View>
  );
};

export default SpecialRequests;
