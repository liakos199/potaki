import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, Platform, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, Calendar, Users, Sofa, Wine, MessageSquare, Check, Clock, Info } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import Toast from '@/components/general/Toast';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import SeatTypeSelection from '@/components/reservation-components1/SeatTypeSelection';
import DateSelection from '@/components/reservation-components1/DateSelection';
import PartySizeSelection from '@/components/reservation-components1/PartySizeSelection';
import DrinkSelection from '@/components/reservation-components1/DrinkSelection';
import SpecialRequests from '@/components/reservation-components1/SpecialRequests';

// Selected drink with quantity
type SelectedDrink = {
  drinkOption: {
    id: string;
    name: string;
    price: number;
    description: string | null;
    image_url: string | null;
    type: string;
    is_available: boolean;
  };
  quantity: number;
};

// Reservation steps
enum ReservationStep {
  DATE,
  SEAT_TYPE,
  PARTY_SIZE,
  DRINKS,
  SPECIAL_REQUESTS,
  REVIEW
}

const NewReservationScreen = (): JSX.Element => {
  const params = useLocalSearchParams();
  const { barId } = params;
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  
  const [loading, setLoading] = useState(true);
  const [barName, setBarName] = useState('');
  const [barDetails, setBarDetails] = useState<{ id: string; name: string } | null>(null);
  
  // Current step in the reservation process
  const [currentStep, setCurrentStep] = useState(ReservationStep.DATE);
  
  // Form state
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSeatType, setSelectedSeatType] = useState<'table' | 'bar' | 'vip' | null>(null);
  const [selectedPartySize, setSelectedPartySize] = useState<number | null>(null);
  const [selectedDrinks, setSelectedDrinks] = useState<SelectedDrink[]>([]);
  const [specialRequests, setSpecialRequests] = useState('');
  
  // Process for saving in progress
  const [savingReservation, setSavingReservation] = useState(false);
  
  // Fetch bar details
  useEffect(() => {
    const fetchBarDetails = async () => {
      if (!barId) return;
      
      // Ensure barId is treated as a string
      const barIdString = Array.isArray(barId) ? barId[0] : barId;
      
      setLoading(true);
      
      try {
        // Fetch bar details
        const { data: barData, error: barError } = await supabase
          .from('bars')
          .select('id, name')
          .eq('id', barIdString)
          .single();
        
        if (barError) {
          console.error('Error fetching bar details:', barError);
          Toast.show({
            type: 'error',
            text1: 'Error loading bar details',
          });
          router.back();
          return;
        }
        
        if (barData) {
          setBarName(barData.name);
          setBarDetails(barData);
        }
      } catch (error) {
        console.error('Error in fetchBarDetails:', error);
        Toast.show({
          type: 'error',
          text1: 'An error occurred',
          text2: 'Please try again later',
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchBarDetails();
  }, [barId, router]);
  
  // Mutation for creating a reservation
  const createReservationMutation = useMutation({
    mutationFn: async () => {
      if (!user || !barDetails || !selectedDate || !selectedSeatType || !selectedPartySize) {
        throw new Error('Missing required reservation information');
      }
      
      const barIdString = Array.isArray(barId) ? barId[0] : barId;
      
      // Format reservation date to ISO string
      const reservationDate = new Date(selectedDate);
      
      // Create the reservation in Supabase
      const { data: reservation, error: reservationError } = await supabase
        .from('reservations')
        .insert({
          bar_id: barIdString,
          customer_id: user.id,
          party_size: selectedPartySize,
          reservation_date: reservationDate.toISOString(),
          seat_type: selectedSeatType,
          special_requests: specialRequests || null,
          status: 'confirmed',
        })
        .select()
        .single();
      
      if (reservationError) {
        throw new Error(reservationError.message);
      }
      
      // If drinks were selected, add them to the reservation
      if (selectedDrinks.length > 0) {
        const drinkInserts = selectedDrinks.map(drink => ({
          reservation_id: reservation.id,
          drink_option_id: drink.drinkOption.id,
          drink_name_at_booking: drink.drinkOption.name,
          drink_type_at_booking: drink.drinkOption.type,
          price_at_booking: drink.drinkOption.price,
          quantity: drink.quantity,
        }));
        
        const { error: drinksError } = await supabase
          .from('reservation_drinks')
          .insert(drinkInserts);
        
        if (drinksError) {
          console.error('Error adding drinks to reservation:', drinksError);
          // Continue anyway - the reservation is created, drinks are secondary
        }
      }
      
      return reservation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      Toast.show({
        type: 'success',
        text1: 'Reservation created!',
        text2: 'Your reservation has been confirmed.',
      });
      router.back();
    },
    onError: (error) => {
      console.error('Error creating reservation:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to create reservation',
        text2: error instanceof Error ? error.message : 'Unknown error',
      });
      setSavingReservation(false);
    }
  });
  
  // Submit the reservation
  const handleSubmitReservation = useCallback(() => {
    if (!user) {
      Toast.show({
        type: 'error',
        text1: 'You must be signed in to make a reservation',
      });
      return;
    }
    
    if (!selectedDate) {
      Toast.show({
        type: 'error',
        text1: 'Please select a date',
      });
      setCurrentStep(ReservationStep.DATE);
      return;
    }
    
    if (!selectedSeatType) {
      Toast.show({
        type: 'error',
        text1: 'Please select a seating type',
      });
      setCurrentStep(ReservationStep.SEAT_TYPE);
      return;
    }
    
    if (!selectedPartySize) {
      Toast.show({
        type: 'error',
        text1: 'Please select a party size',
      });
      setCurrentStep(ReservationStep.PARTY_SIZE);
      return;
    }
    
    setSavingReservation(true);
    createReservationMutation.mutate();
  }, [
    user, 
    selectedDate, 
    selectedSeatType, 
    selectedPartySize, 
    createReservationMutation
  ]);
  
  // Go to the next step
  const handleNextStep = useCallback(() => {
    // Validate current step
    if (currentStep === ReservationStep.DATE && !selectedDate) {
      Toast.show({
        type: 'error',
        text1: 'Please select a date',
      });
      return;
    }
    
    if (currentStep === ReservationStep.SEAT_TYPE && !selectedSeatType) {
      Toast.show({
        type: 'error',
        text1: 'Please select a seating type',
      });
      return;
    }
    
    if (currentStep === ReservationStep.PARTY_SIZE && !selectedPartySize) {
      Toast.show({
        type: 'error',
        text1: 'Please select a party size',
      });
      return;
    }
    
    // Move to next step
    if (currentStep < ReservationStep.REVIEW) {
      setCurrentStep(currentStep + 1);
    } else if (currentStep === ReservationStep.REVIEW) {
      handleSubmitReservation();
    }
  }, [
    currentStep, 
    selectedDate, 
    selectedSeatType, 
    selectedPartySize, 
    handleSubmitReservation
  ]);
  
  // Go to the previous step
  const handlePreviousStep = useCallback(() => {
    if (currentStep > ReservationStep.DATE) {
      setCurrentStep(currentStep - 1);
    } else {
      router.back();
    }
  }, [currentStep, router]);
  
  // Get step title
  const getStepTitle = useCallback(() => {
    switch (currentStep) {
      case ReservationStep.DATE:
        return 'Select Date';
      case ReservationStep.SEAT_TYPE:
        return 'Select Seating';
      case ReservationStep.PARTY_SIZE:
        return 'Party Size';
      case ReservationStep.DRINKS:
        return 'Pre-order Drinks';
      case ReservationStep.SPECIAL_REQUESTS:
        return 'Special Requests';
      case ReservationStep.REVIEW:
        return 'Review & Confirm';
      default:
        return 'Make Reservation';
    }
  }, [currentStep]);
  
  // Get step icon
  const getStepIcon = useCallback(() => {
    switch (currentStep) {
      case ReservationStep.DATE:
        return <Calendar size={20} color="#f0165e" />;
      case ReservationStep.SEAT_TYPE:
        return <Sofa size={20} color="#f0165e" />;
      case ReservationStep.PARTY_SIZE:
        return <Users size={20} color="#f0165e" />;
      case ReservationStep.DRINKS:
        return <Wine size={20} color="#f0165e" />;
      case ReservationStep.SPECIAL_REQUESTS:
        return <MessageSquare size={20} color="#f0165e" />;
      case ReservationStep.REVIEW:
        return <Check size={20} color="#f0165e" />;
      default:
        return <Calendar size={20} color="#f0165e" />;
    }
  }, [currentStep]);
  
  // Get next button text
  const getNextButtonText = useCallback(() => {
    if (currentStep === ReservationStep.REVIEW) {
      return 'Confirm Reservation';
    }
    return 'Continue';
  }, [currentStep]);
  
  // Format date for display
  const formatDate = useCallback((date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);
  
  // Format time for display
  const formatTime = useCallback((date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }, []);
  
  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-[#0f0f13]">
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#f0165e" />
        <Text className="mt-4 text-gray-400">Loading reservation details...</Text>
      </View>
    );
  }
  
  return (
    <SafeAreaView className="flex-1 bg-[#0f0f13]">
      <StatusBar style="light" />
      
      {/* Header */}
      <View className="px-5 pt-2 pb-4 border-b border-[#1f1f27]">
        <View className="flex-row items-center mb-2">
          <Pressable
            className="w-10 h-10 rounded-full justify-center items-center mr-3"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={handlePreviousStep}
          >
            <ArrowLeft size={22} color="#fff" />
          </Pressable>
          <Text className="text-xl font-bold text-white flex-1">
            {getStepTitle()}
          </Text>
        </View>
        
        {/* Step indicator */}
        <View className="flex-row items-center justify-between mt-3 px-2">
          {[
            ReservationStep.DATE,
            ReservationStep.SEAT_TYPE,
            ReservationStep.PARTY_SIZE,
            ReservationStep.DRINKS,
            ReservationStep.SPECIAL_REQUESTS,
            ReservationStep.REVIEW
          ].map((step) => (
            <View 
              key={step} 
              className={`items-center ${step < currentStep ? 'opacity-100' : step === currentStep ? 'opacity-100' : 'opacity-40'}`}
            >
              <View 
                className={`h-2 w-2 rounded-full ${
                  step < currentStep 
                    ? 'bg-[#f0165e]' 
                    : step === currentStep 
                      ? 'bg-[#f0165e]' 
                      : 'bg-gray-600'
                }`} 
              />
              {step === currentStep && (
                <View className="h-1 w-8 bg-[#f0165e] rounded-full mt-1" />
              )}
            </View>
          ))}
        </View>
      </View>
      
      <ScrollView className="flex-1 px-5 pt-4">
        <View className="flex-row items-center mb-6">
          <View className="w-10 h-10 rounded-full bg-[#f0165e]/10 items-center justify-center mr-3">
            {getStepIcon()}
          </View>
          <Text className="text-2xl font-bold text-white">{barName}</Text>
        </View>
        
        {/* Current step content */}
        {currentStep === ReservationStep.DATE && (
          <DateSelection
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}

          />
        )}
        
        {currentStep === ReservationStep.SEAT_TYPE && (
          <SeatTypeSelection
            selectedSeatType={selectedSeatType}
            onSeatTypeChange={setSelectedSeatType}
          />
        )}
        
        {currentStep === ReservationStep.PARTY_SIZE && (
          <PartySizeSelection
            selectedPartySize={selectedPartySize}
            onPartySizeChange={setSelectedPartySize}
          />
        )}
        
        {currentStep === ReservationStep.DRINKS && (
          <DrinkSelection
            barId={Array.isArray(barId) ? barId[0] : barId}
            selectedDrinks={selectedDrinks}
            onDrinksChange={setSelectedDrinks}
          />
        )}
        
        {currentStep === ReservationStep.SPECIAL_REQUESTS && (
          <SpecialRequests
            specialRequests={specialRequests}
            onSpecialRequestsChange={setSpecialRequests}
          />
        )}
        
        {currentStep === ReservationStep.REVIEW && (
          <View className="mb-6">
            <Text className="text-lg font-bold text-white mb-4">Reservation Summary</Text>
            
            <View className="bg-[#1f1f27] p-5 rounded-2xl mb-4">
              {/* Date */}
              <View className="mb-4 flex-row items-center">
                <View className="w-8 h-8 rounded-full bg-[#f0165e]/10 items-center justify-center mr-3">
                  <Calendar size={16} color="#f0165e" />
                </View>
                <View>
                  <Text className="text-gray-400 text-sm">Date & Time</Text>
                  <Text className="text-white font-medium">
                    {selectedDate ? `${formatDate(selectedDate)} at ${formatTime(selectedDate)}` : 'Not selected'}
                  </Text>
                </View>
              </View>
              
              {/* Seating Type */}
              <View className="mb-4 flex-row items-center">
                <View className="w-8 h-8 rounded-full bg-[#f0165e]/10 items-center justify-center mr-3">
                  <Sofa size={16} color="#f0165e" />
                </View>
                <View>
                  <Text className="text-gray-400 text-sm">Seating Type</Text>
                  <Text className="text-white font-medium">
                    {selectedSeatType ? selectedSeatType.charAt(0).toUpperCase() + selectedSeatType.slice(1) : 'Not selected'}
                  </Text>
                </View>
              </View>
              
              {/* Party Size */}
              <View className="mb-4 flex-row items-center">
                <View className="w-8 h-8 rounded-full bg-[#f0165e]/10 items-center justify-center mr-3">
                  <Users size={16} color="#f0165e" />
                </View>
                <View>
                  <Text className="text-gray-400 text-sm">Party Size</Text>
                  <Text className="text-white font-medium">
                    {selectedPartySize ? `${selectedPartySize} ${selectedPartySize === 1 ? 'person' : 'people'}` : 'Not selected'}
                  </Text>
                </View>
              </View>
              
              {/* Drinks */}
              <View className="mb-4 flex-row">
                <View className="w-8 h-8 rounded-full bg-[#f0165e]/10 items-center justify-center mr-3">
                  <Wine size={16} color="#f0165e" />
                </View>
                <View className="flex-1">
                  <Text className="text-gray-400 text-sm">Pre-ordered Drinks</Text>
                  {selectedDrinks.length > 0 ? (
                    <View className="mt-1">
                      {selectedDrinks.map((drink, index) => (
                        <View key={index} className="flex-row justify-between mb-1">
                          <Text className="text-white">
                            {drink.quantity}x {drink.drinkOption.name}
                          </Text>
                          <Text className="text-white">
                            ${(drink.drinkOption.price * drink.quantity).toFixed(2)}
                          </Text>
                        </View>
                      ))}
                      <View className="flex-row justify-between mt-2 pt-2 border-t border-[#2a2a35]">
                        <Text className="text-white font-medium">Total</Text>
                        <Text className="text-white font-medium">
                          ${selectedDrinks.reduce((sum, drink) => sum + (drink.drinkOption.price * drink.quantity), 0).toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text className="text-white">No drinks selected</Text>
                  )}
                </View>
              </View>
              
              {/* Special Requests */}
              <View className="flex-row">
                <View className="w-8 h-8 rounded-full bg-[#f0165e]/10 items-center justify-center mr-3">
                  <MessageSquare size={16} color="#f0165e" />
                </View>
                <View className="flex-1">
                  <Text className="text-gray-400 text-sm">Special Requests</Text>
                  <Text className="text-white">
                    {specialRequests ? specialRequests : 'None'}
                  </Text>
                </View>
              </View>
            </View>
            
            <View className="bg-[#f0165e]/10 p-4 rounded-xl mb-6 flex-row items-start">
              <Info size={18} color="#f0165e" className="mr-2 mt-0.5" />
              <Text className="text-gray-300 flex-1">
                By confirming this reservation, you agree to the cancellation policy. A cancellation fee may apply if you cancel less than 24 hours before your reservation.
              </Text>
            </View>
          </View>
        )}
        
        {/* Next button */}
        <Pressable
          className={`py-4 rounded-xl items-center mb-8 ${
            savingReservation ? 'bg-gray-600' : 'bg-[#f0165e]'
          }`}
          accessibilityRole="button"
          accessibilityLabel={getNextButtonText()}
          onPress={handleNextStep}
          disabled={savingReservation}
        >
          {savingReservation ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-lg font-semibold">{getNextButtonText()}</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
};

export default NewReservationScreen;