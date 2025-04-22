import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Calendar, Clock, CheckCircle, XCircle } from 'lucide-react-native'; // Ensure icons are installed/available
import { format, addDays, isSameDay, startOfDay, addMonths, isAfter, isBefore, parse } from 'date-fns';
import { supabase } from '@/src/lib/supabase'; // Adjust path as needed

// --- Type Definitions UPDATED ---
type SeatOptionType = "bar" | "table" | "vip"; // Use your actual seat types from the enum

type DateStatus = {
  isOpen: boolean;
  isException: boolean;
  openTime: string | null;
  closeTime: string | null;
  isFullyBooked: boolean;
  availableSeatTypes: SeatOptionType[]; // Expecting an array of seat type strings/enums
};

type AvailabilityApiResponse = {
  dateStatus?: Record<string, DateStatus>; // Key is 'yyyy-MM-dd'
};

type DateSelectionProps = {
  barId: string;
  selectedDate: Date | null;
  onDateChange: (date: Date) => void;
};

// --- Helper Function to Format Time ---
const formatTimeDisplay = (timeString: string | null): string | null => {
  if (!timeString) return null;
  try {
    const dummyDate = parse(timeString, 'HH:mm:ss', new Date());
    return format(dummyDate, 'h:mm a'); // e.g., "5:00 PM"
  } catch (e) {
    console.error("Error formatting time:", timeString, e);
    return timeString.substring(0, 5); // Fallback HH:MM
  }
};

// --- Helper to capitalize strings ---
const capitalize = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

const DateSelection: React.FC<DateSelectionProps> = ({ barId, selectedDate, onDateChange }) => {
  // State holds the detailed status including isFullyBooked and availableSeatTypes
  const [dateStatusState, setDateStatusState] = useState<Record<string, DateStatus>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => addMonths(today, 1), [today]);

  // --- Fetch Available Dates from Backend ---
  useEffect(() => {
    const fetchAvailability = async () => {
       if (!barId) { setError('Bar ID is missing.'); setIsLoading(false); setDateStatusState({}); return; }
       setIsLoading(true); setError(null);
       const startDate = format(today, 'yyyy-MM-dd');
       const endDate = format(maxDate, 'yyyy-MM-dd');
       try {
           const { data: { session }, error: sessionError } = await supabase.auth.getSession();
           if (sessionError || !session) throw new Error("User not authenticated or session error.");
           const accessToken = session.access_token;
           // IMPORTANT: Ensure EXPO_PUBLIC_SUPABASE_URL is set in your .env file
           const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
           if (!supabaseUrl) throw new Error("Supabase URL not configured in environment variables.");
           const functionName = 'get-bar-availability';
           const endpoint = `${supabaseUrl}/functions/v1/${functionName}/${barId}?start_date=${startDate}&end_date=${endDate}`;

           console.log(`[DateSelection] Calling endpoint: ${endpoint}`);
           const response = await fetch(endpoint, {
               method: 'GET',
               headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` }
           });
           console.log(`[DateSelection] Response status: ${response.status}`);
           if (!response.ok) {
               const errorText = await response.text();
               console.error('[DateSelection] API Error Response:', errorText);
               throw new Error(`Failed to fetch availability: ${response.status} ${response.statusText}. ${errorText}`);
           }
           const responseData: AvailabilityApiResponse = await response.json();
           console.log('[DateSelection] API Response Data:', responseData);
           setDateStatusState(responseData.dateStatus || {}); // Update state with full details
       } catch (err: any) {
           console.error('[DateSelection] Failed to fetch available dates:', err);
           setError(`Could not load available dates. ${err.message || ''}`);
           setDateStatusState({});
       } finally {
           setIsLoading(false);
       }
    };
    fetchAvailability();
  }, [barId, today, maxDate]);

  // --- Generate Dates for Display ---
  const datesForDisplay = useMemo(() => {
    const dates: Date[] = [];
    let currentDate = today;
    while (!isAfter(currentDate, maxDate)) { dates.push(currentDate); currentDate = addDays(currentDate, 1); }
    return dates;
  }, [today, maxDate]);

  // --- Event Handlers ---
  const handleDateSelect = (date: Date) => {
    onDateChange(startOfDay(date)); // Ensure time part is zeroed out
  };

  // --- Format date for display ---
   const formatDateDisplay = (date: Date) => {
     const todayLocal = startOfDay(new Date());
     const tomorrowLocal = addDays(todayLocal, 1);
     if (isSameDay(date, todayLocal)) return 'Today';
     if (isSameDay(date, tomorrowLocal)) return 'Tomorrow';
     return format(date, 'EEE, MMM d');
   };

   // --- Get Status info for the selected date ---
   const selectedDateString = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
   const selectedStatusInfo = selectedDateString ? dateStatusState[selectedDateString] : null;
   const selectedOpenTimeFormatted = selectedStatusInfo ? formatTimeDisplay(selectedStatusInfo.openTime) : null;
   const selectedCloseTimeFormatted = selectedStatusInfo ? formatTimeDisplay(selectedStatusInfo.closeTime) : null;

  // --- Render ---
  return (
    <View className="mb-6">
      <Text className="text-lg font-semibold text-white mb-4">Select a Date</Text>

       {/* Loading Indicator */}
       {isLoading && ( <View className="items-center justify-center py-10"><ActivityIndicator size="large" color="#ff4d6d" /><Text className="text-gray-400 mt-3">Loading available dates...</Text></View> )}
       {/* Error Message */}
       {error && !isLoading && ( <View className="bg-red-900/50 p-4 rounded-lg mb-4 border border-red-700"><Text className="text-red-300 text-center">{error}</Text></View> )}
       {/* No Dates Available Message */}
       {!isLoading && !error && Object.keys(dateStatusState).length === 0 && ( <Text className="text-gray-400 text-center italic my-4">No available dates found for this bar in the next month.</Text> )}

     {/* Date selection scroll view */}
     {!isLoading && !error && Object.keys(dateStatusState).length > 0 && (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
        {datesForDisplay.map((date, index) => {
           const dateString = format(date, 'yyyy-MM-dd');
           const statusInfo = dateStatusState[dateString];
           // UPDATED isDisabled Check
           const isDisabled = !statusInfo || !statusInfo.isOpen || statusInfo.isFullyBooked || isBefore(date, today);
           const isSelected = selectedDate && isSameDay(selectedDate, date);
           const isException = statusInfo?.isException ?? false;
           // Styling Classes
           const baseBgClass = isSelected ? 'bg-[#ff4d6d]' : 'bg-[#1f1f27]';
           const opacityClass = isDisabled ? 'opacity-50' : '';
           const exceptionBorderClass = isException && !isDisabled ? 'border-2 border-amber-400' : ''; // Keep amber for exceptions
           const textColorClass = isDisabled ? 'text-gray-600' : (isSelected ? 'text-white' : 'text-white');
           const textSubColorClass = isDisabled ? 'text-gray-600' : (isSelected ? 'text-white' : 'text-gray-400');

           return (
             <Pressable
               key={index}
               disabled={isDisabled}
               className={`mr-3 p-3 rounded-xl min-w-[60px] items-center ${baseBgClass} ${opacityClass} ${exceptionBorderClass}`}
               onPress={() => handleDateSelect(date)}
             >
               <Text className={`text-center text-sm font-medium ${textSubColorClass}`}>{format(date, 'EEE')}</Text>
               <Text className={`text-center text-xl font-bold mt-1 ${textColorClass}`}>{format(date, 'd')}</Text>
               <Text className={`text-center text-xs mt-1 ${textSubColorClass}`}>{format(date, 'MMM')}</Text>
               {/* Optional: Indicator dot if open but fully booked */}
               {statusInfo?.isOpen && statusInfo?.isFullyBooked && (
                   <View className="absolute top-1 right-1 bg-red-600 rounded-full w-2 h-2" />
               )}
             </Pressable>
           );
         })}
      </ScrollView>
      )}

      {/* Selected date display - UPDATED */}
      {/* Show section if a date is selected and we have status info for it */}
      {selectedDate && selectedStatusInfo && (
        <View className={`bg-[#1f1f27] p-4 rounded-xl mb-6 ${!selectedStatusInfo.isOpen ? 'opacity-60' : ''}`}>
            {/* Date Part */}
            <View className="flex-row items-center mb-2">
                <Calendar size={20} color="#ff4d6d" />
                <Text className={`ml-3 font-medium ${selectedStatusInfo.isOpen ? 'text-white' : 'text-gray-400 italic'}`}>
                  {formatDateDisplay(selectedDate)}
                  {!selectedStatusInfo.isOpen && ' - Closed'} {/* Indicate if closed */}
                  {selectedStatusInfo.isException && (
                      <Text className={`text-xs italic ${selectedStatusInfo.isOpen ? 'text-amber-400' : 'text-gray-500'}`}>
                         {selectedStatusInfo.isOpen ? ' (Special Hours)' : ' (Special Closure)'}
                      </Text>
                  )}
                </Text>
            </View>

           {/* Time Part - Only show if open and times are available */}
           {selectedStatusInfo.isOpen && selectedOpenTimeFormatted && selectedCloseTimeFormatted && (
             <View className="flex-row items-center ml-1 pl-7 mb-2">
                 <Clock size={16} color="#a0a0a0" />
                 <Text className="text-gray-300 ml-2 text-sm">
                     {selectedOpenTimeFormatted} - {selectedCloseTimeFormatted}
                 </Text>
             </View>
           )}
           {/* Optional: Show if open but times missing */}
            {selectedStatusInfo.isOpen && !(selectedOpenTimeFormatted && selectedCloseTimeFormatted) && (
                 <View className="flex-row items-center ml-1 pl-7 mb-2">
                    <Clock size={16} color="#a0a0a0" />
                    <Text className="text-gray-500 ml-2 text-sm italic">(Hours not specified)</Text>
                </View>
            )}

           {/* Availability Status Part - Only show if open */}
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
                                Available: {/* Join the capitalized types */}
                                {selectedStatusInfo.availableSeatTypes && selectedStatusInfo.availableSeatTypes.length > 0
                                   ? selectedStatusInfo.availableSeatTypes.map(capitalize).join(', ')
                                   : 'Seats' /* Fallback if array is empty but not fully booked */
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