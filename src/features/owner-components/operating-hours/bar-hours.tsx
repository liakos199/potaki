"use client"

import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react"
import { View, Text, TouchableOpacity, Switch, ActivityIndicator, StyleSheet } from "react-native"
import { Clock, AlertCircle } from "lucide-react-native"
import { format } from "date-fns"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/src/lib/supabase"
import { useToast } from "@/src/components/general/Toast"
import type { Database } from "@/src/lib/database.types"

const DaysOfWeek = [
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" },
  { label: "Sunday", value: "7" },
] as const

const DEFAULT_OPEN = "09:00"
const DEFAULT_CLOSE = "17:00"

type DayOfWeekValue = (typeof DaysOfWeek)[number]["value"]
type OperatingHourRow = Database["public"]["Tables"]["operating_hours"]["Row"]
type TimeType = "open" | "close"

type LocalOperatingHour = OperatingHourRow & {
  isOpen: boolean
  isModified: boolean
}

type RegularHoursTabProps = {
  barId: string
  onHasChangesChange: (hasChanges: boolean) => void
  onRequestTimePicker: (currentValue: Date, onConfirm: (newTime: string) => void) => void
}

export type RegularHoursTabRef = {
  getChanges: () => {
    inserts: Omit<OperatingHourRow, "id" | "created_at" | "updated_at">[]
    updates: Pick<OperatingHourRow, "id" | "open_time" | "close_time" | "closes_next_day">[]
    deletes: string[]
  }
  revertChanges: () => void
  saveChanges: () => void
}

// Helper function to convert time string to Date object
const timeStringToDate = (timeString: string): Date => {
  const [hours, minutes] = timeString.split(":").map(Number)
  const date = new Date()
  date.setHours(hours || 0, minutes || 0, 0, 0) // Set seconds and milliseconds to 0
  return date
}

// Format time to display only hours and minutes (HH:MM)
const formatTimeDisplay = (timeString: string): string => {
  // If the time already has the correct format (HH:MM), return it
  if (/^\d{2}:\d{2}$/.test(timeString)) {
    return timeString
  }

  try {
    // Parse the time string to a Date object
    const [hours, minutes] = timeString.split(":").map(Number)
    const date = new Date()
    date.setHours(hours || 0)
    date.setMinutes(minutes || 0)

    // Format to HH:MM
    return format(date, "HH:mm")
  } catch (error) {
    // If parsing fails, return the original string
    return timeString
  }
}

const RegularHoursTab = forwardRef<RegularHoursTabRef, RegularHoursTabProps>(
  ({ barId, onHasChangesChange, onRequestTimePicker }, ref) => {
    const toast = useToast()
    const queryClient = useQueryClient()
    const [localHours, setLocalHours] = useState<LocalOperatingHour[]>([])
    const [originalHoursData, setOriginalHoursData] = useState<OperatingHourRow[] | null>(null)
    const [internalHasChanges, setInternalHasChanges] = useState(false)

    const {
      data: hoursData,
      isPending: isHoursPending,
      error: hoursError,
      refetch: refetchHours,
    } = useQuery<OperatingHourRow[]>({
      queryKey: ["operating_hours", barId],
      queryFn: async () => {
        const { data, error } = await supabase.from("operating_hours").select("*").eq("bar_id", barId)
        if (error) throw error
        return (data ?? []) as OperatingHourRow[]
      },
      enabled: !!barId,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    })

    const saveMutation = useMutation({
      mutationFn: async () => {
        const changes = getChanges()

        // Execute deletes first to avoid unique constraint violations
        if (changes.deletes.length > 0) {
          const deleteResult = await supabase.from("operating_hours").delete().in("id", changes.deletes)
          if (deleteResult.error) {
            throw new Error(`Failed to delete hours: ${deleteResult.error.message}`)
          }
        }

        // Then handle updates
        for (const update of changes.updates) {
          const updateResult = await supabase
            .from("operating_hours")
            .update({
              open_time: update.open_time,
              close_time: update.close_time,
              closes_next_day: update.closes_next_day,
            })
            .eq("id", update.id)

          if (updateResult.error) {
            throw new Error(`Failed to update hours: ${updateResult.error.message}`)
          }
        }

        // Finally handle inserts
        if (changes.inserts.length > 0) {
          const insertResult = await supabase.from("operating_hours").insert(changes.inserts)
          if (insertResult.error) {
            throw new Error(`Failed to insert hours: ${insertResult.error.message}`)
          }
        }

        // Reset modification state after successful save
        setLocalHours((prev) =>
          prev.map((hour) => ({
            ...hour,
            isModified: false,
          })),
        )
      },
      onSuccess: () => {
        toast.show({ type: "success", text1: "Regular hours saved!" })
        queryClient.invalidateQueries({ queryKey: ["operating_hours", barId] })
        setInternalHasChanges(false)
      },
      onError: (error: Error) => {
        toast.show({ type: "error", text1: "Save Failed", text2: error.message })
      },
    })

    useEffect(() => {
      if (hoursData) {
        setOriginalHoursData(hoursData)
        const initialHoursMap = new Map(hoursData.map((h) => [h.day_of_week, h]))
        const initialLocalHours: LocalOperatingHour[] = DaysOfWeek.map(({ value }) => {
          const existingRow = initialHoursMap.get(value)
          return {
            id: existingRow?.id ?? "",
            bar_id: barId,
            day_of_week: value,
            open_time: existingRow?.open_time ?? DEFAULT_OPEN,
            close_time: existingRow?.close_time ?? DEFAULT_CLOSE,
            closes_next_day: existingRow?.closes_next_day ?? false,
            isOpen: !!existingRow,
            isModified: false,
          }
        })
        setLocalHours(initialLocalHours)
        setInternalHasChanges(false)
      }
    }, [hoursData, barId])

    useEffect(() => {
      onHasChangesChange(internalHasChanges)
    }, [internalHasChanges, onHasChangesChange])

    const handleToggleDayStatus = useCallback((dayOfWeek: DayOfWeekValue) => {
      setLocalHours((prev) =>
        prev.map((hour) => {
          if (hour.day_of_week === dayOfWeek) {
            const isNowOpen = !hour.isOpen
            return { ...hour, isOpen: isNowOpen, isModified: true }
          }
          return hour
        }),
      )
      setInternalHasChanges(true)
    }, [])

    const handleUpdateTime = useCallback((dayOfWeek: DayOfWeekValue, timeType: TimeType, newTime: string) => {
      setLocalHours((prev) =>
        prev.map((hour) => {
          if (hour.day_of_week === dayOfWeek) {
            return { ...hour, [timeType === "open" ? "open_time" : "close_time"]: newTime, isModified: true }
          }
          return hour
        }),
      )
      setInternalHasChanges(true)
    }, [])

    const showTimePicker = (dayOfWeek: DayOfWeekValue, timeType: TimeType) => {
      const hour = localHours.find((h) => h.day_of_week === dayOfWeek)
      if (!hour) return
      const currentTime = timeType === "open" ? hour.open_time : hour.close_time
      onRequestTimePicker(timeStringToDate(currentTime), (newTime: string) => {
        handleUpdateTime(dayOfWeek, timeType, newTime)
      })
    }

    const getChanges = () => {
      if (!Array.isArray(originalHoursData)) return { inserts: [], updates: [], deletes: [] }
      const inserts: Omit<OperatingHourRow, "id" | "created_at" | "updated_at">[] = []
      const updates: Pick<OperatingHourRow, "id" | "open_time" | "close_time" | "closes_next_day">[] = []
      const deletes: string[] = []
      const originalHoursMap = new Map(originalHoursData.map((h) => [h.day_of_week, h]))

      localHours.forEach((current) => {
        const original = originalHoursMap.get(current.day_of_week)
        const originallyExisted = !!original
        const currentlyExists = current.isOpen

        if (originallyExisted && !currentlyExists && original.id) {
          deletes.push(original.id)
        } else if (!originallyExisted && currentlyExists) {
          inserts.push({
            bar_id: barId,
            day_of_week: current.day_of_week,
            open_time: current.open_time,
            close_time: current.close_time,
            closes_next_day: current.closes_next_day ?? false,
          })
        } else if (originallyExisted && currentlyExists && original.id) {
          const modified =
            current.open_time !== original.open_time ||
            current.close_time !== original.close_time ||
            (current.closes_next_day ?? false) !== (original.closes_next_day ?? false)
          if (modified) {
            updates.push({
              id: original.id,
              open_time: current.open_time,
              close_time: current.close_time,
              closes_next_day: current.closes_next_day ?? false,
            })
          }
        }
      })

      return { inserts, updates, deletes }
    }

    useImperativeHandle(
      ref,
      () => ({
        getChanges,
        revertChanges: () => {
          if (!Array.isArray(originalHoursData)) {
            toast.show({ type: "warning", text1: "Cannot revert yet", text2: "Original data not available." })
            return
          }
          const originalHoursMap = new Map(originalHoursData.map((h) => [h.day_of_week, h]))
          const revertedLocalHours: LocalOperatingHour[] = DaysOfWeek.map(({ value }) => {
            const existingRow = originalHoursMap.get(value)
            return {
              id: existingRow?.id ?? "",
              bar_id: barId,
              day_of_week: value,
              open_time: existingRow?.open_time ?? DEFAULT_OPEN,
              close_time: existingRow?.close_time ?? DEFAULT_CLOSE,
              closes_next_day: existingRow?.closes_next_day ?? false,
              isOpen: !!existingRow,
              isModified: false,
            }
          })
          setLocalHours(revertedLocalHours)
          setInternalHasChanges(false)
          toast.show({ type: "info", text1: "Regular hours reverted" })
        },
        saveChanges: () => saveMutation.mutateAsync(),
      }),
      [localHours, originalHoursData, barId, internalHasChanges, toast, saveMutation],
    )

    if (isHoursPending) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff4d6d" />
          <Text style={styles.loadingText}>Loading regular hours...</Text>
        </View>
      )
    }

    if (hoursError) {
      return (
        <View style={styles.errorContainer}>
          <AlertCircle size={24} color="#ff4d6d" />
          <Text style={styles.errorTitle}>Failed to load regular hours</Text>
          <Text style={styles.errorMessage}>{hoursError.message}</Text>
          <TouchableOpacity onPress={() => refetchHours()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )
    }

    return (
      <View style={styles.container}>
        {localHours.map((hour) => (
          <View key={hour.day_of_week} style={styles.dayCard}>
            <View style={styles.dayHeader}>
              <View style={styles.dayNameContainer}>
                <View
                  style={[
                    styles.statusIndicator,
                    hour.isOpen ? styles.statusIndicatorActive : styles.statusIndicatorInactive,
                  ]}
                />
                <Text style={styles.dayName}>{DaysOfWeek.find((d) => d.value === hour.day_of_week)?.label}</Text>
                {hour.isModified && <View style={styles.modifiedIndicator} />}
              </View>
              <Switch
                value={hour.isOpen}
                onValueChange={() => handleToggleDayStatus(hour.day_of_week)}
                trackColor={{ false: "#2a2a35", true: "#ff4d6d40" }}
                thumbColor={hour.isOpen ? "#ff4d6d" : "#9ca3af"}
                ios_backgroundColor="#2a2a35"
              />
            </View>

            {hour.isOpen && (
              <View style={styles.timeControls}>
                <TouchableOpacity
                  style={styles.timeButton}
                  onPress={() => showTimePicker(hour.day_of_week, "open")}
                  disabled={!hour.isOpen}
                >
                  <Clock size={16} color="#9ca3af" style={styles.timeIcon} />
                  <Text style={styles.timeLabel}>Opens</Text>
                  <Text style={styles.timeValue}>{formatTimeDisplay(hour.open_time)}</Text>
                </TouchableOpacity>

                <View style={styles.timeSeparator} />

                <TouchableOpacity
                  style={styles.timeButton}
                  onPress={() => showTimePicker(hour.day_of_week, "close")}
                  disabled={!hour.isOpen}
                >
                  <Clock size={16} color="#9ca3af" style={styles.timeIcon} />
                  <Text style={styles.timeLabel}>Closes</Text>
                  <Text style={styles.timeValue}>{formatTimeDisplay(hour.close_time)}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </View>
    )
  },
)

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    minHeight: 200,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#9ca3af",
  },
  errorContainer: {
    padding: 20,
    backgroundColor: "#2a2a35",
    borderRadius: 12,
    alignItems: "center",
    marginVertical: 8,
  },
  errorTitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "600",
    color: "#ff4d6d",
    textAlign: "center",
  },
  errorMessage: {
    marginTop: 4,
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#ff4d6d",
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ffffff",
  },
  dayCard: {
    backgroundColor: "#2a2a35",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  dayNameContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  statusIndicatorActive: {
    backgroundColor: "#ff4d6d",
  },
  statusIndicatorInactive: {
    backgroundColor: "#9ca3af",
  },
  dayName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#ffffff",
  },
  modifiedIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ff4d6d",
    marginLeft: 8,
  },
  timeControls: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#1f1f27",
  },
  timeButton: {
    flex: 1,
    padding: 12,
    alignItems: "center",
  },
  timeIcon: {
    marginBottom: 4,
  },
  timeLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 16,
    fontWeight: "500",
    color: "#ffffff",
  },
  timeSeparator: {
    width: 1,
    backgroundColor: "#1f1f27",
  },
})

export default RegularHoursTab
