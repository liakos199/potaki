import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Wine, Plus, Minus } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase'; // Ensure this path is correct

// --- Corrected Type Definition (is_available REMOVED) ---
// Matches the actual DB schema ONLY
type DrinkOption = {
  id: string;           // from DB: uuid
  name: string | null;  // from DB: text null
  price: number;        // from DB: numeric(8, 2)
  type: string;         // from DB: public.drink_option_type
  // --- Fields from DB not directly used in rendering, but available if selected ---
  // bar_id: string;
  // created_at: string;
  // updated_at: string;
};

type SelectedDrink = {
  drinkOption: DrinkOption;
  quantity: number;
};

type DrinkSelectionProps = {
  barId: string | null; // Allow null for mock data or initial state
  selectedDrinks: SelectedDrink[];
  onDrinksChange: (drinks: SelectedDrink[]) => void;
};

const DrinkSelection: React.FC<DrinkSelectionProps> = ({
  barId,
  selectedDrinks,
  onDrinksChange
}) => {
  const [drinkOptions, setDrinkOptions] = useState<DrinkOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    const fetchDrinkOptions = async () => {
      if (!barId) return; // Guard clause if no barId

      setLoading(true);
      try {
        // Select only the columns that exist and are needed
        const { data, error } = await supabase
          .from('drink_options')
          .select('id, name, price, type') // Select necessary columns explicitly
          .eq('bar_id', barId)
          .order('name'); // Order by name

        if (error) {
          console.error('Error fetching drink options:', error);
          setDrinkOptions([]); // Clear options on error
          return;
        }

        if (data) {
          // Map the fetched data directly to our simplified DrinkOption type
          // No need to add is_available anymore
          const fetchedDrinks = data.map(drink => ({
            id: drink.id,
            name: drink.name,
            price: drink.price,
            type: drink.type,
            // <<<--- is_available property is NOT added ---<<<
          }));
          setDrinkOptions(fetchedDrinks);
        } else {
          setDrinkOptions([]); // Handle null/undefined data response
        }
      } catch (error) {
        console.error('Unexpected error in fetchDrinkOptions:', error);
        setDrinkOptions([]);
      } finally {
        setLoading(false);
      }
    };

    // --- Mock Data Logic (Updated - no is_available) ---
    if (!barId) {
       console.log("Using Mock Drink Data (no barId provided)");
       setLoading(true);
       setTimeout(() => {
        // Mock data now only includes fields defined in the updated DrinkOption type
        const mockDrinks: DrinkOption[] = [
          { id: 'mock-1', name: 'Signature Cocktail', price: 12.99, type: 'cocktail' },
          { id: 'mock-2', name: 'Local Craft Beer', price: 8.99, type: 'beer' },
          { id: 'mock-3', name: 'House Red Wine', price: 10.99, type: 'wine' },
          { id: 'mock-4', name: 'Classic Whiskey', price: 11.99, type: 'spirit' },
          { id: 'mock-5', name: null, price: 15.99, type: 'wine' }, // Example of null name
        ];
        setDrinkOptions(mockDrinks);
        setLoading(false);
       }, 500);
    } else {
      // Fetch real data if barId is present
      fetchDrinkOptions();
    }
  }, [barId]); // Re-run effect if barId changes

  // Get unique drink types for categories
  const drinkTypes = ['all', ...new Set(drinkOptions.map(drink => drink.type).filter(Boolean))];

  // Filter drinks by category - This logic remains correct as it never used is_available
  const filteredDrinks = activeCategory === 'all'
    ? drinkOptions
    : drinkOptions.filter(drink => drink.type === activeCategory);

  // --- Helper Functions (Unchanged) ---
  const addDrink = (drink: DrinkOption) => {
    const existingDrinkIndex = selectedDrinks.findIndex(item => item.drinkOption.id === drink.id);
    if (existingDrinkIndex >= 0) {
      const updatedDrinks = [...selectedDrinks];
      updatedDrinks[existingDrinkIndex].quantity += 1;
      onDrinksChange(updatedDrinks);
    } else {
      onDrinksChange([...selectedDrinks, { drinkOption: drink, quantity: 1 }]);
    }
  };

  const removeDrink = (drinkId: string) => {
    const existingDrinkIndex = selectedDrinks.findIndex(item => item.drinkOption.id === drinkId);
    if (existingDrinkIndex >= 0) {
      const updatedDrinks = [...selectedDrinks];
      if (updatedDrinks[existingDrinkIndex].quantity > 1) {
        updatedDrinks[existingDrinkIndex].quantity -= 1;
      } else {
        updatedDrinks.splice(existingDrinkIndex, 1);
      }
      onDrinksChange(updatedDrinks);
    }
  };

  const getDrinkQuantity = (drinkId: string): number => {
    const drink = selectedDrinks.find(item => item.drinkOption.id === drinkId);
    return drink ? drink.quantity : 0;
  };

  const totalPrice = selectedDrinks.reduce(
    (sum, item) => sum + (item.drinkOption.price * item.quantity), 0
  );

  // --- JSX Rendering (Unchanged from previous correct version) ---
  return (
    <View className="mb-6">
      <Text className="text-lg font-semibold text-white mb-2">Pre-order Drinks (Optional)</Text>
      <Text className="text-gray-400 mb-4">
        Skip the wait by pre-ordering drinks for your reservation
      </Text>

      {/* Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-4"
        contentContainerStyle={{ paddingHorizontal: 4 }} // Optional horizontal padding
      >
        {drinkTypes.map((type) => (
          <Pressable
            key={type}
            className={`mx-1 px-4 py-2 rounded-full ${ // Use mx-1 for spacing
              activeCategory === type ? 'bg-[#ff4d6d]' : 'bg-[#1f1f27]'
            }`}
            onPress={() => setActiveCategory(type)}
          >
            <Text className={`capitalize ${
              activeCategory === type ? 'text-white font-medium' : 'text-gray-300'
            }`}>
              {type}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Drink list */}
      {loading ? (
        <View className="items-center py-6">
          <ActivityIndicator size="large" color="#ff4d6d" />
          <Text className="text-gray-400 mt-2">Loading drink options...</Text>
        </View>
      ) : drinkOptions.length === 0 && barId ? (
         <View className="items-center py-6 bg-[#1f1f27] rounded-xl">
            <Wine size={32} color="#9ca3af" />
            <Text className="text-gray-400 mt-2">No drinks available for this bar yet.</Text>
         </View>
      ) : (
        <View>
          {filteredDrinks.map((drink) => {
            const quantity = getDrinkQuantity(drink.id);

            return (
              <View
                key={drink.id}
                className="bg-[#1f1f27] p-4 rounded-xl mb-3 flex-row items-center"
              >
                {/* Placeholder icon */}
                <View className="w-16 h-16 bg-[#2a2a35] rounded-lg mr-3 items-center justify-center flex-shrink-0">
                  <Wine size={24} color="#9ca3af" />
                </View>

                <View className="flex-1 mr-2">
                  <Text className="text-white font-medium" numberOfLines={2}>
                    {drink.name || `Unnamed ${drink.type || 'Drink'}`}
                   </Text>
                  <Text className="text-[#ff4d6d] mt-1 font-semibold">
                    ${drink.price?.toFixed(2) ?? 'N/A'}
                  </Text>
                </View>

                {/* Action Buttons */}
                <View className="flex-col items-center w-20">
                  {quantity > 0 ? (
                    <View className="flex-row items-center justify-center">
                      <Pressable
                        className="p-2 rounded-full bg-[#2a2a35]"
                        onPress={() => removeDrink(drink.id)} hitSlop={10}
                      >
                        <Minus size={18} color="#fff" />
                      </Pressable>
                      <Text className="text-white mx-3 font-medium text-lg">{quantity}</Text>
                      <Pressable
                        className="p-2 rounded-full bg-[#2a2a35]"
                        onPress={() => addDrink(drink)} hitSlop={10}
                      >
                        <Plus size={18} color="#fff" />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      className="px-4 py-2 bg-[#ff4d6d] rounded-lg"
                      onPress={() => addDrink(drink)}
                    >
                      <Text className="text-white font-medium">Add</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Selected drinks summary */}
      {selectedDrinks.length > 0 && !loading && (
        <View className="bg-[#ff4d6d]/10 p-4 rounded-xl mt-4 border border-[#ff4d6d]/20">
          <Text className="text-white text-base font-semibold mb-3">Order Summary</Text>
          {selectedDrinks.map((item) => (
            <View key={item.drinkOption.id} className="flex-row justify-between items-center mb-2">
              <View className="flex-1 mr-2">
                <Text className="text-gray-300" numberOfLines={1}>
                  {item.quantity}x {item.drinkOption.name || `Unnamed ${item.drinkOption.type || 'Drink'}`}
                </Text>
              </View>
              <Text className="text-white w-16 text-right">
                ${(item.drinkOption.price * item.quantity).toFixed(2)}
              </Text>
            </View>
          ))}
          <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-[#ff4d6d]/30">
            <Text className="text-white text-lg font-bold">Total</Text>
            <Text className="text-white text-lg font-bold">${totalPrice.toFixed(2)}</Text>
          </View>
        </View>
      )}
    </View>
  );
};

export default DrinkSelection;