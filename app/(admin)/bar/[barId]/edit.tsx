import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';


import BarInfoSection from '@/src/features/owner-components/bar-info-section'; 
import BarOperatingHours from '@/src/features/owner-components/operating-hours/bar-operating-hours'; 
import { BarSeatOptions } from '@/src/features/owner-components/bar-seat-options'; 


const EditBarScreen = (): JSX.Element | null => {
  const { barId } = useLocalSearchParams<{ barId: string }>();
  if (!barId) {
     return (
       <View className="flex-1 justify-center items-center bg-white px-4">
         <Text className="text-red-500 mb-2">Error: Bar ID is missing.</Text>
         <Text className="text-gray-500 text-xs">Cannot load bar information.</Text>
       </View>
     );
  }


  return (
    <View className="flex-1 bg-white">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>

        {/* Section 1: Bar Information - Pass only barId */}
        <BarInfoSection barId={barId} /> 

        {/* Section 2: Operating Hours */}
        <BarOperatingHours barId={barId} />
        
        {/* Section 3: Seating Options */}
          <BarSeatOptions barId={barId} />

      </ScrollView>
    </View>
  );
};

export default EditBarScreen;