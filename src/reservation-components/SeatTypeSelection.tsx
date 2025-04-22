import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '@/src/lib/supabase';
import { Check, ChevronDown } from 'lucide-react-native';
import Modal from 'react-native-modal';
import { format } from 'date-fns';

// Seat type option definition
type SeatOption = {
  id: string;
  bar_id: string;
  type: 'table' | 'bar' | 'vip';
  min_people: number;
  max_people: number;
  available_count: number;
  enabled: boolean;
};

// Existing reservation for checking availability
type ExistingReservation = {
  id: string;
  bar_id: string;
  party_size: number;
  reservation_date: string;
  seat_type: 'table' | 'bar' | 'vip';
  status: string; 
};

// Component props
type SeatTypeSelectionProps = {
  barId: string;
  selectedDate: Date | null;
  partySize: number;
  selectedSeatType: 'table' | 'bar' | 'vip' | null;
  onSeatTypeChange: (seatType: 'table' | 'bar' | 'vip') => void;
  isLoading?: boolean;
};

const SeatTypeSelection = ({
  barId,
  selectedDate,
  partySize,
  selectedSeatType,
  onSeatTypeChange,
  isLoading = false
}: SeatTypeSelectionProps): JSX.Element => {
  const [showPicker, setShowPicker] = useState(false);
  const [seatOptions, setSeatOptions] = useState<SeatOption[]>([]);
  const [existingReservations, setExistingReservations] = useState<ExistingReservation[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [debug, setDebug] = useState<string>('');

  // Human-readable labels for seat types
  const seatTypeLabels: Record<string, string> = {
    'table': 'Table',
    'bar': 'Bar Seating',
    'vip': 'VIP Area'
  };

  // Calculate remaining seats for each seat type
  const calculateRemainingSeats = useCallback((
    options: SeatOption[],
    reservations: ExistingReservation[]
  ) => {
    return options.map(option => {
      // Find all reservations for this seat type
      const relevantReservations = reservations.filter(
        res => res.seat_type === option.type && 
        ['confirmed'].includes(res.status.toLowerCase())
      );
      
      // Calculate how many seats are taken
      const takenSeats = relevantReservations.reduce(
        (sum, res) => sum + res.party_size, 0
      );
      
      // Calculate remaining seats
      const remainingSeats = Math.max(0, option.available_count - takenSeats);
      
      return {
        ...option,
        // Override available_count with the actual remaining seats
        available_count: remainingSeats
      };
    });
  }, []);

  // Fetch available seat types from the database
  useEffect(() => {
    let isMounted = true;
    
    const fetchSeatOptions = async () => {
      if (!barId || !selectedDate) return;
      
      setLoadingData(true);
      setDebug('');
      
      try {
        // Format the date for querying
        const formattedDate = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
        console.log(`Fetching seat options for bar ID: ${barId} on date: ${formattedDate}`);
        
        // Fetch seat options
        const { data: seatData, error: seatError } = await supabase
          .from('seat_options')
          .select('*')
          .eq('bar_id', barId)
          .eq('enabled', true);
        
        if (seatError) {
          console.error('Error fetching seat options:', seatError);
          setDebug(`Error fetching seat options: ${seatError.message}`);
          return;
        }
        
        // Fetch existing reservations for this date to check availability
        const { data: reservationData, error: reservationError } = await supabase
          .from('reservations')
          .select('id, bar_id, party_size, reservation_date, seat_type, status')
          .eq('bar_id', barId)
          .like('reservation_date', `${formattedDate}%`)  // This will match the date part
          .in('status', ['confirmed']);
        
        if (reservationError) {
          console.error('Error fetching reservations:', reservationError);
          setDebug((prev) => `${prev}\nError fetching reservations: ${reservationError.message}`);
        }
        
        console.log(`Found ${seatData?.length || 0} seat options and ${reservationData?.length || 0} existing reservations`);
        
        if (isMounted) {
          const existingReservs = reservationData || [];
          setExistingReservations(existingReservs);
          
          // Apply availability calculation
          const seatOptionsWithAvailability = calculateRemainingSeats(
            seatData || [], 
            existingReservs
          );
          
          setSeatOptions(seatOptionsWithAvailability);
          
          // Debug output
          setDebug((prev) => `${prev}\nSeat options: ${seatOptionsWithAvailability.map(
            o => `${o.type}(${o.available_count}/${o.min_people}-${o.max_people})`
          ).join(', ')}`);
          
          // If no seat type is selected yet and we have options,
          // automatically select the first applicable one
          if (!selectedSeatType && seatOptionsWithAvailability.length > 0) {
            const applicableOptions = seatOptionsWithAvailability.filter(
              option => partySize >= option.min_people && 
                      partySize <= option.max_people && 
                      option.available_count > 0
            );
            
            if (applicableOptions.length > 0) {
              onSeatTypeChange(applicableOptions[0].type);
            }
          }
          
          setLoadingData(false);
        }
      } catch (error) {
        console.error('Error in fetchSeatOptions:', error);
        if (isMounted) {
          setLoadingData(false);
          setDebug((prev) => `${prev}\nGeneral error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };
    
    fetchSeatOptions();
    
    return () => {
      isMounted = false;
    };
  }, [barId, selectedDate, partySize, selectedSeatType, onSeatTypeChange, calculateRemainingSeats]);
  
  // Get available seat options based on party size
  const availableSeatOptions = useCallback(() => {
    return seatOptions.filter(
      option => partySize >= option.min_people && 
                partySize <= option.max_people && 
                option.available_count > 0
    );
  }, [seatOptions, partySize]);
  
  // Get the currently selected seat type's label
  const getSelectedLabel = useCallback(() => {
    if (!selectedSeatType) return 'Select seating type';
    return seatTypeLabels[selectedSeatType] || 'Unknown';
  }, [selectedSeatType, seatTypeLabels]);
  
  // Determine if the loading spinner should show
  const showSpinner = isLoading || loadingData;
  
  // Options to show in the picker
  const options = availableSeatOptions();
  
  return (
    <View className="mb-6 w-full">
      <Text className="text-gray-700 text-lg font-semibold mb-2">Seating Type</Text>
      <Pressable
        className={`flex-row items-center justify-between p-4 border border-gray-200 rounded-lg ${showSpinner ? 'opacity-70' : ''}`}
        onPress={() => setShowPicker(true)}
        disabled={showSpinner || options.length === 0 || !selectedDate}
      >
        <Text className="text-lg">
          {!selectedDate ? 'Please select a date first' : 
           showSpinner ? 'Loading seating options...' : 
           getSelectedLabel()}
        </Text>
        {showSpinner ? (
          <ActivityIndicator size="small" color="#4b5563" />
        ) : (
          <ChevronDown size={20} color="#4b5563" />
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
            <Text className="text-lg font-bold">Select Seating Type</Text>
            <Pressable onPress={() => setShowPicker(false)}>
              <Text className="text-blue-600 font-semibold">Done</Text>
            </Pressable>
          </View>
          
          <ScrollView className="max-h-80">
            {options.length > 0 ? (
              options.map((option) => (
                <Pressable
                  key={option.id}
                  className={`p-4 border-b border-gray-100 flex-row items-center ${
                    selectedSeatType === option.type ? 'bg-blue-50' : ''
                  }`}
                  onPress={() => {
                    onSeatTypeChange(option.type);
                    setShowPicker(false);
                  }}
                >
                  <View>
                    <Text className={`text-lg ${selectedSeatType === option.type ? 'text-blue-600 font-semibold' : ''}`}>
                      {seatTypeLabels[option.type]}
                    </Text>
                    <Text className="text-gray-500 text-sm mt-1">
                      For {option.min_people === option.max_people 
                        ? `${option.min_people} people` 
                        : `${option.min_people}-${option.max_people} people`
                      } • {option.available_count} available
                    </Text>
                  </View>
                  
                  {selectedSeatType === option.type && (
                    <Check size={20} className="ml-auto" color="#2563eb" />
                  )}
                </Pressable>
              ))
            ) : (
              <View className="p-4">
                <Text className="text-red-500">
                  No seating options available for your party size.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
      
      {!selectedDate && !loadingData && (
        <Text className="mt-2 text-yellow-600">
          Please select a date before choosing a seating type.
        </Text>
      )}
      
      {selectedDate && options.length === 0 && !loadingData && (
        <Text className="mt-2 text-red-500">
          No seating options available for a party of {partySize} on this date.
        </Text>
      )}
      
      {__DEV__ && debug && (
        <Text className="mt-2 text-xs text-gray-500">
          Debug: {debug}
        </Text>
      )}
    </View>
  );
};

export default SeatTypeSelection;
