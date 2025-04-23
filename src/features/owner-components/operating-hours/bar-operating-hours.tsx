"use client"

import { useState, useRef, useEffect } from "react"
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from "react-native"
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated"
import DateTimePickerModal from "react-native-modal-datetime-picker"
import { format } from "date-fns"
import { Clock, RotateCcw, ChevronDown, Save } from "lucide-react-native"
import RegularHoursTab, { type RegularHoursTabRef } from "./bar-hours"
import ExceptionsTab, { type ExceptionsTabRef } from "./bar-exceptions"
import { useToast } from "@/src/components/general/Toast"

type BarOperatingHoursProps = {
  barId: string
}

const BarOperatingHours = ({ barId }: BarOperatingHoursProps): JSX.Element => {
  const regularHoursRef = useRef<RegularHoursTabRef>(null)
  const exceptionsRef = useRef<ExceptionsTabRef>(null)
  const [activeTab, setActiveTab] = useState<"regular" | "exceptions">("regular")
  const [regularHasChanges, setRegularHasChanges] = useState(false)
  const [exceptionsHasChanges, setExceptionsHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTimePickerVisible, setTimePickerVisible] = useState(false)
  const [isDatePickerVisible, setDatePickerVisible] = useState(false)
  const [timePickerConfig, setTimePickerConfig] = useState<{
    onConfirm: (newTime: string) => void
  } | null>(null)
  const [datePickerConfig, setDatePickerConfig] = useState<{
    onConfirm: (newDate: Date) => void
  } | null>(null)
  const toast = useToast()

  // Compute overall hasChanges state from both tabs
  const hasChanges = regularHasChanges || exceptionsHasChanges

  const [isExpanded, setIsExpanded] = useState(true)
  const toggleExpansion = () => setIsExpanded((prev) => !prev)
  const arrowRotation = useSharedValue(0)

  useEffect(() => {
    arrowRotation.value = withTiming(isExpanded ? 180 : 0, { duration: 200 })
  }, [isExpanded])

  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${arrowRotation.value}deg` }],
  }))

  // Save only the active tab's changes
  const handleSaveChanges = async () => {
    if (isSaving) return

    setIsSaving(true)
    try {
      if (activeTab === "regular" && regularHoursRef.current?.saveChanges) {
        await regularHoursRef.current.saveChanges()
        setRegularHasChanges(false)
      } else if (activeTab === "exceptions" && exceptionsRef.current?.saveChanges) {
        await exceptionsRef.current.saveChanges()
        setExceptionsHasChanges(false)
      }
    } catch (error) {
      console.error("Error saving changes:", error)
      toast.show({
        type: "error",
        text1: "Save failed",
        text2: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Revert only the active tab's changes
  const handleRevertChanges = () => {
    if (activeTab === "regular" && regularHoursRef.current?.revertChanges) {
      regularHoursRef.current.revertChanges()
      setRegularHasChanges(false)
    } else if (activeTab === "exceptions" && exceptionsRef.current?.revertChanges) {
      exceptionsRef.current.revertChanges()
      setExceptionsHasChanges(false)
    }
  }

  // Handle tab changes with unsaved changes warning
  const handleTabChange = (newTab: "regular" | "exceptions") => {
    // Only update if it's actually changing
    if (newTab !== activeTab) {
      // Check if current tab has unsaved changes
      const currentTabHasChanges = activeTab === "regular" ? regularHasChanges : exceptionsHasChanges

      if (currentTabHasChanges) {
        // Prompt user about unsaved changes
        toast.show({
          type: "info",
          text1: "Unsaved changes",
          text2: "Save your changes before switching tabs or they will be lost",
        })
      } else {
        // No unsaved changes, safe to switch
        setActiveTab(newTab)
      }
    }
  }

  // Update change state for each tab separately
  const handleRegularHasChanges = (changed: boolean) => {
    setRegularHasChanges(changed)
  }

  const handleExceptionsHasChanges = (changed: boolean) => {
    setExceptionsHasChanges(changed)
  }

  const requestTimePicker = (currentValue: Date, onConfirm: (newTime: string) => void) => {
    setTimePickerConfig({ onConfirm })
    setTimePickerVisible(true)
  }

  const handleTimeConfirm = (date: Date) => {
    if (timePickerConfig) {
      const formattedTime = format(date, "HH:mm")
      timePickerConfig.onConfirm(formattedTime)
    }
    setTimePickerVisible(false)
    setTimePickerConfig(null)
  }

  const hideTimePicker = () => {
    setTimePickerVisible(false)
    setTimePickerConfig(null)
  }

  const requestDatePicker = (onConfirm: (newDate: Date) => void) => {
    setDatePickerConfig({ onConfirm })
    setDatePickerVisible(true)
  }

  const handleDateConfirm = (date: Date) => {
    if (datePickerConfig) {
      datePickerConfig.onConfirm(date)
    }
    setDatePickerVisible(false)
    setDatePickerConfig(null)
  }

  const hideDatePicker = () => {
    setDatePickerVisible(false)
    setDatePickerConfig(null)
  }

  // Determine if the current tab has changes
  const activeTabHasChanges = activeTab === "regular" ? regularHasChanges : exceptionsHasChanges

  return (
    <View style={styles.container}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={toggleExpansion}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel="Operating Hours Section"
        accessibilityHint={isExpanded ? "Tap to collapse" : "Tap to expand"}
      >
        <View style={styles.headerContent}>
          <Clock size={22} color="#ff4d6d" style={styles.headerIcon} />
          <View>
            <Text style={styles.headerTitle}>Operating Hours</Text>
            <Text style={styles.headerSubtitle}>Set your regular hours and special dates</Text>
          </View>
        </View>
        <Animated.View style={chevronAnimatedStyle}>
          <ChevronDown size={22} color="#9ca3af" />
        </Animated.View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.expandedContent}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsContainer}
            contentContainerStyle={styles.tabsContentContainer}
          >
            <TouchableOpacity
              style={[styles.tabButton, activeTab === "regular" && styles.activeTabButton]}
              onPress={() => handleTabChange("regular")}
            >
              <Text style={[styles.tabText, activeTab === "regular" && styles.activeTabText]}>
                Regular Hours {regularHasChanges && <Text style={styles.changesIndicator}>*</Text>}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === "exceptions" && styles.activeTabButton]}
              onPress={() => handleTabChange("exceptions")}
            >
              <Text style={[styles.tabText, activeTab === "exceptions" && styles.activeTabText]}>
                Special Dates {exceptionsHasChanges && <Text style={styles.changesIndicator}>*</Text>}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.contentContainer}>
            {/* Always render both components but hide inactive one */}
            <View style={{ display: activeTab === "regular" ? "flex" : "none", flex: 1 }}>
              <RegularHoursTab
                ref={regularHoursRef}
                barId={barId}
                onHasChangesChange={handleRegularHasChanges}
                onRequestTimePicker={requestTimePicker}
              />
            </View>
            <View style={{ display: activeTab === "exceptions" ? "flex" : "none", flex: 1 }}>
              <ExceptionsTab
                ref={exceptionsRef}
                barId={barId}
                onHasChangesChange={handleExceptionsHasChanges}
                onRequestTimePicker={requestTimePicker}
                onRequestDatePicker={requestDatePicker}
              />
            </View>
          </View>

          {activeTabHasChanges && (
            <View style={styles.actionBar}>
              <TouchableOpacity
                style={[styles.revertButton, isSaving && styles.disabledButton]}
                onPress={handleRevertChanges}
                disabled={isSaving}
              >
                <RotateCcw size={18} color="#9ca3af" />
                <Text style={styles.revertButtonText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, isSaving && styles.savingButton]}
                onPress={handleSaveChanges}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#ffffff" style={styles.saveButtonIcon} />
                ) : (
                  <Save size={18} color="#ffffff" style={styles.saveButtonIcon} />
                )}
                <Text style={styles.saveButtonText}>{isSaving ? "Saving..." : "Save Changes"}</Text>
              </TouchableOpacity>
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
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
    borderRadius: 16,
    backgroundColor: "#1f1f27",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIcon: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 2,
  },
  expandedContent: {
    borderTopWidth: 1,
    borderTopColor: "#2a2a35",
  },
  tabsContainer: {
    flexGrow: 0,
    paddingVertical: 12,
  },
  tabsContentContainer: {
    paddingHorizontal: 16,
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 100,
    marginRight: 8,
    backgroundColor: "#2a2a35",
  },
  activeTabButton: {
    backgroundColor: "#ff4d6d",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#9ca3af",
  },
  activeTabText: {
    color: "#ffffff",
  },
  changesIndicator: {
    color: "#ffffff",
  },
  contentContainer: {
    padding: 16,
    paddingTop: 8,
  },
  actionBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#2a2a35",
  },
  revertButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 12,
  },
  revertButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "500",
    color: "#9ca3af",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#ff4d6d",
    borderRadius: 8,
  },
  savingButton: {
    backgroundColor: "#ff4d6d",
    opacity: 0.7,
  },
  saveButtonIcon: {
    marginRight: 8,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  disabledButton: {
    opacity: 0.5,
  },
})

export default BarOperatingHours
