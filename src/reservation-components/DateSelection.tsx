import { useCallback, useEffect, useState, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from '@/src/lib/supabase';
import { Calendar } from 'lucide-react-native';
import { format, addDays, getDay, isAfter, isBefore, isSameDay, startOfDay } from 'date-fns';
import DateTimePickerModal from 'react-native-modal-datetime-picker';

// Type for operating hours
type OperatingHours = {
  id: string;
  day_of_week: string; // "1" to "7" where "1" is Monday and "7" is Sunday
  open_time: string;
  close_time: string;
  closes_next_day: boolean;
};

// Type for bar exceptions (closed days or special hours)
type BarException = {
  id: string;
  bar_id: string;
  exception_date: string;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  closes_next_day: boolean | null;
};

type DateSelectionProps = {
  barId: string;
  selectedDate: Date | null;
  onDateChange: (date: Date) => void;
  isLoading?: boolean;
};

const DateSelection = ({ 
  barId,
  selectedDate,
  onDateChange,
  isLoading = false
}: DateSelectionProps): JSX.Element => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [operatingHours, setOperatingHours] = useState<OperatingHours[]>([]);
  const [barExceptions, setBarExceptions] = useState<BarException[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [availableDates, setAvailableDates] = useState<Date[]>([]);
  const [debug, setDebug] = useState<string>('');

  // Calculate maximum date (1 month from today)
  const maxDate = useMemo(() => addDays(new Date(), 30), []);
  
  // JavaScript's getDay() returns 0 for Sunday, 1 for Monday, etc.
  // But our database uses "1" for Monday through "7" for Sunday
  // This mapping helps convert between the two
  const jsToDbDayMap = useMemo(() => ({
    0: "7", // Sunday
    1: "1", // Monday
    2: "2", // Tuesday
    3: "3", // Wednesday
    4: "4", // Thursday
    5: "5", // Friday
    6: "6"  // Saturday
  }), []);

  // Helper function to check if a date is available for booking
  const isDateAvailable = useCallback((date: Date) => {
    // Check if the date is in the future and within maximum date range
    const today = startOfDay(new Date());
    if (isBefore(date, today) || isAfter(date, maxDate)) {
      return false;
    }
    
    // Check if the date is in bar exceptions and marked as closed
    const dateString = format(date, 'yyyy-MM-dd');
    const exception = barExceptions.find(e => e.exception_date === dateString);
    if (exception && exception.is_closed) {
      return false;
    }
    
    // If not in exceptions, check regular operating hours
    const jsDayOfWeek = getDay(date); // 0 = Sunday, 1 = Monday, etc.
    const dbDayOfWeek = jsToDbDayMap[jsDayOfWeek as keyof typeof jsToDbDayMap]; // Convert to "1"-"7" format
    
    // Check if there are operating hours for this day
    const hasOperatingHours = operatingHours.some(h => h.day_of_week === dbDayOfWeek);
    
    return hasOperatingHours;
  }, [operatingHours, barExceptions, maxDate, jsToDbDayMap]);
  
  // Generate available dates for next month
  const generateAvailableDates = useCallback(() => {
    const dates: Date[] = [];
    let currentDate = startOfDay(new Date());
    const endDate = maxDate;
    
    while (!isAfter(currentDate, endDate)) {
      if (isDateAvailable(currentDate)) {
        dates.push(new Date(currentDate));
      }
      currentDate = addDays(currentDate, 1);
    }
    
    setAvailableDates(dates);
    setDebug(`Found ${dates.length} available dates. Operating hours: ${operatingHours.length} records.`);
  }, [isDateAvailable, maxDate, operatingHours.length]);
  
  // Load operating hours and exceptions from Supabase
  useEffect(() => {
    let isMounted = true;
    console.log(`Fetching operating hours for bar ID: ${barId}`);
    
    const fetchBarSchedule = async () => {
      if (!barId) return;
      
      setLoadingData(true);
      
      try {
        // Fetch operating hours
        const { data: hoursData, error: hoursError } = await supabase
          .from('operating_hours')
          .select('id, day_of_week, open_time, close_time, closes_next_day')
          .eq('bar_id', barId);
        
        if (hoursError) {
          console.error('Error fetching operating hours:', hoursError);
          setDebug(`Error fetching operating hours: ${hoursError.message}`);
          return;
        }
        
        console.log(`Found ${hoursData?.length || 0} operating hours records`);
        
        // Fetch bar exceptions
        const { data: exceptionsData, error: exceptionsError } = await supabase
          .from('bar_exceptions')
          .select('id, bar_id, exception_date, is_closed, open_time, close_time, closes_next_day')
          .eq('bar_id', barId)
          .gte('exception_date', format(new Date(), 'yyyy-MM-dd'))
          .lte('exception_date', format(maxDate, 'yyyy-MM-dd'));
          
        if (exceptionsError) {
          console.error('Error fetching bar exceptions:', exceptionsError);
          setDebug((prev) => `${prev}\nError fetching bar exceptions: ${exceptionsError.message}`);
        }
        
        if (isMounted) {
          setOperatingHours(hoursData || []);
          setBarExceptions(exceptionsData || []);
          setLoadingData(false);
          
          // Debug output
          setDebug((prev) => `${prev}\nOperating days: ${hoursData?.map(h => h.day_of_week).join(', ') || 'none'}`);
        }
      } catch (error) {
        console.error('Error in fetchBarSchedule:', error);
        if (isMounted) {
          setLoadingData(false);
          setDebug((prev) => `${prev}\nGeneral error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };
    
    fetchBarSchedule();
    
    return () => {
      isMounted = false;
    };
  }, [barId, maxDate]);
  
  // Generate available dates when hours or exceptions change
  useEffect(() => {
    if (!loadingData) {
      generateAvailableDates();
    }
  }, [loadingData, generateAvailableDates]);
  
  // Set initial date to first available when data loads
  useEffect(() => {
    if (availableDates.length > 0 && !selectedDate) {
      onDateChange(availableDates[0]);
    }
  }, [availableDates, selectedDate, onDateChange]);
  
  // Handle date confirmation from picker
  const handleConfirmDate = (date: Date) => {
    setShowDatePicker(false);
    
    // Only change if the date is available
    if (isDateAvailable(date)) {
      onDateChange(date);
    } else {
      // Find the closest available date
      if (availableDates.length > 0) {
        const closestDate = availableDates.reduce((prev, curr) => {
          const prevDiff = Math.abs(prev.getTime() - date.getTime());
          const currDiff = Math.abs(curr.getTime() - date.getTime());
          return prevDiff < currDiff ? prev : curr;
        }, availableDates[0]);
        
        onDateChange(closestDate);
      }
    }
  };
  
  // Determine if the load spinner should show
  const showSpinner = isLoading || loadingData;
  
  return (
    <View className="mb-6 w-full">
      <Text className="text-gray-700 text-lg font-semibold mb-2">Date</Text>
      <Pressable
        className={`flex-row items-center p-4 border border-gray-200 rounded-lg ${showSpinner ? 'opacity-70' : ''}`}
        onPress={() => setShowDatePicker(true)}
        disabled={showSpinner || availableDates.length === 0}
      >
        <Calendar size={20} color="#4b5563" />
        {showSpinner ? (
          <View className="ml-2 flex-row items-center">
            <ActivityIndicator size="small" color="#4b5563" />
            <Text className="ml-2 text-lg text-gray-500">Loading available dates...</Text>
          </View>
        ) : selectedDate ? (
          <Text className="ml-2 text-lg">
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
          </Text>
        ) : availableDates.length > 0 ? (
          <Text className="ml-2 text-lg text-gray-500">Select a date</Text>
        ) : (
          <Text className="ml-2 text-lg text-red-500">No available dates</Text>
        )}
      </Pressable>
      
      <DateTimePickerModal
        isVisible={showDatePicker}
        mode="date"
        date={selectedDate || new Date()}
        minimumDate={new Date()}
        maximumDate={maxDate}
        onConfirm={handleConfirmDate}
        onCancel={() => setShowDatePicker(false)}
      />
      
      {availableDates.length === 0 && !loadingData && (
        <Text className="mt-2 text-red-500">
          No available dates found for the next month. Please check back later.
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

export default DateSelection;
