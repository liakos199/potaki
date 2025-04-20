import React, { useState, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { format } from "date-fns";
import { Save, RotateCcw, ChevronDown } from "lucide-react-native";
import RegularHoursTab, { RegularHoursTabRef } from "./bar-hours";
import ExceptionsTab, { ExceptionsTabRef } from "./bar-exceptions";
import { useToast } from "@/src/components/general/Toast";

type BarOperatingHoursProps = {
  barId: string;
};

const BarOperatingHours = ({ barId }: BarOperatingHoursProps): JSX.Element => {
  const regularHoursRef = useRef<RegularHoursTabRef>(null);
  const exceptionsRef = useRef<ExceptionsTabRef>(null);
  const [activeTab, setActiveTab] = useState<"regular" | "exceptions">("regular");
  const [regularHasChanges, setRegularHasChanges] = useState(false);
  const [exceptionsHasChanges, setExceptionsHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerConfig, setTimePickerConfig] = useState<{
    onConfirm: (newTime: string) => void;
  } | null>(null);
  const [datePickerConfig, setDatePickerConfig] = useState<{
    onConfirm: (newDate: Date) => void;
  } | null>(null);
  const toast = useToast();

  // Compute overall hasChanges state from both tabs
  const hasChanges = regularHasChanges || exceptionsHasChanges;

  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpansion = () => setIsExpanded((prev) => !prev);
  const arrowRotation = useSharedValue(0);

  React.useEffect(() => {
    arrowRotation.value = withTiming(isExpanded ? 180 : 0, { duration: 200 });
  }, [isExpanded]);

  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${arrowRotation.value}deg` }],
  }));

  // Save only the active tab's changes
  const handleSaveChanges = async () => {
    if (isSaving) return;
    
    setIsSaving(true);
    try {
      if (activeTab === "regular" && regularHoursRef.current?.saveChanges) {
        await regularHoursRef.current.saveChanges();
        setRegularHasChanges(false);
      } else if (activeTab === "exceptions" && exceptionsRef.current?.saveChanges) {
        await exceptionsRef.current.saveChanges();
        setExceptionsHasChanges(false);
      }
    } catch (error) {
      console.error("Error saving changes:", error);
      toast.show({ 
        type: "error", 
        text1: "Save failed", 
        text2: error instanceof Error ? error.message : "An unknown error occurred" 
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Revert only the active tab's changes
  const handleRevertChanges = () => {
    if (activeTab === "regular" && regularHoursRef.current?.revertChanges) {
      regularHoursRef.current.revertChanges();
      setRegularHasChanges(false);
    } else if (activeTab === "exceptions" && exceptionsRef.current?.revertChanges) {
      exceptionsRef.current.revertChanges();
      setExceptionsHasChanges(false);
    }
  };

  // Handle tab changes with unsaved changes warning
  const handleTabChange = (newTab: "regular" | "exceptions") => {
    // Only update if it's actually changing
    if (newTab !== activeTab) {
      // Check if current tab has unsaved changes
      const currentTabHasChanges = activeTab === "regular" ? regularHasChanges : exceptionsHasChanges;
      
      if (currentTabHasChanges) {
        // Prompt user about unsaved changes
        toast.show({
          type: "info",
          text1: "Unsaved changes",
          text2: "Save your changes before switching tabs or they will be lost",
        });
      } else {
        // No unsaved changes, safe to switch
        setActiveTab(newTab);
      }
    }
  };

  // Update change state for each tab separately
  const handleRegularHasChanges = (changed: boolean) => {
    setRegularHasChanges(changed);
  };

  const handleExceptionsHasChanges = (changed: boolean) => {
    setExceptionsHasChanges(changed);
  };

  const requestTimePicker = (currentValue: Date, onConfirm: (newTime: string) => void) => {
    setTimePickerConfig({ onConfirm });
    setTimePickerVisible(true);
  };

  const handleTimeConfirm = (date: Date) => {
    if (timePickerConfig) {
      const formattedTime = format(date, "HH:mm");
      timePickerConfig.onConfirm(formattedTime);
    }
    setTimePickerVisible(false);
    setTimePickerConfig(null);
  };

  const hideTimePicker = () => {
    setTimePickerVisible(false);
    setTimePickerConfig(null);
  };

  const requestDatePicker = (onConfirm: (newDate: Date) => void) => {
    setDatePickerConfig({ onConfirm });
    setDatePickerVisible(true);
  };

  const handleDateConfirm = (date: Date) => {
    if (datePickerConfig) {
      datePickerConfig.onConfirm(date);
    }
    setDatePickerVisible(false);
    setDatePickerConfig(null);
  };

  const hideDatePicker = () => {
    setDatePickerVisible(false);
    setDatePickerConfig(null);
  };

  // Determine if the current tab has changes
  const activeTabHasChanges = activeTab === "regular" ? regularHasChanges : exceptionsHasChanges;

  return (
    <View className="flex-1 bg-white rounded-xl shadow-sm m-2">
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={toggleExpansion}
        className="p-3 flex-row justify-between items-center"
      >
        <View>
          <Text className="text-xl font-bold text-gray-800">Operating Hours</Text>
          <Text className="text-sm text-gray-500 mt-1">Manage when your bar is open.</Text>
        </View>
        <Animated.View style={chevronAnimatedStyle}>
          <ChevronDown size={18} color={isExpanded ? '#4f46e5' : '#6b7280'} />
        </Animated.View>
      </TouchableOpacity>

      {isExpanded && (
        <>
          <View className="flex-row mb-4 border-b border-gray-200 px-3">
            <TouchableOpacity
              className={`py-2 px-4 mr-2 border-b-2 ${activeTab === "regular" ? "border-blue-500" : "border-transparent"}`}
              onPress={() => handleTabChange("regular")}
            >
              <Text className={`text-sm font-medium ${activeTab === "regular" ? "text-blue-600" : "text-gray-500"}`}>
                Regular Hours
                {regularHasChanges && <Text className="text-yellow-500">*</Text>}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`py-2 px-4 border-b-2 ${activeTab === "exceptions" ? "border-blue-500" : "border-transparent"}`}
              onPress={() => handleTabChange("exceptions")}
            >
              <Text className={`text-sm font-medium ${activeTab === "exceptions" ? "text-blue-600" : "text-gray-500"}`}>
                Exceptions
                {exceptionsHasChanges && <Text className="text-yellow-500">*</Text>}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 mb-4 px-3">
            {/* Always render both components but hide inactive one */}
            <View style={{ display: activeTab === "regular" ? "flex" : "none" }}>
              <RegularHoursTab
                ref={regularHoursRef}
                barId={barId}
                onHasChangesChange={handleRegularHasChanges}
                onRequestTimePicker={requestTimePicker}
              />
            </View>
            <View style={{ display: activeTab === "exceptions" ? "flex" : "none" }}>
              <ExceptionsTab
                ref={exceptionsRef}
                barId={barId}
                onHasChangesChange={handleExceptionsHasChanges}
                onRequestTimePicker={requestTimePicker}
                onRequestDatePicker={requestDatePicker}
              />
            </View>
          </ScrollView>

          {activeTabHasChanges && (
            <View className="px-3 pb-3 pt-4 border-t border-gray-200">
              <View className="flex-row justify-end mb-4">
                <TouchableOpacity
                  className="flex-row items-center px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 mr-2"
                  onPress={handleRevertChanges}
                  disabled={isSaving}
                >
                  <RotateCcw size={16} color="#4b5563" />
                  <Text className="ml-1.5 text-sm text-gray-700 font-medium">Revert</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`flex-row items-center px-4 py-2 rounded-lg border ${isSaving ? 'bg-green-50 border-green-200' : 'bg-green-100 border-green-300'}`}
                  onPress={handleSaveChanges}
                  disabled={isSaving}
                >
                  <Save size={16} color="#15803d" />
                  <Text className="ml-1.5 text-sm text-green-800 font-semibold">
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <DateTimePickerModal
            isVisible={isTimePickerVisible}
            mode="time"
            onConfirm={handleTimeConfirm}
            onCancel={hideTimePicker}
            is24Hour={true}
          />
          <DateTimePickerModal
            isVisible={isDatePickerVisible}
            mode="date"
            onConfirm={handleDateConfirm}
            onCancel={hideDatePicker}
            minimumDate={new Date()}
          />
        </>
      )}
    </View>
  );
};

export default BarOperatingHours;