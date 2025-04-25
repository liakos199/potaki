import React, { useMemo, useCallback } from 'react'; // Removed useEffect
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Calendar, Clock, CheckCircle, XCircle } from 'lucide-react-native';
// --- IMPORT TanStack Query ---
import { useQuery } from '@tanstack/react-query';
import { format, addDays, isSameDay, startOfDay, addMonths, isAfter, isBefore, parse } from 'date-fns';
import { supabase } from '@/src/lib/supabase'; // Adjust path as needed

// --- Type Definitions (Keep as is) ---
type SeatOptionType = "bar" | "table" | "vip";
type DateStatus = {
  isOpen: boolean;
  isException: boolean;
  openTime: string | null;
  closeTime: string | null;
  isFullyBooked: boolean;
  availableSeatTypes: SeatOptionType[];
};
// Expected structure from the 'get-bar-availability' function
type AvailabilityApiResponse = {
  dateStatus?: Record<string, DateStatus>; // Key is 'yyyy-MM-dd'
};
type DateSelectionProps = {
  barId: string;
  selectedDate: Date | null;
  onDateChange: (date: Date) => void;
};

// --- Helper Functions (Keep as is) ---
const formatTimeDisplay = (timeString: string | null): string | null => {
  if (!timeString) return null;
  try {
    const dummyDate = parse(timeString, 'HH:mm:ss', new Date());
    return format(dummyDate, 'h:mm a');
  } catch (e) {
    console.error("Error formatting time:", timeString, e);
    return timeString.substring(0, 5); // Fallback
  }
};
const capitalize = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';


// --- TanStack Query Fetch Function ---
// Fetches the availability status for a bar over a date range.
const fetchBarAvailability = async ({ queryKey }: { queryKey: readonly unknown[] }): Promise<Record<string, DateStatus>> => {
    // queryKey is expected as ['barAvailability', barId: string, startDate: string, endDate: string]
    const [_key, barId, startDate, endDate] = queryKey as [string, string, string, string];

    // This check is mostly handled by `enabled`, but adds safety.
    if (!barId || !startDate || !endDate) {
        console.log("[queryFn] fetchBarAvailability: Missing parameters.");
        return {}; // Return empty object if params missing
    }

    console.log(`[queryFn] Fetching bar availability for ${barId} from ${startDate} to ${endDate}`);

    // 1. Get Session/Token
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
        console.error("[queryFn] fetchBarAvailability: Auth error", sessionError?.message || "No session");
        throw new Error("Authentication required to fetch availability.");
    }
    const accessToken = session.access_token;

    // 2. Get Supabase URL
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
        console.error("[queryFn] fetchBarAvailability: Supabase URL not configured.");
        throw new Error("Application configuration error.");
    }

    // 3. Construct Endpoint
    const functionName = 'get-bar-availability';
    const endpoint = `${supabaseUrl}/functions/v1/${functionName}/${barId}?start_date=${startDate}&end_date=${endDate}`;

    // 4. Fetch Data
    console.log(`[queryFn] fetchBarAvailability: Calling ${endpoint}`);
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` }
    });

    // 5. Handle Response
    console.log(`[queryFn] fetchBarAvailability: Response Status ${response.status}`);
    if (!response.ok) {
        let errorMsg = `Failed: ${response.status}`;
        try {
            const errorData = await response.json();
            errorMsg = errorData?.error || errorMsg;
        } catch (e) { /* Ignore parsing error, use status */ }
        console.error('[queryFn] fetchBarAvailability: API Error', errorMsg);
        throw new Error(`Could not load availability data: ${errorMsg}`);
    }

    // 6. Parse and Return Data
    const responseData: AvailabilityApiResponse = await response.json();
    console.log('[queryFn] fetchBarAvailability: Raw Response', responseData);

    // Return the dateStatus object, or an empty object if it's missing/null
    return responseData.dateStatus || {};
};


// --- Main Component ---
const DateSelection: React.FC<DateSelectionProps> = ({ barId, selectedDate, onDateChange }) => {
  // --- Date Range Calculation ---
  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => addMonths(today, 1), [today]);
  const startDateString = useMemo(() => format(today, 'yyyy-MM-dd'), [today]);
  const endDateString = useMemo(() => format(maxDate, 'yyyy-MM-dd'), [maxDate]);

  // --- TanStack Query Hook ---
  const {
      // `data` will hold the Record<string, DateStatus> object
      data: dateStatusData,
      // `isLoading` replaces the manual isLoading state
      isLoading,
      // `isError` replaces the manual error state (boolean)
      isError,
      // `error` holds the actual Error object if isError is true
      error: queryError,
      // `isFetching` can be used for background refresh indicators (optional)
      // isFetching,
  } = useQuery<Record<string, DateStatus>, Error>({ // Specify Data and Error types
      // queryKey: Unique identifier including all dependencies
      queryKey: ['barAvailability', barId, startDateString, endDateString],
      // queryFn: The function that fetches the data
      queryFn: fetchBarAvailability,
      // enabled: Only run the query if barId is present
      enabled: !!barId,
      // Optional: Add staleTime if you don't need it to refetch constantly
      // staleTime: 5 * 60 * 1000, // e.g., data is fresh for 5 minutes
  });

  // Provide a default empty object for dateStatusData while loading or if undefined
  const dateStatusState = dateStatusData ?? {};

  // Format the error message for display
  const errorMessage = useMemo(() => {
      if (!isError || !queryError) return null;
      return `Could not load available dates: ${queryError.message || 'Unknown error'}`;
  }, [isError, queryError]);


  // --- Generate Dates for Display (Keep as is) ---
  const datesForDisplay = useMemo(() => {
    const dates: Date[] = [];
    let currentDate = today;
    while (!isAfter(currentDate, maxDate)) { dates.push(currentDate); currentDate = addDays(currentDate, 1); }
    return dates;
  }, [today, maxDate]);

  // --- Event Handlers (Keep as is) ---
  const handleDateSelect = useCallback((date: Date) => {
    onDateChange(startOfDay(date)); // Ensure time part is zeroed out
  }, [onDateChange]);


  // --- Format date for display (Keep as is) ---
  const formatDateDisplay = useCallback((date: Date) => {
     const todayLocal = startOfDay(new Date());
     const tomorrowLocal = addDays(todayLocal, 1);
     if (isSameDay(date, todayLocal)) return 'Today';
     if (isSameDay(date, tomorrowLocal)) return 'Tomorrow';
     return format(date, 'EEE, MMM d');
   }, []); // No external dependencies needed here

   // --- Get Status info for the selected date (Uses derived state) ---
   const selectedDateString = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
   // Access the dateStatusState derived from useQuery's data
   const selectedStatusInfo = selectedDateString ? dateStatusState[selectedDateString] : null;
   const selectedOpenTimeFormatted = selectedStatusInfo ? formatTimeDisplay(selectedStatusInfo.openTime) : null;
   const selectedCloseTimeFormatted = selectedStatusInfo ? formatTimeDisplay(selectedStatusInfo.closeTime) : null;

  // --- Render ---
  return (
    <View className="mb-6">
      <Text className="text-lg font-semibold text-white mb-4">Select a Date</Text>

       {/* --- Loading State (from useQuery) --- */}
       {isLoading && (
           <View className="items-center justify-center py-10">
               <ActivityIndicator size="large" color="#ff4d6d" />
               <Text className="text-gray-400 mt-3">Loading available dates...</Text>
           </View>
       )}

       {/* --- Error State (from useQuery) --- */}
       {isError && !isLoading && ( // Show error only if not also loading
           <View className="bg-red-900/50 p-4 rounded-lg mb-4 border border-red-700">
               <Text className="text-red-300 text-center">{errorMessage}</Text>
               {/* Optional: Add a Retry button here using `refetch()` from useQuery */}
           </View>
       )}

       {/* --- No Dates Available Message (derived from data) --- */}
       {/* Show this if loading is finished, there's no error, but the data object is empty */}
       {!isLoading && !isError && Object.keys(dateStatusState).length === 0 && (
           <Text className="text-gray-400 text-center italic my-4">
               No available dates found for this bar in the next month.
           </Text>
       )}

     {/* --- Date Selection Scroll View (Render if not loading, no error, and data exists) --- */}
     {!isLoading && !isError && Object.keys(dateStatusState).length > 0 && (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
        {datesForDisplay.map((date) => {
           const dateString = format(date, 'yyyy-MM-dd');
           // Get status info from the data provided by useQuery
           const statusInfo = dateStatusState[dateString];

           // Determine if the date button should be disabled
           const isDisabled = !statusInfo || !statusInfo.isOpen || statusInfo.isFullyBooked || isBefore(date, today);
           const isSelected = selectedDate && isSameDay(selectedDate, date);
           const isException = statusInfo?.isException ?? false;

           // Determine styling based on state
           const baseBgClass = isSelected ? 'bg-[#ff4d6d]' : 'bg-[#1f1f27]';
           const opacityClass = isDisabled ? 'opacity-50' : '';
           const exceptionBorderClass = isException && !isDisabled ? 'border-2 border-amber-400' : '';
           const textColorClass = isDisabled ? 'text-gray-600' : (isSelected ? 'text-white' : 'text-white');
           const textSubColorClass = isDisabled ? 'text-gray-600' : (isSelected ? 'text-white' : 'text-gray-400');

           return (
             <Pressable
               key={date.toISOString()} // Use ISO string for a more robust key
               disabled={isDisabled}
               className={`mr-3 p-3 rounded-xl min-w-[60px] items-center ${baseBgClass} ${opacityClass} ${exceptionBorderClass}`}
               onPress={() => handleDateSelect(date)}
             >
               <Text className={`text-center text-sm font-medium ${textSubColorClass}`}>{format(date, 'EEE')}</Text>
               <Text className={`text-center text-xl font-bold mt-1 ${textColorClass}`}>{format(date, 'd')}</Text>
               <Text className={`text-center text-xs mt-1 ${textSubColorClass}`}>{format(date, 'MMM')}</Text>
               {/* Fully booked indicator */}
               {statusInfo?.isOpen && statusInfo?.isFullyBooked && (
                   <View className="absolute top-1 right-1 bg-red-600 rounded-full w-2 h-2" />
               )}
             </Pressable>
           );
         })}
      </ScrollView>
      )}

      {/* --- Selected Date Details Display (Uses derived state) --- */}
      {/* Render only if a date is selected AND we have status info for it (from query data) */}
      {selectedDate && selectedStatusInfo && (
        <View className={`bg-[#1f1f27] p-4 rounded-xl mb-6 ${!selectedStatusInfo.isOpen ? 'opacity-60' : ''}`}>
            {/* Date Part */}
            <View className="flex-row items-center mb-2">
                <Calendar size={20} color="#ff4d6d" />
                <Text className={`ml-3 font-medium ${selectedStatusInfo.isOpen ? 'text-white' : 'text-gray-400 italic'}`}>
                  {formatDateDisplay(selectedDate)}
                  {!selectedStatusInfo.isOpen && ' - Closed'} {/* Indicate closed status */}
                  {selectedStatusInfo.isException && (
                      <Text className={`text-xs italic ${selectedStatusInfo.isOpen ? 'text-amber-400' : 'text-gray-500'}`}>
                         {selectedStatusInfo.isOpen ? ' (Special Hours)' : ' (Special Closure)'}
                      </Text>
                  )}
                </Text>
            </View>

           {/* Time Part - Render only if open and times are available */}
           {selectedStatusInfo.isOpen && selectedOpenTimeFormatted && selectedCloseTimeFormatted && (
             <View className="flex-row items-center ml-1 pl-7 mb-2">
                 <Clock size={16} color="#a0a0a0" />
                 <Text className="text-gray-300 ml-2 text-sm">
                     {selectedOpenTimeFormatted} - {selectedCloseTimeFormatted}
                 </Text>
             </View>
           )}
           {/* Optional: Indicate missing hours if open */}
            {selectedStatusInfo.isOpen && !(selectedOpenTimeFormatted && selectedCloseTimeFormatted) && (
                 <View className="flex-row items-center ml-1 pl-7 mb-2">
                    <Clock size={16} color="#a0a0a0" />
                    <Text className="text-gray-500 ml-2 text-sm italic">(Hours not specified)</Text>
                </View>
            )}

           {/* Availability Status Part - Render only if open */}
           {selectedStatusInfo.isOpen && (
                <View className="flex-row items-center ml-1 pl-7">
                    {selectedStatusInfo.isFullyBooked ? (
                        <>
                            <XCircle size={16} color="#ff6b6b" />
                            <Text className="text-red-400 ml-2 text-sm font-semibold">Fully Booked</Text>
                        </>
                    ) : (
                         <>
                            <CheckCircle size={16} color="#63e6be" />
                            <Text className="text-green-400 ml-2 text-sm font-semibold">
                                Available: {/* Join available seat types */}
                                {selectedStatusInfo.availableSeatTypes && selectedStatusInfo.availableSeatTypes.length > 0
                                   ? selectedStatusInfo.availableSeatTypes.map(capitalize).join(', ')
                                   : 'Seats Available' /* Fallback if array empty but not fully booked */
                                }
                            </Text>
                        </>
                    )}
                </View>
           )}
         </View>
      )}
    </View>
  );
};

export default DateSelection;