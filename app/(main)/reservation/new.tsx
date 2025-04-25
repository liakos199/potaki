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
import { supabase } from '@/src/lib/supabase'; 
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import Toast from '@/components/general/Toast';
import { useAuthStore } from '@/src/features/auth/store/auth-store'; 
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView, MotiText } from 'moti';
import { format } from 'date-fns';
import SeatTypeSelection, { SeatDetails } from '@/components/reservation-components/SeatTypeSelection';
import DateSelection from '@/components/reservation-components/DateSelection';
import PartySizeSelection from '@/components/reservation-components/PartySizeSelection';
import DrinkSelection from '@/components/reservation-components/DrinkSelection';
import SpecialRequests from '@/components/reservation-components/SpecialRequests';

// --- Enums and Types ---
enum ReservationStep { DATE, SEAT_TYPE, PARTY_SIZE, DRINKS, SPECIAL_REQUESTS, REVIEW }
type SelectedDrink = {
    drinkOption: { id: string; name: string; price: number; description: string | null; image_url: string | null; type: string; is_available: boolean; };
    quantity: number;
};
type IconComponent = React.FC<LucideProps>;

// --- Step Configuration (Keep as is) ---
const stepsConfig: { id: ReservationStep; icon: IconComponent; label: string }[] = [
    { id: ReservationStep.DATE, icon: Calendar, label: 'Date' }, { id: ReservationStep.SEAT_TYPE, icon: Sofa, label: 'Seating' }, { id: ReservationStep.PARTY_SIZE, icon: Users, label: 'Guests' }, { id: ReservationStep.DRINKS, icon: Wine, label: 'Drinks' }, { id: ReservationStep.SPECIAL_REQUESTS, icon: MessageSquare, label: 'Requests' }, { id: ReservationStep.REVIEW, icon: Check, label: 'Review' },
];

// --- Step Indicator Component (Keep as is) ---
interface StepIndicatorProps { currentStep: ReservationStep; }
const ICON_SIZE_INDICATOR = 18; const ACTIVE_COLOR_INDICATOR = '#f0165e'; 
const COMPLETED_COLOR_INDICATOR = ACTIVE_COLOR_INDICATOR;
const INACTIVE_COLOR_INDICATOR = '#555'; 
const LINE_COLOR_INACTIVE_INDICATOR = '#333'; 
const LINE_COLOR_ACTIVE_INDICATOR = ACTIVE_COLOR_INDICATOR;
const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
    const currentStepIndex = stepsConfig.findIndex(step => step.id === currentStep);
    return (
        <View className="flex-row items-center justify-between px-1 py-2">
            {stepsConfig.map((step, index) => {
                const isCompleted = index < currentStepIndex; const isActive = index === currentStepIndex; const isLastStep = index === stepsConfig.length - 1;
                const iconColor = isActive || isCompleted ? '#fff' : INACTIVE_COLOR_INDICATOR; const labelColor = isActive ? 'text-white' : isCompleted ? 'text-gray-400' : 'text-gray-600';
                const circleBg = isActive || isCompleted ? ACTIVE_COLOR_INDICATOR : '#2a2a35'; const lineBg = isCompleted ? LINE_COLOR_ACTIVE_INDICATOR : LINE_COLOR_INACTIVE_INDICATOR;
                // Using MotiView for animations (keeping original structure)
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
const stepDetails: { [key in ReservationStep]: { title: string; icon: IconComponent } } = {
    [ReservationStep.DATE]: { title: 'Select Date', icon: Calendar }, [ReservationStep.SEAT_TYPE]: { title: 'Select Seating', icon: Sofa }, [ReservationStep.PARTY_SIZE]: { title: 'Party Size', icon: Users }, [ReservationStep.DRINKS]: { title: 'Pre-order Drinks (Optional)', icon: Wine }, [ReservationStep.SPECIAL_REQUESTS]: { title: 'Special Requests (Optional)', icon: MessageSquare }, [ReservationStep.REVIEW]: { title: 'Review & Confirm', icon: Check },
};

// --- Helper Function (Keep as is) ---
const capitalize = (s: string | null | undefined) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';


// --- TanStack Query Fetch Function ---
// This function fetches the seat details for a specific bar and date.
// It's designed to be used with `useQuery`.
const fetchSeatDetailsForDate = async ({ queryKey }: { queryKey: readonly unknown[] }): Promise<SeatDetails[]> => {
    // queryKey is expected to be ['seatDetails', barId: string, dateString: string]
    const [_key, barId, dateString] = queryKey as [string, string, string];

    // This condition is primarily handled by `enabled` in useQuery,
    // but this check adds robustness.
    if (!barId || !dateString) {
        console.log("[queryFn] Skipping fetch: Missing barId or dateString.");
        return [];
    }

    console.log(`[queryFn] Attempting to fetch seats for bar: ${barId}, date: ${dateString}`);

    // 1. Get User Session for Auth Token
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
        console.error("[queryFn] Authentication error:", sessionError?.message || "No active session");
        // Throw error because fetching cannot proceed without auth
        throw new Error("Authentication required to fetch seat details.");
    }
    const accessToken = session.access_token;

    // 2. Get Supabase URL from Environment Variables
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
        console.error("[queryFn] Configuration error: EXPO_PUBLIC_SUPABASE_URL is not set.");
        throw new Error("Application configuration error."); // Avoid leaking details
    }

    // 3. Construct the Edge Function Endpoint URL
    const functionName = 'get-seats-for-date';
    const endpoint = `${supabaseUrl}/functions/v1/${functionName}/${barId}?target_date=${dateString}`;

    // 4. Make the Fetch Request
    console.log(`[queryFn] Calling endpoint: ${endpoint}`);
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}` // Pass the auth token
        }
    });

    // 5. Handle the Response
    console.log(`[queryFn] Response status: ${response.status}`);
    if (!response.ok) {
        let errorPayload = { message: `Request failed with status ${response.status}` };
        try {
            // Try to get a more specific error from the function's JSON response
            const errorData = await response.json();
            if (errorData && errorData.error) {
                 errorPayload.message = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
            }
        } catch (e) {
            // If response isn't JSON or parsing fails, stick with the status code message
            console.warn("[queryFn] Could not parse error response as JSON.");
        }
        console.error('[queryFn] Seat fetch failed:', errorPayload.message);
        // Throwing an error here allows TanStack Query to manage the error state
        throw new Error(errorPayload.message);
    }

    // 6. Parse Successful Response
    const data = await response.json();
    console.log('[queryFn] Raw success response data:', data);

    // 7. Validate and Return Data Structure
    if (data && Array.isArray(data.seatDetails)) {
        console.log('[queryFn] Successfully fetched and parsed seat details.');
        return data.seatDetails as SeatDetails[]; // Return the array of seat details
    } else {
        console.warn('[queryFn] Unexpected data format in response:', data);
        // If the structure is wrong, treat it as an error
        throw new Error('Received invalid data format from the server.');
    }
};


// --- Main Component ---
const NewReservationScreen = (): JSX.Element => {
  // --- Hooks ---
  const params = useLocalSearchParams<{ barId: string }>();
  const { barId } = params; // Get barId from route params
  const router = useRouter();
  const queryClient = useQueryClient(); // Used for mutations and invalidations
  const user = useAuthStore((s) => s.user); // Get user from auth store

  // --- State ---
  // Loading state specifically for fetching initial bar details
  const [loadingBarDetails, setLoadingBarDetails] = useState(true);
  const [barName, setBarName] = useState('');
  const [barDetails, setBarDetails] = useState<{ id: string; name: string } | null>(null);

  // Current step in the reservation flow
  const [currentStep, setCurrentStep] = useState(ReservationStep.DATE);

  // State for user selections throughout the flow
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSeatType, setSelectedSeatType] = useState<SeatDetails['type'] | null>(null);
  const [selectedPartySize, setSelectedPartySize] = useState<number>(1); // Default to 1
  const [selectedDrinks, setSelectedDrinks] = useState<SelectedDrink[]>([]);
  const [specialRequests, setSpecialRequests] = useState('');

  // State for managing the submission process
  const [savingReservation, setSavingReservation] = useState(false);

  // --- Effects ---
  // Effect to fetch basic bar details (name, ID) when the component mounts or barId changes
  useEffect(() => {
    const fetchBarDetails = async () => {
      if (!barId) {
        console.error('[NewReservation] No Bar ID provided.');
        Toast.show({ type: 'error', text1: 'Error', text2: 'Bar ID is missing.' });
        setLoadingBarDetails(false); // Stop loading indicator
        // Consider navigating back or showing a persistent error state
        return;
      }
      console.log(`[NewReservation] Fetching details for bar ID: ${barId}`);
      setLoadingBarDetails(true);
      try {
        const { data: barData, error: barError } = await supabase
          .from('bars')
          .select('id, name')
          .eq('id', barId)
          .single(); // Expect only one bar

        if (barError) {
            console.error('[NewReservation] Supabase error fetching bar:', barError);
            throw barError; // Let the catch block handle it
        }
        if (barData) {
            console.log('[NewReservation] Bar details fetched:', barData);
            setBarName(barData.name);
            setBarDetails(barData);
        } else {
            // This case means the query succeeded but no bar with that ID was found
            console.warn(`[NewReservation] Bar with ID ${barId} not found.`);
            throw new Error('Bar not found.');
        }
      } catch (error: any) {
        console.error('[NewReservation] Failed to fetch bar details:', error);
        Toast.show({ type: 'error', text1: 'Error Loading Bar', text2: error.message || 'Could not retrieve bar information.' });
        setBarDetails(null); // Ensure barDetails is null on error
        setBarName('');
      } finally {
        setLoadingBarDetails(false); // Hide loading indicator regardless of outcome
      }
    };

    fetchBarDetails();
  }, [barId]); // Re-run this effect only if the barId changes

  // --- TanStack Query Hook for Fetching Seat Details ---
  // Calculate the date string (YYYY-MM-DD) needed for the API call, memoized for efficiency
  const dateString = useMemo(() => selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null, [selectedDate]);

  // `useQuery` hook manages fetching, caching, loading, and error states for seat details
  const {
    // `data` holds the result from `fetchSeatDetailsForDate` (SeatDetails[] | undefined)
    data: availableSeatDetailsData,
    // `isLoading` is true only during the initial fetch for a specific queryKey
    isLoading: seatTypesLoading,
    // `isFetching` is true during initial load AND background refetches (e.g., on window focus)
    // isFetching: seatTypesFetching, // Uncomment if you need a different loading indicator for refetches
    // `isError` is true if `fetchSeatDetailsForDate` threw an error
    isError: isSeatTypesError,
    // `error` holds the actual Error object thrown by the query function
    error: seatTypesErrorObject,
  } = useQuery<SeatDetails[], Error>({ // Specify the expected data type and error type
     // queryKey: An array that uniquely identifies this query.
     // Includes dependencies: if barId or dateString changes, TanStack Query treats it as a new query.
     queryKey: ['seatDetails', barId, dateString],

     // queryFn: The asynchronous function that performs the data fetching.
     queryFn: fetchSeatDetailsForDate,

     // enabled: A crucial option. The query will only run if this condition is true.
     // Prevents fetching if we don't have a barId or a selected date yet.
     enabled: !!barId && !!dateString, // Query runs only when both are truthy

     // Optional configuration for caching and refetching behavior:
     // staleTime: 60 * 1000, // Data is considered fresh for 1 minute (ms)
     // cacheTime: 5 * 60 * 1000, // Keep data in memory for 5 minutes after it becomes inactive
     // refetchOnWindowFocus: true, // Refetch data when the app window regains focus (default: true)
     // retry: 1, // Retry failed requests 1 time before marking as error
  });

  // Provide a default empty array if data is still undefined (initial load or disabled query)
  // This simplifies prop passing to child components.
  const availableSeatDetails = availableSeatDetailsData ?? [];

  // Memoize a user-friendly error message derived from the error object
  const seatTypesErrorMessage = useMemo(() => {
    if (!isSeatTypesError || !seatTypesErrorObject) return null; // No error
    // Return the message from the Error object thrown by fetchSeatDetailsForDate
    return seatTypesErrorObject.message || 'An unknown error occurred while loading seating options.';
  }, [isSeatTypesError, seatTypesErrorObject]);


  // --- Effect to Reset Seat Selection When Date Changes ---
  // This improves UX by immediately clearing the selected seat type
  // when the user picks a different date, preventing the display of
  // potentially invalid options while new data is loading.
  useEffect(() => {
      // Only reset if the date actually changes (not on initial mount with null)
      if (selectedDate) {
           console.log("[Effect] Date changed, resetting selected seat type.");
           setSelectedSeatType(null);
      }
      // Note: We don't reset party size here, user might want to keep it.
  }, [selectedDate]); // Run only when selectedDate changes


  // --- Derived State: Get Full Details of the Selected Seat Type ---
  // This uses `useMemo` to efficiently find the complete `SeatDetails` object
  // corresponding to the `selectedSeatType` string, based on the currently
  // available fetched data (`availableSeatDetails`).
  const selectedSeatDetails = useMemo(() => {
    // Cannot find details if no type is selected or if the data isn't available yet
    if (!selectedSeatType || availableSeatDetails.length === 0) {
        return null;
    }
    // Find the object in the array where the 'type' matches the selected string
    const details = availableSeatDetails.find(detail => detail.type === selectedSeatType);

    if (!details) {
        // This might happen if the query refetches and the previously selected type is no longer valid
        console.warn(`Consistency warning: Selected seat type "${selectedSeatType}" not found in the latest fetched details. Data might have changed.`);
        // Optional: Could automatically reset `selectedSeatType` here for stricter consistency
        // setSelectedSeatType(null);
    }
    // Return the found object or null if not found
    return details ?? null;
  }, [selectedSeatType, availableSeatDetails]); // Recalculate when selection or data changes


  // --- TanStack Mutation for Creating the Reservation ---
  const createReservationMutation = useMutation({
    mutationFn: async () => {
      // --- 1. Pre-flight Checks ---
      if (!user) throw new Error('You must be logged in to make a reservation.');
      if (!barDetails) throw new Error('Bar details are missing.');
      if (!selectedDate) throw new Error('Please select a reservation date.');
      if (!selectedSeatType) throw new Error('Please select a seating type.');
      if (!selectedPartySize || selectedPartySize <= 0) throw new Error('Please enter a valid party size.');
      // Final check using derived data (redundant if steps enforce this, but safe)
      if (selectedSeatDetails && (selectedPartySize < selectedSeatDetails.minPeople || selectedPartySize > selectedSeatDetails.maxPeople)) {
          throw new Error(`Party size (${selectedPartySize}) does not fit the selected seating (${selectedSeatDetails.minPeople}-${selectedSeatDetails.maxPeople} guests).`);
      }
       if (!selectedSeatDetails && selectedSeatType) {
          // Should ideally not happen if validation works, but catch potential race condition/error
          throw new Error('Could not verify seating details. Please try again.');
       }


      // --- 2. Insert into 'reservations' table ---
      console.log('[Mutation] Creating reservation with:', { barId: barDetails.id, userId: user.id, date: dateString, seat: selectedSeatType, party: selectedPartySize });
      const { data: reservation, error: reservationError } = await supabase
        .from('reservations')
        .insert({
          bar_id: barDetails.id,
          customer_id: user.id, // Ensure your column name matches
          party_size: selectedPartySize,
          reservation_date: format(selectedDate, 'yyyy-MM-dd'), // Ensure consistent format
          seat_type: selectedSeatType,
          special_requests: specialRequests?.trim() || null, // Trim whitespace or set null
          status: 'confirmed', // Or 'pending' if admin approval is needed
          // Add other relevant fields like time if applicable
        })
        .select() // Select the newly created row
        .single(); // Expect only one row back

      if (reservationError) {
          console.error('[Mutation] Error inserting reservation:', reservationError);
          // Provide a more specific error if possible (e.g., check for unique constraint violations)
          throw new Error(`Database error: ${reservationError.message}`);
      }
      if (!reservation) {
          // This case indicates the insert might have appeared successful but didn't return data
          console.error('[Mutation] Reservation insert succeeded but no data returned.');
          throw new Error('Failed to confirm reservation creation.');
      }
      console.log('[Mutation] Reservation created successfully:', reservation);

      // --- 3. Insert into 'reservation_drinks' table (if any) ---
      if (selectedDrinks.length > 0) {
            console.log(`[Mutation] Adding ${selectedDrinks.length} drink pre-orders for reservation ID: ${reservation.id}`);
            const drinkInserts = selectedDrinks.map(drink => ({
                reservation_id: reservation.id,
                drink_option_id: drink.drinkOption.id,
                // Store details at time of booking for historical accuracy
                drink_name_at_booking: drink.drinkOption.name,
                drink_type_at_booking: drink.drinkOption.type,
                price_at_booking: drink.drinkOption.price,
                quantity: drink.quantity,
            }));

            const { error: drinksError } = await supabase
                .from('reservation_drinks') // Ensure table name is correct
                .insert(drinkInserts);

            if (drinksError) {
                // Log the error but don't fail the whole reservation, show a warning instead
                console.error('[Mutation] Error adding pre-ordered drinks:', drinksError);
                Toast.show({ type: 'warning', text1: 'Reservation Confirmed', text2: 'Could not save pre-ordered drinks.' });
                // Don't re-throw here, reservation itself was successful
            } else {
                 console.log('[Mutation] Drink pre-orders added successfully.');
            }
        }

      // Return the main reservation object on success
      return reservation;
    },
    // --- 4. Mutation Callbacks ---
    onSuccess: (data) => {
        console.log('[Mutation] onSuccess callback triggered.');
        // Invalidate queries related to reservations to refetch fresh data elsewhere
        queryClient.invalidateQueries({ queryKey: ['reservations'] }); // Adjust query key if needed
        // Maybe invalidate seat availability for that date too?
        queryClient.invalidateQueries({ queryKey: ['seatDetails', barId, dateString] });

        Toast.show({ type: 'success', text1: 'Reservation Created!', text2: `Your booking at ${barName || 'the bar'} for ${format(selectedDate!, 'MMM d')} is confirmed.` });
        router.back(); // Navigate back after successful creation
    },
    onError: (error) => {
        console.error('[Mutation] onError callback triggered:', error);
        // Show specific error thrown by the mutationFn
        Toast.show({ type: 'error', text1: 'Reservation Failed', text2: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.' });
    },
    onSettled: () => {
        console.log('[Mutation] onSettled callback triggered.');
        // This runs after onSuccess or onError, good for final cleanup
        setSavingReservation(false); // Hide loading indicator on the button
    }
  });

  // --- Callbacks & Memoized Values ---

  // Check if the current step's requirements are met
  const isStepValid = useCallback((step: ReservationStep): boolean => {
    switch (step) {
      case ReservationStep.DATE:
        return !!selectedDate; // Must have a selected date
      case ReservationStep.SEAT_TYPE:
        return !!selectedSeatType; // Must have selected a seat type
      case ReservationStep.PARTY_SIZE:
        // Must have a party size > 0
        // Further validation (fitting seat) happens in handleNextStep/handleSubmit
        return !!selectedPartySize && selectedPartySize > 0;
      case ReservationStep.DRINKS:
        return true; // Optional step
      case ReservationStep.SPECIAL_REQUESTS:
        return true; // Optional step
      case ReservationStep.REVIEW:
        // Check if all required preceding steps are valid
        return !!selectedDate && !!selectedSeatType && !!selectedPartySize && selectedPartySize > 0;
      default:
        return false; // Should not happen
    }
  }, [selectedDate, selectedSeatType, selectedPartySize]); // Dependencies for step validity

  // Handle moving to the next step or submitting the reservation
  const handleNextStep = useCallback(() => {
    // 1. Check if the current step is valid based on basic requirements
    if (!isStepValid(currentStep)) {
      let errorText = 'Please complete this step first.';
      // Provide more specific guidance
      switch (currentStep) {
        case ReservationStep.DATE: errorText = 'Please select a date.'; break;
        case ReservationStep.SEAT_TYPE: errorText = 'Please select an available seating type.'; break;
        case ReservationStep.PARTY_SIZE: errorText = 'Please enter the number of guests (minimum 1).'; break;
      }
      Toast.show({ type: 'error', text1: 'Step Incomplete', text2: errorText });
      return; // Stop execution
    }

    // 2. Perform step-specific validation *before* proceeding
    if (currentStep === ReservationStep.PARTY_SIZE) {
       // Use the derived `selectedSeatDetails` which contains min/max people
       if (selectedSeatDetails) {
            // Check if party size fits within the selected seat's limits
            if (selectedPartySize && (selectedPartySize < selectedSeatDetails.minPeople || selectedPartySize > selectedSeatDetails.maxPeople)) {
                Toast.show({ type: 'error', text1: 'Party Size Invalid', text2: `${capitalize(selectedSeatType)} seating accommodates ${selectedSeatDetails.minPeople}-${selectedSeatDetails.maxPeople} guests.` });
                return; // Stay on this step
            }
       } else if(selectedSeatType) {
           // If a type is selected but details are missing (e.g., data loading/error), show a warning
           console.warn("Cannot validate party size, selected seat details are missing.");
           // Decide UX: Allow proceeding (risk)? Or block? Blocking is safer.
           // Toast.show({ type: 'warning', text1: 'Seating Info Unavailable', text2: 'Cannot verify party size limits currently.' });
           // return; // Uncomment to block proceeding without details
       }
    }

    // 3. Proceed to the next step or trigger submission
    if (currentStep < ReservationStep.REVIEW) {
      setCurrentStep(prev => prev + 1); // Move to the next step index
    } else if (currentStep === ReservationStep.REVIEW) {
      // If on the Review step, clicking 'Next' means 'Submit'
      if (!savingReservation) { // Prevent double-clicks
         setSavingReservation(true); // Show loading indicator
         createReservationMutation.mutate(); // Trigger the mutation
      }
    }
  }, [
      currentStep,
      isStepValid,
      // createReservationMutation, // mutation function itself doesn't change
      // setSavingReservation, // state setter doesn't change
      selectedPartySize,
      selectedSeatType,
      selectedSeatDetails // Use derived details for validation
      // Removed handleSubmitReservation as direct dependency, called within logic
  ]);

  // Handle navigating back through steps or discarding progress
  const handlePreviousStep = useCallback(() => {
    if (savingReservation) return; // Don't allow navigation while submitting

    if (currentStep > ReservationStep.DATE) {
      // If not on the first step, simply go back one step
      setCurrentStep(prev => prev - 1);
    } else {
      // If on the first step (Date), prompt before discarding
      Alert.alert(
        "Discard Reservation?",
        "Are you sure you want to go back? Your selections will be lost.",
        [
          { text: "Cancel", style: "cancel" }, // Does nothing
          { text: "Discard", onPress: () => router.back(), style: 'destructive' } // Navigates back
        ],
        { cancelable: true } // Allow dismissing by tapping outside
      );
    }
  }, [currentStep, router, savingReservation]); // Dependencies for backward navigation

  // This function is now essentially incorporated into handleNextStep for the REVIEW case.
  // Kept separate previously, but merging simplifies the primary button's action.
  // const handleSubmitReservation = useCallback(() => { ... moved inside handleNextStep ... });

  // Get title and icon for the current step's header display
  const currentStepDetail = useMemo(() => stepDetails[currentStep], [currentStep]);

  // Determine the text for the main action button
  const getNextButtonText = useCallback(() => {
    if (currentStep === ReservationStep.REVIEW) return 'Confirm Reservation';
    return 'Continue';
  }, [currentStep]);

  // Format date for display in the Review step
  const formatDate = useCallback((date: Date | null): string => {
    if (!date) return 'Not selected';
    try {
        return format(date, 'EEE, MMM d, yyyy'); // e.g., "Wed, Oct 27, 2023"
    } catch (e) {
        console.error("Error formatting date:", e);
        return "Invalid Date";
    }
  }, []);


  // --- Main Render Logic ---
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Header Section: Back Arrow, Title, Step Indicator */}
      <View style={styles.header}>
        {/* Top Row: Back Button and Titles */}
        <View style={styles.headerTopRow}>
          <Pressable
            style={styles.backButton}
            onPress={handlePreviousStep}
            disabled={savingReservation} // Disable back navigation during submission
          >
            <ArrowLeft size={22} color={savingReservation ? "#666" : "#fff"} />
          </Pressable>
          {/* Centered Titles */}
          <View className="flex-1 items-center mr-10">
             <Text className="text-lg font-semibold text-white text-center" numberOfLines={1} ellipsizeMode='tail'>
                 {/* Show loading state or bar name */}
                 {loadingBarDetails ? 'Loading...' : (barName || 'New Reservation')}
             </Text>
             {/* Show current step title only if bar details loaded successfully */}
             {!loadingBarDetails && barDetails && (
                 <Text className="text-sm text-gray-400 text-center">
                     {currentStepDetail.title}
                 </Text>
             )}
          </View>
        </View>
        {/* Step Indicator (only show if bar details loaded) */}
        {!loadingBarDetails && barDetails && (
            <StepIndicator currentStep={currentStep} />
        )}
      </View>

      {/* Main Content Area */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        keyboardShouldPersistTaps="handled" // Helps with input focus dismissal
      >
        {/* --- Loading Indicator for Initial Bar Details Fetch --- */}
        {loadingBarDetails && (
            <View className="items-center justify-center py-20">
                <ActivityIndicator size="large" color="#f0165e" />
                <Text className="text-gray-400 mt-3">Loading Bar Information...</Text>
            </View>
        )}

        {/* --- Error State for Bar Details Fetch --- */}
        {!loadingBarDetails && !barDetails && (
             <View className="items-center justify-center py-20 px-6">
                 <Text className="text-red-400 text-center text-base font-semibold mb-2">Failed to Load Bar Details</Text>
                 <Text className="text-gray-400 text-center">Could not retrieve information for this bar. Please ensure you have the correct link or try again later.</Text>
                 {/* Optionally add a retry button here */}
             </View>
         )}


        {/* --- Animated Step Content: Render only if Bar Details are successfully loaded --- */}
        {!loadingBarDetails && barDetails && (
            <MotiView
              key={currentStep} // Animate whenever the step changes
              from={{ opacity: 0, translateY: 15 }}
              animate={{ opacity: 1, translateY: 0 }}
              exit={{ opacity: 0, translateY: -15 }}
              transition={{ type: 'timing', duration: 300 }}
              style={{ width: '100%' }} // Ensure MotiView takes full width
            >
              {/* Render the component corresponding to the current reservation step */}

              {/* Step 1: Date Selection */}
              {currentStep === ReservationStep.DATE && (
                <DateSelection
                  barId={barId} // Pass the validated barId
                  selectedDate={selectedDate}
                  onDateChange={setSelectedDate} // Callback to update state
                />
              )}

              {/* Step 2: Seat Type Selection */}
              {currentStep === ReservationStep.SEAT_TYPE && (
                <SeatTypeSelection
                  // Data and states managed by useQuery
                  seatDetails={availableSeatDetails} // Pass fetched data (defaults to [])
                  isLoading={seatTypesLoading}      // Pass loading state from useQuery
                  error={seatTypesErrorMessage}     // Pass formatted error message
                  // Other props remain the same
                  selectedSeatType={selectedSeatType}
                  partySize={selectedPartySize ?? 1} // Ensure partySize is at least 1
                  onSeatTypeChange={setSelectedSeatType} // Callback to update state
                />
              )}

              {/* Step 3: Party Size Selection */}
              {currentStep === ReservationStep.PARTY_SIZE && (
                <PartySizeSelection
                  selectedPartySize={selectedPartySize}
                  onPartySizeChange={setSelectedPartySize}
                  // Use the derived 'selectedSeatDetails' for accurate min/max limits
                  minSize={selectedSeatDetails?.minPeople ?? 1} // Default min if details missing
                  maxSize={selectedSeatDetails?.maxPeople ?? 10} // Default max if details missing
                  selectedSeatTypeLabel={selectedSeatType ? capitalize(selectedSeatType) : null}
                />
              )}

              {/* Step 4: Drink Selection */}
              {currentStep === ReservationStep.DRINKS && (
                <DrinkSelection
                  barId={barDetails.id} // Pass the loaded barId
                  selectedDrinks={selectedDrinks}
                  onDrinksChange={setSelectedDrinks}
                />
              )}

              {/* Step 5: Special Requests */}
              {currentStep === ReservationStep.SPECIAL_REQUESTS && (
                <SpecialRequests
                  specialRequests={specialRequests}
                  onSpecialRequestsChange={setSpecialRequests}
                />
              )}

              {/* Step 6: Review */}
              {currentStep === ReservationStep.REVIEW && (
                <View className="mb-6 px-1">
                  <Text className="text-xl font-bold text-white mb-5">Review Your Reservation</Text>
                  <View className="bg-[#1c1c22] p-5 rounded-2xl mb-5 shadow-md">
                    {/* Review Items */}
                    <ReviewItem icon={Calendar} label="Date" value={formatDate(selectedDate)} />
                    <ReviewItem icon={Sofa} label="Seating Type" value={capitalize(selectedSeatType) || 'Not selected'} />
                    <ReviewItem icon={Users} label="Party Size" value={selectedPartySize ? `${selectedPartySize} Guest${selectedPartySize !== 1 ? 's' : ''}` : 'Not selected'} />
                    <ReviewItem icon={Wine} label="Pre-ordered Drinks" value={selectedDrinks.length > 0 ? (
                        <View className="mt-1 w-full">
                            {selectedDrinks.map((drink, index) => (
                                <View key={index} className="flex-row justify-between items-center mb-1 w-full">
                                    <Text className="text-white text-sm flex-1 mr-2" numberOfLines={1} ellipsizeMode="tail">{drink.quantity}x {drink.drinkOption.name}</Text>
                                    <Text className="text-gray-300 text-sm">${calculateItemTotal(drink)}</Text>
                                </View>
                            ))}
                            <View className="flex-row justify-between mt-3 pt-2 border-t border-gray-700/50 w-full">
                                <Text className="text-white font-semibold">Drinks Total</Text>
                                <Text className="text-white font-semibold">${calculateDrinksTotal(selectedDrinks)}</Text>
                            </View>
                        </View>
                    ) : (<Text className="text-gray-500 italic">None</Text>)} />
                    <ReviewItem icon={MessageSquare} label="Special Requests" value={specialRequests?.trim() || <Text className="text-gray-500 italic">None</Text>} isLast />
                  </View>
                  {/* Info Box */}
                  <View className="bg-[#f0165e]/10 p-4 rounded-xl mb-6 flex-row items-start">
                     <Info size={18} color="#f0165e" className="mr-3 mt-1 flex-shrink-0" />
                     <Text className="text-gray-300 text-sm flex-1">Please double-check all details. Confirming your reservation may be subject to the venue's cancellation policy.</Text>
                  </View>
                </View>
              )}
            </MotiView>
         )}

        {/* Spacer to push button to bottom */}
        <View style={{ flexGrow: 1 }} />

      </ScrollView>

      {/* Footer Button: Only show if Bar Details loaded successfully */}
      {!loadingBarDetails && barDetails && (
          <View style={styles.footer}>
            <Pressable
              // Apply styles based on state (pressed, saving)
              style={({ pressed }) => [
                  styles.buttonBase,
                  savingReservation && styles.buttonDisabled, // Dim if saving
                  pressed && !savingReservation && styles.buttonPressed, // Opacity on press
              ]}
              onPress={savingReservation ? undefined : handleNextStep} // Trigger next step/submit
              disabled={savingReservation} // Disable button during submission
              accessibilityRole="button"
              accessibilityLabel={getNextButtonText()} // Dynamic label for accessibility
            >
              {/* Button Background Gradient */}
              <LinearGradient
                colors={savingReservation ? ['#555', '#444'] : ['#f0165e', '#d40a4d']} // Gray when disabled
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.buttonGradient}
               >
                {/* Show ActivityIndicator or Text */}
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


// --- Styles (Keep as is) ---
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#121212', },
  header: { paddingTop: Platform.OS === 'android' ? 15 : 0, paddingBottom: 5, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#2a2a35', backgroundColor: '#18181b', },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, height: 44, },
  backButton: { padding: 8, marginLeft: -8, zIndex: 1, }, // Ensure back button is tappable
  scrollView: { flex: 1, }, // Allows content to scroll
  scrollViewContent: { paddingHorizontal: 15, paddingTop: 20, paddingBottom: 20, flexGrow: 1, }, // Padding and allows pushing footer down
  footer: { padding: 15, borderTopWidth: 1, borderTopColor: '#2a2a35', backgroundColor: '#18181b', },
  buttonBase: { borderRadius: 12, overflow: 'hidden', }, // Base button style for gradient clipping
  buttonGradient: { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', },
  buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold', },
  buttonDisabled: { opacity: 0.6, }, // Style when button is disabled (saving)
  buttonPressed: { opacity: 0.85, }, // Style when button is actively pressed
});


export default NewReservationScreen;