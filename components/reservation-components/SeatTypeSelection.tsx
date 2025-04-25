import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
// Import necessary icons
import { Sofa, BarChart3, Crown, Users, AlertCircle, LucideProps, XCircle } from 'lucide-react-native';

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

// Base configuration for ALL potential seat types (rendering icons, labels)
const allSeatOptionsConfig: { type: SeatOptionType; label: string; icon: React.FC<LucideProps> }[] = [
  { type: 'table', label: 'Table', icon: Sofa },
  { type: 'bar', label: 'Bar Seat', icon: BarChart3 },
  { type: 'vip', label: 'VIP Area', icon: Crown },
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
      <View className="items-center justify-center py-10">
        <ActivityIndicator size="large" color="#ff4d6d" />
        <Text className="text-gray-400 mt-3">Checking seat availability...</Text>
      </View>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <View className="bg-red-900/50 p-4 rounded-lg mb-4 border border-red-700">
        <Text className="text-red-300 text-center">Error loading seat types: {error}</Text>
      </View>
    );
  }

  // --- Render Seat Options ---
  return (
    <View className="mb-6">
      <Text className="text-lg font-semibold text-white mb-4">Choose Your Seating Area</Text>
      <View className="space-y-3">
        {allSeatOptionsConfig.map((baseOption) => {
          // Find details fetched from API for this type
          const detail = seatDetails?.find(d => d.type === baseOption.type);

          // --- Determine Status ---
          const isOfferedByBar = !!detail; // Was this type returned by the API (i.e., enabled)?
          const remainingSeats = detail?.remainingCount ?? 0;
          const minPeople = detail?.minPeople ?? 0;
          const maxPeople = detail?.maxPeople ?? 0;
          const fitsPartySize = isOfferedByBar ? (partySize >= minPeople && partySize <= maxPeople) : false;
          const hasSeatsLeft = isOfferedByBar && remainingSeats > 0;

          // --- Determine Disabled State ---
          // Disable if: Not offered OR no seats left OR party size doesn't fit
          const isDisabled = !isOfferedByBar || !hasSeatsLeft || !fitsPartySize;

          const isSelected = selectedSeatType === baseOption.type;
          const IconComponent = baseOption.icon;

          // --- Determine Status Text & Styling ---
          let statusText = '';
          let statusColor = 'text-gray-500'; // Default for unavailable info
          let StatusIcon = XCircle;

          if (isOfferedByBar) {
            if (hasSeatsLeft) {
              if (fitsPartySize) {
                // Available and fits party size
                statusText = `${remainingSeats} Seat${remainingSeats !== 1 ? 's' : ''} Left`;
                statusColor = 'text-green-400';
                // No specific icon needed here, just count
              } else {
                // Available but doesn't fit party size (will be disabled)
                statusText = `Fits ${minPeople}-${maxPeople}`;
                statusColor = 'text-amber-400'; // Use warning color
                StatusIcon = AlertCircle;
              }
            } else {
              // Offered but no seats left (will be disabled)
              statusText = 'Fully Booked';
              statusColor = 'text-red-400';
            }
          } else {
            // Not offered by the bar at all
            statusText = 'Not Offered';
            statusColor = 'text-gray-500';
          }

          // --- Compose requirements string if restrictions exist ---
          let requirementsText = '';
          if (detail?.restrictions) {
            const { min_bottles, min_consumption } = detail.restrictions;
            if (typeof min_bottles === 'number' && min_bottles > 0) {
              requirementsText += `Min. ${min_bottles} bottle${min_bottles > 1 ? 's' : ''}`;
            }
            if (typeof min_consumption === 'number' && min_consumption > 0) {
              if (requirementsText) requirementsText += ' · ';
              requirementsText += `Min. spend €${min_consumption}`;
            }
          }

          return (
            <Pressable
              key={baseOption.type}
              disabled={isDisabled}
              onPress={() => onSeatTypeChange(baseOption.type)}
              className={`
                p-4 rounded-xl border
                ${isSelected ? 'bg-[#ff4d6d]/20 border-[#ff4d6d]' : 'bg-[#1f1f27] border-transparent'}
                ${isDisabled ? 'opacity-50 bg-gray-800/60 border-gray-700' : ''}
                ${!isDisabled && !isSelected ? 'active:bg-[#2a2a33]' : ''}
              `}
            >
              <View className="flex-row items-center">
                 <IconComponent
                   size={24}
                   // Adjust disabled color slightly more muted
                   color={isDisabled ? '#666' : (isSelected ? '#ff4d6d' : '#e0e0e0')}
                   className="mr-4"
                 />
                 <View className="flex-1">
                    <Text
                      className={`text-base font-medium ${isDisabled ? 'text-gray-500' : (isSelected ? 'text-[#ff4d6d]' : 'text-white')}`}
                    >
                      {baseOption.label}
                    </Text>
                    {/* Sub-details / Status row */}
                    <View className="flex-row items-center mt-1 flex-wrap">
                        {/* Show Status Icon based on logic */}
                        {(isDisabled || (hasSeatsLeft && !fitsPartySize)) && // Show icon for unavailable/warning states
                            <StatusIcon size={12} color={isDisabled ? '#999' : '#facc15'} className="mr-1"/>
                        }
                         {/* Show Status Text */}
                        <Text className={`text-xs mr-3 ${statusColor}`}>
                            {statusText}
                        </Text>
                         {/* Show Min/Max People only if offered by bar */}
                         {isOfferedByBar && (
                            <View className="flex-row items-center mr-3">
                                <Users size={12} color="#a0a0a0" className="mr-1"/>
                                <Text className="text-xs text-gray-400">{minPeople}-{maxPeople}</Text>
                            </View>
                         )}
                         {/* Show requirements if present */}
                         {requirementsText ? (
                           <View className="flex-row items-center mr-3">
                             <Text className="text-xs text-red-400 font-semibold">{requirementsText}</Text>
                           </View>
                         ) : null}
                    </View>
                 </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

export default SeatTypeSelection;