import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Switch, // Use from react-native
  Platform,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/src/lib/supabase"; // Adjust path as needed
import { useToast } from "@/src/components/general/Toast"; // Adjust path as needed
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { format, parseISO, isValid, startOfDay } from "date-fns";
import {
  Clock,
  Save,
  RotateCcw,
  Calendar,
  Plus,
  X,
  AlertCircle,
  Sun,
  Info,
} from "lucide-react-native";

import type { Database } from "@/src/lib/database.types"; // Adjust path as needed

// --- Constants ---
const DaysOfWeek = [
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" },
  { label: "Sunday", value: "7" },
] as const;

const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "17:00";
const ALL_DAY_OPEN = "00:00";
const ALL_DAY_CLOSE = "23:59";

// --- Types ---
type DayOfWeekValue = typeof DaysOfWeek[number]["value"];
type OperatingHourRow = Database["public"]["Tables"]["operating_hours"]["Row"];
type ExceptionRow = Database["public"]["Tables"]["bar_exceptions"]["Row"];
type TimeType = "open" | "close";

type LocalOperatingHour = OperatingHourRow & {
  isOpen: boolean;
  isModified: boolean;
};

type LocalException = ExceptionRow & {
  isModified: boolean;
  isNew?: boolean;
  isAllDay: boolean;
};

type BarOperatingHoursProps = {
  barId: string;
};

// --- Helper Functions ---
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


// --- Main Component ---
const BarOperatingHours = ({ barId }: BarOperatingHoursProps): JSX.Element => {
  const toast = useToast();
  const queryClient = useQueryClient();

  // --- State ---
  const [localHours, setLocalHours] = useState<LocalOperatingHour[]>([]);
  const [localExceptions, setLocalExceptions] = useState<LocalException[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<"regular" | "exceptions">("regular");
  const [toDeleteExceptions, setToDeleteExceptions] = useState<string[]>([]);

  // Picker State
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [pickerContext, setPickerContext] = useState<{
    type: "regular" | "exception";
    dayOrIndex: DayOfWeekValue | number | null;
    timeType: TimeType;
  } | null>(null);

  // --- Data Fetching ---
  // Store original fetched data separately for revert functionality
  const [originalHoursData, setOriginalHoursData] = useState<OperatingHourRow[] | null>(null);
  const [originalExceptionsData, setOriginalExceptionsData] = useState<ExceptionRow[] | null>(null);

  const {
    data: hoursData,
    isPending: isHoursPending,
    error: hoursError,
    refetch: refetchHours,
  } = useQuery<OperatingHourRow[]>({
    queryKey: ["operating_hours", barId],
    queryFn: async () => {
      const { data, error } = await supabase.from("operating_hours").select("*").eq("bar_id", barId);
      if (error) throw error;
      const fetchedData = (data ?? []) as OperatingHourRow[];
      setOriginalHoursData(fetchedData); // Store original data
      return fetchedData;
    },
    enabled: !!barId,
  });

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
        .order("exception_date", { ascending: true });
      if (error) throw error;
      const fetchedData = (data ?? []) as ExceptionRow[];
      setOriginalExceptionsData(fetchedData); // Store original data
      return fetchedData;
    },
    enabled: !!barId,
  });

  // --- Effects ---
  // Initialize local state from fetched regular hours
  // This effect runs when hoursData changes (initial load or after save/refetch)
  useEffect(() => {
    const dataToProcess = hoursData ?? originalHoursData; // Use fetched or stored original
    if (dataToProcess) {
      const initialHoursMap = new Map(dataToProcess.map(h => [h.day_of_week, h]));
      const initialHours: LocalOperatingHour[] = DaysOfWeek.map(({ value }) => {
        const existingRow = initialHoursMap.get(value);
        return {
          id: existingRow?.id ?? '',
          bar_id: barId,
          day_of_week: value,
          open_time: existingRow?.open_time ?? DEFAULT_OPEN,
          close_time: existingRow?.close_time ?? DEFAULT_CLOSE,
          closes_next_day: existingRow?.closes_next_day ?? false,
          isOpen: !!existingRow,
          isModified: false, // Reset modified flag on data load/refresh
        };
      });
      setLocalHours(initialHours);
    } else {
       const defaultHours: LocalOperatingHour[] = DaysOfWeek.map(({ value }) => ({
          id: '', bar_id: barId, day_of_week: value, open_time: DEFAULT_OPEN,
          close_time: DEFAULT_CLOSE, closes_next_day: false, isOpen: false, isModified: false,
       }));
       setLocalHours(defaultHours);
    }
  }, [hoursData, originalHoursData, barId]); // Depend on fetched and stored original data

  // Initialize local state from fetched exceptions
  // This effect runs when exceptionsData changes
  useEffect(() => {
    const dataToProcess = exceptionsData ?? originalExceptionsData;
    if (dataToProcess) {
      const initialExceptions: LocalException[] = dataToProcess.map((exception) => {
        const isAllDay = !exception.is_closed && exception.open_time === ALL_DAY_OPEN && exception.close_time === ALL_DAY_CLOSE;
        return {
          ...exception,
          open_time: exception.open_time ?? DEFAULT_OPEN,
          close_time: exception.close_time ?? DEFAULT_CLOSE,
          isModified: false, // Reset modified flag
          isNew: false,     // Ensure isNew is false for existing data
          isAllDay: isAllDay,
        };
      });
      setLocalExceptions(initialExceptions);
    } else {
      setLocalExceptions([]);
    }
  }, [exceptionsData, originalExceptionsData]); // Depend on fetched and stored original data

// Remove: Do not reset hasChanges/toDeleteExceptions based on query data, only on mutation success


  // --- Mutations ---
  const saveMutation = useMutation({
    mutationFn: async () => {
      // (Mutation logic remains the same as the previous correct version)
      // ... (Prepare hoursToDelete, hoursToInsert, hoursToUpdate) ...
      // ... (Prepare exceptionsToInsert, exceptionsToUpdate using localExceptions) ...
      // *** IMPORTANT: Use the `toDeleteExceptions` state variable for exception deletions ***

       // 1. Prepare Regular Hours Changes
       const hoursToDelete: string[] = [];
       const hoursToInsert: Omit<OperatingHourRow, "id" | "created_at" | "updated_at">[] = [];
       const hoursToUpdate: Pick<OperatingHourRow, "id" | "open_time" | "close_time" | "closes_next_day">[] = [];

       localHours.forEach((hour) => {
         if (!hour.isModified) return;
         if (hour.id && !hour.isOpen) hoursToDelete.push(hour.id);
         else if (!hour.id && hour.isOpen) hoursToInsert.push({ bar_id: barId, day_of_week: hour.day_of_week, open_time: hour.open_time, close_time: hour.close_time, closes_next_day: hour.closes_next_day ?? false });
         else if (hour.id && hour.isOpen) hoursToUpdate.push({ id: hour.id, open_time: hour.open_time, close_time: hour.close_time, closes_next_day: hour.closes_next_day ?? false });
       });

       // 2. Prepare Exception Changes
       const exceptionsToInsert: Omit<ExceptionRow, "id" | "created_at" | "updated_at">[] = [];
       const exceptionsToUpdate: (Partial<ExceptionRow> & { id: string })[] = [];

       localExceptions.forEach((ex) => {
         const payloadBase = {
           is_closed: ex.is_closed,
           open_time: ex.is_closed ? null : (ex.isAllDay ? ALL_DAY_OPEN : ex.open_time),
           close_time: ex.is_closed ? null : (ex.isAllDay ? ALL_DAY_CLOSE : ex.close_time),
           closes_next_day: ex.is_closed || ex.isAllDay ? false : (ex.closes_next_day ?? false),
         };
         if (ex.isNew) {
           exceptionsToInsert.push({ bar_id: barId, exception_date: ex.exception_date, ...payloadBase });
         } else if (ex.isModified) {
           exceptionsToUpdate.push({ id: ex.id, ...payloadBase });
         }
       });

      // 3. Execute DB Operations
      const promises = [];
      // Regular Hours
      if (hoursToDelete.length > 0) promises.push(supabase.from("operating_hours").delete().in("id", hoursToDelete));
      if (hoursToInsert.length > 0) promises.push(supabase.from("operating_hours").insert(hoursToInsert));
      hoursToUpdate.forEach(u => promises.push(supabase.from("operating_hours").update({ open_time: u.open_time, close_time: u.close_time, closes_next_day: u.closes_next_day }).eq("id", u.id)));

      // Exceptions
      if (toDeleteExceptions.length > 0) promises.push(supabase.from("bar_exceptions").delete().in("id", toDeleteExceptions)); // Use state here
      if (exceptionsToInsert.length > 0) promises.push(supabase.from("bar_exceptions").insert(exceptionsToInsert));
      exceptionsToUpdate.forEach(u => promises.push(supabase.from("bar_exceptions").update({ is_closed: u.is_closed, open_time: u.open_time, close_time: u.close_time, closes_next_day: u.closes_next_day }).eq("id", u.id)));

      const results = await Promise.allSettled(promises);
      const errors = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error));
      if (errors.length > 0) {
         const firstError = errors[0];
         const errorMessage = firstError.status === 'rejected' ? firstError.reason?.message : firstError.value?.error?.message;
         throw new Error(`Failed to save some changes. Error: ${errorMessage ?? 'Unknown DB error'}`);
      }
    },
    onSuccess: () => {
      toast.show({ type: "success", text1: "Operating hours saved!" });
      queryClient.invalidateQueries({ queryKey: ["operating_hours", barId] });
      queryClient.invalidateQueries({ queryKey: ["bar_exceptions", barId] });
      setHasChanges(false); // Immediately hide Save/Revert buttons
      setToDeleteExceptions([]); // Clear deletions
    },
    onError: (error: Error) => {
      toast.show({ type: "error", text1: "Save Failed", text2: error.message });
      console.error("Save mutation error:", error);
    },
  });

  // --- State Handlers (using useCallback for optimization) ---
  const handleToggleDayStatus = useCallback((dayOfWeek: DayOfWeekValue) => {
    setLocalHours((prev) =>
      prev.map((hour) =>
        hour.day_of_week === dayOfWeek ? { ...hour, isOpen: !hour.isOpen, isModified: true } : hour
      )
    );
    setHasChanges(true);
  }, []);

  const handleUpdateTime = useCallback((dayOfWeek: DayOfWeekValue, timeType: TimeType, newTime: string) => {
    setLocalHours((prev) =>
      prev.map((hour) =>
        hour.day_of_week === dayOfWeek
          ? { ...hour, [timeType === "open" ? "open_time" : "close_time"]: newTime, isModified: true }
          : hour
      )
    );
    setHasChanges(true);
  }, []);

  const handleToggleExceptionStatus = useCallback((index: number) => {
    setLocalExceptions((prev) => {
      const updated = [...prev];
      if (!updated[index]) return prev;
      const isNowClosed = !updated[index].is_closed;
      updated[index] = {
        ...updated[index],
        is_closed: isNowClosed,
        isAllDay: isNowClosed ? false : updated[index].isAllDay,
        isModified: true,
      };
      return updated;
    });
    setHasChanges(true);
  }, []);

  const handleToggleExceptionAllDay = useCallback((index: number) => {
    setLocalExceptions((prev) => {
      const updated = [...prev];
       if (!updated[index]) return prev;
      const isNowAllDay = !updated[index].isAllDay;
      updated[index] = {
        ...updated[index],
        isAllDay: isNowAllDay,
        open_time: isNowAllDay ? ALL_DAY_OPEN : DEFAULT_OPEN,
        close_time: isNowAllDay ? ALL_DAY_CLOSE : DEFAULT_CLOSE,
        is_closed: false,
        isModified: true,
      };
      return updated;
    });
    setHasChanges(true);
  }, []);

  const handleUpdateExceptionTime = useCallback((index: number, timeType: TimeType, newTime: string) => {
    setLocalExceptions((prev) => {
      const updated = [...prev];
       if (!updated[index]) return prev;
      updated[index] = {
        ...updated[index],
        [timeType === "open" ? "open_time" : "close_time"]: newTime,
        isAllDay: false,
        isModified: true,
      };
      return updated;
    });
    setHasChanges(true);
  }, []);

  const handleAddException = useCallback((date: Date) => {
    const formattedDate = format(date, "yyyy-MM-dd");
    const alreadyExists = localExceptions.some((e) => e.exception_date === formattedDate);
    if (alreadyExists) {
      toast.show({ type: "error", text1: "Date already has an exception" }); return;
    }
    const newException: LocalException = {
      id: `new-${Date.now()}`, bar_id: barId, exception_date: formattedDate, is_closed: false,
      open_time: DEFAULT_OPEN, close_time: DEFAULT_CLOSE, closes_next_day: false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      isModified: false, isNew: true, isAllDay: false,
    };
    setLocalExceptions((prev) => [...prev, newException].sort((a, b) => a.exception_date.localeCompare(b.exception_date)));
    setHasChanges(true);
  }, [barId, localExceptions, toast]);

  const handleRemoveException = useCallback((index: number) => {
    const exceptionToRemove = localExceptions[index];
    if (!exceptionToRemove) return;
    if (!exceptionToRemove.isNew && exceptionToRemove.id && !exceptionToRemove.id.startsWith('new-')) {
      setToDeleteExceptions((prev) => prev.includes(exceptionToRemove.id!) ? prev : [...prev, exceptionToRemove.id!]);
    }
    setLocalExceptions((prev) => prev.filter((_, i) => i !== index));
    setHasChanges(true);
  }, [localExceptions]); // Make sure localExceptions is a dependency

  // --- REVERT FIX ---
  const handleRevertChanges = useCallback(() => {
    if (originalHoursData === null || originalExceptionsData === null) {
        toast.show({ type: 'warning', text1: 'Cannot revert yet', text2: 'Original data not loaded.' });
        return;
    }

    // Revert Hours directly from stored original data
    const revertedHoursMap = new Map(originalHoursData.map(h => [h.day_of_week, h]));
    const revertedHours: LocalOperatingHour[] = DaysOfWeek.map(({ value }) => {
        const existingRow = revertedHoursMap.get(value);
        return {
          id: existingRow?.id ?? '', bar_id: barId, day_of_week: value,
          open_time: existingRow?.open_time ?? DEFAULT_OPEN,
          close_time: existingRow?.close_time ?? DEFAULT_CLOSE,
          closes_next_day: existingRow?.closes_next_day ?? false,
          isOpen: !!existingRow,
          isModified: false, // Explicitly false
        };
    });
    setLocalHours(revertedHours);

    // Revert Exceptions directly from stored original data
    const revertedExceptions: LocalException[] = originalExceptionsData.map((exception) => {
        const isAllDay = !exception.is_closed && exception.open_time === ALL_DAY_OPEN && exception.close_time === ALL_DAY_CLOSE;
        return {
          ...exception,
          open_time: exception.open_time ?? DEFAULT_OPEN,
          close_time: exception.close_time ?? DEFAULT_CLOSE,
          isModified: false, // Explicitly false
          isNew: false,      // Explicitly false
          isAllDay: isAllDay,
        };
    });
     // Sort reverted exceptions just in case original data wasn't sorted (though query does it)
    setLocalExceptions(revertedExceptions.sort((a, b) => a.exception_date.localeCompare(b.exception_date)));


    // Reset control states
    setToDeleteExceptions([]); // Clear pending deletions
    setHasChanges(false);    // Hide action buttons

    toast.show({ type: "info", text1: "Changes reverted" });
  }, [originalHoursData, originalExceptionsData, barId, toast]); // Depend on the stored original data

  const handleSaveChanges = () => {
    saveMutation.mutate();
  };

  // --- Picker Handlers ---
  const showTimePicker = (dayOrIndex: DayOfWeekValue | number, type: TimeType, contextType: "regular" | "exception") => {
    setPickerContext({ type: contextType, dayOrIndex, timeType: type });
    setTimePickerVisible(true);
  };
  const hideTimePicker = () => { setTimePickerVisible(false); setPickerContext(null); };
  const handleTimeConfirm = (date: Date) => {
    const formattedTime = format(date, "HH:mm");
    if (pickerContext) {
      if (pickerContext.type === "regular" && typeof pickerContext.dayOrIndex === 'string') {
        handleUpdateTime(pickerContext.dayOrIndex, pickerContext.timeType, formattedTime);
      } else if (pickerContext.type === "exception" && typeof pickerContext.dayOrIndex === 'number') {
        handleUpdateExceptionTime(pickerContext.dayOrIndex, pickerContext.timeType, formattedTime);
      }
    }
    hideTimePicker();
  };
  const showDatePicker = () => setDatePickerVisible(true);
  const hideDatePicker = () => setDatePickerVisible(false);
  const handleDateConfirm = (date: Date) => { handleAddException(date); hideDatePicker(); };

  // --- Memos for Picker ---
  const timePickerDate = useMemo(() => {
    if (!pickerContext) return new Date();
    const { type, dayOrIndex, timeType } = pickerContext;
    try { // Add try-catch for safety if localHours/localExceptions are temporarily empty
      if (type === 'regular' && typeof dayOrIndex === 'string') {
        const hour = localHours.find(h => h.day_of_week === dayOrIndex);
        return timeStringToDate(timeType === 'open' ? hour?.open_time : hour?.close_time);
      } else if (type === 'exception' && typeof dayOrIndex === 'number' && localExceptions[dayOrIndex]) {
        const exception = localExceptions[dayOrIndex];
        return timeStringToDate(timeType === 'open' ? exception?.open_time : exception?.close_time);
      }
    } catch (error) {
       console.error("Error calculating timePickerDate:", error);
    }
    return new Date(); // Fallback
  }, [pickerContext, localHours, localExceptions]);

  // --- Render Logic ---
  const isPending = isHoursPending || isExceptionsPending; // Base loading state
  const isSaving = saveMutation.isPending; // Specific saving state
  const error = hoursError || exceptionsError;

  if (isPending && originalHoursData === null) { // Show loading only on initial load
    return (
      <View className="flex-1 justify-center items-center p-5 bg-white rounded-xl m-4 shadow-sm">
        <ActivityIndicator size="large" color="#4f46e5" />
        <Text className="mt-3 text-base text-gray-600">Loading hours...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="p-5 bg-red-50 border border-red-200 rounded-xl m-4 items-center shadow-sm">
        <AlertCircle size={24} color="#dc2626" />
        <Text className="mt-2 text-base font-semibold text-red-700 text-center">Failed to load operating hours</Text>
        <Text className="mt-1 text-sm text-red-600 text-center">{error.message}</Text>
        <TouchableOpacity
           onPress={() => { refetchHours(); refetchExceptions(); }}
           className="mt-3 bg-red-100 px-4 py-1.5 rounded-md border border-red-200"
        >
           <Text className="text-red-700 text-sm font-medium">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Main component structure using NativeWind classes
  return (
    <View className="flex-1 bg-white rounded-xl shadow-sm m-4 p-5">
      {/* Header */}
      <View className="pb-3 mb-4 border-b border-gray-200">
        <Text className="text-xl font-bold text-gray-800">Operating Hours</Text>
        <Text className="text-sm text-gray-500 mt-1">Manage when your bar is open for customers.</Text>
      </View>

      {/* Tab Navigation */}
      <View className="flex-row mb-4 border-b border-gray-200">
        <TouchableOpacity
          className={`py-2 px-4 mr-2 border-b-2 ${activeTab === "regular" ? "border-blue-500" : "border-transparent"}`}
          onPress={() => setActiveTab("regular")}
        >
          <Text className={`text-sm font-medium ${activeTab === "regular" ? "text-blue-600" : "text-gray-500"}`}>Regular Hours</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`py-2 px-4 border-b-2 ${activeTab === "exceptions" ? "border-blue-500" : "border-transparent"}`}
          onPress={() => setActiveTab("exceptions")}
        >
          <Text className={`text-sm font-medium ${activeTab === "exceptions" ? "text-blue-600" : "text-gray-500"}`}>Exceptions</Text>
        </TouchableOpacity>
      </View>

      {/* Content Area */}
      <ScrollView className="flex-1 mb-4">
        {activeTab === "regular" ? (
          // --- Regular Hours Tab ---
          <View className="py-2">
            {/* Table Header */}
            <View className="flex-row mb-2 pb-2 px-1 border-b border-gray-100">
              <Text className="flex-[2.5] text-xs font-semibold text-gray-500 uppercase">Day</Text>
              <Text className="flex-[3] text-xs font-semibold text-gray-500 uppercase text-center">Open</Text>
              <Text className="flex-[3] text-xs font-semibold text-gray-500 uppercase text-center">Close</Text>
              <Text className="flex-[1.5] text-xs font-semibold text-gray-500 uppercase text-center">Status</Text>
            </View>
            {/* Table Rows */}
            {localHours.map((hour) => (
              <View key={hour.day_of_week} className="flex-row items-center py-2.5 px-1 border-b border-gray-100 last:border-b-0">
                 {/* Day Label */}
                 <View className="flex-[2.5] flex-row items-center pr-2">
                    <View className={`w-2 h-2 rounded-full mr-2 ${hour.isOpen ? "bg-green-500" : "bg-gray-300"}`} />
                    <Text className="text-sm font-medium text-gray-700">{DaysOfWeek.find(d => d.value === hour.day_of_week)?.label}</Text>
                 </View>
                 {/* Open Time */}
                 <View className="flex-[3] px-1">
                    <TouchableOpacity
                       className={`flex-row items-center justify-center border rounded-md px-2 py-1.5 ${
                         hour.isOpen ? "bg-gray-50 border-gray-300" : "bg-gray-100 border-gray-200 opacity-60"
                       }`}
                       onPress={() => hour.isOpen && showTimePicker(hour.day_of_week, "open", "regular")}
                       disabled={!hour.isOpen}
                     >
                       <Clock size={14} color={hour.isOpen ? "#4b5563" : "#9ca3af"} />
                       <Text className={`ml-1.5 text-sm ${hour.isOpen ? "text-gray-800" : "text-gray-400"}`}>{hour.open_time}</Text>
                    </TouchableOpacity>
                 </View>
                 {/* Close Time */}
                 <View className="flex-[3] px-1">
                    <TouchableOpacity
                       className={`flex-row items-center justify-center border rounded-md px-2 py-1.5 ${
                         hour.isOpen ? "bg-gray-50 border-gray-300" : "bg-gray-100 border-gray-200 opacity-60"
                       }`}
                       onPress={() => hour.isOpen && showTimePicker(hour.day_of_week, "close", "regular")}
                       disabled={!hour.isOpen}
                     >
                       <Clock size={14} color={hour.isOpen ? "#4b5563" : "#9ca3af"} />
                       <Text className={`ml-1.5 text-sm ${hour.isOpen ? "text-gray-800" : "text-gray-400"}`}>{hour.close_time}</Text>
                    </TouchableOpacity>
                 </View>
                 {/* Status Toggle */}
                 <View className="flex-[1.5] items-center pl-1">
                    <Switch
                       value={hour.isOpen}
                       onValueChange={() => handleToggleDayStatus(hour.day_of_week)}
                       trackColor={{ false: "#e5e7eb", true: "#a7f3d0" }}
                       thumbColor={hour.isOpen ? "#10b981" : "#9ca3af"}
                       ios_backgroundColor="#e5e7eb"
                       style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                    />
                 </View>
              </View>
            ))}
          </View>
        ) : (
          // --- Exceptions Tab ---
          <View className="py-2">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-base font-semibold text-gray-700">Special Dates & Closures</Text>
              <TouchableOpacity
                className="flex-row items-center bg-green-50 px-3 py-1.5 rounded-lg border border-green-200"
                onPress={showDatePicker}
              >
                <Plus size={16} color="#16a34a" />
                <Text className="text-green-700 font-medium text-sm ml-1">Add Date</Text>
              </TouchableOpacity>
            </View>

            {localExceptions.length === 0 ? (
              <View className="items-center py-10 opacity-70">
                <Calendar size={40} color="#9ca3af" />
                <Text className="text-gray-500 mt-3 text-base">No exceptions added yet.</Text>
                <Text className="text-gray-400 text-sm text-center mt-1">Add specific dates for holidays or special hours.</Text>
              </View>
            ) : (
              <View>
                {localExceptions.map((exception, index) => (
                  <View key={exception.id || `new-${index}`} className="bg-white rounded-lg border border-gray-200 p-4 mb-3 shadow-sm">
                    {/* Card Header */}
                    <View className="flex-row justify-between items-center pb-3 mb-3 border-b border-gray-100">
                       <View className="flex-row items-center">
                         <Calendar size={16} color="#4b5563" />
                         <Text className="font-semibold text-gray-800 ml-2 text-sm">{formatDisplayDate(exception.exception_date)}</Text>
                       </View>
                       <TouchableOpacity onPress={() => handleRemoveException(index)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                         <X size={18} color="#ef4444" />
                       </TouchableOpacity>
                     </View>

                     {/* Card Controls */}
                     <View className="flex-row justify-between mb-3">
                        {/* Status Toggle */}
                        <View className="flex-1 mr-2">
                            <Text className="text-xs text-gray-500 mb-1">Status</Text>
                            <View className="flex-row items-center">
                                <Switch
                                  value={!exception.is_closed}
                                  onValueChange={() => handleToggleExceptionStatus(index)}
                                  trackColor={{ false: "#fee2e2", true: "#dcfce7" }}
                                  thumbColor={!exception.is_closed ? "#22c55e" : "#ef4444"}
                                  ios_backgroundColor="#fee2e2"
                                  style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                                />
                                <Text className={`ml-1.5 text-sm font-medium ${exception.is_closed ? 'text-red-600' : 'text-green-600'}`}>
                                    {exception.is_closed ? "Closed" : "Open"}
                                </Text>
                            </View>
                        </View>
                        {/* All Day Toggle */}
                        {!exception.is_closed && (
                           <View className="flex-1 ml-2 items-end">
                             <Text className="text-xs text-gray-500 mb-1">All Day</Text>
                             <View className="flex-row items-center">
                               <Switch
                                  value={exception.isAllDay}
                                  onValueChange={() => handleToggleExceptionAllDay(index)}
                                  trackColor={{ false: "#e5e7eb", true: "#dbeafe" }}
                                  thumbColor={exception.isAllDay ? "#3b82f6" : "#9ca3af"}
                                  ios_backgroundColor="#e5e7eb"
                                  style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                               />
                               <Sun size={16} color={exception.isAllDay ? "#3b82f6" : "#9ca3af"} className="ml-1.5" />
                             </View>
                           </View>
                        )}
                     </View>

                     {/* Time Pickers or All Day Display */}
                    {!exception.is_closed && !exception.isAllDay && (
                       <View className="flex-row mt-1">
                           <View className="flex-1 mr-2">
                              <Text className="text-xs text-gray-500 mb-1">Open Time</Text>
                              <TouchableOpacity
                                 className="flex-row items-center justify-center border border-gray-300 rounded-md px-2 py-1.5 bg-gray-50"
                                 onPress={() => showTimePicker(index, "open", "exception")}
                               >
                                <Clock size={14} color="#4b5563" />
                                <Text className="ml-1.5 text-sm text-gray-800">{exception.open_time ?? DEFAULT_OPEN}</Text>
                              </TouchableOpacity>
                           </View>
                           <View className="flex-1 ml-2">
                             <Text className="text-xs text-gray-500 mb-1">Close Time</Text>
                             <TouchableOpacity
                                className="flex-row items-center justify-center border border-gray-300 rounded-md px-2 py-1.5 bg-gray-50"
                                onPress={() => showTimePicker(index, "close", "exception")}
                              >
                               <Clock size={14} color="#4b5563" />
                               <Text className="ml-1.5 text-sm text-gray-800">{exception.close_time ?? DEFAULT_CLOSE}</Text>
                              </TouchableOpacity>
                           </View>
                       </View>
                    )}
                     {!exception.is_closed && exception.isAllDay && (
                       <View className="flex-row items-center bg-blue-50 p-2 rounded-md mt-1 border border-blue-100">
                         <Sun size={14} color="#2563eb" />
                         <Text className="text-blue-700 text-sm font-medium ml-2">Open All Day ({ALL_DAY_OPEN} - {ALL_DAY_CLOSE})</Text>
                       </View>
                     )}

                    {/* Unsaved Indicator */}
                    {exception.isNew && (
                      <View className="flex-row items-center mt-3 pt-2 border-t border-gray-100">
                        <AlertCircle size={14} color="#f59e0b" />
                        <Text className="text-yellow-600 text-xs ml-1 italic">New / Unsaved</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Footer Actions & Info */}
      <View className="pt-4 border-t border-gray-200">
        {hasChanges && (
          <View className="flex-row justify-end mb-4">
            <TouchableOpacity
              className="flex-row items-center px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 mr-2"
              onPress={handleRevertChanges}
              disabled={isSaving} // Disable revert while saving
            >
              <RotateCcw size={16} color="#4b5563" />
              <Text className="ml-1.5 text-sm text-gray-700 font-medium">Revert</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-row items-center px-4 py-2 rounded-lg border ${
                isSaving
                  ? "bg-green-50 border-green-200 opacity-70"
                  : "bg-green-100 border-green-300"
              }`}
              onPress={handleSaveChanges}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#15803d" />
              ) : (
                <Save size={16} color="#15803d" />
              )}
              <Text className="ml-1.5 text-sm text-green-800 font-semibold">Save Changes</Text>
            </TouchableOpacity>
          </View>
        )}
        <View className="flex-row items-center justify-center bg-gray-50 p-2 rounded-md">
          <Info size={14} color="#6b7280" />
          <Text className="ml-2 text-xs text-gray-600 text-center">Times are 24h format. Use exceptions for specific dates.</Text>
        </View>
      </View>

      {/* Modals */}
      <DateTimePickerModal
        isVisible={isTimePickerVisible}
        mode="time"
        onConfirm={handleTimeConfirm}
        onCancel={hideTimePicker}
        date={timePickerDate}
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
  );
};

export default BarOperatingHours;