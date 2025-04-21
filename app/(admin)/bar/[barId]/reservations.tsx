import React, { useState, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
    Alert,
    FlatList,
    SafeAreaView,
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
} from 'lucide-react-native';
import { format, parseISO, isToday, isAfter, isBefore, startOfDay } from 'date-fns';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { useToast } from '@/src/components/general/Toast';
import type { Database } from '@/src/lib/database.types';
// Removed styled and clsx imports

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
    { bg: string; text: string; border: string }
> = {
    confirmed: {
        bg: 'bg-green-100',
        text: 'text-green-800',
        border: 'border-green-300',
    },
    cancelled: {
        bg: 'bg-red-100',
        text: 'text-red-800',
        border: 'border-red-300',
    },
    completed: {
        bg: 'bg-blue-100',
        text: 'text-blue-800',
        border: 'border-blue-300',
    },
    no_show: {
        bg: 'bg-yellow-100',
        text: 'text-yellow-800',
        border: 'border-yellow-300',
    },
};

const SEAT_TYPE_LABELS: Record<SeatType, string> = {
    bar: 'Bar',
    table: 'Table',
    vip: 'VIP',
};

const ICON_SIZE = 16;
const ICON_COLOR = 'text-gray-600';

// --- Reusable UI Components ---

interface FilterButtonProps {
    label: string;
    isActive: boolean;
    onPress: () => void;
}

const FilterButton: React.FC<FilterButtonProps> = ({ label, isActive, onPress }) => (
    <TouchableOpacity
        // Use template literal for conditional classes
        className={`
            px-3.5 py-1.5 rounded-full mr-2 mb-2 border
            ${isActive
                ? 'bg-indigo-600 border-indigo-700'
                : 'bg-gray-100 border-gray-300 hover:bg-gray-200'}
        `}
        onPress={onPress}
        activeOpacity={0.8} // Add touch feedback
    >
        <Text
            // Use template literal for conditional classes
            className={`
                text-sm font-medium
                ${isActive ? 'text-white' : 'text-gray-700'}
            `}
        >
            {label}
        </Text>
    </TouchableOpacity>
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
        <View className="p-4 bg-white border-b border-gray-200">
            <Text className="text-base font-semibold text-gray-700 mb-3 flex-row items-center">
                <Filter size={18} className="text-gray-600 mr-2" />
                Filters
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mb-2">
                {/* Status Filters */}
                <View className="flex-row items-center mr-4">
                    <Text className="text-sm font-medium text-gray-500 mr-2">Status:</Text>
                    {statusOptions.map((status) => (
                        <FilterButton
                            key={status}
                            label={status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')} // Also replace underscore
                            isActive={statusFilter === status}
                            onPress={() => setStatusFilter(status)}
                        />
                    ))}
                </View>
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
              {/* Date Filters */}
              <View className="flex-row items-center">
                    <Text className="text-sm font-medium text-gray-500 mr-2">Date:</Text>
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
        <View className="px-4 pb-4 pt-3 bg-gray-50 border-t border-gray-200">
            {/* Special Requests */}
            {hasSpecialRequests && (
                <View className="mb-4">
                    <Text className="text-sm font-semibold text-gray-700 mb-1.5 flex-row items-center">
                        <MessageSquare size={ICON_SIZE - 2} className={`${ICON_COLOR} mr-1.5`} />
                        Special Requests
                    </Text>
                    <Text className="text-sm text-gray-600 leading-snug">
                        {reservation.special_requests}
                    </Text>
                </View>
            )}

            {/* Drinks */}
            <View className="mb-4">
                 <Text className="text-sm font-semibold text-gray-700 mb-1.5 flex-row items-center">
                    <GlassWater size={ICON_SIZE - 2} className={`${ICON_COLOR} mr-1.5`} />
                    Pre-ordered Drinks
                </Text>
                {isLoadingDrinks ? (
                    <ActivityIndicator size="small" color="#4f46e5" className="my-2" />
                ) : hasDrinks ? (
                    <View>
                        {reservationDrinks?.map((drink) => (
                            <View key={drink.id} className="flex-row justify-between items-center py-1.5 border-b border-gray-100 last:border-b-0">
                                <Text className="text-sm text-gray-600">
                                    {drink.quantity}x {drink.drink_name_at_booking}
                                </Text>
                                <Text className="text-sm font-medium text-gray-700">
                                    ${(drink.price_at_booking * drink.quantity).toFixed(2)}
                                </Text>
                            </View>
                        ))}
                        <View className="flex-row justify-end mt-2 pt-2 border-t border-gray-200">
                            <Text className="text-sm font-bold text-gray-800">
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
                    <TouchableOpacity
                        className="flex-row items-center bg-green-100 border border-green-300 px-3 py-1.5 rounded-md ml-2 mb-2"
                        onPress={onCheckIn}
                        disabled={isUpdatingStatus}
                        activeOpacity={0.7}
                    >
                        <CheckCircle size={ICON_SIZE - 2} className="text-green-700 mr-1.5" />
                        <Text className="text-sm font-medium text-green-700">Check In</Text>
                    </TouchableOpacity>
                )}
                {reservation.status !== 'no_show' && reservation.status !== 'completed' && reservation.status !== 'cancelled' && (
                    <TouchableOpacity
                        className="flex-row items-center bg-yellow-100 border border-yellow-300 px-3 py-1.5 rounded-md ml-2 mb-2"
                        onPress={onNoShow}
                        disabled={isUpdatingStatus}
                        activeOpacity={0.7}
                    >
                        <XCircle size={ICON_SIZE - 2} className="text-yellow-700 mr-1.5" />
                        <Text className="text-sm font-medium text-yellow-700">No Show</Text>
                    </TouchableOpacity>
                )}
                {reservation.status !== 'cancelled' && reservation.status !== 'completed' && (
                    <TouchableOpacity
                        className="flex-row items-center bg-red-100 border border-red-300 px-3 py-1.5 rounded-md ml-2 mb-2"
                        onPress={onCancel}
                        disabled={isUpdatingStatus}
                        activeOpacity={0.7}
                    >
                        <XCircle size={ICON_SIZE - 2} className="text-red-700 mr-1.5" />
                        <Text className="text-sm font-medium text-red-700">Cancel</Text>
                    </TouchableOpacity>
                )}
            </View>
            {isUpdatingStatus && <ActivityIndicator size="small" color="#4f46e5" className="mt-2 self-end" />}
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
        <View className="bg-white rounded-lg border border-gray-200 shadow-sm mb-4 overflow-hidden">
            {/* Header Section */}
            <TouchableOpacity
                className="flex-row items-center justify-between p-4"
                onPress={onToggleDetails}
                activeOpacity={0.7}
            >
                <View className="flex-1 mr-3">
                    {/* Date and Time */}
                    <View className="flex-row items-center mb-2">
                        <Calendar size={ICON_SIZE} className={`${ICON_COLOR} mr-2`} />
                        <Text className="text-base font-semibold text-gray-800">
                            {format(reservationDate, 'EEE, MMM d, yyyy')}
                        </Text>
                        <Text className="text-base text-gray-600 ml-1">
                            at {format(reservationDate, 'h:mm a')}
                        </Text>
                    </View>

                    {/* Customer and Party Size */}
                    <View className="flex-row items-center mb-2.5">
                        <Users size={ICON_SIZE} className={`${ICON_COLOR} mr-2`} />
                        <Text className="text-sm text-gray-700 flex-shrink" numberOfLines={1}>
                            {reservation.customer.name || 'Unnamed Customer'}
                            <Text className="text-gray-500">
                                {' '}· {reservation.party_size} guest{reservation.party_size === 1 ? '' : 's'}
                            </Text>
                        </Text>
                    </View>

                    {/* Status and Seat Type Badges */}
                    <View className="flex-row flex-wrap items-center">
                        <View
                            // Use template literal for dynamic classes based on status
                            className={`
                                flex-row items-center px-2.5 py-0.5 rounded-full mr-2 mb-1 border
                                ${statusStyle.bg} ${statusStyle.border}
                            `}
                        >
                            <Text
                                // Use template literal for dynamic text color
                                className={`
                                    text-xs font-medium capitalize
                                    ${statusStyle.text}
                                `}
                            >
                                {reservation.status.replace('_', ' ')}
                            </Text>
                        </View>
                        <View className="flex-row items-center bg-indigo-100 px-2.5 py-0.5 rounded-full mb-1 border border-indigo-200">
                            <Utensils size={ICON_SIZE - 4} className="text-indigo-700 mr-1" />
                            <Text className="text-xs font-medium text-indigo-700">
                                {SEAT_TYPE_LABELS[reservation.seat_type]}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Expand Icon */}
                <View>
                    {isExpanded ? (
                        <ChevronUp size={20} className="text-gray-500" />
                    ) : (
                        <ChevronDown size={20} className="text-gray-500" />
                    )}
                </View>
            </TouchableOpacity>

            {/* Expanded Details Section */}
            {isExpanded && <ReservationDetails reservation={reservation} {...detailProps} />}
        </View>
    );
};

// --- Status Components ---

const LoadingIndicator: React.FC<{ message?: string }> = ({ message = "Loading reservations..." }) => (
    <View className="flex-1 justify-center items-center p-4 bg-gray-50">
        <ActivityIndicator size="large" color="#4f46e5" />
        <Text className="mt-3 text-base text-gray-600">{message}</Text>
    </View>
);

const ErrorDisplay: React.FC<{ error: Error | null; onRetry: () => void }> = ({ error, onRetry }) => (
    <View className="flex-1 justify-center items-center p-6 bg-red-50">
        <AlertCircle size={48} className="text-red-500" />
        <Text className="mt-4 text-lg font-semibold text-red-800">
            Failed to load reservations
        </Text>
        <Text className="mt-2 text-sm text-red-700 text-center">
            {error instanceof Error ? error.message : 'An unknown error occurred'}
        </Text>
        <TouchableOpacity
            className="mt-6 bg-red-600 px-5 py-2 rounded-lg shadow-sm"
            onPress={onRetry}
            activeOpacity={0.8}
        >
            <Text className="text-white font-medium">Retry</Text>
        </TouchableOpacity>
    </View>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
    <View className="flex-1 justify-center items-center p-8 bg-gray-50 mt-4">
        <Calendar size={48} className="text-gray-400" />
        <Text className="mt-4 text-lg font-semibold text-gray-700">
            No Reservations Found
        </Text>
        <Text className="mt-2 text-sm text-gray-500 text-center max-w-xs">
            {message}
        </Text>
    </View>
);


// --- Main Screen Component ---

export default function ReservationsScreen() {
    const { barId } = useLocalSearchParams<{ barId: string }>();
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
        return <SafeAreaView className="flex-1"><LoadingIndicator /></SafeAreaView>;
    }

    if (reservationsError && !reservations) { // Show error only if there's no cached data
        return <SafeAreaView className="flex-1"><ErrorDisplay error={reservationsError} onRetry={refetchReservations} /></SafeAreaView>;
    }

    const getEmptyStateMessage = () => {
        if (statusFilter !== 'all' || dateFilter !== 'upcoming') {
            return "Try adjusting your filters or checking different date ranges to find reservations.";
        }
        return "There are no upcoming reservations matching the current filters.";
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-100">
            {/* Header */}
            <View className="p-4 bg-white border-b border-gray-200 shadow-sm">
                <Text className="text-2xl font-bold text-gray-800">
                    Reservations
                </Text>
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
                    contentContainerStyle={{ flexGrow: 1 }} // Ensure container grows for centering
                     refreshControl={ // Allow refresh even when empty
                        <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#4f46e5"/>
                    }
                    // Apply className directly if needed, e.g., for background
                    // className="bg-gray-50"
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
                            // Pass drink data/state only if expanded for potential optimization
                            reservationDrinks={selectedReservation === item.id ? reservationDrinks : undefined}
                            isLoadingDrinks={selectedReservation === item.id && isLoadingDrinks}
                            isUpdatingStatus={updateReservationStatus.isPending && updateReservationStatus.variables?.reservationId === item.id}
                        />
                    )}
                    // Use contentContainerClassName for FlatList content styling
                    contentContainerClassName="p-4"
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#4f46e5"/>
                    }
                />
            )}
        </SafeAreaView>
    );
}