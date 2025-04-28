import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
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
  Info,
  LucideProps,
} from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase'; // Assuming correct path
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import Toast from '@/components/general/Toast'; // Assuming correct path
import { useAuthStore } from '@/src/features/auth/store/auth-store'; // Assuming correct path
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView, MotiText } from 'moti';
import { format } from 'date-fns';
import SeatTypeSelection, { SeatDetails } from '@/components/reservation-components/SeatTypeSelection'; // Assuming correct path
import DateSelection from '@/components/reservation-components/DateSelection'; // Assuming correct path
import PartySizeSelection from '@/components/reservation-components/PartySizeSelection'; // Assuming correct path
import DrinkSelection from '@/components/reservation-components/DrinkSelection'; // Assuming correct path
import SpecialRequests from '@/components/reservation-components/SpecialRequests'; // Assuming correct path

// --- Enums and Types ---
enum ReservationStep { DATE, SEAT_TYPE, PARTY_SIZE, DRINKS, SPECIAL_REQUESTS, REVIEW }

// Update these types to match the ones in DrinkSelection.tsx
type DrinkType = 'single-drink' | 'bottle';

type DrinkOptionType = {
    id: string;
    name: string | null; 
    price: number;
    description: string | null;
    image_url: string | null;
    type: DrinkType;
    is_available: boolean;
};

type SelectedDrinkType = {
    drinkOption: DrinkOptionType;
    quantity: number;
};

// Type alias to fix type compatibility issues
type SelectedDrink = SelectedDrinkType;

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

// --- Step Indicator Component ---
interface StepIndicatorProps { currentStep: ReservationStep; }
const ICON_SIZE_INDICATOR = 18;
const ACTIVE_COLOR_INDICATOR = '#f0165e';
const INACTIVE_COLOR_INDICATOR = '#555';
const LINE_COLOR_INACTIVE_INDICATOR = '#333';
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
                const lineBg = isCompleted ? ACTIVE_COLOR_INDICATOR : LINE_COLOR_INACTIVE_INDICATOR;

                return (
                    <React.Fragment key={step.id}>
                        <MotiView className="items-center" from={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'timing', duration: 300, delay: index * 50 }}>
                            <MotiView className="w-8 h-8 rounded-full items-center justify-center mb-1" style={{ backgroundColor: circleBg }} from={{ scale: isActive ? 0.8 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
                                <step.icon size={ICON_SIZE_INDICATOR} color={iconColor} />
                            </MotiView>
                            <MotiText className={`text-xs font-medium ${labelColor}`} from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 300, delay: index * 70 }}>
                                {step.label}
                            </MotiText>
                        </MotiView>
                        {!isLastStep && (<MotiView className="flex-1 h-[2px] mx-1 mb-6" style={{ backgroundColor: lineBg }} from={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ type: 'timing', duration: 400, delay: index * 60 }} />)}
                    </React.Fragment>
                );
            })}
        </View>
    );
};


// --- Review Item Component ---
interface ReviewItemProps { icon: IconComponent; label: string; value: string | JSX.Element; isLast?: boolean; }
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

// --- Calculation Helpers ---
const calculateItemTotal = (drink: SelectedDrink): string => (drink.drinkOption.price * drink.quantity).toFixed(2);
const calculateDrinksTotal = (drinks: SelectedDrink[]): string => drinks.reduce((sum, drink) => sum + (drink.drinkOption.price * drink.quantity), 0).toFixed(2);

// --- Step Details Mapping ---
const stepDetails: { [key in ReservationStep]: { title: string; icon: IconComponent } } = {
    [ReservationStep.DATE]: { title: 'Select Date', icon: Calendar },
    [ReservationStep.SEAT_TYPE]: { title: 'Select Seating', icon: Sofa },
    [ReservationStep.PARTY_SIZE]: { title: 'Party Size', icon: Users },
    [ReservationStep.DRINKS]: { title: 'Pre-order Drinks (Optional)', icon: Wine },
    [ReservationStep.SPECIAL_REQUESTS]: { title: 'Special Requests (Optional)', icon: MessageSquare },
    [ReservationStep.REVIEW]: { title: 'Review & Confirm', icon: Check },
};

// --- Helper Function ---
const capitalize = (s: string | null | undefined) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

// --- TanStack Query Fetch Function for Seat Details ---
const fetchSeatDetailsForDate = async ({ queryKey }: { queryKey: readonly unknown[] }): Promise<SeatDetails[]> => {
    const [_key, barId, dateString] = queryKey as [string, string, string];

    if (!barId || !dateString) {
        console.log("[queryFn SeatDetails] Skipping fetch: Missing barId or dateString.");
        return []; // Return empty array, let 'enabled' handle query execution
    }

    console.log(`[queryFn SeatDetails] Fetching seats for bar: ${barId}, date: ${dateString}`);
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
        console.error("[queryFn SeatDetails] Auth error:", sessionError?.message || "No session");
        throw new Error("Authentication required.");
    }
    const accessToken = session.access_token;
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
        console.error("[queryFn SeatDetails] Config error: EXPO_PUBLIC_SUPABASE_URL missing.");
        throw new Error("Configuration error.");
    }

    const functionName = 'get-seats-for-date';
    const endpoint = `${supabaseUrl}/functions/v1/${functionName}/${barId}?target_date=${dateString}`;

    console.log(`[queryFn SeatDetails] Calling endpoint: ${endpoint}`);
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        }
    });

    console.log(`[queryFn SeatDetails] Response status: ${response.status}`);
    if (!response.ok) {
        let errorPayload = { message: `Request failed with status ${response.status}` };
        try {
            const errorData = await response.json();
            if (errorData?.error) {
                 errorPayload.message = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
            }
        } catch (e) {
            console.warn("[queryFn SeatDetails] Could not parse error response as JSON.");
        }
        console.error('[queryFn SeatDetails] Fetch failed:', errorPayload.message);
        throw new Error(errorPayload.message);
    }

    const data = await response.json();
    console.log('[queryFn SeatDetails] Raw success response data:', data);

    if (data && Array.isArray(data.seatDetails)) {
        console.log('[queryFn SeatDetails] Successfully fetched seat details.');
        return data.seatDetails as SeatDetails[];
    } else {
        console.warn('[queryFn SeatDetails] Unexpected data format:', data);
        throw new Error('Received invalid data format.');
    }
};


// --- Main Component ---
const NewReservationScreen = (): JSX.Element => {
  // --- Hooks ---
  const params = useLocalSearchParams<{ barId: string }>();
  const { barId } = params;
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  // --- State ---
  const [loadingBarDetails, setLoadingBarDetails] = useState(true);
  const [barName, setBarName] = useState('');
  const [barDetails, setBarDetails] = useState<{ id: string; name: string } | null>(null);
  const [currentStep, setCurrentStep] = useState(ReservationStep.DATE);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSeatType, setSelectedSeatType] = useState<SeatDetails['type'] | null>(null);
  const [selectedPartySize, setSelectedPartySize] = useState<number>(1);
  const [selectedDrinks, setSelectedDrinks] = useState<SelectedDrink[]>([]);
  const [specialRequests, setSpecialRequests] = useState('');
  const [savingReservation, setSavingReservation] = useState(false); // State for final submission loading
  const [seatRestrictions, setSeatRestrictions] = useState<SeatDetails['restrictions'] | null>(null);

  // --- Effects ---
  // Fetch initial bar details
  useEffect(() => {
    const fetchBarDetails = async () => {
      if (!barId) {
        console.error('[NewReservation] No Bar ID.');
        Toast.show({ type: 'error', text1: 'Error', text2: 'Bar ID is missing.' });
        setLoadingBarDetails(false);
        // Maybe navigate back or show a more persistent error UI element
        // router.back();
        return;
      }
      console.log(`[NewReservation] Fetching details for bar ID: ${barId}`);
      setLoadingBarDetails(true);
      setBarDetails(null); // Reset previous details if barId changes
      setBarName('');
      try {
        const { data: barData, error: barError } = await supabase
          .from('bars')
          .select('id, name')
          .eq('id', barId)
          .single();

        if (barError) throw barError;
        if (!barData) throw new Error('Bar not found.');

        console.log('[NewReservation] Bar details fetched:', barData);
        setBarName(barData.name);
        setBarDetails(barData);
      } catch (error: any) {
        console.error('[NewReservation] Failed to fetch bar details:', error);
        Toast.show({ type: 'error', text1: 'Error Loading Bar', text2: error.message || 'Could not retrieve bar info.' });
        setBarDetails(null);
        setBarName('');
      } finally {
        setLoadingBarDetails(false);
      }
    };
    fetchBarDetails();
  }, [barId]);

  // --- TanStack Query Hook for Seat Details ---
  const dateString = useMemo(() => selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null, [selectedDate]);

  const {
    data: availableSeatDetailsData,
    isLoading: seatTypesLoading, // Loading state for seat details fetch
    // isFetching: seatTypesFetching, // Use if needed for background refetch indicator
    isError: isSeatTypesError, // Error state for seat details fetch
    error: seatTypesErrorObject,
  } = useQuery<SeatDetails[], Error>({
     queryKey: ['seatDetails', barId, dateString],
     queryFn: fetchSeatDetailsForDate,
     // Query only runs if we have a valid barId and a selected date
     enabled: !!barId && !!dateString && !!barDetails,
     // Optional: Configure caching, retries etc.
     // staleTime: 60 * 1000, // 1 minute
     // cacheTime: 5 * 60 * 1000, // 5 minutes
     // retry: 1,
  });

  const availableSeatDetails = availableSeatDetailsData ?? []; // Default to empty array

  const seatTypesErrorMessage = useMemo(() => {
    if (!isSeatTypesError || !seatTypesErrorObject) return null;
    return seatTypesErrorObject.message || 'Error loading seating options.';
  }, [isSeatTypesError, seatTypesErrorObject]);

  // --- Effect to Reset Seat Selection When Date Changes ---
  useEffect(() => {
      if (selectedDate !== null) { // Check against null to avoid reset on initial load
           console.log("[Effect] Date changed, resetting selected seat type.");
           setSelectedSeatType(null);
           // Optional: Reset party size if desired, but usually better to keep it
           // setSelectedPartySize(1);
      }
  }, [selectedDate]);


  // --- Derived State: Full Details of Selected Seat ---
  const selectedSeatDetails = useMemo(() => {
    if (!selectedSeatType || availableSeatDetails.length === 0) return null;
    const details = availableSeatDetails.find(detail => detail.type === selectedSeatType);
    if (!details) {
        console.warn(`Consistency warning: Selected seat type "${selectedSeatType}" not found in latest details.`);
        // Consider resetting selectedSeatType here if strict consistency is needed
        // setSelectedSeatType(null);
    }
    return details ?? null;
  }, [selectedSeatType, availableSeatDetails]);


  // --- TanStack Mutation for Creating Reservation ---
  const createReservationMutation = useMutation({
    mutationFn: async () => {
      // Pre-flight checks (already done partially by button state, but good practice)
      if (!user) throw new Error('Login required.');
      if (!barDetails) throw new Error('Bar details missing.');
      if (!selectedDate) throw new Error('Date not selected.');
      if (!selectedSeatType) throw new Error('Seating not selected.');
      if (!selectedPartySize || selectedPartySize <= 0) throw new Error('Invalid party size.');
      if (selectedSeatDetails && (selectedPartySize < selectedSeatDetails.minPeople || selectedPartySize > selectedSeatDetails.maxPeople)) {
          throw new Error(`Party size (${selectedPartySize}) doesn't fit ${capitalize(selectedSeatType)} (${selectedSeatDetails.minPeople}-${selectedSeatDetails.maxPeople} guests).`);
      }
      if (!selectedSeatDetails && selectedSeatType) {
          throw new Error('Could not verify seating details. Please retry.');
      }

      console.log('[Mutation] Creating reservation with:', { barId: barDetails.id, userId: user.id, date: dateString, seat: selectedSeatType, party: selectedPartySize });
      const { data: reservation, error: reservationError } = await supabase
        .from('reservations')
        .insert({
          bar_id: barDetails.id,
          customer_id: user.id,
          party_size: selectedPartySize,
          reservation_date: format(selectedDate, 'yyyy-MM-dd'),
          seat_type: selectedSeatType,
          special_requests: specialRequests?.trim() || null,
          status: 'confirmed', // Adjust if needed
        })
        .select()
        .single();

      if (reservationError) throw new Error(`Database error: ${reservationError.message}`);
      if (!reservation) throw new Error('Failed to confirm reservation creation.');
      console.log('[Mutation] Reservation created:', reservation);

      // Insert drinks if any
      if (selectedDrinks.length > 0) {
            console.log(`[Mutation] Adding ${selectedDrinks.length} drink pre-orders for reservation ID: ${reservation.id}`);
            const drinkInserts = selectedDrinks.map(drink => ({
                reservation_id: reservation.id,
                drink_option_id: drink.drinkOption.id,
                drink_name_at_booking: drink.drinkOption.name || '',
                drink_type_at_booking: drink.drinkOption.type, // This is now correctly typed as 'single-drink' | 'bottle'
                price_at_booking: drink.drinkOption.price,
                quantity: drink.quantity,
            }));

            const { error: drinksError } = await supabase.from('reservation_drinks').insert(drinkInserts);

            if (drinksError) {
                console.error('[Mutation] Error adding drinks:', drinksError);
                // Don't fail the whole process, just warn
                Toast.show({ type: 'warning', text1: 'Reservation Confirmed', text2: 'Could not save pre-ordered drinks.' });
            } else {
                 console.log('[Mutation] Drinks added successfully.');
            }
        }
      return reservation;
    },
    onSuccess: (data) => {
      console.log('[Mutation] onSuccess', data);
        queryClient.invalidateQueries({ queryKey: ['reservations'] }); // Invalidate general reservations list
        queryClient.invalidateQueries({ queryKey: ['seatDetails', barId, dateString] }); // Invalidate availability for this date

        Toast.show({ type: 'success', text1: 'Reservation Confirmed!', text2: `Booking at ${barName} for ${format(selectedDate!, 'MMM d, yyyy')} confirmed.` });
        router.back(); // Navigate back
    },
    onError: (error) => {
        console.error('[Mutation] onError:', error);
        Toast.show({ type: 'error', text1: 'Reservation Failed', text2: error instanceof Error ? error.message : 'An unexpected error occurred.' });
    },
    onSettled: () => {
        console.log('[Mutation] onSettled');
        setSavingReservation(false); // Ensure loading indicator stops
    }
  });

  // --- Callbacks & Memoized Values ---

  // Check if the current step's selections are valid
  const isStepValid = useCallback((step: ReservationStep): boolean => {
    switch (step) {
      case ReservationStep.DATE:
        return !!selectedDate;
      case ReservationStep.SEAT_TYPE:
        // Valid if a seat type is selected AND we are not loading/in error state for seats
        return !!selectedSeatType && !seatTypesLoading && !isSeatTypesError;
      case ReservationStep.PARTY_SIZE:
        // Valid if party size > 0 AND it fits the selected seat's capacity
        if (!selectedPartySize || selectedPartySize <= 0) return false;
        if (selectedSeatDetails) { // Use derived details for validation
             return selectedPartySize >= selectedSeatDetails.minPeople && selectedPartySize <= selectedSeatDetails.maxPeople;
        }
        // If seat details aren't available (e.g., still loading/error after seat selection), consider it invalid for safety
        return false;
      case ReservationStep.DRINKS: 
        // Check if the drink step has minimum requirements and if those are met
        if (seatRestrictions?.min_bottles || seatRestrictions?.min_consumption) {
          // If the step has restrictions, we need to check if they're met
          // We'll look for our flag on the last drink object (added in DrinkSelection component)
          const anyDrinkExists = selectedDrinks.length > 0;
          if (!anyDrinkExists) return false;
          
          // We need to manually check requirement satisfaction - don't rely solely on the flag
          if (seatRestrictions?.min_bottles) {
            // Count bottles
            const bottleCount = selectedDrinks.reduce((count, drink) => {
              return drink.drinkOption.type === 'bottle' ? count + drink.quantity : count;
            }, 0);
            if (bottleCount < seatRestrictions.min_bottles) return false;
          }
          
          if (seatRestrictions?.min_consumption) {
            // Calculate total spent
            const totalSpent = selectedDrinks.reduce(
              (sum, drink) => sum + (drink.drinkOption.price * drink.quantity), 
              0
            );
            if (totalSpent < seatRestrictions.min_consumption) return false;
          }
          
          // If we've reached here, all requirements are met
          return true;
        }
        // No restrictions - optional step is always valid
        return true;
      case ReservationStep.SPECIAL_REQUESTS: // Optional
        return true;
      case ReservationStep.REVIEW: // Check all mandatory previous steps
        // Re-check party size validity here as well
        const partySizeValid = selectedSeatDetails
          ? (selectedPartySize >= selectedSeatDetails.minPeople && selectedPartySize <= selectedSeatDetails.maxPeople)
          : false;
          
        // Check drink requirements if any exist
        let drinksValid = true;
        if (seatRestrictions?.min_bottles || seatRestrictions?.min_consumption) {
          const anyDrinkExists = selectedDrinks.length > 0;
          if (!anyDrinkExists) {
            drinksValid = false;
          } else {
            // Directly check requirements instead of relying on flags
            if (seatRestrictions?.min_bottles) {
              const bottleCount = selectedDrinks.reduce((count, drink) => {
                return drink.drinkOption.type === 'bottle' ? count + drink.quantity : count;
              }, 0);
              if (bottleCount < seatRestrictions.min_bottles) drinksValid = false;
            }
            
            if (seatRestrictions?.min_consumption) {
              const totalSpent = selectedDrinks.reduce(
                (sum, drink) => sum + (drink.drinkOption.price * drink.quantity), 
                0
              );
              if (totalSpent < seatRestrictions.min_consumption) drinksValid = false;
            }
          }
        }
        return !!selectedDate && !!selectedSeatType && !!selectedPartySize && partySizeValid && drinksValid;
      default:
        return false;
    }
  }, [selectedDate, selectedSeatType, selectedPartySize, selectedSeatDetails, seatTypesLoading, isSeatTypesError, seatRestrictions, selectedDrinks]); // Dependencies

  // Handle moving to the next step or submitting
  const handleNextStep = useCallback(() => {
    // Basic check first - is the current step fundamentally complete?
    let isCurrentStepFundamentallyValid = false;
    switch (currentStep) {
        case ReservationStep.DATE: isCurrentStepFundamentallyValid = !!selectedDate; break;
        case ReservationStep.SEAT_TYPE: isCurrentStepFundamentallyValid = !!selectedSeatType; break;
        case ReservationStep.PARTY_SIZE: isCurrentStepFundamentallyValid = !!selectedPartySize && selectedPartySize > 0; break;
        default: isCurrentStepFundamentallyValid = true; // Optional steps or review
    }

    if (!isCurrentStepFundamentallyValid) {
        let errorText = 'Please complete this step.';
        if (currentStep === ReservationStep.DATE) errorText = 'Please select a date.';
        else if (currentStep === ReservationStep.SEAT_TYPE) errorText = 'Please select an available seating type.';
        else if (currentStep === ReservationStep.PARTY_SIZE) errorText = 'Please enter the number of guests (minimum 1).';
        Toast.show({ type: 'error', text1: 'Incomplete Step', text2: errorText });
        return;
    }

    // Now perform more complex validation (like party size fitting the seat)
    // using the memoized `isStepValid` which includes these checks.
    if (!isStepValid(currentStep)) {
         // isStepValid already includes the check for party size fit.
         // Give specific feedback if it's the party size step failing the detailed check.
         if (currentStep === ReservationStep.PARTY_SIZE && selectedSeatDetails) {
             Toast.show({ type: 'error', text1: 'Party Size Invalid', text2: `${capitalize(selectedSeatType)} accommodates ${selectedSeatDetails.minPeople}-${selectedSeatDetails.maxPeople} guests.` });
         } else if (currentStep === ReservationStep.SEAT_TYPE && (seatTypesLoading || isSeatTypesError)) {
             // This case should ideally be prevented by the disabled button state, but double-check
             Toast.show({ type: 'info', text1: 'Seating Info Update', text2: seatTypesLoading ? 'Loading seating details...' : 'Error loading seating options.' });
         } else {
             // Generic fallback if somehow invalid without specific message
             Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Please check your selections for this step.' });
         }
         return; // Stop if not valid
    }

    // Proceed or Submit
    if (currentStep < ReservationStep.REVIEW) {
      setCurrentStep(prev => prev + 1);
    } else if (currentStep === ReservationStep.REVIEW) {
      if (!savingReservation) { // Prevent double submission
         setSavingReservation(true); // Show loading on button
         createReservationMutation.mutate(); // Start the mutation
      }
    }
  }, [
      currentStep,
      isStepValid, // Use the memoized validation check
      savingReservation,
      selectedDate, // Needed for fundamental checks
      selectedSeatType, // Needed for fundamental checks
      selectedPartySize, // Needed for fundamental checks
      selectedSeatDetails, // Needed for specific validation messages
      seatTypesLoading, // Needed for specific validation messages
      isSeatTypesError, // Needed for specific validation messages
      createReservationMutation, // Dependency for submission
  ]);

  // Handle navigating back
  const handlePreviousStep = useCallback(() => {
    if (savingReservation) return; // Prevent back navigation during save

    if (currentStep > ReservationStep.DATE) {
      setCurrentStep(prev => prev - 1);
    } else {
      // Prompt before discarding on the first step
      Alert.alert(
        "Discard Reservation?",
        "Go back? Your selections will be lost.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Discard", onPress: () => router.back(), style: 'destructive' }
        ],
        { cancelable: true }
      );
    }
  }, [currentStep, router, savingReservation]);

  const currentStepDetail = useMemo(() => stepDetails[currentStep], [currentStep]);

  const getNextButtonText = useCallback(() => {
    if (currentStep === ReservationStep.REVIEW) return 'Confirm Reservation';
    return 'Continue';
  }, [currentStep]);

  const formatDateForReview = useCallback((date: Date | null): string => {
    if (!date) return 'Not selected';
    try {
        return format(date, 'EEE, MMM d, yyyy'); // e.g., "Wed, Oct 27, 2023"
    } catch (e) {
        console.error("Error formatting date:", e); return "Invalid Date";
    }
  }, []);

  // --- Derived State for Button ---
  // Determines if the main action button should be disabled
  const isContinueDisabled = useMemo(() => {
      // Always disabled if saving the reservation
      if (savingReservation) return true;
      // Always disabled if essential bar details haven't loaded
      if (!barDetails) return true;
      // Disabled if the current step's specific requirements aren't met
      if (!isStepValid(currentStep)) return true;

      // Specific check for SEAT_TYPE step: disable while loading or if error occurred
      if (currentStep === ReservationStep.SEAT_TYPE && (seatTypesLoading || isSeatTypesError)) {
          return true;
      }

      // If none of the above, the button is enabled
      return false;
  }, [savingReservation, currentStep, isStepValid, barDetails, seatTypesLoading, isSeatTypesError]);

  // --- Main Render ---
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable
            style={({ pressed }) => [
                styles.backButton,
                { opacity: pressed || savingReservation ? 0.6 : 1 } // Dim if saving or pressed
            ]}
            onPress={handlePreviousStep}
            disabled={savingReservation}
          >
            <ArrowLeft size={22} color="#fff" />
          </Pressable>
          <View style={styles.headerTitleContainer}>
             <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode='tail'>
                 {loadingBarDetails ? 'Loading...' : (barName || 'New Reservation')}
             </Text>
             {!loadingBarDetails && barDetails && (
                 <Text style={styles.headerSubtitle}>
                     {currentStepDetail.title}
                 </Text>
             )}
          </View>
          {/* Spacer to help center title when back button exists */}
          <View style={{ width: 38 }} />
        </View>
        {/* Show Step Indicator only when bar details are loaded */}
        {!loadingBarDetails && barDetails && (
            <StepIndicator currentStep={currentStep} />
        )}
      </View>

      {/* Scrollable Content Area */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* --- Initial Loading Indicator --- */}
        {loadingBarDetails && (
            <View style={styles.centeredMessageContainer}>
                <ActivityIndicator size="large" color="#f0165e" />
                <Text style={styles.loadingText}>Loading Bar Information...</Text>
            </View>
        )}

        {/* --- Error State for Initial Load --- */}
        {!loadingBarDetails && !barDetails && !barId && ( // Case where barId was missing
             <View style={styles.centeredMessageContainer}>
                 <Text style={styles.errorText}>Bar Information Missing</Text>
                 <Text style={styles.infoText}>Could not load reservation details because the Bar ID is missing.</Text>
             </View>
         )}
         {!loadingBarDetails && !barDetails && barId && ( // Case where fetch failed
              <View style={styles.centeredMessageContainer}>
                  <Text style={styles.errorText}>Failed to Load Bar</Text>
                  <Text style={styles.infoText}>Could not retrieve information for this bar. Please check the link or try again.</Text>
                   {/* Optional: Add a retry button here */}
              </View>
          )}

        {/* --- Main Step Content (Render only if bar details loaded) --- */}
        {!loadingBarDetails && barDetails && (
            <MotiView
              key={currentStep} // Animate on step change
              from={{ opacity: 0, translateY: 15 }}
              animate={{ opacity: 1, translateY: 0 }}
              exit={{ opacity: 0, translateY: -15 }}
              transition={{ type: 'timing', duration: 250 }} // Slightly faster transition
              style={{ width: '100%' }}
            >
              {/* Render Step Component */}
              {currentStep === ReservationStep.DATE && (
                <DateSelection barId={barId} selectedDate={selectedDate} onDateChange={setSelectedDate} />
              )}

              {currentStep === ReservationStep.SEAT_TYPE && (
                <SeatTypeSelection
                  seatDetails={availableSeatDetails}
                  isLoading={seatTypesLoading}
                  error={seatTypesErrorMessage} // Pass the error message string
                  selectedSeatType={selectedSeatType}
                  partySize={selectedPartySize} // Pass current party size for potential filtering/display
                  onSeatTypeChange={(seatType) => {
                    setSelectedSeatType(seatType);
                    const details = availableSeatDetails.find((s) => s.type === seatType);
                    setSeatRestrictions(details?.restrictions ?? null);
                  }}
                />
              )}

              {currentStep === ReservationStep.PARTY_SIZE && (
                <PartySizeSelection
                  selectedPartySize={selectedPartySize}
                  onPartySizeChange={setSelectedPartySize}
                  // Provide min/max based on the *derived* selectedSeatDetails
                  minSize={selectedSeatDetails?.minPeople ?? 1}
                  maxSize={selectedSeatDetails?.maxPeople ?? 10} // Provide a sensible default max
                  selectedSeatTypeLabel={selectedSeatType ? capitalize(selectedSeatType) : null}
                />
              )}

              {currentStep === ReservationStep.DRINKS && (
                <DrinkSelection
                  barId={barDetails.id}
                  selectedDrinks={selectedDrinks}
                  onDrinksChange={(drinks) => {
                    // Force TypeScript to accept this with a type assertion
                    // This is safe because we've aligned the types structurally
                    setSelectedDrinks(drinks as any);
                  }}
                  restrictions={seatRestrictions || null}
                  seatTypeLabel={selectedSeatType ? capitalize(selectedSeatType) : null}
                />
              )}

              {currentStep === ReservationStep.SPECIAL_REQUESTS && (
                <SpecialRequests
                  specialRequests={specialRequests}
                  onSpecialRequestsChange={setSpecialRequests}
                />
              )}

              {/* --- Review Step UI --- */}
              {currentStep === ReservationStep.REVIEW && (
                <View className="mb-6 px-1">
                  <Text className="text-xl font-bold text-white mb-5">Review Your Reservation</Text>
                  <View className="bg-[#1c1c22] p-5 rounded-2xl mb-5 shadow-md">
                    {/* Review Items */}
                    <ReviewItem icon={Calendar} label="Date" value={formatDateForReview(selectedDate)} />
                    <ReviewItem icon={Sofa} label="Seating Type" value={capitalize(selectedSeatType) || 'Not selected'} />
                    <ReviewItem icon={Users} label="Party Size" value={selectedPartySize ? `${selectedPartySize} Guest${selectedPartySize !== 1 ? 's' : ''}` : 'Not selected'} />
                    <ReviewItem icon={Wine} label="Pre-ordered Drinks" value={selectedDrinks.length > 0 ? (
                        <View className="mt-1 w-full">
                            {selectedDrinks.map((drink, index) => (
                                <View key={index} className="flex-row justify-between items-center mb-1 w-full">
                                    <Text className="text-white text-sm flex-1 mr-2" numberOfLines={1}>{drink.quantity}x {drink.drinkOption.name}</Text>
                                    <Text className="text-gray-300 text-sm">${calculateItemTotal(drink)}</Text>
                                </View>
                            ))}
                            <View className="flex-row justify-between mt-3 pt-2 border-t border-gray-700/50 w-full">
                                <Text className="text-white font-semibold">Drinks Total</Text>
                                <Text className="text-white font-semibold">${calculateDrinksTotal(selectedDrinks)}</Text>
                            </View>
                        </View>
                    ) : (<Text className="text-gray-500 italic">None</Text>)} />
                    <ReviewItem icon={MessageSquare} label="Special Requests" value={specialRequests?.trim() ? specialRequests.trim() : <Text className="text-gray-500 italic">None</Text>} />
                    <ReviewItem icon={Check} label="Name" value={profile?.name || profile?.email || 'Unknown'} isLast />
                  </View>

                  {/* Info Box */}
                  <View className="bg-[#f0165e]/10 p-4 rounded-xl mb-6 flex-row items-start">
                     <Info size={18} color="#f0165e" className="mr-3 mt-0.5 flex-shrink-0" />
                     <Text className="text-gray-300 text-sm flex-1">Please double-check all details. Confirming your reservation may be subject to the venue's cancellation policy.</Text>
                  </View>
                </View>
              )}
            </MotiView>
         )}

        {/* Spacer to push button to bottom */}
        <View style={{ flexGrow: 1 }} />
      </ScrollView>

      {/* Footer Button - Show only if bar details loaded */}
      {!loadingBarDetails && barDetails && (
          <View style={styles.footer}>
            <Pressable
              // Use the derived disabled state
              disabled={isContinueDisabled}
              onPress={handleNextStep}
              // Apply styles based on pressed state AND derived disabled state
              style={({ pressed }) => [
                  styles.buttonBase,
                  isContinueDisabled && styles.buttonDisabled, // Style for disabled
                  pressed && !isContinueDisabled && styles.buttonPressed, // Style for pressed (only if not disabled)
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: isContinueDisabled }}
              accessibilityLabel={getNextButtonText()}
            >
              <LinearGradient
                // Change colors based on disabled state
                colors={isContinueDisabled ? ['#555', '#444'] : ['#f0165e', '#d40a4d']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.buttonGradient}
               >
                {/* Show loader only when saving, not just disabled */}
                {savingReservation ? (
                    <ActivityIndicator color="#fff" size="small" />
                 ) : (
                    <Text style={styles.buttonText}>{getNextButtonText()}</Text>
                 )}
              </LinearGradient>
            </Pressable>
          </View>
      )}
    </SafeAreaView>
  );
};


// --- Styles ---
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#121212', // Dark background
  },
  header: {
    paddingTop: Platform.OS === 'android' ? 15 : 0,
    paddingBottom: 5,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a35', // Darker border
    backgroundColor: '#18181b', // Slightly lighter header bg
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', // Space between back, title, spacer
    marginBottom: 10,
    minHeight: 44, // Ensure consistent height
  },
  backButton: {
    padding: 8, // Hit area
    marginLeft: -8, // Align visually with edge padding
    zIndex: 1,
  },
  headerTitleContainer: {
      flex: 1, // Take available space
      alignItems: 'center', // Center text horizontally
      justifyContent: 'center', // Center text vertically if needed
      // Remove margin if using spacer: marginRight: 38, // Account for back button width approx
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600', // Semibold
    color: '#ffffff',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#a1a1aa', // Lighter gray
    textAlign: 'center',
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingHorizontal: 15,
    paddingTop: 20,
    paddingBottom: 20, // Padding at the bottom of scroll content
    flexGrow: 1, // Ensure content can push footer down
  },
  footer: {
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#2a2a35',
    backgroundColor: '#18181b', // Match header bg
  },
  buttonBase: {
    borderRadius: 12,
    overflow: 'hidden', // Clip gradient
  },
  buttonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48, // Ensure consistent button height
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Style applied when the button is logically disabled (step invalid, loading, etc.)
  buttonDisabled: {
    opacity: 0.5, // Reduced opacity for disabled state
  },
  // Style applied ONLY when actively pressing an ENABLED button
  buttonPressed: {
    opacity: 0.85, // Slightly dimmed on press
  },
  // Styles for centered messages (loading/error)
  centeredMessageContainer: {
      flex: 1, // Take up space if needed
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      marginTop: 40, // Add some top margin
  },
  loadingText: {
      color: '#a1a1aa', // Gray text
      marginTop: 12,
      fontSize: 15,
  },
  errorText: {
      color: '#f87171', // Red text for errors
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
      marginBottom: 8,
  },
  infoText: {
      color: '#a1a1aa',
      textAlign: 'center',
      fontSize: 14,
  },
});

export default NewReservationScreen;