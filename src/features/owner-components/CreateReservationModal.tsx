import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import {
  Search,
  CheckCircle,
  Calendar,
  ChevronDown,
  X,
} from 'lucide-react-native';
import { format, parseISO, addHours } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import type { Database } from '@/src/lib/database.types';

// Type definitions needed within this component
type SeatOption = Database['public']['Tables']['seat_options']['Row'];
type SeatType = Database['public']['Enums']['seat_option_type'];

// Constants needed
const SEAT_TYPE_LABELS = {
  bar: 'Bar',
  table: 'Table',
  vip: 'VIP',
};

// Props type for the modal
export type CreateReservationModalProps = {
  isVisible: boolean;
  onClose: () => void;
  seatOptions: SeatOption[];
  isLoading: boolean;
  onCreate: (reservation: {
    customer_id: string;
    party_size: number;
    reservation_date: string;
    seat_type: SeatType;
    special_requests?: string;
  }) => void;
  barId: string; // Keep barId if needed for internal logic, like fetching drinks (though removed now)
};

// The Modal Component
export const CreateReservationModal: React.FC<CreateReservationModalProps> = ({
  isVisible,
  onClose,
  seatOptions,
  isLoading,
  onCreate,
  barId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: string;
    name: string | null;
    email: string | null;
  } | null>(null);
  const [partySize, setPartySize] = useState('2');
  const [reservationDate, setReservationDate] = useState(
    addHours(new Date(), 1).toISOString()
  );
  const [selectedSeatType, setSelectedSeatType] = useState<SeatType | ''>('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showSeatOptions, setShowSeatOptions] = useState(false);

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['customer_search', searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 3) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, role')
        .or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .eq('role', 'customer')
        .limit(5);

      if (error) throw error;
      return data;
    },
    enabled: showCustomerSearch && searchQuery.length >= 3,
  });

  const handleSelectCustomer = (customer: {
    id: string;
    name: string | null;
    email: string | null;
  }) => {
    setSelectedCustomer(customer);
    setShowCustomerSearch(false);
  };

  const handleSelectSeatType = (seatType: SeatType) => {
    setSelectedSeatType(seatType);
    setShowSeatOptions(false);
  };

  const handleCreateReservation = () => {
    // Validate form
    if (!selectedCustomer) {
      Alert.alert('Error', 'Please select a customer');
      return;
    }

    if (!selectedSeatType) {
      Alert.alert('Error', 'Please select a seat type');
      return;
    }

    const partySizeNum = parseInt(partySize, 10);
    if (isNaN(partySizeNum) || partySizeNum < 1) {
      Alert.alert('Error', 'Please enter a valid party size');
      return;
    }

    // Find seat option for validation
    const selectedSeatOption = seatOptions.find(
      (option) => option.type === selectedSeatType
    );
    if (selectedSeatOption) {
      if (partySizeNum < selectedSeatOption.min_people) {
        Alert.alert(
          'Error',
          `This seat type requires at least ${selectedSeatOption.min_people} people`
        );
        return;
      }

      if (partySizeNum > selectedSeatOption.max_people) {
        Alert.alert(
          'Error',
          `This seat type can accommodate at most ${selectedSeatOption.max_people} people`
        );
        return;
      }
    }

    // Create reservation
    onCreate({
      customer_id: selectedCustomer.id,
      party_size: partySizeNum,
      reservation_date: reservationDate,
      seat_type: selectedSeatType,
      special_requests: specialRequests || undefined,
    });
  };

  const handleClose = () => {
    // Reset form
    setSearchQuery('');
    setSelectedCustomer(null);
    setPartySize('2');
    setReservationDate(addHours(new Date(), 1).toISOString());
    setSelectedSeatType('');
    setSpecialRequests('');
    setShowCustomerSearch(false);
    setShowSeatOptions(false);

    onClose();
  };

  // Format date for display
  const formattedDate = useMemo(() => {
    try {
      const date = parseISO(reservationDate);
      return format(date, 'MMM d, yyyy h:mm a');
    } catch (error) {
      return 'Invalid date';
    }
  }, [reservationDate]);

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      onRequestClose={handleClose}
      transparent={false}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Create New Reservation</Text>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.modalCloseButton}
          >
            <X size={24} color="#6b7280" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          {/* Customer Selection */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Customer</Text>
            {selectedCustomer ? (
              <View style={styles.selectedCustomerContainer}>
                <View style={styles.selectedCustomerInfo}>
                  <Text style={styles.selectedCustomerName}>
                    {selectedCustomer.name || 'Unnamed Customer'}
                  </Text>
                  <Text style={styles.selectedCustomerEmail}>
                    {selectedCustomer.email || 'No email'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.changeCustomerButton}
                  onPress={() => {
                    setSelectedCustomer(null);
                    setShowCustomerSearch(true);
                  }}
                >
                  <Text style={styles.changeCustomerButtonText}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.selectCustomerButton}
                onPress={() => setShowCustomerSearch(true)}
              >
                <Search size={18} color="#4f46e5" />
                <Text style={styles.selectCustomerButtonText}>
                  Search for a customer
                </Text>
              </TouchableOpacity>
            )}

            {showCustomerSearch && (
              <View style={styles.searchContainer}>
                <View style={styles.searchInputContainer}>
                  <Search size={18} color="#6b7280" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name or email (min 3 chars)"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                  />
                </View>

                {isSearching && (
                  <ActivityIndicator
                    size="small"
                    color="#4f46e5"
                    style={styles.searchLoading}
                  />
                )}

                {searchResults && searchResults.length > 0 ? (
                  <View style={styles.searchResults}>
                    {searchResults.map((customer) => (
                      <TouchableOpacity
                        key={customer.id}
                        style={styles.searchResultItem}
                        onPress={() => handleSelectCustomer(customer)}
                      >
                        <View>
                          <Text style={styles.searchResultName}>
                            {customer.name || 'Unnamed Customer'}
                          </Text>
                          <Text style={styles.searchResultEmail}>
                            {customer.email || 'No email'}
                          </Text>
                        </View>
                        <CheckCircle size={18} color="#4f46e5" />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : searchQuery.length >= 3 && !isSearching ? (
                  <Text style={styles.noResultsText}>No customers found</Text>
                ) : null}
              </View>
            )}
          </View>

          {/* Party Size */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Party Size</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Number of people"
              value={partySize}
              onChangeText={setPartySize}
              keyboardType="number-pad"
            />
          </View>

          {/* Date & Time Picker */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Date & Time</Text>
            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => {
                // For a real implementation, you would use a date picker here
                // For simplicity, we're just using a placeholder
                Alert.alert(
                  'Date & Time Selection',
                  'In a real implementation, this would open a date & time picker. For now, using default time (1 hour from now).'
                );
              }}
            >
              <Calendar size={18} color="#4b5563" style={styles.dateTimeIcon} />
              <Text style={styles.dateTimeText}>{formattedDate}</Text>
            </TouchableOpacity>
          </View>

          {/* Seat Type */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Seat Type</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setShowSeatOptions(!showSeatOptions)}
            >
              <Text style={styles.dropdownButtonText}>
                {selectedSeatType
                  ? SEAT_TYPE_LABELS[selectedSeatType as keyof typeof SEAT_TYPE_LABELS]
                  : 'Select seat type'}
              </Text>
              <ChevronDown size={18} color="#4b5563" />
            </TouchableOpacity>

            {showSeatOptions && (
              <View style={styles.dropdownOptions}>
                {seatOptions.length > 0 ? (
                  seatOptions.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={styles.dropdownOption}
                      onPress={() => handleSelectSeatType(option.type)}
                    >
                      <Text style={styles.dropdownOptionText}>
                        {SEAT_TYPE_LABELS[option.type as keyof typeof SEAT_TYPE_LABELS]}{' '}
                        ({option.min_people}-{option.max_people} people)
                      </Text>
                      {selectedSeatType === option.type && (
                        <CheckCircle size={18} color="#4f46e5" />
                      )}
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={styles.noOptionsText}>
                    No seat options available
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Special Requests */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Special Requests (Optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Enter any special requests or notes"
              value={specialRequests}
              onChangeText={setSpecialRequests}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={styles.formCancelButton}
            onPress={handleClose}
          >
            <Text style={styles.formCancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.createReservationButton,
              isLoading && styles.disabledButton,
            ]}
            onPress={handleCreateReservation}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.createReservationButtonText}>
                Create Reservation
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

// Styles needed for the modal
const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1f2937',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  selectCustomerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectCustomerButtonText: {
    marginLeft: 8,
    color: '#4b5563',
    fontSize: 16,
  },
  selectedCustomerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectedCustomerInfo: {
    flex: 1,
    marginRight: 12,
  },
  selectedCustomerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  selectedCustomerEmail: {
    fontSize: 14,
    color: '#6b7280',
  },
  changeCustomerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 6,
  },
  changeCustomerButtonText: {
    color: '#4b5563',
    fontWeight: '600',
  },
  searchContainer: {
    marginTop: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: '#1f2937',
    marginLeft: 8,
  },
  searchLoading: {
    marginVertical: 16,
  },
  searchResults: {
    maxHeight: 150, // Limit height to prevent oversized list
  },
  searchResultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  searchResultName: {
    fontSize: 15,
    color: '#1f2937',
  },
  searchResultEmail: {
    fontSize: 13,
    color: '#6b7280',
  },
  noResultsText: {
    textAlign: 'center',
    color: '#6b7280',
    paddingVertical: 16,
    fontStyle: 'italic',
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dateTimeIcon: {
    marginRight: 8,
  },
  dateTimeText: {
    fontSize: 16,
    color: '#1f2937',
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dropdownButtonText: {
    fontSize: 16,
    color: '#1f2937',
  },
  dropdownOptions: {
    marginTop: 4,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    maxHeight: 150,
  },
  dropdownOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dropdownOptionText: {
    fontSize: 16,
    color: '#1f2937',
  },
  noOptionsText: {
    textAlign: 'center',
    color: '#6b7280',
    paddingVertical: 16,
    fontStyle: 'italic',
  },
  formCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  formCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4b5563',
  },
  createReservationButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createReservationButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  disabledButton: {
    opacity: 0.7,
  },
});
