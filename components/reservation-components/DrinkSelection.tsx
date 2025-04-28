import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Plus, Minus, CheckCircle, AlertCircle } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import Toast from '@/components/general/Toast';

// Import database types for proper typing
import type { Database } from '@/src/lib/database.types';

// Define the specific drink type values from the database
type DrinkType = Database['public']['Enums']['drink_option_type'];

// Basic drink option from the database
interface DrinkOption {
  id: string;
  name: string | null;
  price: number;
  type: DrinkType;
  description?: string | null;
  image_url?: string | null;
  is_available?: boolean;
}

// Selected drink with quantity
interface SelectedDrink {
  drinkOption: DrinkOption;
  quantity: number;
}

// Props for the component
interface DrinkSelectionProps {
  barId: string | null;
  selectedDrinks: SelectedDrink[];
  onDrinksChange: (drinks: SelectedDrink[]) => void;
  restrictions: {
    min_bottles?: number;
    min_consumption?: number;
    [key: string]: unknown;
  } | null;
  seatTypeLabel?: string | null;
}

// Labels for drink types in the UI
const DRINK_TYPE_LABELS: Record<string, string> = {
  'single-drink': 'By the Glass',
  'bottle': 'Bottle',
  'all': 'All',
};

// Function to fetch drink options from the database
const fetchDrinkOptions = async (barId: string): Promise<DrinkOption[]> => {
  const { data, error } = await supabase
    .from('drink_options')
    .select('*')  // Select all fields to ensure we get everything needed
    .eq('bar_id', barId)
    .order('name');
    
  if (error) throw new Error(error.message);
  
  // Simple validation without schema to avoid type issues
  if (!Array.isArray(data)) throw new Error('Invalid drink data received');
  return data;
};

// Constants
const MAX_QUANTITY = 10;

// Helper functions
const getBottleCount = (drinks: SelectedDrink[]): number => {
  return drinks.reduce((count, drink) => {
    return drink.drinkOption.type === 'bottle' ? count + drink.quantity : count;
  }, 0);
};

const calculateTotal = (drinks: SelectedDrink[]): number => {
  return drinks.reduce((sum, drink) => sum + (drink.drinkOption.price * drink.quantity), 0);
};

// Main component
const DrinkSelection: React.FC<DrinkSelectionProps> = ({ 
  barId, 
  selectedDrinks, 
  onDrinksChange, 
  restrictions, 
  seatTypeLabel 
}) => {
  // Local state
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [validationMessage, setValidationMessage] = useState<{type: 'info' | 'error' | 'success', message: string} | null>(null);

  // Query for drink options
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<DrinkOption[], Error>({
    queryKey: ['drink-options', barId],
    queryFn: async () => {
      if (!barId) throw new Error('No barId provided');
      return fetchDrinkOptions(barId);
    },
    enabled: !!barId,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  // Error notification
  useEffect(() => {
    if (isError) {
      Toast.show({ 
        type: 'error', 
        text1: 'Failed to load drinks', 
        text2: error?.message || 'Unknown error' 
      });
    }
  }, [isError, error]);

  // Process data
  const drinkOptions: DrinkOption[] = useMemo(
    () => Array.isArray(data) ? data : [], 
    [data]
  );

  // Get unique drink types for filtering
  const drinkTypes: string[] = useMemo(() => {
    const types = Array.from(
      new Set(
        drinkOptions
          .map((drink) => drink.type)
          .filter((type): type is DrinkType => Boolean(type))
      )
    );
    return types.length > 1 ? ['all', ...types] : types;
  }, [drinkOptions]);

  // Filter drinks by selected category
  const filteredDrinks = useMemo(() => {
    const drinks = activeCategory === 'all'
      ? drinkOptions
      : drinkOptions.filter((drink) => drink.type === activeCategory);
      
    // Sort by name (nulls last)
    return drinks.slice().sort((a, b) => {
      if (!a.name) return 1;
      if (!b.name) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [drinkOptions, activeCategory]);

  // Add a drink to the cart
  const addDrink = (drink: DrinkOption) => {
    const existingDrinkIndex = selectedDrinks.findIndex(
      (item) => item.drinkOption.id === drink.id
    );
    
    if (existingDrinkIndex >= 0) {
      // Update existing drink quantity
      if (selectedDrinks[existingDrinkIndex].quantity < MAX_QUANTITY) {
        const updatedDrinks = [...selectedDrinks];
        updatedDrinks[existingDrinkIndex].quantity += 1;
        onDrinksChange(updatedDrinks);
      }
    } else {
      // Add new drink
      onDrinksChange([...selectedDrinks, { drinkOption: drink, quantity: 1 }]);
    }
  };

  // Remove a drink from the cart
  const removeDrink = (drink: DrinkOption) => {
    const existingDrinkIndex = selectedDrinks.findIndex(
      (item) => item.drinkOption.id === drink.id
    );
    
    if (existingDrinkIndex >= 0) {
      const updatedDrinks = [...selectedDrinks];
      if (updatedDrinks[existingDrinkIndex].quantity > 1) {
        // Reduce quantity
        updatedDrinks[existingDrinkIndex].quantity -= 1;
        onDrinksChange(updatedDrinks);
      } else {
        // Remove drink completely
        updatedDrinks.splice(existingDrinkIndex, 1);
        onDrinksChange(updatedDrinks);
      }
    }
  };

  // Check if step is mandatory
  const isStepMandatory = useMemo(
    () => !!(restrictions?.min_bottles || restrictions?.min_consumption),
    [restrictions]
  );

  // Calculate totals
  const totalSpent = useMemo(
    () => calculateTotal(selectedDrinks), 
    [selectedDrinks]
  );
  
  const bottleCount = useMemo(
    () => getBottleCount(selectedDrinks), 
    [selectedDrinks]
  );

  // Determine validation status
  const { isValid, statusMessage } = useMemo(() => {
    // No restrictions case
    if (!isStepMandatory) {
      return { 
        isValid: true,
        statusMessage: { 
          type: 'info' as const, 
          message: 'Pre-ordering drinks is optional' 
        }
      };
    }

    // Both restrictions case (need to satisfy both)
    if (restrictions?.min_bottles && restrictions?.min_consumption) {
      const bottlesValid = bottleCount >= restrictions.min_bottles;
      const consumptionValid = totalSpent >= restrictions.min_consumption;
      
      if (bottlesValid && consumptionValid) {
        return { 
          isValid: true, 
          statusMessage: { 
            type: 'success' as const, 
            message: 'All requirements met!' 
          }
        };
      } else if (!bottlesValid && !consumptionValid) {
        return { 
          isValid: false, 
          statusMessage: { 
            type: 'error' as const, 
            message: `You need ${restrictions.min_bottles - bottleCount} more bottle(s) and €${(restrictions.min_consumption - totalSpent).toFixed(2)} more in purchases` 
          }
        };
      } else if (!bottlesValid) {
        return { 
          isValid: false, 
          statusMessage: { 
            type: 'error' as const, 
            message: `You need ${restrictions.min_bottles - bottleCount} more bottle(s)` 
          }
        };
      } else {
        return { 
          isValid: false, 
          statusMessage: { 
            type: 'error' as const, 
            message: `You need €${(restrictions.min_consumption - totalSpent).toFixed(2)} more in purchases` 
          }
        };
      }
    }
    
    // Only min_bottles restriction
    if (restrictions?.min_bottles) {
      const bottlesValid = bottleCount >= restrictions.min_bottles;
      return { 
        isValid: bottlesValid, 
        statusMessage: { 
          type: bottlesValid ? 'success' as const : 'error' as const, 
          message: bottlesValid 
            ? 'Minimum bottles requirement met!' 
            : `You need ${restrictions.min_bottles - bottleCount} more bottle(s)` 
        }
      };
    }
    
    // Only min_consumption restriction
    if (restrictions?.min_consumption) {
      const consumptionValid = totalSpent >= restrictions.min_consumption;
      return { 
        isValid: consumptionValid, 
        statusMessage: { 
          type: consumptionValid ? 'success' as const : 'error' as const, 
          message: consumptionValid 
            ? 'Minimum consumption requirement met!' 
            : `You need €${(restrictions.min_consumption - totalSpent).toFixed(2)} more in purchases` 
        }
      };
    }
    
    // Fallback
    return { 
      isValid: true, 
      statusMessage: null 
    };
  }, [isStepMandatory, restrictions, bottleCount, totalSpent]);

  // Update validation message
  useEffect(() => {
    setValidationMessage(statusMessage);
    
    // Expose validation status to parent component via custom DOM event
    // This is a clean way to communicate the status without modifying props
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent('drink-validation-change', { 
        detail: { isValid }
      }));
    }
  }, [statusMessage, isValid]);

  // Render restrictions UI
  const renderRestrictions = () => {
    if (!restrictions && !seatTypeLabel) return null;
    
    return (
      <View className="mb-4 px-4 py-3 bg-[#1c1c22] rounded-xl border border-[#f0165e]/40">
        <Text className="text-[#f0165e] text-base font-semibold mb-1">Seating Restrictions</Text>
        
        {/* Seat type */}
        {seatTypeLabel && (
          <Text className="text-white text-sm mb-0.5">
            Seat type: <Text className="font-bold">{seatTypeLabel}</Text>
          </Text>
        )}
        
        {/* Minimum bottles */}
        {restrictions?.min_bottles !== undefined && (
          <Text className="text-white text-sm mb-0.5">
            Minimum bottles: <Text className="font-bold">{restrictions.min_bottles}</Text>
          </Text>
        )}
        
        {/* Minimum consumption */}
        {restrictions?.min_consumption !== undefined && (
          <Text className="text-white text-sm mb-0.5">
            Minimum consumption: <Text className="font-bold">€{restrictions.min_consumption}</Text>
          </Text>
        )}
        
        {/* Other restrictions */}
        {restrictions && Object.entries(restrictions).map(([key, value]) => {
          if (key === 'min_bottles' || key === 'min_consumption') return null;
          return (
            <Text key={key} className="text-white text-sm mb-0.5">
              {key.replace(/_/g, ' ')}: <Text className="font-bold">{String(value)}</Text>
            </Text>
          );
        })}
      </View>
    );
  };

  // UI States
  if (!barId) {
    return (
      <View className="items-center justify-center py-12">
        <Text className="text-gray-400">No bar selected. Cannot fetch drinks.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="items-center justify-center py-12">
        <ActivityIndicator size="large" color="#f0165e" />
        <Text className="text-gray-400 mt-2">Loading drinks...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View className="items-center justify-center py-12">
        <Text className="text-red-400 mb-2">Failed to load drinks.</Text>
        <Pressable 
          onPress={() => refetch()} 
          className="px-4 py-2 bg-[#f0165e] rounded-lg mt-2"
        >
          <Text className="text-white font-semibold">Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!drinkOptions.length) {
    return (
      <View className="items-center justify-center py-12">
        <Text className="text-gray-400">No drinks available for this bar.</Text>
      </View>
    );
  }

  // Main UI
  return (
    <View className="flex-1">
      {/* Restrictions section */}
      {renderRestrictions()}
      
      {/* Category tabs */}
      {drinkTypes.length > 1 && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          className="mb-4"
        >
          <View className="flex-row px-1">
            {drinkTypes.map((type) => (
              <Pressable
                key={type}
                onPress={() => setActiveCategory(type)}
                className={`px-4 py-2 mr-2 rounded-lg ${
                  activeCategory === type
                    ? 'bg-[#f0165e]'
                    : 'bg-[#2a2a32]'
                }`}
              >
                <Text
                  className={`font-medium ${
                    activeCategory === type ? 'text-white' : 'text-gray-400'
                  }`}
                >
                  {DRINK_TYPE_LABELS[type] || type}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Drink items */}
      <ScrollView className="flex-1">
        <View className="px-1">
          {filteredDrinks.map((drink) => {
            const selectedDrink = selectedDrinks.find(
              (item) => item.drinkOption.id === drink.id
            );
            const quantity = selectedDrink?.quantity || 0;

            return (
              <View
                key={drink.id}
                className="flex-row items-center justify-between py-3 px-2 border-b border-gray-700/30"
              >
                <View className="flex-1 mr-4">
                  <Text className="text-white font-medium">
                    {drink.name || 'Unnamed Drink'}
                  </Text>
                  <Text className="text-gray-400 text-sm mt-0.5">
                    {DRINK_TYPE_LABELS[drink.type] || drink.type} • €{drink.price.toFixed(2)}
                  </Text>
                </View>
                
                {/* Quantity controls */}
                <View className="flex-row items-center">
                  {quantity > 0 && (
                    <>
                      <Pressable
                        onPress={() => removeDrink(drink)}
                        className="w-8 h-8 bg-[#2a2a32] rounded-full items-center justify-center"
                      >
                        <Minus size={16} color="#fff" />
                      </Pressable>
                      <Text className="text-white font-bold mx-3 w-6 text-center">
                        {quantity}
                      </Text>
                    </>
                  )}
                  <Pressable
                    onPress={() => addDrink(drink)}
                    className={`w-8 h-8 ${
                      quantity > 0 ? 'bg-[#f0165e]' : 'bg-[#2a2a32]'
                    } rounded-full items-center justify-center`}
                  >
                    <Plus size={16} color="#fff" />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      
      {/* Status and Validation */}
      {selectedDrinks.length > 0 && (
        <View className="mt-4 pt-4 border-t border-gray-700/30">
          {/* Totals */}
          <View className="flex-row justify-between mb-1">
            <Text className="text-white">Total Drinks:</Text>
            <Text className="text-white font-bold">
              {selectedDrinks.reduce((total, item) => total + item.quantity, 0)}
            </Text>
          </View>
          
          {/* Bottle count if relevant */}
          {restrictions?.min_bottles !== undefined && (
            <View className="flex-row justify-between mb-1">
              <Text className="text-white">Bottle Count:</Text>
              <Text 
                className={`font-bold ${
                  bottleCount >= (restrictions?.min_bottles || 0) 
                    ? 'text-green-500' 
                    : 'text-red-400'
                }`}
              >
                {bottleCount} / {restrictions.min_bottles}
              </Text>
            </View>
          )}
          
          {/* Total spent */}
          <View className="flex-row justify-between mb-3">
            <Text className="text-white">Total Spent:</Text>
            <Text 
              className={`font-bold ${
                totalSpent >= (restrictions?.min_consumption || 0) 
                  ? 'text-green-500' 
                  : 'text-white'
              }`}
            >
              €{totalSpent.toFixed(2)}
              {restrictions?.min_consumption 
                ? ` / €${restrictions.min_consumption}` 
                : ''}
            </Text>
          </View>
          
          {/* Validation message */}
          {validationMessage && (
            <View 
              className={`flex-row items-center py-2 px-3 rounded-lg mb-2 ${
                validationMessage.type === 'error' 
                  ? 'bg-red-900/30' 
                  : validationMessage.type === 'success' 
                    ? 'bg-green-900/30' 
                    : 'bg-blue-900/30'
              }`}
            >
              {validationMessage.type === 'error' && (
                <AlertCircle size={18} color="#f87171" className="mr-2" />
              )}
              {validationMessage.type === 'success' && (
                <CheckCircle size={18} color="#10b981" className="mr-2" />
              )}
              <Text 
                className={
                  validationMessage.type === 'error' 
                    ? 'text-red-400' 
                    : validationMessage.type === 'success' 
                      ? 'text-green-400' 
                      : 'text-blue-400'
                }
              >
                {validationMessage.message}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export default DrinkSelection;