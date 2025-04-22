import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ChevronRight,
  Calendar,
  Users,
  Sofa,
  Wine,
  MessageSquare,
  Check,
  Clock,
  Info,
  LucideProps,
} from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import Toast from '@/components/general/Toast';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView, MotiText } from 'moti';

import SeatTypeSelection from '@/components/reservation-components/SeatTypeSelection';
import DateSelection from '@/components/reservation-components/DateSelection';
import PartySizeSelection from '@/components/reservation-components/PartySizeSelection';
import DrinkSelection from '@/components/reservation-components/DrinkSelection';
import SpecialRequests from '@/components/reservation-components/SpecialRequests';


enum ReservationStep {
  DATE,
  SEAT_TYPE,
  PARTY_SIZE,
  DRINKS,
  SPECIAL_REQUESTS,
  REVIEW,
}


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


type IconComponent = React.FC<LucideProps>;


const stepsConfig: { id: ReservationStep; icon: IconComponent; label: string }[] = [
  { id: ReservationStep.DATE, icon: Calendar, label: 'Date' },
  { id: ReservationStep.SEAT_TYPE, icon: Sofa, label: 'Seating' },
  { id: ReservationStep.PARTY_SIZE, icon: Users, label: 'Guests' },
  { id: ReservationStep.DRINKS, icon: Wine, label: 'Drinks' },
  { id: ReservationStep.SPECIAL_REQUESTS, icon: MessageSquare, label: 'Requests' },
  { id: ReservationStep.REVIEW, icon: Check, label: 'Review' },
];


interface StepIndicatorProps {
  currentStep: ReservationStep;
}

const ICON_SIZE_INDICATOR = 18;
const ACTIVE_COLOR_INDICATOR = '#f0165e';
const COMPLETED_COLOR_INDICATOR = ACTIVE_COLOR_INDICATOR;
const INACTIVE_COLOR_INDICATOR = '#555';
const LINE_COLOR_INACTIVE_INDICATOR = '#333';
const LINE_COLOR_ACTIVE_INDICATOR = ACTIVE_COLOR_INDICATOR;

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const currentStepIndex = stepsConfig.findIndex(step => step.id === currentStep);

  return (
    <View className="flex-row items-center justify-between px-1 py-2">
      {stepsConfig.map((step, index) => {
        const isCompleted = index < currentStepIndex;
        const isActive = index === currentStepIndex;
        const isLastStep = index === stepsConfig.length - 1;

        const iconColor = isActive || isCompleted ? '#fff' : INACTIVE_COLOR_INDICATOR;
        const labelColor = isActive ? 'text-white' : isCompleted ? 'text-gray-400' : 'text-gray-600';
        const circleBg = isActive || isCompleted ? ACTIVE_COLOR_INDICATOR : '#2a2a35';
        const lineBg = isCompleted ? LINE_COLOR_ACTIVE_INDICATOR : LINE_COLOR_INACTIVE_INDICATOR;

        return (
          <React.Fragment key={step.id}>

            <MotiView
              className="items-center"
              from={{ scale: 1, opacity: isActive ? 0.7 : (isCompleted ? 1 : 0.5) }}
              animate={{ scale: isActive ? 1.15 : 1, opacity: isActive ? 1 : (isCompleted ? 0.8 : 0.5) }}
              transition={{ type: 'timing', duration: 300 }}
            >
              <MotiView
                className="w-8 h-8 rounded-full items-center justify-center mb-1"
                from={{ backgroundColor: isCompleted ? COMPLETED_COLOR_INDICATOR : '#2a2a35' }}
                animate={{ backgroundColor: circleBg }}
                transition={{ type: 'timing', duration: 300 }}
              >
                <step.icon size={ICON_SIZE_INDICATOR} color={iconColor} />
              </MotiView>
              <MotiText
                className={`text-xs font-medium ${labelColor}`}
                from={{ opacity: isActive ? 0.8 : (isCompleted ? 0.7 : 0.5) }}
                animate={{ opacity: isActive ? 1 : (isCompleted ? 0.7 : 0.5) }}
                transition={{ type: 'timing', duration: 300 }}
              >
                {step.label}
              </MotiText>
            </MotiView>


            {!isLastStep && (
              <MotiView
                className="flex-1 h-[2px] mx-1 mb-6"
                from={{ backgroundColor: LINE_COLOR_INACTIVE_INDICATOR }}
                animate={{ backgroundColor: lineBg }}
                transition={{ type: 'timing', duration: 400, delay: 100 }}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
};


interface ReviewItemProps {
    icon: IconComponent;
    label: string;
    value: string | JSX.Element;
    isLast?: boolean;
}

const ReviewItem: React.FC<ReviewItemProps> = ({ icon: Icon, label, value, isLast = false }) => (
   <View className={`flex-row items-start ${!isLast ? 'pb-4 mb-3 border-b border-gray-700/60' : ''}`}>
      <View className="w-8 h-8 rounded-full bg-[#f0165e]/15 items-center justify-center mr-4 mt-1 flex-shrink-0">
         <Icon size={16} color="#f0165e" />
      </View>
      <View className="flex-1">
         <Text className="text-gray-400 text-sm">{label}</Text>
         {typeof value === 'string' ? (
             <Text className="text-white font-medium mt-0.5">{value}</Text>
         ) : (
             <View className="mt-0.5">{value}</View>
         )}
      </View>
   </View>
);


const calculateItemTotal = (drink: SelectedDrink): string => {
  return (drink.drinkOption.price * drink.quantity).toFixed(2);
};

const calculateDrinksTotal = (drinks: SelectedDrink[]): string => {
  return drinks.reduce((sum, drink) => sum + (drink.drinkOption.price * drink.quantity), 0).toFixed(2);
};


const stepDetails: { [key in ReservationStep]: { title: string; icon: IconComponent } } = {
  [ReservationStep.DATE]: { title: 'Select Date', icon: Calendar },
  [ReservationStep.SEAT_TYPE]: { title: 'Select Seating', icon: Sofa },
  [ReservationStep.PARTY_SIZE]: { title: 'Party Size', icon: Users },
  [ReservationStep.DRINKS]: { title: 'Pre-order Drinks (Optional)', icon: Wine },
  [ReservationStep.SPECIAL_REQUESTS]: { title: 'Special Requests (Optional)', icon: MessageSquare },
  [ReservationStep.REVIEW]: { title: 'Review & Confirm', icon: Check },
};

const NewReservationScreen = (): JSX.Element => {
  const params = useLocalSearchParams<{ barId: string }>();
  const { barId } = params;
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [barName, setBarName] = useState('');
  const [barDetails, setBarDetails] = useState<{ id: string; name: string } | null>(null);


  const [currentStep, setCurrentStep] = useState(ReservationStep.DATE);


  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSeatType, setSelectedSeatType] = useState<'table' | 'bar' | 'vip' | null>(null);
  const [selectedPartySize, setSelectedPartySize] = useState<number | null>(null);
  const [selectedDrinks, setSelectedDrinks] = useState<SelectedDrink[]>([]);
  const [specialRequests, setSpecialRequests] = useState('');


  const [savingReservation, setSavingReservation] = useState(false);


  useEffect(() => {
    const fetchBarDetails = async () => {
      if (!barId) return;
      const barIdString = Array.isArray(barId) ? barId[0] : barId;
      setLoading(true);
      try {
        const { data: barData, error: barError } = await supabase
          .from('bars')
          .select('id, name')
          .eq('id', barIdString)
          .single();
        if (barError) throw barError;
        if (barData) {
          setBarName(barData.name);
          setBarDetails(barData);
        } else {
           throw new Error('Bar not found');
        }
      } catch (error: any) {
        console.error('Error fetching bar details:', error);
        Toast.show({ type: 'error', text1: 'Error loading bar', text2: error.message || 'Could not fetch bar details.' });

      } finally {
        setLoading(false);
      }
    };
    fetchBarDetails();
  }, [barId, router]);


  const createReservationMutation = useMutation({
    mutationFn: async () => {
       if (!user || !barDetails || !selectedDate || !selectedSeatType || !selectedPartySize) {
        throw new Error('Missing required reservation information');
      }

      const barIdString = Array.isArray(barId) ? barId[0] : barId;
      const reservationDate = new Date(selectedDate);

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

      if (reservationError) throw new Error(reservationError.message);
       if (!reservation) throw new Error('Failed to create reservation entry.');

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
          console.error('Error adding drinks:', drinksError);

          Toast.show({ type: 'warning', text1: 'Reservation Confirmed', text2: 'Could not save pre-ordered drinks.' });
        }
      }
      return reservation;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      Toast.show({
        type: 'success',
        text1: 'Reservation Created!',
        text2: `Your booking at ${barName || 'the bar'} is confirmed.`,
      });

      router.back();
    },
    onError: (error) => {
      console.error('Error creating reservation:', error);
      Toast.show({
        type: 'error',
        text1: 'Reservation Failed',
        text2: error instanceof Error ? error.message : 'Please check your details and try again.',
      });
    },
    onSettled: () => {
      setSavingReservation(false);
    }
  });


  const isStepValid = useCallback((step: ReservationStep): boolean => {
    switch (step) {
      case ReservationStep.DATE:
        return !!selectedDate;
      case ReservationStep.SEAT_TYPE:
        return !!selectedSeatType;
      case ReservationStep.PARTY_SIZE:

        return !!selectedPartySize && selectedPartySize > 0;

      case ReservationStep.DRINKS:
      case ReservationStep.SPECIAL_REQUESTS:
        return true;

      case ReservationStep.REVIEW:
         return !!selectedDate && !!selectedSeatType && !!selectedPartySize && selectedPartySize > 0;
      default:
        return false;
    }
  }, [selectedDate, selectedSeatType, selectedPartySize]);


  const handleSubmitReservation = useCallback(() => {
    if (!user) {
      Toast.show({ type: 'info', text1: 'Please sign in', text2: 'Sign in required to make a reservation.' });

      return;
    }


    if (!isStepValid(ReservationStep.REVIEW)) {
         let firstInvalidStep = ReservationStep.DATE;
         let errorMessage = 'Please complete all required steps.';

         if (!isStepValid(ReservationStep.DATE)) {
            firstInvalidStep = ReservationStep.DATE;
            errorMessage = 'Please select a date.';
         } else if (!isStepValid(ReservationStep.SEAT_TYPE)) {
             firstInvalidStep = ReservationStep.SEAT_TYPE;
             errorMessage = 'Please select a seating type.';
         } else if (!isStepValid(ReservationStep.PARTY_SIZE)) {
             firstInvalidStep = ReservationStep.PARTY_SIZE;
             errorMessage = 'Please select a valid party size.';
         }

         Toast.show({ type: 'error', text1: 'Missing Information', text2: errorMessage });
         setCurrentStep(firstInvalidStep);
         return;
    }

    setSavingReservation(true);
    createReservationMutation.mutate();
  }, [ user, isStepValid, createReservationMutation, setCurrentStep ]);


  const handleNextStep = useCallback(() => {
      if (!isStepValid(currentStep)) {

           let errorText = 'Please complete this step.';
           switch (currentStep) {
               case ReservationStep.DATE: errorText = 'Please select a date'; break;
               case ReservationStep.SEAT_TYPE: errorText = 'Please select a seating type'; break;
               case ReservationStep.PARTY_SIZE: errorText = 'Please select a party size (min 1)'; break;

           }
           Toast.show({ type: 'error', text1: 'Step Incomplete', text2: errorText });
           return;
      }

      if (currentStep < ReservationStep.REVIEW) {
        setCurrentStep(prev => prev + 1);
      } else if (currentStep === ReservationStep.REVIEW) {

        handleSubmitReservation();
      }
  }, [ currentStep, isStepValid, handleSubmitReservation, setCurrentStep ]);


  const handlePreviousStep = useCallback(() => {
    if (savingReservation) return;

    if (currentStep > ReservationStep.DATE) {
      setCurrentStep(prev => prev - 1);
    } else {

      Alert.alert(
        "Discard Reservation?",
        "Are you sure you want to go back? Your progress on this reservation will be lost.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Discard", onPress: () => router.back(), style: 'destructive' }
        ],
        { cancelable: true }
      );

    }
  }, [currentStep, router, savingReservation, setCurrentStep]);


  const currentStepDetail = useMemo(() => stepDetails[currentStep], [currentStep]);


  const getNextButtonText = useCallback(() => {
    if (currentStep === ReservationStep.REVIEW) {
      return 'Confirm Reservation';
    }
    return 'Continue';
  }, [currentStep]);


  const formatDate = useCallback((date: Date | null) => {
      if (!date) return 'Not selected';
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }, []);
  const formatTime = useCallback((date: Date | null) => {
      if (!date) return '';
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }, []);


 


  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />


      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back or previous step"
            onPress={handlePreviousStep}
            disabled={savingReservation}
          >
            <ArrowLeft size={22} color={savingReservation ? "#666" : "#fff"} />
          </Pressable>
          <View className="flex-1 items-center mr-10">
             <Text className="text-lg font-semibold text-white text-center" numberOfLines={1} ellipsizeMode='tail'>
                {barName || 'New Reservation'}
             </Text>
             <Text className="text-sm text-gray-400 text-center">
                 {currentStepDetail.title}
             </Text>
          </View>
        </View>


        <StepIndicator currentStep={currentStep} />
      </View>


      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        keyboardShouldPersistTaps="handled"
      >

        <MotiView
           key={currentStep}
           from={{ opacity: 0, translateY: 20 }}
           animate={{ opacity: 1, translateY: 0 }}
           exit={{ opacity: 0, translateY: -20 }}
           transition={{ type: 'timing', duration: 350 }}
           style={{ width: '100%'}}
        >

          {currentStep === ReservationStep.DATE && (
            <DateSelection
              barId={barId ?? ''}
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

          {currentStep === ReservationStep.DRINKS && barDetails && (
            <DrinkSelection
              barId={barDetails.id}
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


          {currentStep === ReservationStep.REVIEW && barDetails && (
            <View className="mb-6 px-1">
              <Text className="text-xl font-bold text-white mb-5">Review Your Reservation</Text>

              <View className="bg-[#1c1c22] p-5 rounded-2xl mb-5 shadow-md">
                 <ReviewItem
                    icon={Calendar}
                    label="Date"
                    value={selectedDate ? `${formatDate(selectedDate)}` : 'Not selected'}
                 />
                 <ReviewItem
                    icon={Sofa}
                    label="Seating Type"
                    value={selectedSeatType ? selectedSeatType.charAt(0).toUpperCase() + selectedSeatType.slice(1) : 'Not selected'}
                 />
                 <ReviewItem
                    icon={Users}
                    label="Party Size"
                    value={selectedPartySize ? `${selectedPartySize} ${selectedPartySize === 1 ? 'Guest' : 'Guests'}` : 'Not selected'}
                 />


                 <ReviewItem
                    icon={Wine}
                    label="Pre-ordered Drinks"
                    value={
                        selectedDrinks.length > 0 ? (
                            <View className="mt-1 w-full">
                            {selectedDrinks.map((drink, index) => (
                                <View key={index} className="flex-row justify-between items-center mb-1 w-full">
                                <Text className="text-white text-sm flex-1 mr-2" numberOfLines={1} ellipsizeMode="tail">
                                    {drink.quantity}x {drink.drinkOption.name}
                                </Text>
                                <Text className="text-gray-300 text-sm">
                                    ${calculateItemTotal(drink)}
                                </Text>
                                </View>
                            ))}
                            <View className="flex-row justify-between mt-3 pt-2 border-t border-gray-700/50 w-full">
                                <Text className="text-white font-semibold">Drinks Total</Text>
                                <Text className="text-white font-semibold">
                                ${calculateDrinksTotal(selectedDrinks)}
                                </Text>
                            </View>
                            </View>
                        ) : (
                            <Text className="text-gray-500 italic">None</Text>
                        )
                    }
                 />


                 <ReviewItem
                    icon={MessageSquare}
                    label="Special Requests"
                    value={specialRequests || <Text className="text-gray-500 italic">None</Text>}
                    isLast
                 />
              </View>

              <View className="bg-[#f0165e]/10 p-4 rounded-xl mb-6 flex-row items-start">
                <Info size={18} color="#f0165e" className="mr-3 mt-1 flex-shrink-0" />
                <Text className="text-gray-300 text-sm flex-1">
                  Please review details carefully. By confirming, you agree to the bar's cancellation policy. Fees may apply for late cancellations or no-shows.
                </Text>
              </View>
            </View>
          )}
          </MotiView>

        <View style={{ flexGrow: 1 }} />

      </ScrollView>

       <View style={styles.footer}>
            <Pressable
            style={({ pressed }) => [
                styles.buttonBase,
                savingReservation && styles.buttonDisabled,
                pressed && !savingReservation && styles.buttonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={getNextButtonText()}
            onPress={savingReservation ? undefined : handleNextStep}
            disabled={savingReservation}
            >
            <LinearGradient
                colors={savingReservation ? ['#555', '#444'] : ['#f0165e', '#d40a4d']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.buttonGradient}
            >
                {savingReservation ? (
                    <ActivityIndicator color="white" size="small" />
                ) : (
                    <Text style={styles.buttonText}>{getNextButtonText()}</Text>
                )}
            </LinearGradient>
            </Pressable>
       </View>

    </SafeAreaView>
  );
};


const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f0f13',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f13',
  },
  loadingText: {
      marginTop: 16,
      color: '#9CA3AF',
      fontSize: 16,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 8 : 4,
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f27',
    backgroundColor: '#131318',
  },
  headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
      minHeight: 44,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
    marginLeft: -8,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  footer: {
      paddingHorizontal: 20,
      paddingBottom: Platform.OS === 'ios' ? 10 : 20,
      paddingTop: 10,
      backgroundColor: '#0f0f13',
  },
   buttonBase: {
    borderRadius: 20,
    overflow: 'hidden',
   },
  buttonGradient: {
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
      opacity: 0.85,
  },
});

export default NewReservationScreen;