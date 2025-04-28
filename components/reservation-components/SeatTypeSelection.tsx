import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient'; // Import LinearGradient

// Import necessary icons (ensure names match usage)
import { Sofa, BarChart3, Crown, Users, AlertCircle, XCircle, Clock, Wine } from 'lucide-react-native';
// Define LucideProps type if not globally available (sometimes needed)
import type { LucideProps } from 'lucide-react-native';

// Define the structure expected for each seat type's details
export type SeatDetails = {
  type: SeatOptionType;
  remainingCount: number;
  minPeople: number;
  maxPeople: number;
  restrictions?: {
    min_bottles?: number;
    min_consumption?: number;
    [key: string]: unknown;
  };
};

// Define the possible seat type values
type SeatOptionType = 'table' | 'bar' | 'vip';

// Define the props the component expects
interface SeatTypeSelectionProps {
  seatDetails: SeatDetails[] | null; // Array of details for ENABLED types, or null
  isLoading: boolean;
  error: string | null;
  selectedSeatType: SeatOptionType | null;
  partySize: number;
  onSeatTypeChange: (seatType: SeatOptionType) => void;
}

// Base configuration for ALL potential seat types (rendering icons, labels, descriptions)
// Added description based on the example structure
const allSeatOptionsConfig: {
  type: SeatOptionType;
  label: string;
  icon: React.FC<LucideProps>;
  description: string;
}[] = [
  { type: 'table', label: 'Table Service', icon: Sofa, description: 'Reserved table with dedicated service' },
  { type: 'bar', label: 'Bar Seating', icon: BarChart3, description: 'Casual seating at our premium bar' },
  { type: 'vip', label: 'VIP Experience', icon: Crown, description: 'Exclusive area with premium service' },
];

const SeatTypeSelection: React.FC<SeatTypeSelectionProps> = ({
  seatDetails,
  isLoading,
  error,
  selectedSeatType,
  partySize,
  onSeatTypeChange,
}) => {

  // --- Loading State ---
  if (isLoading) {
    return (
      // Adapted from example's loading state styles
      <View style={styles.loadingContainer}>
        <View style={styles.loadingIndicator}>
          {/* Using ActivityIndicator instead of just text */}
          <ActivityIndicator size="large" color="#ff4d6d" />
          <Text style={styles.loadingText}>Checking seat availability...</Text>
        </View>
      </View>
    );
  }

  // --- Error State ---
  if (error) {
    return (
       // Using LinearGradient for error background as in example
      <LinearGradient
        colors={['rgba(220, 38, 38, 0.1)', 'rgba(220, 38, 38, 0.05)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.errorContainer}
      >
        <AlertCircle color="#ef4444" size={24} />
        <Text style={styles.errorText}>Error loading seat types: {error}</Text>
      </LinearGradient>
    );
  }

  // --- Render Seat Options ---
  return (
    <View style={styles.container}>
      {/* Header with Gradient like the example */}
      <LinearGradient
        colors={['rgba(255, 77, 109, 0.15)', 'rgba(255, 77, 109, 0.05)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerContainer}
      >
        <Text style={styles.title}>Choose Your Seating Area</Text>
        <Text style={styles.subtitle}>Select from available options based on your party</Text>
      </LinearGradient>

      <View style={styles.optionsContainer}>
        {allSeatOptionsConfig.map((baseOption) => {
          // Find details fetched from API for this type
          const detail = seatDetails?.find(d => d.type === baseOption.type);

          // --- Determine Status (Keep original logic) ---
          const isOfferedByBar = !!detail;
          const remainingSeats = detail?.remainingCount ?? 0;
          const minPeople = detail?.minPeople ?? 0;
          const maxPeople = detail?.maxPeople ?? 0;
          const fitsPartySize = isOfferedByBar ? (partySize >= minPeople && partySize <= maxPeople) : false;
          const hasSeatsLeft = isOfferedByBar && remainingSeats > 0;

          const isDisabled = !isOfferedByBar || !hasSeatsLeft || !fitsPartySize;
          const isSelected = selectedSeatType === baseOption.type;
          const IconComponent = baseOption.icon;

          // --- Determine Status Info based on original logic, mapping to example's structure ---
          let statusInfo = {
            text: 'Not Offered',
            color: '#6b7280', // text-gray-500
            icon: XCircle
          };

          if (isOfferedByBar) {
            if (hasSeatsLeft) {
              if (fitsPartySize) {
                // Available and fits party size
                statusInfo = {
                  text: `${remainingSeats} Left`, // Simplified text
                  color: '#22c55e', // text-green-400
                  icon: Clock, // Use Clock icon for available
                };
              } else {
                // Available but doesn't fit party size
                statusInfo = {
                  text: `Requires ${minPeople}-${maxPeople} people`, // Clearer text
                  color: '#f59e0b', // text-amber-400
                  icon: AlertCircle, // Use Alert icon for warning
                };
              }
            } else {
              // Offered but no seats left
              statusInfo = {
                text: 'Fully Booked',
                color: '#ef4444', // text-red-400
                icon: XCircle,
              };
            }
          }
           // Note: The 'isDisabled' state (which combines multiple conditions)
           // will be applied to the Pressable's style directly.
           // statusInfo reflects the specific reason *if* it's offered.

          // --- Compose requirements string if restrictions exist ---
          let requirementsText = '';
          let requirements = [];
          if (detail?.restrictions) {
            const { min_bottles, min_consumption } = detail.restrictions;
            if (typeof min_bottles === 'number' && min_bottles > 0) {
                requirements.push({ type: 'bottle', value: min_bottles });
                requirementsText += `Min. ${min_bottles} bottle${min_bottles > 1 ? 's' : ''}`; // Keep for potential later use if needed
            }
            if (typeof min_consumption === 'number' && min_consumption > 0) {
                requirements.push({ type: 'spend', value: min_consumption });
                 if (requirementsText) requirementsText += ' · '; // Keep for potential later use
                 requirementsText += `Min. spend €${min_consumption}`; // Keep for potential later use
            }
          }

          return (
            <Pressable
              key={baseOption.type}
              // Apply base, conditional selected, and conditional disabled styles
              style={[
                styles.optionCard,
                isSelected && styles.selectedCard, // Apply selected styles
                isDisabled && styles.disabledCard // Apply disabled styles (includes opacity)
              ]}
              onPress={() => !isDisabled && onSeatTypeChange(baseOption.type)}
              disabled={isDisabled}
            >
              {/* Card Header Structure from Example */}
              <View style={styles.cardHeader}>
                <IconComponent
                  size={28} // Example size
                  // Example conditional coloring
                  color={isDisabled ? '#6b7280' : (isSelected ? '#ff4d6d' : '#e0e0e0')}
                  strokeWidth={1.5} // Example stroke width
                />
                <View style={styles.headerText}>
                  <Text style={[
                    styles.optionTitle,
                    // Example conditional text styling
                    isSelected && styles.selectedTitle,
                    isDisabled && styles.disabledText // Use disabledText style for title too
                  ]}>
                    {baseOption.label}
                  </Text>
                  {/* Added Description */}
                  <Text style={[
                     styles.optionDescription,
                     isDisabled && styles.disabledText // Also dim description when disabled
                  ]}>
                    {baseOption.description}
                  </Text>
                </View>
              </View>

              {/* Card Footer Structure from Example */}
              {(isOfferedByBar || requirements.length > 0) && ( // Only show footer if offered or has restrictions
                <View style={styles.cardFooter}>
                    {/* Status Info */}
                    <View style={styles.statusContainer}>
                      <statusInfo.icon size={14} color={isDisabled ? '#6b7280' : statusInfo.color} />
                      <Text style={[
                        styles.statusText,
                        { color: isDisabled ? '#6b7280' : statusInfo.color } // Apply color dynamically
                      ]}>
                        {statusInfo.text}
                      </Text>
                    </View>

                    {/* Min/Max People Info (Show if offered, separate from status) */}
                    {isOfferedByBar && !fitsPartySize && !hasSeatsLeft && ( // Show only if it's the reason for being disabled or relevant warning
                      <View style={styles.peopleInfoContainer}>
                          <Users size={14} color={isDisabled ? '#6b7280' : '#a0a0a0'} />
                          <Text style={[styles.peopleInfoText, isDisabled && styles.disabledText]}>
                              Fits {minPeople}-{maxPeople} People
                          </Text>
                      </View>
                    )}
                    {isOfferedByBar && fitsPartySize && hasSeatsLeft && ( // Show capacity even if available
                        <View style={styles.peopleInfoContainer}>
                          <Users size={14} color="#a0a0a0" />
                          <Text style={styles.peopleInfoText}>Capacity: {minPeople}-{maxPeople}</Text>
                        </View>
                    )}


                    {/* Restrictions Info (Using example's structure) */}
                    {requirements.length > 0 && (
                      <View style={styles.restrictionsContainer}>
                        {requirements.map((req, index) => (
                           <View key={index} style={styles.restriction}>
                             {req.type === 'bottle' && <Wine size={14} color={isDisabled ? '#a1626f' : "#fb7185"} />}
                             <Text style={[styles.restrictionText, isDisabled && styles.disabledRestrictionText]}>
                               {req.type === 'bottle' ? `Min ${req.value} Bottle${req.value > 1 ? 's' : ''}` : `Min €${req.value} Spend`}
                             </Text>
                           </View>
                        ))}
                      </View>
                    )}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

// StyleSheet copied and adapted from the example
const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#121212', // Added a subtle background for the whole container
  },
  headerContainer: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    // Gradient is applied via LinearGradient component props
  },
  title: {
    fontSize: 24,
    fontWeight: '600', // Use string for fontWeight
    color: '#ffffff',
    marginBottom: 8,
    // Text shadow might not render consistently across platforms, keep if desired
    textShadowColor: 'rgba(255, 77, 109, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  optionsContainer: {
    gap: 16, // Use gap for spacing between cards
  },
  optionCard: {
    borderRadius: 16,
    padding: 20,
    backgroundColor: 'rgba(31, 31, 39, 0.8)', // Slightly less transparent base
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      web: {
        transition: 'all 0.2s ease',
      },
    }),
  },
  selectedCard: {
    backgroundColor: 'rgba(255, 77, 109, 0.15)',
    borderColor: '#ff4d6d',
    borderWidth: 1.5, // Make border slightly thicker when selected
  },
  disabledCard: {
    opacity: 0.5, // Apply opacity to the whole card
    backgroundColor: 'rgba(55, 55, 63, 0.6)', // Darker disabled background
    borderColor: 'rgba(100, 100, 100, 0.3)',
     ...Platform.select({
      web: {
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start', // Align items to the start (top)
    marginBottom: 16,
  },
  headerText: {
    marginLeft: 16,
    flex: 1, // Take remaining space
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  selectedTitle: {
    color: '#ff4d6d', // Selected title color from example
  },
  optionDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 18, // Improve readability
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
    gap: 10, // Space between footer items
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8, // Space between icon and text
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    // Color is applied dynamically in the component
  },
   peopleInfoContainer: { // Added style for Min/Max people info
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  peopleInfoText: { // Added style for Min/Max people text
    fontSize: 13,
    color: '#a0a0a0', // Grayish color for secondary info
    fontWeight: '400',
  },
  restrictionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap', // Allow wrapping
    gap: 12, // Horizontal gap
    rowGap: 6, // Vertical gap if wraps
  },
  restriction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6, // Space between icon and text
  },
  restrictionText: {
    fontSize: 13,
    color: '#fb7185', // Pinkish-red from example
    fontWeight: '500',
  },
  disabledText: { // Style for generic disabled text (applied to title, description etc.)
    color: '#6b7280', // Muted gray for disabled text
  },
  disabledRestrictionText: { // Specific style for disabled restriction text
     color: '#a1626f', // More muted pink/red
  },
  loadingContainer: {
    // Adjusted from example to center content better
    flex: 1, // Take available space if needed
    alignItems: 'center',
    justifyContent: 'center', // Center vertically and horizontally
    paddingVertical: 40, // Add padding
  },
  loadingIndicator: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 77, 109, 0.1)',
    alignItems: 'center', // Center items inside the indicator box
    gap: 12, // Space between indicator and text
  },
  loadingText: {
    color: '#ff4d6d',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 8, // Add space above text
  },
  errorContainer: {
    padding: 20,
    borderRadius: 12,
    flexDirection: 'row', // Align icon and text horizontally
    alignItems: 'center',
    gap: 12, // Space between icon and text
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.3)', // Slightly stronger border
    // Gradient is applied via LinearGradient component props
    margin: 16, // Add margin so it doesn't touch edges
  },
  errorText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '500',
    flex: 1, // Allow text to wrap
  },
});

export default SeatTypeSelection;