import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput, // Keep if used elsewhere, otherwise remove
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Calendar,
  Users,
  Sofa,
  Wine,
  MessageSquare,
  Check,
  // Clock, // No longer explicitly used in this component's render
  Info,
  LucideProps,
} from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase'; // Adjust path
import { useQueryClient, useMutation } from '@tanstack/react-query';
import Toast from '@/components/general/Toast'; // Adjust path
import { useAuthStore } from '@/src/features/auth/store/auth-store'; // Adjust path
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView, MotiText } from 'moti';
import { format } from 'date-fns'; // Ensure date-fns is installed

// Import child components and types
// Make sure the path is correct and SeatDetails type is exported from SeatTypeSelection
import SeatTypeSelection, { SeatDetails } from '@/components/reservation-components/SeatTypeSelection';
import DateSelection from '@/components/reservation-components/DateSelection';
import PartySizeSelection from '@/components/reservation-components/PartySizeSelection';
import DrinkSelection from '@/components/reservation-components/DrinkSelection';
import SpecialRequests from '@/components/reservation-components/SpecialRequests';

// --- Enums and Types ---
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
    type: string; // Consider using a specific enum/type
    is_available: boolean;
  };
  quantity: number;
};

type IconComponent = React.FC<LucideProps>;

// --- Step Configuration ---
const stepsConfig: { id: ReservationStep; icon: IconComponent; label: string }[] = [
  { id: ReservationStep.DATE, icon: Calendar, label: 'Date' },
  { id: ReservationStep.SEAT_TYPE, icon: Sofa, label: 'Seating' },
  { id: ReservationStep.PARTY_SIZE, icon: Users, label: 'Guests' },
  { id: ReservationStep.DRINKS, icon: Wine, label: 'Drinks' },
  { id: ReservationStep.SPECIAL_REQUESTS, icon: MessageSquare, label: 'Requests' },
  { id: ReservationStep.REVIEW, icon: Check, label: 'Review' },
];

// --- Step Indicator Component (Keep as is) ---
interface StepIndicatorProps { currentStep: ReservationStep; }
const ICON_SIZE_INDICATOR = 18; /* ... other constants ... */
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
                        <MotiView className="items-center" /* ... Moti props ... */>
                            <MotiView className="w-8 h-8 rounded-full items-center justify-center mb-1" /* ... Moti props ... */ style={{ backgroundColor: circleBg }}>
                                <step.icon size={ICON_SIZE_INDICATOR} color={iconColor} />
                            </MotiView>
                            <MotiText className={`text-xs font-medium ${labelColor}`} /* ... Moti props ... */>
                                {step.label}
                            </MotiText>
                        </MotiView>
                        {!isLastStep && (<MotiView className="flex-1 h-[2px] mx-1 mb-6" /* ... Moti props ... */ style={{ backgroundColor: lineBg }} />)}
                    </React.Fragment>
                );
            })}
        </View>
    );
};


// --- Review Item Component (Keep as is) ---
interface ReviewItemProps { icon: IconComponent; label: string; value: string | JSX.Element; isLast?: boolean; }
const ReviewItem: React.FC<ReviewItemProps> = ({ icon: Icon, label, value, isLast = false }) => (
    <View className={`flex-row items-start ${!isLast ? 'pb-4 mb-3 border-b border-gray-700/60' : ''}`}>
        <View className="w-8 h-8 rounded-full bg-[#f0165e]/15 items-center justify-center mr-4 mt-1 flex-shrink-0">
            <Icon size={16} color="#f0165e" />
        </View>
        <View className="flex-1">
            <Text className="text-gray-400 text-sm">{label}</Text>
            {typeof value === 'string' ? (<Text className="text-white font-medium mt-0.5">{value}</Text>) : (<View className="mt-0.5">{value}</View>)}
        </View>
    </View>
);

// --- Calculation Helpers (Keep as is) ---
const calculateItemTotal = (drink: SelectedDrink): string => (drink.drinkOption.price * drink.quantity).toFixed(2);
const calculateDrinksTotal = (drinks: SelectedDrink[]): string => drinks.reduce((sum, drink) => sum + (drink.drinkOption.price * drink.quantity), 0).toFixed(2);

// --- Step Details Mapping (Keep as is) ---
const stepDetails: { [key in ReservationStep]: { title: string; icon: IconComponent } } = { /* ... as before ... */
    [ReservationStep.DATE]: { title: 'Select Date', icon: Calendar },
    [ReservationStep.SEAT_TYPE]: { title: 'Select Seating', icon: Sofa },
    [ReservationStep.PARTY_SIZE]: { title: 'Party Size', icon: Users },
    [ReservationStep.DRINKS]: { title: 'Pre-order Drinks (Optional)', icon: Wine },
    [ReservationStep.SPECIAL_REQUESTS]: { title: 'Special Requests (Optional)', icon: MessageSquare },
    [ReservationStep.REVIEW]: { title: 'Review & Confirm', icon: Check },
};

// --- Helper Function ---
const capitalize = (s: string | null | undefined) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';


// --- Main Component ---
const NewReservationScreen = (): JSX.Element => {
  // --- Hooks ---
  const params = useLocalSearchParams<{ barId: string }>();
  const { barId } = params; // Assuming barId is always a string from params
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  // --- State ---
  const [loading, setLoading] = useState(true); // Loading bar details
  const [barName, setBarName] = useState('');
  const [barDetails, setBarDetails] = useState<{ id: string; name: string } | null>(null);

  const [currentStep, setCurrentStep] = useState(ReservationStep.DATE);

  // Reservation Details State
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  // Store the selected seat type *string* (e.g., 'table')
  const [selectedSeatType, setSelectedSeatType] = useState<SeatDetails['type'] | null>(null);
  // Default party size to 1 guest
  const [selectedPartySize, setSelectedPartySize] = useState<number>(1);
  const [selectedDrinks, setSelectedDrinks] = useState<SelectedDrink[]>([]);
  const [specialRequests, setSpecialRequests] = useState('');

  // State for Seat Selection Step - Store the FULL SeatDetails array
  const [availableSeatDetails, setAvailableSeatDetails] = useState<SeatDetails[] | null>(null);
  const [seatTypesLoading, setSeatTypesLoading] = useState<boolean>(false);
  const [seatTypesError, setSeatTypesError] = useState<string | null>(null);
  const selectedSeatDetails = useMemo(() => {
    if (!selectedSeatType || !availableSeatDetails) {
        return null;
    }
    return availableSeatDetails.find(detail => detail.type === selectedSeatType);
}, [selectedSeatType, availableSeatDetails]);

  // Submission State
  const [savingReservation, setSavingReservation] = useState(false);

  // --- Effects ---
  // Fetch Bar Details (Keep as is)
  useEffect(() => {
    const fetchBarDetails = async () => {
      if (!barId) return;
      setLoading(true);
      try {
        const { data: barData, error: barError } = await supabase.from('bars').select('id, name').eq('id', barId).single();
        if (barError) throw barError;
        if (barData) { setBarName(barData.name); setBarDetails(barData); }
        else { throw new Error('Bar not found'); }
      } catch (error: any) {
        console.error('[NewReservation] Error fetching bar details:', error);
        Toast.show({ type: 'error', text1: 'Error loading bar', text2: error.message || 'Could not fetch bar details.' });
      } finally { setLoading(false); }
    };
    fetchBarDetails();
  }, [barId]);

  // Fetch Seat Details when Date changes (UPDATED to store full details)
  useEffect(() => {
    // Reset seat-related state when date changes or becomes null
    if (!selectedDate || !barId) {
      setAvailableSeatDetails(null);
      setSelectedSeatType(null); // Reset seat type selection
      setSeatTypesLoading(false);
      setSeatTypesError(null);
      return; // Exit if no date or barId
    }

    const fetchSeatDetails = async () => {
      setSeatTypesLoading(true);
      setSeatTypesError(null);
      setAvailableSeatDetails(null); // Clear previous details
      setSelectedSeatType(null); // Reset seat type selection on new fetch

      const dateString = format(selectedDate, 'yyyy-MM-dd');

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) throw new Error("User not authenticated or session error.");
        const accessToken = session.access_token;

        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL; // Ensure this is set
        if (!supabaseUrl) throw new Error("Supabase URL not configured.");

        const functionName = 'get-seats-for-date'; // Call the second Edge Function
        const endpoint = `${supabaseUrl}/functions/v1/${functionName}/${barId}?target_date=${dateString}`;

        console.log(`[NewReservation] Fetching seats from: ${endpoint}`);
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` }
        });

        console.log(`[NewReservation] Seat fetch status: ${response.status}`);
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[NewReservation] Seat fetch error:', errorText);
          throw new Error(`Failed (${response.status}): ${errorText || 'Could not fetch seat types.'}`);
        }

        // Expect { seatDetails: [...] } from the function
        const data = await response.json();
        console.log('[NewReservation] Seat fetch response data:', data);

        // Store the FULL seatDetails array
        if (data && Array.isArray(data.seatDetails)) {
          setAvailableSeatDetails(data.seatDetails); // Store the array directly
        } else {
          console.warn('[NewReservation] Unexpected seat data format or empty details:', data);
          setAvailableSeatDetails([]); // Set empty array if format is wrong
        }

      } catch (error: any) {
        console.error('[NewReservation] Error fetching seat types:', error);
        setSeatTypesError(error.message || 'An unknown error occurred while fetching seat types.');
        setAvailableSeatDetails(null); // Set null on error
      } finally {
        setSeatTypesLoading(false);
      }
    };

    fetchSeatDetails();

  }, [selectedDate, barId]); // Re-run ONLY when selectedDate or barId changes

  // --- Mutations ---
  const createReservationMutation = useMutation({
    mutationFn: async () => {
      // Pre-flight checks
      if (!user || !barDetails || !selectedDate || !selectedSeatType || !selectedPartySize || selectedPartySize <= 0) {
        throw new Error('Missing required reservation information.');
      }

      // --- Consider adding FINAL pre-confirmation check using RPC here for production ---
      // This example uses the basic insert
      const { data: reservation, error: reservationError } = await supabase
        .from('reservations')
        .insert({
          bar_id: barDetails.id,
          customer_id: user.id,
          party_size: selectedPartySize,
          reservation_date: format(selectedDate, 'yyyy-MM-dd'), // Format date correctly
          seat_type: selectedSeatType,
          special_requests: specialRequests || null,
          status: 'confirmed',
        })
        .select()
        .single();

      if (reservationError) throw new Error(reservationError.message);
      if (!reservation) throw new Error('Failed to create reservation entry.');

      // Handle Drink Inserts
      if (selectedDrinks.length > 0) {
            const drinkInserts = selectedDrinks.map(drink => ({ /* ...drink data... */
                reservation_id: reservation.id, drink_option_id: drink.drinkOption.id,
                drink_name_at_booking: drink.drinkOption.name, drink_type_at_booking: drink.drinkOption.type,
                price_at_booking: drink.drinkOption.price, quantity: drink.quantity,
            }));
            const { error: drinksError } = await supabase.from('reservation_drinks').insert(drinkInserts);
            if (drinksError) {
                console.error('Error adding drinks:', drinksError);
                Toast.show({ type: 'warning', text1: 'Reservation Confirmed', text2: 'Could not save pre-ordered drinks.' });
            }
        }
      return reservation;
    },
    onSuccess: (data) => { /* ... keep existing onSuccess ... */
        queryClient.invalidateQueries({ queryKey: ['reservations'] });
        Toast.show({ type: 'success', text1: 'Reservation Created!', text2: `Your booking at ${barName || 'the bar'} is confirmed.` });
        router.back();
    },
    onError: (error) => { /* ... keep existing onError ... */
        console.error('Error creating reservation:', error);
        Toast.show({ type: 'error', text1: 'Reservation Failed', text2: error instanceof Error ? error.message : 'Please check details or try again.' });
    },
    onSettled: () => { setSavingReservation(false); }
  });

  // --- Callbacks & Memoized Values ---
  // Validate steps
  const isStepValid = useCallback((step: ReservationStep): boolean => {
    // (Keep existing validation logic)
    switch (step) {
      case ReservationStep.DATE: return !!selectedDate;
      case ReservationStep.SEAT_TYPE: return !!selectedSeatType;
      case ReservationStep.PARTY_SIZE: return !!selectedPartySize && selectedPartySize > 0;
      case ReservationStep.DRINKS: return true;
      case ReservationStep.SPECIAL_REQUESTS: return true;
      case ReservationStep.REVIEW:
        return !!selectedDate && !!selectedSeatType && !!selectedPartySize && selectedPartySize > 0;
      default: return false;
    }
  }, [selectedDate, selectedSeatType, selectedPartySize]);

  // Handle moving to next step or submitting
  const handleNextStep = useCallback(() => {
    // Basic step completion check
    if (!isStepValid(currentStep)) {
      let errorText = 'Please complete this step.';
      switch (currentStep) {
        case ReservationStep.DATE: errorText = 'Please select a date'; break;
        case ReservationStep.SEAT_TYPE: errorText = 'Please select an available seating type'; break;
        case ReservationStep.PARTY_SIZE: errorText = 'Please enter number of guests (min 1)'; break;
      }
      Toast.show({ type: 'error', text1: 'Step Incomplete', text2: errorText });
      return;
    }

    // Add specific validation for Party Size fitting the Selected Seat Type *before* proceeding
    if (currentStep === ReservationStep.PARTY_SIZE && selectedSeatType && availableSeatDetails) {
       const seatInfo = availableSeatDetails.find(s => s.type === selectedSeatType);
       // Ensure selectedPartySize is not null before comparison
       if (seatInfo && selectedPartySize && (selectedPartySize < seatInfo.minPeople || selectedPartySize > seatInfo.maxPeople)) {
            Toast.show({type: 'error', text1: 'Party Size Invalid', text2: `${capitalize(selectedSeatType)} seats ${seatInfo.minPeople}-${seatInfo.maxPeople} guests.`});
            // Don't proceed to next step
            return;
       }
    }

    // Proceed to next step or submit
    if (currentStep < ReservationStep.REVIEW) {
      setCurrentStep(prev => prev + 1);
    } else if (currentStep === ReservationStep.REVIEW) {
      handleSubmitReservation(); // Call submit logic
    }
  }, [currentStep, isStepValid, handleSubmitReservation, selectedPartySize, selectedSeatType, availableSeatDetails]); // Added dependencies


  // Handle going back
  const handlePreviousStep = useCallback(() => {
    if (savingReservation) return;
    if (currentStep > ReservationStep.DATE) {
      setCurrentStep(prev => prev - 1);
    } else {
      Alert.alert( /* ... discard confirmation ... */
        "Discard Reservation?", "Are you sure you want to go back? Your progress will be lost.",
        [ { text: "Cancel", style: "cancel" }, { text: "Discard", onPress: () => router.back(), style: 'destructive' } ],
        { cancelable: true }
      );
    }
  }, [currentStep, router, savingReservation]);

  // Submit handler (with added validation)
  const handleSubmitReservation = useCallback(() => {
    if (!user) { /* ... handle not logged in ... */
        Toast.show({ type: 'info', text1: 'Please sign in', text2: 'Sign in required to make a reservation.' }); return;
    }
    if (!isStepValid(ReservationStep.REVIEW)) { /* ... handle basic validation error ... */
        Toast.show({ type: 'error', text1: 'Missing Information', text2: 'Please complete all required steps.' }); return;
    }

    // Final check before calling mutation: Does party size fit?
    if (selectedSeatType && availableSeatDetails && selectedPartySize) { // Check party size is not null
       const seatInfo = availableSeatDetails.find(s => s.type === selectedSeatType);
       if (seatInfo && (selectedPartySize < seatInfo.minPeople || selectedPartySize > seatInfo.maxPeople)) {
            Toast.show({type: 'error', text1: 'Party Size Invalid', text2: `Selected seating fits ${seatInfo.minPeople}-${seatInfo.maxPeople} guests.`});
            setCurrentStep(ReservationStep.PARTY_SIZE); // Go back to party size step
            return; // Stop submission
       }
     } else if (!selectedPartySize || selectedPartySize <= 0) {
         // Explicitly check party size again if somehow null/zero
         Toast.show({ type: 'error', text1: 'Missing Information', text2: 'Please enter a valid party size.' });
         setCurrentStep(ReservationStep.PARTY_SIZE);
         return;
     }

    setSavingReservation(true);
    createReservationMutation.mutate();
  }, [user, isStepValid, createReservationMutation, setCurrentStep, selectedPartySize, selectedSeatType, availableSeatDetails]); // Added dependencies

  // Get current step details for display
  const currentStepDetail = useMemo(() => stepDetails[currentStep], [currentStep]);

  // Dynamic button text
  const getNextButtonText = useCallback(() => {
    if (currentStep === ReservationStep.REVIEW) return 'Confirm Reservation';
    return 'Continue';
  }, [currentStep]);

  // Formatting function
  const formatDate = useCallback((date: Date | null) => {
    if (!date) return 'Not selected';
    return format(date, 'EEE, MMM d, yyyy');
  }, []);


  // --- Main Render ---
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable style={styles.backButton} onPress={handlePreviousStep} disabled={savingReservation}>
            <ArrowLeft size={22} color={savingReservation ? "#666" : "#fff"} />
          </Pressable>
          <View className="flex-1 items-center mr-10">
             <Text className="text-lg font-semibold text-white text-center" numberOfLines={1} ellipsizeMode='tail'>{barName || 'New Reservation'}</Text>
             <Text className="text-sm text-gray-400 text-center">{currentStepDetail.title}</Text>
          </View>
        </View>
        <StepIndicator currentStep={currentStep} />
      </View>

      {/* Main Content ScrollView */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        keyboardShouldPersistTaps="handled" // Important for TextInput dismissal
      >
        {/* Animated Step Content */}
        <MotiView
          key={currentStep} // Ensures animation runs when step changes
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          exit={{ opacity: 0, translateY: -20 }}
          transition={{ type: 'timing', duration: 350 }}
          style={{ width: '100%' }}
        >
          {/* Render Component based on currentStep */}
          {currentStep === ReservationStep.DATE && barId && (
            <DateSelection
              barId={barId} // Pass barId
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
            />
          )}

          {currentStep === ReservationStep.SEAT_TYPE && (
            <SeatTypeSelection
              seatDetails={availableSeatDetails} // Pass the full SeatDetails array
              isLoading={seatTypesLoading}
              error={seatTypesError}
              selectedSeatType={selectedSeatType}
              partySize={selectedPartySize ?? 1} // Pass current party size (default to 1 if null)
              onSeatTypeChange={setSelectedSeatType} // Callback sets the type string
            />
          )}

{currentStep === ReservationStep.PARTY_SIZE && (
  <PartySizeSelection
    selectedPartySize={selectedPartySize}
    onPartySizeChange={setSelectedPartySize}
    // Pass the min/max limits for the selected seat type
    // Provide defaults (e.g., 1-10) if no seat type is selected yet or details missing
    minSize={selectedSeatDetails?.minPeople ?? 1}
    maxSize={selectedSeatDetails?.maxPeople ?? 10} // Use a reasonable default max
    selectedSeatTypeLabel={selectedSeatType ? capitalize(selectedSeatType) : null}
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
                {/* Review Items */}
                <ReviewItem icon={Calendar} label="Date" value={selectedDate ? formatDate(selectedDate) : 'Not selected'} />
                <ReviewItem icon={Sofa} label="Seating Type" value={selectedSeatType ? capitalize(selectedSeatType) : 'Not selected'} />
                <ReviewItem icon={Users} label="Party Size" value={selectedPartySize ? `${selectedPartySize} Guest${selectedPartySize !== 1 ? 's' : ''}` : 'Not selected'} />
                <ReviewItem icon={Wine} label="Pre-ordered Drinks" value={selectedDrinks.length > 0 ? ( /* ... drink details render ... */
                    <View className="mt-1 w-full">{selectedDrinks.map((drink, index) => ( <View key={index} className="flex-row justify-between items-center mb-1 w-full"><Text className="text-white text-sm flex-1 mr-2" numberOfLines={1} ellipsizeMode="tail">{drink.quantity}x {drink.drinkOption.name}</Text><Text className="text-gray-300 text-sm">${calculateItemTotal(drink)}</Text></View> ))}<View className="flex-row justify-between mt-3 pt-2 border-t border-gray-700/50 w-full"><Text className="text-white font-semibold">Drinks Total</Text><Text className="text-white font-semibold">${calculateDrinksTotal(selectedDrinks)}</Text></View></View>
                ) : (<Text className="text-gray-500 italic">None</Text>)} />
                <ReviewItem icon={MessageSquare} label="Special Requests" value={specialRequests || <Text className="text-gray-500 italic">None</Text>} isLast />
              </View>
              {/* Info Box */}
              <View className="bg-[#f0165e]/10 p-4 rounded-xl mb-6 flex-row items-start">
                 <Info size={18} color="#f0165e" className="mr-3 mt-1 flex-shrink-0" />
                 <Text className="text-gray-300 text-sm flex-1">Please review details carefully. Confirming agrees to cancellation policy.</Text>
              </View>
            </View>
          )}
        </MotiView>

        {/* Spacer to push button down */}
        <View style={{ flexGrow: 1 }} />

      </ScrollView>

      {/* Footer Button */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [ styles.buttonBase, savingReservation && styles.buttonDisabled, pressed && !savingReservation && styles.buttonPressed, ]}
          onPress={savingReservation ? undefined : handleNextStep} // Call handleNextStep or handleSubmitReservation
          disabled={savingReservation}
          accessibilityRole="button"
          accessibilityLabel={getNextButtonText()}
        >
          <LinearGradient colors={savingReservation ? ['#555', '#444'] : ['#f0165e', '#d40a4d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.buttonGradient}>
            {savingReservation ? (<ActivityIndicator color="white" size="small" />) : (<Text style={styles.buttonText}>{getNextButtonText()}</Text>)}
          </LinearGradient>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};


// --- Styles --- (Make sure you have these defined at the bottom)
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    paddingTop: Platform.OS === 'android' ? 15 : 0,
    paddingBottom: 5,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a35',
    backgroundColor: '#18181b',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    height: 44,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
    zIndex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingHorizontal: 15,
    paddingTop: 20,
    paddingBottom: 20,
    flexGrow: 1,
  },
  footer: {
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#2a2a35',
    backgroundColor: '#18181b',
  },
  buttonBase: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  buttonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
});


export default NewReservationScreen;