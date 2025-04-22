import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Calendar } from 'lucide-react-native'; // Assuming this is your icon library
import { format, addDays, isSameDay, startOfDay, addMonths, isAfter, isBefore } from 'date-fns';
import { supabase } from '@/src/lib/supabase'; // Adjust path as needed

// Define the NEW expected structure of the API response
type DateStatus = {
  isOpen: boolean;
  isException: boolean;
};

type AvailabilityApiResponse = {
  dateStatus?: Record<string, DateStatus>; // Object keyed by 'yyyy-MM-dd'
};

type DateSelectionProps = {
  barId: string;
  selectedDate: Date | null;
  onDateChange: (date: Date) => void;
};

const DateSelection: React.FC<DateSelectionProps> = ({ barId, selectedDate, onDateChange }) => {
  // State for the date status object fetched from the API
  const [dateStatusState, setDateStatusState] = useState<Record<string, DateStatus>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // --- Calculate Date Range ---
  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => addMonths(today, 1), [today]);

  // --- Fetch Available Dates from Backend ---
  useEffect(() => {
    const fetchAvailability = async () => {
      if (!barId) {
        setError('Bar ID is missing.');
        setIsLoading(false);
        setDateStatusState({});
        return;
      }

      setIsLoading(true);
      setError(null);

      const startDate = format(today, 'yyyy-MM-dd');
      const endDate = format(maxDate, 'yyyy-MM-dd');

      try {
        console.log(`Fetching availability for bar ${barId} from ${startDate} to ${endDate}`);

        // --- Using fetch directly to control URL and add Auth header ---
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
           throw new Error("User not authenticated or session error.");
        }
        const accessToken = session.access_token;

        // Ensure Supabase URL is configured (replace with your env variable access)
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        if (!supabaseUrl) {
            throw new Error("Supabase URL not configured.");
        }
        const functionName = 'get-bar-availability';
        const endpoint = `${supabaseUrl}/functions/v1/${functionName}/${barId}?start_date=${startDate}&end_date=${endDate}`;

        console.log(`Calling endpoint: ${endpoint}`);

        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            }
        });

        console.log(`Response status: ${response.status}`);

        if (!response.ok) {
           const errorText = await response.text();
           console.error('API Error Response:', errorText);
           throw new Error(`Failed to fetch availability: ${response.status} ${response.statusText}. ${errorText}`);
        }

        // Expect the NEW response structure
        const responseData: AvailabilityApiResponse = await response.json();
        console.log('API Response Data:', responseData);

        // Set the fetched date status object into state
        setDateStatusState(responseData.dateStatus || {}); // Use empty object if data is missing

      } catch (err: any) {
        console.error('Failed to fetch available dates:', err);
        setError(`Could not load available dates. ${err.message || ''}`);
        setDateStatusState({}); // Clear dates on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchAvailability();
  }, [barId, today, maxDate]); // Re-fetch if barId, today, or maxDate changes

  // --- Generate Dates for Display (Next 30 days or until maxDate) ---
  const datesForDisplay = useMemo(() => {
    const dates: Date[] = [];
    let currentDate = today;
    while (!isAfter(currentDate, maxDate)) {
        dates.push(currentDate);
        currentDate = addDays(currentDate, 1);
    }
    return dates;
  }, [today, maxDate]);

  // --- Event Handlers ---
  const handleDateSelect = (date: Date) => {
    onDateChange(startOfDay(date));
  };

  // --- Format date for display in the bottom bar ---
   const formatDateDisplay = (date: Date) => {
     const todayLocal = startOfDay(new Date());
     const tomorrowLocal = addDays(todayLocal, 1);

     if (isSameDay(date, todayLocal)) return 'Today';
     if (isSameDay(date, tomorrowLocal)) return 'Tomorrow';
     return format(date, 'EEE, MMM d');
   };

  // --- Render ---
  return (
    <View className="mb-6">
      <Text className="text-lg font-semibold text-white mb-4">Select a Date</Text>

       {/* Loading Indicator */}
       {isLoading && (
          <View className="items-center justify-center py-10">
            <ActivityIndicator size="large" color="#ff4d6d" />
            <Text className="text-gray-400 mt-3">Loading available dates...</Text>
          </View>
        )}

       {/* Error Message */}
       {error && !isLoading && (
         <View className="bg-red-900/50 p-4 rounded-lg mb-4 border border-red-700">
            <Text className="text-red-300 text-center">{error}</Text>
         </View>
       )}

       {/* No Dates Available Message - Check if the state object is empty */}
       {!isLoading && !error && Object.keys(dateStatusState).length === 0 && (
          <Text className="text-gray-400 text-center italic my-4">
              No available dates found for this bar in the next month.
          </Text>
       )}

      {/* Date selection scroll view - Only show if not loading and no error OR if there are dates */}
     {!isLoading && !error && Object.keys(dateStatusState).length > 0 && (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-6"
      >
        {datesForDisplay.map((date, index) => {
           const dateString = format(date, 'yyyy-MM-dd');
           const statusInfo = dateStatusState[dateString]; // Get status info for this date

           // Determine if the date is disabled
           // Disabled if: No status info OR status info says it's not open OR it's before today
           const isDisabled = !statusInfo || !statusInfo.isOpen || isBefore(date, today);

           // Determine if the date is selected
           const isSelected = selectedDate && isSameDay(selectedDate, date);

           // Determine if it's an exception day (and it has status info)
           const isException = statusInfo?.isException ?? false;

           // --- Define dynamic classes/styles ---
           // Base class (selected or default)
           const baseBgClass = isSelected ? 'bg-[#ff4d6d]' : 'bg-[#1f1f27]';
           // Opacity class if disabled
           const opacityClass = isDisabled ? 'opacity-50' : '';
           // Border class if it's an exception day (and not disabled)
           const exceptionBorderClass = isException && !isDisabled ? 'border-2 border-red-400' : ''; // Example: Yellow border for exceptions

           const textColorClass = isDisabled ? 'text-gray-600' : (isSelected ? 'text-white' : 'text-white'); // Adjust disabled color if needed
           const textSubColorClass = isDisabled ? 'text-gray-600' : (isSelected ? 'text-white' : 'text-gray-400'); // Adjust disabled color if needed

           return (
             <Pressable
               key={index}
               disabled={isDisabled}
               // Combine classes for styling
               className={`mr-3 p-3 rounded-xl min-w-[60px] items-center ${baseBgClass} ${opacityClass} ${exceptionBorderClass}`}
               onPress={() => handleDateSelect(date)}
             >
               <Text className={`text-center text-sm font-medium ${textSubColorClass}`}>
                 {format(date, 'EEE')}
               </Text>
               <Text className={`text-center text-xl font-bold mt-1 ${textColorClass}`}>
                 {format(date, 'd')}
               </Text>
               <Text className={`text-center text-xs mt-1 ${textSubColorClass}`}>
                 {format(date, 'MMM')}
               </Text>
             </Pressable>
           );
         })}
      </ScrollView>
      )}

      {/* Selected date display */}
      {selectedDate && (
        <View className="bg-[#1f1f27] p-4 rounded-xl mb-6 flex-row items-center">
          <Calendar size={20} color="#ff4d6d" />
          <Text className="text-white ml-3 font-medium">
            {formatDateDisplay(selectedDate)}
          </Text>
        </View>
      )}
    </View>
  );
};

export default DateSelection;