"use client"

import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react"
import { View, Text, TouchableOpacity, Switch, ActivityIndicator, StyleSheet } from "react-native"
import { Calendar, Plus, X, Clock, AlertCircle, Sun } from "lucide-react-native"
import { format, parseISO, isValid, startOfDay } from "date-fns"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/src/lib/supabase"
import { useToast } from "@/src/components/general/Toast"
import type { Database } from "@/src/lib/database.types"

const DEFAULT_OPEN = "09:00"
const DEFAULT_CLOSE = "17:00"
const ALL_DAY_OPEN = "00:00"
const ALL_DAY_CLOSE = "23:59"

type ExceptionRow = Database["public"]["Tables"]["bar_exceptions"]["Row"]
type TimeType = "open" | "close"

type LocalException = Omit<ExceptionRow, "open_time" | "close_time"> & {
  open_time: string
  close_time: string
  isAllDay: boolean
  isModified: boolean
  isNew?: boolean
}

type ExceptionsTabProps = {
  barId: string
  onHasChangesChange: (hasChanges: boolean) => void
  onRequestTimePicker: (currentValue: Date, onConfirm: (newTime: string) => void) => void
  onRequestDatePicker: (onConfirm: (newDate: Date) => void) => void
}

export type ExceptionsTabRef = {
  getChanges: () => {
    inserts: Omit<ExceptionRow, "id" | "created_at" | "updated_at">[]
    updates: (Partial<ExceptionRow> & { id: string })[]
    deletes: string[]
  }
  revertChanges: () => void
  saveChanges: () => void
}

const formatDisplayDate = (dateString: string): string => {
  try {
    const date = parseISO(dateString)
    return isValid(date) ? format(date, "EEE, MMM d, yyyy") : dateString
  } catch (e) {
    console.error("Error parsing date:", e)
    return dateString
  }
}

const timeStringToDate = (timeStr: string | null | undefined, defaultTime: string = DEFAULT_OPEN): Date => {
  const timeToParse = timeStr || defaultTime
  const [hours, minutes] = timeToParse.split(":").map(Number)
  const date = startOfDay(new Date())
  date.setHours(hours || 0)
  date.setMinutes(minutes || 0)
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

const ExceptionsTab = forwardRef<ExceptionsTabRef, ExceptionsTabProps>(
  ({ barId, onHasChangesChange, onRequestTimePicker, onRequestDatePicker }, ref) => {
    const toast = useToast()
    const queryClient = useQueryClient()
    const [localExceptions, setLocalExceptions] = useState<LocalException[]>([])
    const [originalExceptionsData, setOriginalExceptionsData] = useState<ExceptionRow[] | null>(null)
    const [toDeleteIds, setToDeleteIds] = useState<string[]>([])
    const [internalHasChanges, setInternalHasChanges] = useState(false)

    const {
      data: exceptionsData,
      isPending: isExceptionsPending,
      error: exceptionsError,
      refetch: refetchExceptions,
    } = useQuery<ExceptionRow[]>({
      queryKey: ["bar_exceptions", barId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("bar_exceptions")
          .select("*")
          .eq("bar_id", barId)
          .order("exception_date", { ascending: true })
        if (error) throw error
        return (data ?? []) as ExceptionRow[]
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
          const deleteResult = await supabase.from("bar_exceptions").delete().in("id", changes.deletes)
          if (deleteResult.error) {
            throw new Error(`Failed to delete exceptions: ${deleteResult.error.message}`)
          }
        }

        // Then handle updates
        for (const update of changes.updates) {
          const updateResult = await supabase
            .from("bar_exceptions")
            .update({
              is_closed: update.is_closed,
              open_time: update.open_time,
              close_time: update.close_time,
              closes_next_day: update.closes_next_day,
            })
            .eq("id", update.id)

          if (updateResult.error) {
            throw new Error(`Failed to update exception: ${updateResult.error.message}`)
          }
        }

        // Finally handle inserts
        if (changes.inserts.length > 0) {
          const insertResult = await supabase.from("bar_exceptions").insert(changes.inserts)
          if (insertResult.error) {
            throw new Error(`Failed to insert exceptions: ${insertResult.error.message}`)
          }
        }

        // Mark all exceptions as not modified and not new after successful save
        setLocalExceptions((prev) =>
          prev.map((ex) => ({
            ...ex,
            isModified: false,
            isNew: false,
          })),
        )
        setToDeleteIds([])
      },
      onSuccess: () => {
        toast.show({ type: "success", text1: "Exceptions saved!" })
        queryClient.invalidateQueries({ queryKey: ["bar_exceptions", barId] })
        setInternalHasChanges(false)
      },
      onError: (error: Error) => {
        toast.show({ type: "error", text1: "Save Failed", text2: error.message })
      },
    })

    useEffect(() => {
      if (exceptionsData) {
        setOriginalExceptionsData(exceptionsData)
        const initialLocalExceptions: LocalException[] = exceptionsData.map((ex) => {
          return {
            ...ex,
            open_time: ex.open_time ?? DEFAULT_OPEN,
            close_time: ex.close_time ?? DEFAULT_CLOSE,
            isModified: false,
            isNew: false,
            isAllDay: false,
          }
        })
        setLocalExceptions(initialLocalExceptions)
        setToDeleteIds([])
        setInternalHasChanges(false)
      }
    }, [exceptionsData])

    useEffect(() => {
      const hasNew = localExceptions.some((ex) => ex.isNew)
      const hasDeleted = toDeleteIds.length > 0
      const hasModifiedExisting = localExceptions.some((ex) => !ex.isNew && ex.isModified)
      const currentlyHasChanges = hasNew || hasDeleted || hasModifiedExisting
      setInternalHasChanges(currentlyHasChanges)
      onHasChangesChange(currentlyHasChanges)
    }, [localExceptions, toDeleteIds, onHasChangesChange])

    const updateException = useCallback((index: number, updates: Partial<LocalException>) => {
      setLocalExceptions((prev) => {
        const updatedList = [...prev]
        if (!updatedList[index]) return prev
        const currentItem = updatedList[index]
        const updatedItem = { ...currentItem, ...updates }
        let modified = currentItem.isNew || currentItem.isModified
        if (!currentItem.isNew && Object.keys(updates).length > 0) {
          modified = true
        }
        updatedList[index] = { ...updatedItem, isModified: modified }
        return updatedList.sort((a, b) => a.exception_date.localeCompare(b.exception_date))
      })
    }, [])

    const handleToggleExceptionStatus = useCallback(
      (index: number) => {
        const currentIsClosed = localExceptions[index]?.is_closed ?? false
        updateException(index, {
          is_closed: !currentIsClosed,
          isAllDay: !currentIsClosed ? false : (localExceptions[index]?.isAllDay ?? false),
        })
      },
      [localExceptions, updateException],
    )

    const handleToggleAllDay = useCallback(
      (index: number) => {
        const exception = localExceptions[index]
        if (!exception) return

        const newIsAllDay = !exception.isAllDay

        updateException(index, {
          isAllDay: newIsAllDay,
          is_closed: false, // Can't be closed and all day
          open_time: newIsAllDay ? ALL_DAY_OPEN : DEFAULT_OPEN,
          close_time: newIsAllDay ? ALL_DAY_CLOSE : DEFAULT_CLOSE,
        })
      },
      [localExceptions, updateException],
    )

    const handleUpdateExceptionTime = useCallback(
      (index: number, timeType: TimeType, newTime: string) => {
        updateException(index, {
          [timeType === "open" ? "open_time" : "close_time"]: newTime,
          isAllDay: false, // If time is manually set, it's not all day
          is_closed: false,
        })
      },
      [updateException],
    )

    const handleAddException = useCallback(
      (date: Date) => {
        const formattedDate = format(date, "yyyy-MM-dd")
        if (localExceptions.some((e) => e.exception_date === formattedDate)) {
          toast.show({ type: "error", text1: "Date already has an exception" })
          return
        }
        const newException: LocalException = {
          id: `new-${Date.now()}`,
          bar_id: barId,
          exception_date: formattedDate,
          is_closed: false,
          open_time: DEFAULT_OPEN,
          close_time: DEFAULT_CLOSE,
          closes_next_day: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          isModified: true,
          isNew: true,
          isAllDay: false,
        }
        setLocalExceptions((prev) =>
          [...prev, newException].sort((a, b) => a.exception_date.localeCompare(b.exception_date)),
        )
      },
      [barId, localExceptions, toast],
    )

    const handleRemoveException = useCallback(
      (index: number) => {
        const exceptionToRemove = localExceptions[index]
        if (!exceptionToRemove) return
        if (!exceptionToRemove.isNew && exceptionToRemove.id && !exceptionToRemove.id.startsWith("new-")) {
          setToDeleteIds((prev) => [...new Set([...prev, exceptionToRemove.id!])])
        }
        setLocalExceptions((prev) => prev.filter((_, i) => i !== index))
      },
      [localExceptions],
    )

    const showTimePicker = useCallback(
      (index: number, timeType: TimeType) => {
        const exception = localExceptions[index]
        if (!exception) return
        const currentTime = timeType === "open" ? exception.open_time : exception.close_time
        onRequestTimePicker(timeStringToDate(currentTime), (newTime: string) => {
          handleUpdateExceptionTime(index, timeType, newTime)
        })
      },
      [localExceptions, onRequestTimePicker, handleUpdateExceptionTime],
    )

    const showDatePicker = useCallback(() => {
      onRequestDatePicker((newDate: Date) => handleAddException(newDate))
    }, [onRequestDatePicker, handleAddException])

    const getChanges = () => {
      const inserts: Omit<ExceptionRow, "id" | "created_at" | "updated_at">[] = []
      const updates: (Partial<ExceptionRow> & { id: string })[] = []
      const deletes = [...toDeleteIds]

      localExceptions.forEach((ex) => {
        const getPayload = (
          item: LocalException,
        ): Omit<ExceptionRow, "id" | "bar_id" | "exception_date" | "created_at" | "updated_at"> => ({
          is_closed: item.is_closed,
          open_time: item.is_closed ? null : item.isAllDay ? ALL_DAY_OPEN : item.open_time,
          close_time: item.is_closed ? null : item.isAllDay ? ALL_DAY_CLOSE : item.close_time,
          closes_next_day: item.is_closed || item.isAllDay ? false : (item.closes_next_day ?? false),
        })

        if (ex.isNew) {
          inserts.push({ bar_id: barId, exception_date: ex.exception_date, ...getPayload(ex) })
        } else if (ex.isModified && ex.id && !ex.id.startsWith("new-") && !deletes.includes(ex.id)) {
          updates.push({ id: ex.id, ...getPayload(ex) })
        }
      })

      return { inserts, updates, deletes }
    }

    useImperativeHandle(
      ref,
      () => ({
        getChanges,
        revertChanges: () => {
          if (!Array.isArray(originalExceptionsData)) {
            toast.show({ type: "warning", text1: "Cannot revert", text2: "Original data unavailable." })
            return
          }
          const revertedLocalExceptions: LocalException[] = originalExceptionsData.map((ex) => {
            return {
              ...ex,
              open_time: ex.open_time ?? DEFAULT_OPEN,
              close_time: ex.close_time ?? DEFAULT_CLOSE,
              isModified: false,
              isNew: false,
              isAllDay: false,
            }
          })
          setLocalExceptions(revertedLocalExceptions)
          setToDeleteIds([])
          setInternalHasChanges(false)
          toast.show({ type: "info", text1: "Exception changes reverted" })
        },
        saveChanges: () => saveMutation.mutateAsync(),
      }),
      [localExceptions, originalExceptionsData, barId, toDeleteIds, internalHasChanges, toast, saveMutation],
    )

    if (isExceptionsPending) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff4d6d" />
          <Text style={styles.loadingText}>Loading exceptions...</Text>
        </View>
      )
    }

    if (exceptionsError) {
      return (
        <View style={styles.errorContainer}>
          <AlertCircle size={24} color="#ff4d6d" />
          <Text style={styles.errorTitle}>Failed to load exceptions</Text>
          <Text style={styles.errorMessage}>{exceptionsError.message}</Text>
          <TouchableOpacity onPress={() => refetchExceptions()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )
    }

    return (
      <View style={styles.container}>
        <View style={styles.headerContainer}>
          <Text style={styles.headerText}>Add special dates like holidays or events</Text>
          <TouchableOpacity style={styles.addButton} onPress={showDatePicker}>
            <Plus size={16} color="#ffffff" />
            <Text style={styles.addButtonText}>Add Date</Text>
          </TouchableOpacity>
        </View>

        {localExceptions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Calendar size={40} color="#9ca3af" />
            <Text style={styles.emptyTitle}>No exceptions added yet</Text>
            <Text style={styles.emptySubtitle}>Add dates for holidays or special hours</Text>
          </View>
        ) : (
          <View>
            {localExceptions.map((exception, index) => (
              <View key={exception.id || `new-${index}`} style={styles.exceptionCard}>
                <View style={styles.exceptionHeader}>
                  <View style={styles.exceptionTitleContainer}>
                    <Calendar size={18} color="#ff4d6d" style={styles.exceptionIcon} />
                    <Text style={styles.exceptionTitle}>{formatDisplayDate(exception.exception_date)}</Text>
                    {exception.isNew && <View style={styles.newIndicator} />}
                    {exception.isModified && !exception.isNew && <View style={styles.modifiedIndicator} />}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRemoveException(index)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.removeButton}
                  >
                    <X size={18} color="#9ca3af" />
                  </TouchableOpacity>
                </View>

                <View style={styles.exceptionControls}>
                  <View style={styles.controlGroup}>
                    <Text style={styles.controlLabel}>Status</Text>
                    <View style={styles.switchContainer}>
                      <Switch
                        value={!exception.is_closed}
                        onValueChange={() => handleToggleExceptionStatus(index)}
                        trackColor={{ false: "#2a2a35", true: "#ff4d6d40" }}
                        thumbColor={!exception.is_closed ? "#ff4d6d" : "#9ca3af"}
                        ios_backgroundColor="#2a2a35"
                      />
                      <Text
                        style={[
                          styles.statusText,
                          exception.is_closed ? styles.statusTextClosed : styles.statusTextOpen,
                        ]}
                      >
                        {exception.is_closed ? "Closed" : "Open"}
                      </Text>
                    </View>
                  </View>

                  {!exception.is_closed && (
                    <View style={styles.controlGroup}>
                      <Text style={styles.controlLabel}>All Day</Text>
                      <View style={styles.switchContainer}>
                        <Switch
                          value={exception.isAllDay}
                          onValueChange={() => handleToggleAllDay(index)}
                          trackColor={{ false: "#2a2a35", true: "#ff4d6d40" }}
                          thumbColor={exception.isAllDay ? "#ff4d6d" : "#9ca3af"}
                          ios_backgroundColor="#2a2a35"
                          disabled={exception.is_closed}
                        />
                        <Sun size={16} color={exception.isAllDay ? "#ff4d6d" : "#9ca3af"} style={styles.statusIcon} />
                      </View>
                    </View>
                  )}
                </View>

                {!exception.is_closed && (
                  <>
                    {exception.isAllDay ? (
                      <View style={styles.allDayBanner}>
                        <Sun size={16} color="#ff4d6d" />
                        <Text style={styles.allDayText}>Open All Day (00:00 - 23:59)</Text>
                      </View>
                    ) : (
                      <View style={styles.timeControls}>
                        <TouchableOpacity
                          style={styles.timeButton}
                          onPress={() => showTimePicker(index, "open")}
                          disabled={exception.is_closed}
                        >
                          <Clock size={16} color="#9ca3af" style={styles.timeIcon} />
                          <Text style={styles.timeLabel}>Opens</Text>
                          <Text style={styles.timeValue}>{formatTimeDisplay(exception.open_time)}</Text>
                        </TouchableOpacity>

                        <View style={styles.timeSeparator} />

                        <TouchableOpacity
                          style={styles.timeButton}
                          onPress={() => showTimePicker(index, "close")}
                          disabled={exception.is_closed}
                        >
                          <Clock size={16} color="#9ca3af" style={styles.timeIcon} />
                          <Text style={styles.timeLabel}>Closes</Text>
                          <Text style={styles.timeValue}>{formatTimeDisplay(exception.close_time)}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}

                {(exception.isNew || (exception.isModified && !exception.isNew)) && (
                  <View style={styles.statusFooter}>
                    <AlertCircle size={14} color={exception.isNew ? "#ff4d6d" : "#9ca3af"} />
                    <Text style={styles.statusFooterText}>{exception.isNew ? "New / Unsaved" : "Modified"}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    )
  },
)

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerText: {
    fontSize: 14,
    color: "#9ca3af",
    flex: 1,
    marginRight: 16,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ff4d6d",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
    marginLeft: 6,
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
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2a2a35",
    borderRadius: 12,
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: "500",
    color: "#ffffff",
  },
  emptySubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
  },
  exceptionCard: {
    backgroundColor: "#2a2a35",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
  },
  exceptionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f27",
  },
  exceptionTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  exceptionIcon: {
    marginRight: 10,
  },
  exceptionTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#ffffff",
  },
  newIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ff4d6d",
    marginLeft: 8,
  },
  modifiedIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#9ca3af",
    marginLeft: 8,
  },
  removeButton: {
    padding: 4,
  },
  exceptionControls: {
    flexDirection: "row",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f27",
  },
  controlGroup: {
    flex: 1,
  },
  controlLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 8,
  },
  switchContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "500",
  },
  statusTextOpen: {
    color: "#ff4d6d",
  },
  statusTextClosed: {
    color: "#9ca3af",
  },
  statusIcon: {
    marginLeft: 8,
  },
  allDayBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: "#1f1f27",
  },
  allDayText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "500",
    color: "#ff4d6d",
  },
  timeControls: {
    flexDirection: "row",
  },
  timeButton: {
    flex: 1,
    padding: 12,
    alignItems: "center",
    backgroundColor: "#1f1f27",
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
    backgroundColor: "#2a2a35",
  },
  statusFooter: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#1f1f27",
  },
  statusFooterText: {
    marginLeft: 6,
    fontSize: 12,
    color: "#9ca3af",
    fontStyle: "italic",
  },
})

export default ExceptionsTab
