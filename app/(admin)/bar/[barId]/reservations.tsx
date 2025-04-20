import React, { useState, useMemo, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator, 
  ScrollView, 
  Alert,
  FlatList,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { 
  Calendar, 
  Users, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Info,
  Filter,
  Plus,
} from 'lucide-react-native';
import { format, parseISO, isToday, isAfter, isBefore} from 'date-fns';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { useToast } from '@/src/components/general/Toast';
import type { Database } from '@/src/lib/database.types';
import { CreateReservationModal } from '@/src/features/owner-components/CreateReservationModal';

// Type definitions
type Reservation = Database['public']['Tables']['reservations']['Row'] & {
  customer: {
    id: string;
    name: string | null;
    email: string | null;
  };
  drinks?: ReservationDrink[];
};

type ReservationDrink = Database['public']['Tables']['reservation_drinks']['Row'];

type DrinkOption = Database['public']['Tables']['drink_options']['Row'];

type ReservationStatus = Database['public']['Enums']['reservation_status'];
type SeatType = Database['public']['Enums']['seat_option_type'];
type DrinkOptionType = Database['public']['Enums']['drink_option_type'];
type SeatOption = Database['public']['Tables']['seat_options']['Row'];

// Constants
const STATUS_COLORS = {
  confirmed: {
    bg: '#dcfce7', // Green 100
    text: '#15803d', // Green 700
  },
  cancelled: {
    bg: '#fee2e2', // Red 100
    text: '#b91c1c', // Red 700
  },
  completed: {
    bg: '#dbeafe', // Blue 100
    text: '#1d4ed8', // Blue 700
  },
  no_show: {
    bg: '#fef3c7', // Yellow 100
    text: '#b45309', // Yellow 700
  },
};

const SEAT_TYPE_LABELS = {
  bar: 'Bar',
  table: 'Table',
  vip: 'VIP',
};

// Main component
export default function ReservationsScreen() {
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const profile = useAuthStore((s) => s.profile);
  const toast = useToast();
  const queryClient = useQueryClient();
  
  // State for filtering
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | 'all'>('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'upcoming' | 'past' | 'all'>('upcoming');
  const [selectedReservation, setSelectedReservation] = useState<string | null>(null);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  
  // Fetch reservations
  const { 
    data: reservations, 
    isLoading: isLoadingReservations,
    error: reservationsError,
    refetch: refetchReservations
  } = useQuery({
    queryKey: ['reservations', barId],
    queryFn: async () => {
      if (!barId) throw new Error('Bar ID is required');
      
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          *,
          customer:profiles!reservations_customer_id_fkey(id, name, email)
        `)
        .eq('bar_id', barId)
        .order('reservation_date', { ascending: true });
      
      if (error) throw error;
      return data as Reservation[];
    },
    enabled: !!barId && !!profile,
  });
  
  // Fetch reservation drinks when a reservation is selected
  const {
    data: reservationDrinks,
    isLoading: isLoadingDrinks,
  } = useQuery({
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
    enabled: !!selectedReservation,
  });
  
  // Fetch seat options for the bar
  const {
    data: seatOptions,
    isLoading: isLoadingSeatOptions,
  } = useQuery({
    queryKey: ['seat_options', barId],
    queryFn: async () => {
      if (!barId) return [];
      
      const { data, error } = await supabase
        .from('seat_options')
        .select('*')
        .eq('bar_id', barId)
        .eq('enabled', true);
      
      if (error) throw error;
      return data as SeatOption[];
    },
    enabled: !!barId,
  });
  
  // Update reservation status mutation
  const updateReservationStatus = useMutation({
    mutationFn: async ({ 
      reservationId, 
      status, 
      checkedInAt = null 
    }: { 
      reservationId: string; 
      status: ReservationStatus; 
      checkedInAt?: string | null;
    }) => {
      const { error } = await supabase
        .from('reservations')
        .update({ 
          status, 
          ...(checkedInAt ? { checked_in_at: checkedInAt } : {})
        })
        .eq('id', reservationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations', barId] });
      toast.show({ type: 'success', text1: 'Reservation updated successfully' });
    },
    onError: (error) => {
      toast.show({ 
        type: 'error', 
        text1: 'Failed to update reservation', 
        text2: error instanceof Error ? error.message : 'Unknown error' 
      });
    },
  });
  
  // Create reservation mutation
  const createReservation = useMutation({
    mutationFn: async (newReservation: {
      customer_id: string;
      party_size: number;
      reservation_date: string;
      seat_type: SeatType;
      special_requests?: string;
    }) => {
      if (!barId) throw new Error('Bar ID is required');
      
      const { data, error } = await supabase
        .from('reservations')
        .insert({
          ...newReservation,
          bar_id: barId,
          status: 'confirmed' as ReservationStatus,
        })
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations', barId] });
      toast.show({ type: 'success', text1: 'Reservation created successfully' });
      setIsCreateModalVisible(false);
    },
    onError: (error) => {
      toast.show({ 
        type: 'error', 
        text1: 'Failed to create reservation', 
        text2: error instanceof Error ? error.message : 'Unknown error' 
      });
    },
  });
  
  // Filter reservations
  const filteredReservations = useMemo(() => {
    if (!reservations) return [];
    
    return reservations.filter(reservation => {
      const reservationDate = parseISO(reservation.reservation_date);
      const today = new Date();
      
      // Status filter
      if (statusFilter !== 'all' && reservation.status !== statusFilter) {
        return false;
      }
      
      // Date filter
      if (dateFilter === 'today' && !isToday(reservationDate)) {
        return false;
      } else if (dateFilter === 'upcoming' && !isAfter(reservationDate, today)) {
        return false;
      } else if (dateFilter === 'past' && !isBefore(reservationDate, today)) {
        return false;
      }
      
      return true;
    });
  }, [reservations, statusFilter, dateFilter]);
  
  // Handle check-in
  const handleCheckIn = (reservation: Reservation) => {
    if (reservation.status === 'completed') {
      toast.show({ 
        type: 'info', 
        text1: 'Already checked in', 
        text2: 'This reservation is already marked as completed.' 
      });
      return;
    }
    
    if (reservation.status === 'cancelled') {
      Alert.alert(
        'Reservation Cancelled',
        'This reservation was cancelled. Do you want to mark it as completed anyway?',
        [
          { text: 'No', style: 'cancel' },
          { 
            text: 'Yes', 
            onPress: () => updateReservationStatus.mutate({ 
              reservationId: reservation.id, 
              status: 'completed',
              checkedInAt: new Date().toISOString()
            })
          }
        ]
      );
      return;
    }
    
    updateReservationStatus.mutate({ 
      reservationId: reservation.id, 
      status: 'completed',
      checkedInAt: new Date().toISOString()
    });
  };
  
  // Handle mark as no-show
  const handleNoShow = (reservation: Reservation) => {
    if (reservation.status === 'no_show') {
      toast.show({ 
        type: 'info', 
        text1: 'Already marked as no-show', 
        text2: 'This reservation is already marked as no-show.' 
      });
      return;
    }
    
    Alert.alert(
      'Mark as No-Show',
      'Are you sure you want to mark this reservation as no-show?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Mark as No-Show', 
          style: 'destructive',
          onPress: () => updateReservationStatus.mutate({ 
            reservationId: reservation.id, 
            status: 'no_show' 
          })
        }
      ]
    );
  };
  
  // Handle cancel reservation
  const handleCancel = (reservation: Reservation) => {
    if (reservation.status === 'cancelled') {
      toast.show({ 
        type: 'info', 
        text1: 'Already cancelled', 
        text2: 'This reservation is already cancelled.' 
      });
      return;
    }
    
    Alert.alert(
      'Cancel Reservation',
      'Are you sure you want to cancel this reservation?',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes, Cancel', 
          style: 'destructive',
          onPress: () => updateReservationStatus.mutate({ 
            reservationId: reservation.id, 
            status: 'cancelled' 
          })
        }
      ]
    );
  };
  
  // Handle view details
  const handleViewDetails = (reservationId: string) => {
    setSelectedReservation(prevId => prevId === reservationId ? null : reservationId);
  };
  
  // Render reservation item
  const renderReservationItem = ({ item }: { item: Reservation }) => {
    const isExpanded = selectedReservation === item.id;
    const reservationDate = parseISO(item.reservation_date);
    const statusColor = STATUS_COLORS[item.status as keyof typeof STATUS_COLORS];
    
    return (
      <View style={styles.reservationCard}>
        <TouchableOpacity 
          style={styles.reservationHeader}
          onPress={() => handleViewDetails(item.id)}
        >
          <View style={styles.reservationInfo}>
            <View style={styles.dateTimeContainer}>
              <Calendar size={16} color="#4b5563" style={styles.icon} />
              <Text style={styles.dateTimeText}>
                {format(reservationDate, 'MMM d, yyyy')} at {format(reservationDate, 'h:mm a')}
              </Text>
            </View>
            
            <View style={styles.customerContainer}>
              <Users size={16} color="#4b5563" style={styles.icon} />
              <Text style={styles.customerText}>
                {item.customer.name || 'Unnamed Customer'} · {item.party_size} {item.party_size === 1 ? 'person' : 'people'}
              </Text>
            </View>
            
            <View style={styles.detailsRow}>
              <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
                <Text style={[styles.statusText, { color: statusColor.text }]}>
                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </Text>
              </View>
              
              <View style={styles.seatTypeBadge}>
                <Text style={styles.seatTypeText}>
                  {SEAT_TYPE_LABELS[item.seat_type as keyof typeof SEAT_TYPE_LABELS]}
                </Text>
              </View>
            </View>
          </View>
          
          <View style={styles.expandIconContainer}>
            <Info size={20} color="#6b7280" />
          </View>
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={styles.expandedContent}>
            {item.special_requests && (
              <View style={styles.specialRequestsContainer}>
                <Text style={styles.sectionTitle}>Special Requests:</Text>
                <Text style={styles.specialRequestsText}>{item.special_requests}</Text>
              </View>
            )}
            
            {isLoadingDrinks ? (
              <ActivityIndicator size="small" color="#4f46e5" style={styles.loadingIndicator} />
            ) : reservationDrinks && reservationDrinks.length > 0 ? (
              <View style={styles.drinksContainer}>
                <Text style={styles.sectionTitle}>Pre-ordered Drinks:</Text>
                {reservationDrinks.map((drink) => (
                  <View key={drink.id} style={styles.drinkItem}>
                    <Text style={styles.drinkName}>
                      {drink.quantity}x {drink.drink_name_at_booking}
                    </Text>
                    <Text style={styles.drinkPrice}>
                      ${(drink.price_at_booking * drink.quantity).toFixed(2)}
                    </Text>
                  </View>
                ))}
                <View style={styles.drinkTotalContainer}>
                  <Text style={styles.drinkTotalText}>
                    Total: ${reservationDrinks.reduce((total, drink) => 
                      total + (drink.price_at_booking * drink.quantity), 0).toFixed(2)}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.noDrinksText}>No drinks pre-ordered</Text>
            )}
            
            <View style={styles.actionButtonsContainer}>
              {item.status !== 'completed' && (
                <TouchableOpacity 
                  style={[styles.actionButton, styles.checkInButton]}
                  onPress={() => handleCheckIn(item)}
                  disabled={updateReservationStatus.isPending}
                >
                  <CheckCircle size={16} color="#15803d" style={styles.actionIcon} />
                  <Text style={styles.checkInButtonText}>Check In</Text>
                </TouchableOpacity>
              )}
              
              {item.status !== 'no_show' && item.status !== 'cancelled' && (
                <TouchableOpacity 
                  style={[styles.actionButton, styles.noShowButton]}
                  onPress={() => handleNoShow(item)}
                  disabled={updateReservationStatus.isPending}
                >
                  <XCircle size={16} color="#b45309" style={styles.actionIcon} />
                  <Text style={styles.noShowButtonText}>No Show</Text>
                </TouchableOpacity>
              )}
              
              {item.status !== 'cancelled' && (
                <TouchableOpacity 
                  style={[styles.actionButton, styles.cancelButton]}
                  onPress={() => handleCancel(item)}
                  disabled={updateReservationStatus.isPending}
                >
                  <XCircle size={16} color="#b91c1c" style={styles.actionIcon} />
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };
  
  // Render filter section
  const renderFilterSection = () => (
    <View style={styles.filterContainer}>
      <Text style={styles.filterTitle}>
        <Filter size={16} color="#4b5563" /> Filters
      </Text>
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScrollContent}
      >
        <View style={styles.filterGroup}>
          <Text style={styles.filterGroupLabel}>Status:</Text>
          <View style={styles.filterButtonsRow}>
            <TouchableOpacity
              style={[
                styles.filterButton,
                statusFilter === 'all' && styles.filterButtonActive
              ]}
              onPress={() => setStatusFilter('all')}
            >
              <Text style={[
                styles.filterButtonText,
                statusFilter === 'all' && styles.filterButtonTextActive
              ]}>All</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.filterButton,
                statusFilter === 'confirmed' && styles.filterButtonActive
              ]}
              onPress={() => setStatusFilter('confirmed')}
            >
              <Text style={[
                styles.filterButtonText,
                statusFilter === 'confirmed' && styles.filterButtonTextActive
              ]}>Confirmed</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.filterButton,
                statusFilter === 'completed' && styles.filterButtonActive
              ]}
              onPress={() => setStatusFilter('completed')}
            >
              <Text style={[
                styles.filterButtonText,
                statusFilter === 'completed' && styles.filterButtonTextActive
              ]}>Completed</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.filterButton,
                statusFilter === 'cancelled' && styles.filterButtonActive
              ]}
              onPress={() => setStatusFilter('cancelled')}
            >
              <Text style={[
                styles.filterButtonText,
                statusFilter === 'cancelled' && styles.filterButtonTextActive
              ]}>Cancelled</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.filterButton,
                statusFilter === 'no_show' && styles.filterButtonActive
              ]}
              onPress={() => setStatusFilter('no_show')}
            >
              <Text style={[
                styles.filterButtonText,
                statusFilter === 'no_show' && styles.filterButtonTextActive
              ]}>No Show</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.filterDivider} />
        
        <View style={styles.filterGroup}>
          <Text style={styles.filterGroupLabel}>Date:</Text>
          <View style={styles.filterButtonsRow}>
            <TouchableOpacity
              style={[
                styles.filterButton,
                dateFilter === 'all' && styles.filterButtonActive
              ]}
              onPress={() => setDateFilter('all')}
            >
              <Text style={[
                styles.filterButtonText,
                dateFilter === 'all' && styles.filterButtonTextActive
              ]}>All</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.filterButton,
                dateFilter === 'today' && styles.filterButtonActive
              ]}
              onPress={() => setDateFilter('today')}
            >
              <Text style={[
                styles.filterButtonText,
                dateFilter === 'today' && styles.filterButtonTextActive
              ]}>Today</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.filterButton,
                dateFilter === 'upcoming' && styles.filterButtonActive
              ]}
              onPress={() => setDateFilter('upcoming')}
            >
              <Text style={[
                styles.filterButtonText,
                dateFilter === 'upcoming' && styles.filterButtonTextActive
              ]}>Upcoming</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.filterButton,
                dateFilter === 'past' && styles.filterButtonActive
              ]}
              onPress={() => setDateFilter('past')}
            >
              <Text style={[
                styles.filterButtonText,
                dateFilter === 'past' && styles.filterButtonTextActive
              ]}>Past</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
  
  // Render loading state
  if (isLoadingReservations) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={styles.loadingText}>Loading reservations...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  // Render error state
  if (reservationsError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <AlertCircle size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>Failed to load reservations</Text>
          <Text style={styles.errorMessage}>
            {reservationsError instanceof Error 
              ? reservationsError.message 
              : 'An unknown error occurred'}
          </Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={() => refetchReservations()}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reservations</Text>
        <TouchableOpacity 
          style={styles.createButton}
          onPress={() => setIsCreateModalVisible(true)}
        >
          <Plus size={18} color="#ffffff" />
          <Text style={styles.createButtonText}>New Reservation</Text>
        </TouchableOpacity>
      </View>
      
      {renderFilterSection()}
      
      {filteredReservations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Calendar size={48} color="#9ca3af" />
          <Text style={styles.emptyTitle}>No reservations found</Text>
          <Text style={styles.emptyMessage}>
            {statusFilter !== 'all' || dateFilter !== 'all'
              ? 'Try changing your filters to see more reservations.'
              : 'There are no reservations for this bar yet.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredReservations}
          renderItem={renderReservationItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
      
      <CreateReservationModal
        isVisible={isCreateModalVisible}
        onClose={() => setIsCreateModalVisible(false)}
        seatOptions={seatOptions || []}
        isLoading={isLoadingSeatOptions || createReservation.isPending}
        onCreate={createReservation.mutate}
        barId={barId}
      />
    </SafeAreaView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4f46e5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    marginLeft: 6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#4b5563',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  errorMessage: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#4f46e5',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  emptyMessage: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 300,
  },
  filterContainer: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 12,
  },
  filterScrollContent: {
    paddingRight: 16,
  },
  filterGroup: {
    marginRight: 16,
  },
  filterGroupLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  filterButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
    marginBottom: 8,
  },
  filterButtonActive: {
    backgroundColor: '#4f46e5',
  },
  filterButtonText: {
    fontSize: 13,
    color: '#4b5563',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  filterDivider: {
    width: 1,
    backgroundColor: '#e5e7eb',
    marginRight: 16,
  },
  listContent: {
    padding: 16,
  },
  reservationCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  reservationHeader: {
    flexDirection: 'row',
    padding: 16,
  },
  reservationInfo: {
    flex: 1,
  },
  dateTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    marginRight: 6,
  },
  dateTimeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  customerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  customerText: {
    fontSize: 14,
    color: '#4b5563',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  seatTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
  },
  seatTypeText: {
    fontSize: 12,
    color: '#4b5563',
  },
  expandIconContainer: {
    justifyContent: 'center',
    marginLeft: 8,
  },
  expandedContent: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  specialRequestsContainer: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 8,
  },
  specialRequestsText: {
    fontSize: 14,
    color: '#6b7280',
  },
  loadingIndicator: {
    marginVertical: 16,
  },
  drinksContainer: {
    marginBottom: 16,
  },
  drinkItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  drinkName: {
    fontSize: 14,
    color: '#4b5563',
  },
  drinkPrice: {
    fontSize: 14,
    color: '#4b5563',
    fontWeight: '600',
  },
  drinkTotalContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  drinkTotalText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  noDrinksText: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  actionIcon: {
    marginRight: 6,
  },
  checkInButton: {
    backgroundColor: '#dcfce7',
  },
  checkInButtonText: {
    color: '#15803d',
    fontWeight: '600',
  },
  noShowButton: {
    backgroundColor: '#fef3c7',
  },
  noShowButtonText: {
    color: '#b45309',
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#fee2e2',
  },
  cancelButtonText: {
    color: '#b91c1c',
    fontWeight: '600',
  },
});