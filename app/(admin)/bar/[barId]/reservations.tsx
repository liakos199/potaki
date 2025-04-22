import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  FlatList,
  RefreshControl,
} from 'react-native';
import {
  Calendar,
  Users,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  Filter,
  Utensils,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  GlassWater,
  ArrowLeft,
  Clock,
} from 'lucide-react-native';
import { format, parseISO, isToday, isAfter, isBefore, startOfDay } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { useToast } from '@/src/components/general/Toast';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Database } from '@/src/lib/database.types';

// --- Type Definitions ---
type Reservation = Database['public']['Tables']['reservations']['Row'] & {
  customer: {
    id: string;
    name: string | null;
    email: string | null;
  };
};

type ReservationDrink = Database['public']['Tables']['reservation_drinks']['Row'];
type ReservationStatus = Database['public']['Enums']['reservation_status'];
type SeatType = Database['public']['Enums']['seat_option_type'];

// --- Constants ---
const STATUS_STYLES: Record<
  ReservationStatus,
  { bg: string; text: string; icon: React.ReactNode }
> = {
  confirmed: {
    bg: 'bg-[#2a2a35]',
    text: 'text-green-400',
    icon: <Clock size={14} color="#4ade80" />,
  },
  cancelled: {
    bg: 'bg-[#2a2a35]',
    text: 'text-red-400',
    icon: <XCircle size={14} color="#f87171" />,
  },
  completed: {
    bg: 'bg-[#2a2a35]',
    text: 'text-blue-400',
    icon: <CheckCircle size={14} color="#60a5fa" />,
  },
  no_show: {
    bg: 'bg-[#2a2a35]',
    text: 'text-yellow-400',
    icon: <AlertCircle size={14} color="#facc15" />,
  },
};

const SEAT_TYPE_LABELS: Record<SeatType, string> = {
  bar: 'Bar',
  table: 'Table',
  vip: 'VIP',
};

const ICON_SIZE = 16;
const ICON_COLOR = "#9ca3af";

// --- Reusable UI Components ---

interface FilterButtonProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

const FilterButton: React.FC<FilterButtonProps> = ({ label, isActive, onPress }) => (
  <Pressable
    className={`
      px-3.5 py-2 rounded-xl mr-2 mb-2
      ${isActive 
        ? 'bg-[#ff4d6d]' 
        : 'bg-[#1f1f27]'}
    `}
    onPress={onPress}
  >
    <Text className={`
      text-sm font-medium
      ${isActive ? 'text-white' : 'text-gray-300'}
    `}>
      {label}
    </Text>
  </Pressable>
);

interface FilterBarProps {
  statusFilter: ReservationStatus | 'all';
  setStatusFilter: (status: ReservationStatus | 'all') => void;
  dateFilter: 'today' | 'upcoming' | 'past' | 'all';
  setDateFilter: (date: 'today' | 'upcoming' | 'past' | 'all') => void;
}

const FilterBar: React.FC<FilterBarProps> = ({
  statusFilter,
  setStatusFilter,
  dateFilter,
  setDateFilter,
}) => {
  const statusOptions: (ReservationStatus | 'all')[] = ['all', 'confirmed', 'completed', 'cancelled', 'no_show'];
  const dateOptions: ('today' | 'upcoming' | 'past' | 'all')[] = ['upcoming', 'today', 'past', 'all'];

  return (
    <View className="p-4 bg-[#0f0f13] border-b border-[#1f1f27]">
      <View className="flex-row items-center mb-3">
        <Filter size={18} color="#ff4d6d" />
        <Text className="text-base font-semibold text-white ml-2">
          Filters
        </Text>
      </View>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mb-2">
        {/* Status Filters */}
        <View className="flex-row items-center mr-4">
          <Text className="text-sm font-medium text-gray-400 mr-2">Status:</Text>
          {statusOptions.map((status) => (
            <FilterButton
              key={status}
              label={status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
              isActive={statusFilter === status}
              onPress={() => setStatusFilter(status)}
            />
          ))}
        </View>
      </ScrollView>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
        {/* Date Filters */}
        <View className="flex-row items-center">
          <Text className="text-sm font-medium text-gray-400 mr-2">Date:</Text>
          {dateOptions.map((date) => (
            <FilterButton
              key={date}
              label={date.charAt(0).toUpperCase() + date.slice(1)}
              isActive={dateFilter === date}
              onPress={() => setDateFilter(date)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

interface ReservationDetailsProps {
  reservation: Reservation;
  reservationDrinks: ReservationDrink[] | undefined;
  isLoadingDrinks: boolean;
  onCheckIn: () => void;
  onNoShow: () => void;
  onCancel: () => void;
  isUpdatingStatus: boolean;
}

const ReservationDetails: React.FC<ReservationDetailsProps> = ({
  reservation,
  reservationDrinks,
  isLoadingDrinks,
  onCheckIn,
  onNoShow,
  onCancel,
  isUpdatingStatus,
}) => {
  const totalDrinkPrice = useMemo(() => {
    return (reservationDrinks ?? []).reduce(
      (total, drink) => total + drink.price_at_booking * drink.quantity,
      0
    );
  }, [reservationDrinks]);

  const hasDrinks = reservationDrinks && reservationDrinks.length > 0;
  const hasSpecialRequests = !!reservation.special_requests;

  return (
    <View className="px-4 pb-4 pt-3 bg-[#1f1f27] border-t border-[#2a2a35]">
      {/* Special Requests */}
      {hasSpecialRequests && (
        <View className="mb-4">
          <View className="flex-row items-center mb-2">
            <MessageSquare size={ICON_SIZE} color="#ff4d6d" />
            <Text className="text-sm font-semibold text-white ml-2">
              Special Requests
            </Text>
          </View>
          <Text className="text-sm text-gray-300 leading-snug">
            {reservation.special_requests}
          </Text>
        </View>
      )}

      {/* Drinks */}
      <View className="mb-4">
        <View className="flex-row items-center mb-2">
          <GlassWater size={ICON_SIZE} color="#ff4d6d" />
          <Text className="text-sm font-semibold text-white ml-2">
            Pre-ordered Drinks
          </Text>
        </View>
        
        {isLoadingDrinks ? (
          <ActivityIndicator size="small" color="#ff4d6d" className="my-2" />
        ) : hasDrinks ? (
          <View>
            {reservationDrinks?.map((drink) => (
              <View key={drink.id} className="flex-row justify-between items-center py-1.5 border-b border-[#2a2a35] last:border-b-0">
                <Text className="text-sm text-gray-300">
                  {drink.quantity}x {drink.drink_name_at_booking}
                </Text>
                <Text className="text-sm font-medium text-white">
                  ${(drink.price_at_booking * drink.quantity).toFixed(2)}
                </Text>
              </View>
            ))}
            <View className="flex-row justify-end mt-2 pt-2 border-t border-[#2a2a35]">
              <Text className="text-sm font-bold text-[#ff4d6d]">
                Drinks Total: ${totalDrinkPrice.toFixed(2)}
              </Text>
            </View>
          </View>
        ) : (
          <Text className="text-sm text-gray-500 italic">
            No drinks pre-ordered.
          </Text>
        )}
      </View>

      {/* No Details Fallback */}
      {!hasSpecialRequests && !hasDrinks && !isLoadingDrinks && (
        <Text className="text-sm text-gray-500 italic mb-4">
          No special requests or pre-ordered drinks.
        </Text>
      )}

      {/* Action Buttons */}
      <View className="flex-row justify-end flex-wrap -mb-2">
        {reservation.status !== 'completed' && reservation.status !== 'cancelled' && (
          <Pressable
            className="flex-row items-center bg-[#2a2a35] px-4 py-2 rounded-xl ml-2 mb-2"
            onPress={onCheckIn}
            disabled={isUpdatingStatus}
          >
            <CheckCircle size={ICON_SIZE} color="#4ade80" />
            <Text className="text-sm font-medium text-green-400 ml-1.5">Check In</Text>
          </Pressable>
        )}
        {reservation.status !== 'no_show' && reservation.status !== 'completed' && reservation.status !== 'cancelled' && (
          <Pressable
            className="flex-row items-center bg-[#2a2a35] px-4 py-2 rounded-xl ml-2 mb-2"
            onPress={onNoShow}
            disabled={isUpdatingStatus}
          >
            <XCircle size={ICON_SIZE} color="#facc15" />
            <Text className="text-sm font-medium text-yellow-400 ml-1.5">No Show</Text>
          </Pressable>
        )}
        {reservation.status !== 'cancelled' && reservation.status !== 'completed' && (
          <Pressable
            className="flex-row items-center bg-[#2a2a35] px-4 py-2 rounded-xl ml-2 mb-2"
            onPress={onCancel}
            disabled={isUpdatingStatus}
          >
            <XCircle size={ICON_SIZE} color="#f87171" />
            <Text className="text-sm font-medium text-red-400 ml-1.5">Cancel</Text>
          </Pressable>
        )}
      </View>
      {isUpdatingStatus && <ActivityIndicator size="small" color="#ff4d6d" className="mt-2 self-end" />}
    </View>
  );
};

interface ReservationListItemProps {
  reservation: Reservation;
  isExpanded: boolean;
  onToggleDetails: () => void;
  onCheckIn: () => void;
  onNoShow: () => void;
  onCancel: () => void;
  reservationDrinks: ReservationDrink[] | undefined;
  isLoadingDrinks: boolean;
  isUpdatingStatus: boolean;
}

const ReservationListItem: React.FC<ReservationListItemProps> = ({
  reservation,
  isExpanded,
  onToggleDetails,
  ...detailProps // Pass down remaining props to ReservationDetails
}) => {
  const reservationDate = parseISO(reservation.reservation_date);
  const statusStyle = STATUS_STYLES[reservation.status];

  return (
    <View className="bg-[#1f1f27] rounded-xl mb-3 overflow-hidden">
      {/* Header Section */}
      <Pressable
        className="p-4"
        onPress={onToggleDetails}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            {/* Date and Time */}
            <View className="flex-row items-center mb-2">
              <View className="w-8 h-8 rounded-full bg-[#2a2a35] items-center justify-center mr-2">
                <Calendar size={16} color="#ff4d6d" />
              </View>
              <View>
                <Text className="text-base font-semibold text-white">
                  {format(reservationDate, 'EEE, MMM d, yyyy')}
                </Text>
                <Text className="text-sm text-gray-400">
                  {format(reservationDate, 'h:mm a')}
                </Text>
              </View>
            </View>

            {/* Customer and Party Size */}
            <View className="flex-row items-center mb-3">
              <View className="w-8 h-8 rounded-full bg-[#2a2a35] items-center justify-center mr-2">
                <Users size={16} color="#ff4d6d" />
              </View>
              <View>
                <Text className="text-base text-white" numberOfLines={1}>
                  {reservation.customer.name || 'Unnamed Customer'}
                </Text>
                <Text className="text-sm text-gray-400">
                  {reservation.party_size} guest{reservation.party_size === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            {/* Status and Seat Type Badges */}
            <View className="flex-row flex-wrap items-center">
              <View className={`flex-row items-center px-3 py-1 rounded-xl mr-2 mb-1 ${statusStyle.bg}`}>
                {statusStyle.icon}
                <Text className={`text-xs font-medium capitalize ml-1 ${statusStyle.text}`}>
                  {reservation.status.replace('_', ' ')}
                </Text>
              </View>
              <View className="flex-row items-center bg-[#2a2a35] px-3 py-1 rounded-xl mb-1">
                <Utensils size={14} color="#ff4d6d" />
                <Text className="text-xs font-medium text-white ml-1">
                  {SEAT_TYPE_LABELS[reservation.seat_type]}
                </Text>
              </View>
            </View>
          </View>

          {/* Expand Icon */}
          <View className="w-8 h-8 rounded-full bg-[#2a2a35] items-center justify-center">
            {isExpanded ? (
              <ChevronUp size={18} color="#fff" />
            ) : (
              <ChevronDown size={18} color="#fff" />
            )}
          </View>
        </View>
      </Pressable>

      {/* Expanded Details Section */}
      {isExpanded && <ReservationDetails reservation={reservation} {...detailProps} />}
    </View>
  );
};

// --- Status Components ---

const LoadingIndicator: React.FC<{ message?: string }> = ({ message = "Loading reservations..." }) => (
  <View className="flex-1 justify-center items-center p-4 bg-[#0f0f13]">
    <ActivityIndicator size="large" color="#ff4d6d" />
    <Text className="mt-3 text-base text-gray-300">{message}</Text>
  </View>
);

const ErrorDisplay: React.FC<{ error: Error | null; onRetry: () => void }> = ({ error, onRetry }) => (
  <View className="flex-1 justify-center items-center p-6 bg-[#0f0f13]">
    <AlertCircle size={48} color="#f87171" />
    <Text className="mt-4 text-lg font-semibold text-white">
      Failed to load reservations
    </Text>
    <Text className="mt-2 text-sm text-gray-300 text-center">
      {error instanceof Error ? error.message : 'An unknown error occurred'}
    </Text>
    <Pressable
      className="mt-6 bg-[#ff4d6d] px-5 py-3 rounded-xl"
      onPress={onRetry}
    >
      <Text className="text-white font-medium">Retry</Text>
    </Pressable>
  </View>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <View className="flex-1 justify-center items-center p-8 bg-[#0f0f13] mt-4">
    <Calendar size={48} color="#6b7280" />
    <Text className="mt-4 text-lg font-semibold text-white">
      No Reservations Found
    </Text>
    <Text className="mt-2 text-sm text-gray-400 text-center max-w-xs">
      {message}
    </Text>
  </View>
);

// --- Main Screen Component ---

export default function ReservationsScreen() {
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const toast = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<ReservationStatus | 'all'>('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'upcoming' | 'past' | 'all'>('upcoming');
  const [selectedReservation, setSelectedReservation] = useState<string | null>(null);

  // --- Data Fetching ---
  const {
    data: reservations,
    isLoading: isLoadingReservations,
    error: reservationsError,
    refetch: refetchReservations,
    isRefetching,
  } = useQuery({
    queryKey: ['reservations', barId],
    queryFn: async () => {
      if (!barId) throw new Error('Bar ID is required');
      const { data, error } = await supabase
        .from('reservations')
        .select('*, customer:profiles!reservations_customer_id_fkey(id, name, email)')
        .eq('bar_id', barId)
        .order('reservation_date', { ascending: true });
      if (error) throw error;
      return data as Reservation[];
    },
    enabled: !!barId && !!profile,
  });

  const { data: reservationDrinks, isLoading: isLoadingDrinks } = useQuery({
    queryKey: ['reservation_drinks', selectedReservation],
    queryFn: async () => {
      if (!selectedReservation) return [];
      const { data, error } = await supabase
        .from('reservation_drinks')
        .select('*')
        .eq('reservation_id', selectedReservation);
      if (error) throw error;
      return data as ReservationDrink[];
    },
    enabled: !!selectedReservation, // Only fetch when a reservation is selected/expanded
  });

  // --- Mutations ---
  const updateReservationStatus = useMutation({
    mutationFn: async ({
      reservationId,
      status,
      checkedInAt = null,
    }: {
      reservationId: string;
      status: ReservationStatus;
      checkedInAt?: string | null;
    }) => {
      const { error } = await supabase
        .from('reservations')
        .update({ status, ...(checkedInAt && { checked_in_at: checkedInAt }) })
        .eq('id', reservationId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reservations', barId] });
      toast.show({ type: 'success', text1: `Reservation marked as ${variables.status.replace('_', ' ')}` });
    },
    onError: (error) => {
      toast.show({
        type: 'error',
        text1: 'Update failed',
        text2: error instanceof Error ? error.message : 'Could not update status',
      });
    },
  });

  // --- Filtering Logic ---
  const filteredReservations = useMemo(() => {
    if (!reservations) return [];
    const todayStart = startOfDay(new Date());

    return reservations.filter(reservation => {
      const reservationDate = parseISO(reservation.reservation_date);
      const reservationDateStart = startOfDay(reservationDate);

      // Status filter
      if (statusFilter !== 'all' && reservation.status !== statusFilter) return false;

      // Date filter
      const isResToday = isToday(reservationDate);
      // Upcoming includes today and future dates
      const isResUpcoming = isAfter(reservationDateStart, todayStart) || isResToday;
      // Past is strictly before today
      const isResPast = isBefore(reservationDateStart, todayStart);

      if (dateFilter === 'today' && !isResToday) return false;
      if (dateFilter === 'upcoming' && !isResUpcoming) return false;
      if (dateFilter === 'past' && !isResPast) return false;

      return true;
    });
  }, [reservations, statusFilter, dateFilter]);

  // --- Event Handlers ---
  const handleToggleDetails = useCallback((reservationId: string) => {
    setSelectedReservation(prevId => (prevId === reservationId ? null : reservationId));
  }, []);

  const handleCheckIn = useCallback((reservation: Reservation) => {
    if (reservation.status === 'completed') {
      toast.show({ type: 'info', text1: 'Already checked in' }); return;
    }
    if (reservation.status === 'cancelled') {
      Alert.alert('Confirm Check-in', 'This reservation was cancelled. Still check them in?', [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: () => updateReservationStatus.mutate({ reservationId: reservation.id, status: 'completed', checkedInAt: new Date().toISOString() }) }
      ]);
    } else {
      updateReservationStatus.mutate({ reservationId: reservation.id, status: 'completed', checkedInAt: new Date().toISOString() });
    }
  }, [toast, updateReservationStatus]);

  const handleNoShow = useCallback((reservation: Reservation) => {
    if (reservation.status === 'no_show') {
      toast.show({ type: 'info', text1: 'Already marked as no-show' }); return;
    }
    Alert.alert('Confirm No-Show', 'Mark this reservation as a no-show?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark No-Show', style: 'destructive', onPress: () => updateReservationStatus.mutate({ reservationId: reservation.id, status: 'no_show' }) }
    ]);
  }, [toast, updateReservationStatus]);

  const handleCancel = useCallback((reservation: Reservation) => {
    if (reservation.status === 'cancelled') {
      toast.show({ type: 'info', text1: 'Already cancelled' }); return;
    }
    Alert.alert('Confirm Cancellation', 'Cancel this reservation?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Cancel', style: 'destructive', onPress: () => updateReservationStatus.mutate({ reservationId: reservation.id, status: 'cancelled' }) }
    ]);
  }, [toast, updateReservationStatus]);

  const onRefresh = useCallback(() => {
    refetchReservations();
  }, [refetchReservations]);

  // --- Render Logic ---
  if (isLoadingReservations && !isRefetching) { // Show full loading only on initial load
    return (
      <SafeAreaView className="flex-1 bg-[#0f0f13]">
        <StatusBar style="light" />
        <LoadingIndicator />
      </SafeAreaView>
    );
  }

  if (reservationsError && !reservations) { // Show error only if there's no cached data
    return (
      <SafeAreaView className="flex-1 bg-[#0f0f13]">
        <StatusBar style="light" />
        <ErrorDisplay error={reservationsError} onRetry={refetchReservations} />
      </SafeAreaView>
    );
  }

  const getEmptyStateMessage = () => {
    if (statusFilter !== 'all' || dateFilter !== 'upcoming') {
      return "Try adjusting your filters or checking different date ranges to find reservations.";
    }
    return "There are no upcoming reservations matching the current filters.";
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0f0f13]">
      <StatusBar style="light" />
      
      {/* Header */}
      <View className="px-5 pt-2 pb-4 border-b border-[#1f1f27]">
        <View className="flex-row items-center mb-2">
          <Pressable
            className="w-10 h-10 rounded-full justify-center items-center mr-3"
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={22} color="#fff" />
          </Pressable>
          <Text className="text-xl font-bold text-white flex-1">
            Reservations
          </Text>
        </View>
      </View>

      {/* Filters */}
      <FilterBar
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
      />

      {/* Content Area */}
      {filteredReservations.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#ff4d6d"/>
          }
        >
          <EmptyState message={getEmptyStateMessage()} />
        </ScrollView>
      ) : (
        <FlatList
          data={filteredReservations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ReservationListItem
              reservation={item}
              isExpanded={selectedReservation === item.id}
              onToggleDetails={() => handleToggleDetails(item.id)}
              onCheckIn={() => handleCheckIn(item)}
              onNoShow={() => handleNoShow(item)}
              onCancel={() => handleCancel(item)}
              reservationDrinks={selectedReservation === item.id ? reservationDrinks : undefined}
              isLoadingDrinks={selectedReservation === item.id && isLoadingDrinks}
              isUpdatingStatus={updateReservationStatus.isPending && updateReservationStatus.variables?.reservationId === item.id}
            />
          )}
          contentContainerClassName="p-4"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#ff4d6d"/>
          }
        />
      )}
    </SafeAreaView>
  );
}