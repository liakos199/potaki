import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '@/src/lib/supabase';
import { Users, ChevronDown, Check } from 'lucide-react-native';
import Modal from 'react-native-modal';

// Component props
type PartySizeSelectionProps = {
  barId: string;
  selectedSeatType: 'table' | 'bar' | 'vip' | null;
  selectedPartySize: number | null;
  onPartySizeChange: (size: number) => void;
  isLoading?: boolean;
};

// Seat option type for getting min and max people
type SeatOption = {
  min_people: number;
  max_people: number;
  available_count: number;
};

const PartySizeSelection = ({
  barId,
  selectedSeatType,
  selectedPartySize,
  onPartySizeChange,
  isLoading = false
}: PartySizeSelectionProps): JSX.Element => {
  const [showPicker, setShowPicker] = useState(false);
  const [seatOption, setSeatOption] = useState<SeatOption | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  
  // Fetch seat option details to determine allowed party sizes
  useEffect(() => {
    const fetchSeatOptionDetails = async () => {
      if (!barId || !selectedSeatType) {
        setSeatOption(null);
        setLoadingData(false);
        return;
      }
      
      setLoadingData(true);
      
      try {
        const { data, error } = await supabase
          .from('seat_options')
          .select('min_people, max_people, available_count')
          .eq('bar_id', barId)
          .eq('type', selectedSeatType)
          .eq('enabled', true)
          .single();
        
        if (error) {
          console.error('Error fetching seat option details:', error);
          setSeatOption(null);
        } else if (data) {
          setSeatOption(data);
          
          // Auto-select a default party size if none is selected
          if (!selectedPartySize && data) {
            onPartySizeChange(data.min_people);
          } else if (selectedPartySize) {
            // Ensure the selected party size is within limits of the new seat type
            if (
              selectedPartySize < data.min_people ||
              selectedPartySize > data.max_people
            ) {
              onPartySizeChange(data.min_people);
            }
          }
        }
      } catch (error) {
        console.error('Error in fetchSeatOptionDetails:', error);
        setSeatOption(null);
      } finally {
        setLoadingData(false);
      }
    };
    
    fetchSeatOptionDetails();
  }, [barId, selectedSeatType, selectedPartySize, onPartySizeChange]);
  
  // Generate available party size options
  const partySizeOptions = useCallback(() => {
    if (!seatOption) return [];
    
    const { min_people, max_people } = seatOption;
    return Array.from(
      { length: max_people - min_people + 1 },
      (_, i) => min_people + i
    );
  }, [seatOption]);
  
  // Determine if the loading spinner should show
  const showSpinner = isLoading || loadingData;
  
  // Available options
  const options = partySizeOptions();
  
  return (
    <View className="mb-6 w-full">
      <Text className="text-gray-700 text-lg font-semibold mb-2">Party Size</Text>
      <Pressable
        className={`flex-row items-center justify-between p-4 border border-gray-200 rounded-lg ${showSpinner ? 'opacity-70' : ''}`}
        onPress={() => setShowPicker(true)}
        disabled={showSpinner || !selectedSeatType || options.length === 0}
      >
        <View className="flex-row items-center">
          <Users size={20} color="#4b5563" />
          <Text className="ml-2 text-lg">
            {showSpinner ? (
              'Loading options...'
            ) : !selectedSeatType ? (
              'Please select a seating type first'
            ) : selectedPartySize ? (
              `${selectedPartySize} ${selectedPartySize === 1 ? 'person' : 'people'}`
            ) : (
              'Select party size'
            )}
          </Text>
        </View>
        {showSpinner ? (
          <ActivityIndicator size="small" color="#4b5563" />
        ) : (
          options.length > 0 && <ChevronDown size={20} color="#4b5563" />
        )}
      </Pressable>
      
      <Modal
        isVisible={showPicker}
        onBackdropPress={() => setShowPicker(false)}
        backdropOpacity={0.5}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        style={{ margin: 0, justifyContent: 'flex-end' }}
      >
        <View className="bg-white rounded-t-xl p-4">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-lg font-bold">Select Party Size</Text>
            <Pressable onPress={() => setShowPicker(false)}>
              <Text className="text-blue-600 font-semibold">Done</Text>
            </Pressable>
          </View>
          
          <ScrollView className="max-h-80">
            {options.map((size) => (
              <Pressable
                key={size}
                className={`p-4 border-b border-gray-100 flex-row items-center ${
                  selectedPartySize === size ? 'bg-blue-50' : ''
                }`}
                onPress={() => {
                  onPartySizeChange(size);
                  setShowPicker(false);
                }}
              >
                <Text className={`text-lg ${selectedPartySize === size ? 'text-blue-600 font-semibold' : ''}`}>
                  {size} {size === 1 ? 'person' : 'people'}
                </Text>
                {selectedPartySize === size && (
                  <Check size={20} className="ml-auto" color="#2563eb" />
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
      
      {!selectedSeatType && !loadingData && (
        <Text className="mt-2 text-yellow-600">
          Please select a seating type before choosing party size.
        </Text>
      )}
      
      {selectedSeatType && options.length === 0 && !loadingData && (
        <Text className="mt-2 text-red-500">
          No party size options available for the selected seating.
        </Text>
      )}
    </View>
  );
};

export default PartySizeSelection;
