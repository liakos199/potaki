import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { View, Text, TouchableOpacity, Switch, ActivityIndicator } from "react-native";
import { Calendar, Plus, X, Clock, AlertCircle, Sun } from "lucide-react-native";
import { format, parseISO, isValid, startOfDay } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/src/lib/supabase";
import { useToast } from "@/src/components/general/Toast";
import type { Database } from "@/src/lib/database.types";

const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "17:00";
const ALL_DAY_OPEN = "00:00";
const ALL_DAY_CLOSE = "23:59";

type ExceptionRow = Database["public"]["Tables"]["bar_exceptions"]["Row"];
type TimeType = "open" | "close";

type LocalException = Omit<ExceptionRow, 'open_time' | 'close_time'> & {
  open_time: string;
  close_time: string;
  isAllDay: boolean;
  isModified: boolean;
  isNew?: boolean;
};

type ExceptionsTabProps = {
  barId: string;
  onHasChangesChange: (hasChanges: boolean) => void;
  onRequestTimePicker: (currentValue: Date, onConfirm: (newTime: string) => void) => void;
  onRequestDatePicker: (onConfirm: (newDate: Date) => void) => void;
};

export type ExceptionsTabRef = {
  getChanges: () => {
    inserts: Omit<ExceptionRow, "id" | "created_at" | "updated_at">[];
    updates: (Partial<ExceptionRow> & { id: string })[];
    deletes: string[];
  };
  revertChanges: () => void;
  saveChanges: () => void;
};

const formatDisplayDate = (dateString: string): string => {
  try {
    const date = parseISO(dateString);
    return isValid(date) ? format(date, "EEE, MMM d, yyyy") : dateString;
  } catch (e) {
    console.error("Error parsing date:", e);
    return dateString;
  }
};

const timeStringToDate = (timeStr: string | null | undefined, defaultTime: string = DEFAULT_OPEN): Date => {
  const timeToParse = timeStr || defaultTime;
  const [hours, minutes] = timeToParse.split(":").map(Number);
  const date = startOfDay(new Date());
  date.setHours(hours || 0);
  date.setMinutes(minutes || 0);
  return date;
};

// Format time to display only hours and minutes (HH:MM)
const formatTimeDisplay = (timeString: string): string => {
  // If the time already has the correct format (HH:MM), return it
  if (/^\d{2}:\d{2}$/.test(timeString)) {
    return timeString;
  }
  
  try {
    // Parse the time string to a Date object
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours || 0);
    date.setMinutes(minutes || 0);
    
    // Format to HH:MM
    return format(date, 'HH:mm');
  } catch (error) {
    // If parsing fails, return the original string
    return timeString;
  }
};

const ExceptionsTab = forwardRef<ExceptionsTabRef, ExceptionsTabProps>(
  ({ barId, onHasChangesChange, onRequestTimePicker, onRequestDatePicker }, ref) => {
    const toast = useToast();
    const queryClient = useQueryClient();
    const [localExceptions, setLocalExceptions] = useState<LocalException[]>([]);
    const [originalExceptionsData, setOriginalExceptionsData] = useState<ExceptionRow[] | null>(null);
    const [toDeleteIds, setToDeleteIds] = useState<string[]>([]);
    const [internalHasChanges, setInternalHasChanges] = useState(false);

    const { data: exceptionsData, isPending: isExceptionsPending, error: exceptionsError, refetch: refetchExceptions } = useQuery<ExceptionRow[]>({
      queryKey: ["bar_exceptions", barId],
      queryFn: async () => {
        const { data, error } = await supabase.from("bar_exceptions").select("*").eq("bar_id", barId).order("exception_date", { ascending: true });
        if (error) throw error;
        return (data ?? []) as ExceptionRow[];
      },
      enabled: !!barId,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    });

    const saveMutation = useMutation({
      mutationFn: async () => {
        const changes = getChanges();
        
        // Execute deletes first to avoid unique constraint violations
        if (changes.deletes.length > 0) {
          const deleteResult = await supabase.from("bar_exceptions").delete().in("id", changes.deletes);
          if (deleteResult.error) {
            throw new Error(`Failed to delete exceptions: ${deleteResult.error.message}`);
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
              closes_next_day: update.closes_next_day 
            })
            .eq("id", update.id);
            
          if (updateResult.error) {
            throw new Error(`Failed to update exception: ${updateResult.error.message}`);
          }
        }

        // Finally handle inserts
        if (changes.inserts.length > 0) {
          const insertResult = await supabase.from("bar_exceptions").insert(changes.inserts);
          if (insertResult.error) {
            throw new Error(`Failed to insert exceptions: ${insertResult.error.message}`);
          }
        }
        
        // Mark all exceptions as not modified and not new after successful save
        setLocalExceptions(prev => prev.map(ex => ({
          ...ex,
          isModified: false,
          isNew: false
        })));
        setToDeleteIds([]);
      },
      onSuccess: () => {
        toast.show({ type: "success", text1: "Exceptions saved!" });
        queryClient.invalidateQueries({ queryKey: ["bar_exceptions", barId] });
        setInternalHasChanges(false);
      },
      onError: (error: Error) => {
        toast.show({ type: "error", text1: "Save Failed", text2: error.message });
      },
    });

    useEffect(() => {
      if (exceptionsData) {
        setOriginalExceptionsData(exceptionsData);
        const initialLocalExceptions: LocalException[] = exceptionsData.map((ex) => {
          return {
            ...ex,
            open_time: ex.open_time ?? DEFAULT_OPEN,
            close_time: ex.close_time ?? DEFAULT_CLOSE,
            isModified: false,
            isNew: false,
            isAllDay: false,
          };
        });
        setLocalExceptions(initialLocalExceptions);
        setToDeleteIds([]);
        setInternalHasChanges(false);
      }
    }, [exceptionsData]);

    useEffect(() => {
      const hasNew = localExceptions.some(ex => ex.isNew);
      const hasDeleted = toDeleteIds.length > 0;
      const hasModifiedExisting = localExceptions.some(ex => !ex.isNew && ex.isModified);
      const currentlyHasChanges = hasNew || hasDeleted || hasModifiedExisting;
      setInternalHasChanges(currentlyHasChanges);
      onHasChangesChange(currentlyHasChanges);
    }, [localExceptions, toDeleteIds, onHasChangesChange]);

    const updateException = useCallback((index: number, updates: Partial<LocalException>) => {
      setLocalExceptions(prev => {
        const updatedList = [...prev];
        if (!updatedList[index]) return prev;
        const currentItem = updatedList[index];
        let updatedItem = { ...currentItem, ...updates };
        let modified = currentItem.isNew || currentItem.isModified;
        if (!currentItem.isNew && Object.keys(updates).length > 0) {
          modified = true;
        }
        updatedList[index] = { ...updatedItem, isModified: modified };
        return updatedList.sort((a, b) => a.exception_date.localeCompare(b.exception_date));
      });
    }, []);

    const handleToggleExceptionStatus = useCallback((index: number) => {
      const currentIsClosed = localExceptions[index]?.is_closed ?? false;
      updateException(index, {
        is_closed: !currentIsClosed,
        isAllDay: !currentIsClosed ? false : localExceptions[index]?.isAllDay ?? false,
      });
    }, [localExceptions, updateException]);

    const handleToggleAllDay = useCallback((index: number) => {
      const exception = localExceptions[index];
      if (!exception) return;
      
      const newIsAllDay = !exception.isAllDay;
      
      updateException(index, {
        isAllDay: newIsAllDay,
        is_closed: false, // Can't be closed and all day
        open_time: newIsAllDay ? ALL_DAY_OPEN : DEFAULT_OPEN,
        close_time: newIsAllDay ? ALL_DAY_CLOSE : DEFAULT_CLOSE,
      });
    }, [localExceptions, updateException]);

    const handleUpdateExceptionTime = useCallback((index: number, timeType: TimeType, newTime: string) => {
      updateException(index, {
        [timeType === "open" ? "open_time" : "close_time"]: newTime,
        isAllDay: false, // If time is manually set, it's not all day
        is_closed: false,
      });
    }, [updateException]);

    const handleAddException = useCallback((date: Date) => {
      const formattedDate = format(date, "yyyy-MM-dd");
      if (localExceptions.some((e) => e.exception_date === formattedDate)) {
        toast.show({ type: "error", text1: "Date already has an exception" });
        return;
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
      };
      setLocalExceptions((prev) => [...prev, newException].sort((a, b) => a.exception_date.localeCompare(b.exception_date)));
    }, [barId, localExceptions, toast]);

    const handleRemoveException = useCallback((index: number) => {
      const exceptionToRemove = localExceptions[index];
      if (!exceptionToRemove) return;
      if (!exceptionToRemove.isNew && exceptionToRemove.id && !exceptionToRemove.id.startsWith('new-')) {
        setToDeleteIds((prev) => [...new Set([...prev, exceptionToRemove.id!])]);
      }
      setLocalExceptions((prev) => prev.filter((_, i) => i !== index));
    }, [localExceptions]);

    const showTimePicker = useCallback((index: number, timeType: TimeType) => {
      const exception = localExceptions[index];
      if (!exception) return;
      const currentTime = timeType === 'open' ? exception.open_time : exception.close_time;
      onRequestTimePicker(timeStringToDate(currentTime), (newTime: string) => {
        handleUpdateExceptionTime(index, timeType, newTime);
      });
    }, [localExceptions, onRequestTimePicker, handleUpdateExceptionTime]);

    const showDatePicker = useCallback(() => {
      onRequestDatePicker((newDate: Date) => handleAddException(newDate));
    }, [onRequestDatePicker, handleAddException]);

    const getChanges = () => {
      const inserts: Omit<ExceptionRow, "id" | "created_at" | "updated_at">[] = [];
      const updates: (Partial<ExceptionRow> & { id: string })[] = [];
      const deletes = [...toDeleteIds];

      localExceptions.forEach((ex) => {
        const getPayload = (item: LocalException): Omit<ExceptionRow, 'id' | 'bar_id' | 'exception_date' | 'created_at' | 'updated_at'> => ({
          is_closed: item.is_closed,
          open_time: item.is_closed ? null : (item.isAllDay ? ALL_DAY_OPEN : item.open_time),
          close_time: item.is_closed ? null : (item.isAllDay ? ALL_DAY_CLOSE : item.close_time),
          closes_next_day: item.is_closed || item.isAllDay ? false : (item.closes_next_day ?? false),
        });

        if (ex.isNew) {
          inserts.push({ bar_id: barId, exception_date: ex.exception_date, ...getPayload(ex) });
        } else if (ex.isModified && ex.id && !ex.id.startsWith('new-') && !deletes.includes(ex.id)) {
          updates.push({ id: ex.id, ...getPayload(ex) });
        }
      });

      return { inserts, updates, deletes };
    };

    useImperativeHandle(ref, () => ({
      getChanges,
      revertChanges: () => {
        if (!Array.isArray(originalExceptionsData)) {
          toast.show({ type: 'warning', text1: 'Cannot revert', text2: 'Original data unavailable.' });
          return;
        }
        const revertedLocalExceptions: LocalException[] = originalExceptionsData.map((ex) => {
          return {
            ...ex,
            open_time: ex.open_time ?? DEFAULT_OPEN,
            close_time: ex.close_time ?? DEFAULT_CLOSE,
            isModified: false,
            isNew: false,
            isAllDay: false,
          };
        });
        setLocalExceptions(revertedLocalExceptions);
        setToDeleteIds([]);
        setInternalHasChanges(false);
        toast.show({ type: "info", text1: "Exception changes reverted" });
      },
      saveChanges: () => saveMutation.mutateAsync(),
    }), [localExceptions, originalExceptionsData, barId, toDeleteIds, internalHasChanges, toast, saveMutation]);
    
    if (isExceptionsPending) {
      return (
        <View className="items-center p-5 min-h-[200px]">
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text className="mt-3 text-gray-600">Loading exceptions...</Text>
        </View>
      );
    }

    if (exceptionsError) {
      return (
        <View className="p-5 bg-red-50 border border-red-200 rounded-lg items-center">
          <AlertCircle size={24} color="#dc2626" />
          <Text className="mt-2 font-semibold text-red-700 text-center">Load Error</Text>
          <Text className="mt-1 text-sm text-red-600 text-center">{exceptionsError.message}</Text>
          <TouchableOpacity onPress={() => refetchExceptions()} className="mt-3 bg-red-100 px-4 py-1.5 rounded-md border border-red-200">
            <Text className="text-red-700 text-sm font-medium">Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View className="py-2">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-base font-semibold text-gray-700">Special Dates & Closures</Text>
          <TouchableOpacity className="flex-row items-center bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 active:bg-green-100" onPress={showDatePicker}>
            <Plus size={16} color="#16a34a" />
            <Text className="text-green-700 font-medium text-sm ml-1">Add Date</Text>
          </TouchableOpacity>
        </View>

        {localExceptions.length === 0 ? (
          <View className="items-center py-10 opacity-70">
            <Calendar size={40} color="#9ca3af" />
            <Text className="mt-3 text-gray-500">No exceptions added yet.</Text>
            <Text className="mt-1 text-gray-400 text-sm text-center">Add dates for holidays or special hours.</Text>
          </View>
        ) : (
          <View>
            {localExceptions.map((exception, index) => (
              <View key={exception.id || `new-${index}`} className="bg-white rounded-lg border border-gray-200 p-4 mb-3 shadow-sm">
                <View className="flex-row justify-between items-center pb-3 mb-3 border-b border-gray-100">
                  <View className="flex-row items-center flex-1 mr-2" style={{ minWidth: 0 }}>
                    <Calendar size={16} color="#4b5563" className="flex-shrink-0" />
                    <Text className="font-semibold text-gray-800 ml-2 text-sm flex-shrink" numberOfLines={1} ellipsizeMode="tail">{formatDisplayDate(exception.exception_date)}</Text>
                    {exception.isModified && !exception.isNew && <View className="w-1.5 h-1.5 bg-blue-500 rounded-full ml-2 flex-shrink-0" />}
                    {exception.isNew && <View className="w-1.5 h-1.5 bg-green-500 rounded-full ml-1 flex-shrink-0" />}
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveException(index)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <X size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>

                <View className="flex-row justify-between mb-3">
                  <View className="flex-1 mr-2">
                    <Text className="text-xs text-gray-500 mb-1">Status</Text>
                    <View className="flex-row items-center">
                      <Switch value={!exception.is_closed} onValueChange={() => handleToggleExceptionStatus(index)} trackColor={{ false: "#fee2e2", true: "#dcfce7" }} thumbColor={!exception.is_closed ? "#22c55e" : "#ef4444"} ios_backgroundColor="#fee2e2" style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }} />
                      <Text className={`ml-1.5 text-sm font-medium ${exception.is_closed ? 'text-red-600' : 'text-green-600'}`}>{exception.is_closed ? "Closed" : "Open"}</Text>
                    </View>
                  </View>
                  
                  {!exception.is_closed && (
                    <View className="flex-1 ml-2">
                      <Text className="text-xs text-gray-500 mb-1">All Day</Text>
                      <View className="flex-row items-center">
                        <Switch 
                          value={exception.isAllDay} 
                          onValueChange={() => handleToggleAllDay(index)} 
                          trackColor={{ false: "#e5e7eb", true: "#dbeafe" }} 
                          thumbColor={exception.isAllDay ? "#3b82f6" : "#9ca3af"} 
                          ios_backgroundColor="#e5e7eb" 
                          style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }} 
                          disabled={exception.is_closed}
                        />
                        <Sun size={16} color={exception.isAllDay ? "#3b82f6" : "#9ca3af"} className="ml-1.5" />
                      </View>
                    </View>
                  )}
                </View>

                {!exception.is_closed && (
                  <>
                    {exception.isAllDay ? (
                      <View className="flex-row items-center bg-blue-50 p-2 rounded-md mt-1 border border-blue-100">
                        <Sun size={14} color="#2563eb" />
                        <Text className="text-blue-700 text-sm font-medium ml-2">Open All Day (00:00 - 23:59)</Text>
                      </View>
                    ) : (
                      <View className="flex-row mt-1">
                        <View className="flex-1 mr-2">
                          <Text className="text-xs text-gray-500 mb-1">Open Time</Text>
                          <TouchableOpacity className="flex-row items-center justify-center border border-gray-300 rounded-md px-2 py-1.5 bg-gray-50 active:bg-gray-100" onPress={() => showTimePicker(index, "open")}>
                            <Clock size={14} color="#4b5563" />
                            <Text className="ml-1.5 text-sm text-gray-800">{formatTimeDisplay(exception.open_time)}</Text>
                          </TouchableOpacity>
                        </View>
                        <View className="flex-1 ml-2">
                          <Text className="text-xs text-gray-500 mb-1">Close Time</Text>
                          <TouchableOpacity className="flex-row items-center justify-center border border-gray-300 rounded-md px-2 py-1.5 bg-gray-50 active:bg-gray-100" onPress={() => showTimePicker(index, "close")}>
                            <Clock size={14} color="#4b5563" />
                            <Text className="ml-1.5 text-sm text-gray-800">{formatTimeDisplay(exception.close_time)}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </>
                )}

                {(exception.isNew || (exception.isModified && !exception.isNew)) && (
                  <View className="flex-row items-center mt-3 pt-2 border-t border-gray-100">
                    <AlertCircle size={14} color={exception.isNew ? "#f59e0b" : "#3b82f6"} />
                    <Text className={`text-xs ml-1 italic ${exception.isNew ? "text-yellow-600" : "text-blue-600"}`}>{exception.isNew ? "New / Unsaved" : "Modified"}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }
);

export default ExceptionsTab;