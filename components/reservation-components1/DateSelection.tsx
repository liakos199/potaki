import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Calendar, Clock } from 'lucide-react-native';
import { format, addDays, isSameDay } from 'date-fns';

/*
the calendar should have a max allowed to select date which will be : from today's date + 1 month ( 30 days ). So lets say today is 1 January , the max allowed date should be 1 February.
From that range , the user can select any date he wants where the specific bar is open
After he selects a date , the calculations are done to check the availability and if there is at least 1 option of a seat type left for the selected date the user is able to proceed with the next steps , else if there is none he should select another date.

Each time i select a date , show the available 
*/

type DateSelectionProps = {
  selectedDate: Date | null;
  onDateChange: (date: Date) => void;

};

const DateSelection: React.FC<DateSelectionProps> = ({ selectedDate, onDateChange}) => {
  const [availableDates, setAvailableDates] = useState<Date[]>([]);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Generate available dates (next 14 days)
  useEffect(() => {
    const dates = [];
    const today = new Date();
    
    for (let i = 0; i < 14; i++) {
      dates.push(addDays(today, i));
    }
    
    setAvailableDates(dates);
  }, []);

  // Generate available times when a date is selected
  useEffect(() => {
    if (selectedDate) {
      setLoading(true);
      
      // Simulate API call to get available times
      setTimeout(() => {
        // Mock available times
        const times = ['18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'];
        setAvailableTimes(times);
        setLoading(false);
      }, 500);
    }
  }, [selectedDate]);

  // Handle date selection
  const handleDateSelect = (date: Date) => {
    // Reset time selection when date changes
    setSelectedTime(null);
    onDateChange(date);
  };

  // Handle time selection
  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    
    // Create a new date with the selected time
    if (selectedDate) {
      const [hours, minutes] = time.split(':').map(Number);
      const newDate = new Date(selectedDate);
      newDate.setHours(hours, minutes);
      onDateChange(newDate);
    }
  };

  // Format date for display
  const formatDateDisplay = (date: Date) => {
    const today = new Date();
    const tomorrow = addDays(today, 1);
    
    if (isSameDay(date, today)) {
      return 'Today';
    } else if (isSameDay(date, tomorrow)) {
      return 'Tomorrow';
    } else {
      return format(date, 'EEE, MMM d');
    }
  };

  return (
    <View className="mb-6">
      <Text className="text-lg font-semibold text-white mb-4">Select a Date</Text>
      
      {/* Date selection */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        className="mb-6"
      >
        {availableDates.map((date, index) => (
          <Pressable
            key={index}
            className={`mr-3 p-3 rounded-xl ${
              selectedDate && isSameDay(selectedDate, date) 
                ? 'bg-[#ff4d6d]' 
                : 'bg-[#1f1f27]'
            }`}
            onPress={() => handleDateSelect(date)}
          >
            <Text className={`text-center ${
              selectedDate && isSameDay(selectedDate, date) 
                ? 'text-white font-medium' 
                : 'text-gray-300'
            }`}>
              {format(date, 'EEE')}
            </Text>
            <Text className={`text-center text-xl font-bold mt-1 ${
              selectedDate && isSameDay(selectedDate, date) 
                ? 'text-white' 
                : 'text-white'
            }`}>
              {format(date, 'd')}
            </Text>
            <Text className={`text-center text-xs mt-1 ${
              selectedDate && isSameDay(selectedDate, date) 
                ? 'text-white' 
                : 'text-gray-400'
            }`}>
              {format(date, 'MMM')}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      
      {/* Selected date display */}
      {selectedDate && (
        <View className="bg-[#1f1f27] p-4 rounded-xl mb-6 flex-row items-center">
          <Calendar size={20} color="#ff4d6d" />
          <Text className="text-white ml-3 font-medium">
            {formatDateDisplay(selectedDate)}
          </Text>
        </View>
      )}
      
      {/* Time selection */}
      {selectedDate && (
        <>
          <Text className="text-lg font-semibold text-white mb-4">Select a Time</Text>
          
          {loading ? (
            <View className="items-center py-6">
              <ActivityIndicator color="#ff4d6d" />
              <Text className="text-gray-400 mt-2">Loading available times...</Text>
            </View>
          ) : (
            <View className="flex-row flex-wrap">
              {availableTimes.map((time, index) => (
                <Pressable
                  key={index}
                  className={`mr-3 mb-3 px-4 py-3 rounded-xl ${
                    selectedTime === time 
                      ? 'bg-[#ff4d6d]' 
                      : 'bg-[#1f1f27]'
                  }`}
                  onPress={() => handleTimeSelect(time)}
                >
                  <View className="flex-row items-center">
                    <Clock size={14} color={selectedTime === time ? "#fff" : "#9ca3af"} />
                    <Text className={`ml-2 ${
                      selectedTime === time 
                        ? 'text-white font-medium' 
                        : 'text-gray-300'
                    }`}>
                      {time}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
};

export default DateSelection;