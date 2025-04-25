import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Plus, Minus } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import Toast from '@/components/general/Toast';
import { z } from 'zod';

// import type { Database } from '@/src/lib/database.types';
// type Drink = Database['public']['Tables']['drink_options']['Row'];

type DrinkOption = {
  id: string;
  name: string | null;
  price: number;
  type: string;
};

type SelectedDrink = {
  drinkOption: DrinkOption;
  quantity: number;
};

type DrinkSelectionProps = {
  barId: string | null;
  selectedDrinks: SelectedDrink[];
  onDrinksChange: (drinks: SelectedDrink[]) => void;
};

const DRINK_TYPE_LABELS: Record<string, string> = {
  'single-drink': 'By the Glass',
  'bottle': 'Bottle',
  'all': 'All',
};

const DrinkOptionSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  price: z.number(),
  type: z.string(),
});
const DrinkOptionsSchema = z.array(DrinkOptionSchema);

const fetchDrinkOptions = async (barId: string): Promise<DrinkOption[]> => {
  const { data, error } = await supabase
    .from('drink_options')
    .select('id, name, price, type')
    .eq('bar_id', barId)
    .order('name');
  if (error) throw new Error(error.message);
  const parsed = DrinkOptionsSchema.safeParse(data);
  if (!parsed.success) throw new Error('Invalid drink data received');
  return parsed.data;
};

const MAX_QUANTITY = 10;

const DrinkSelection: React.FC<DrinkSelectionProps> = ({ barId, selectedDrinks, onDrinksChange }) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');

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

  useEffect(() => {
    if (isError) {
      Toast.show({ type: 'error', text1: 'Failed to load drinks', text2: error?.message || 'Unknown error' });
    }
  }, [isError, error]);

  const drinkOptions: DrinkOption[] = useMemo(() => Array.isArray(data) ? data : [], [data]);

  // Memoize drink types and filtered drinks
  const drinkTypes: string[] = useMemo(() => {
    const types = Array.from(new Set(drinkOptions.map((drink) => drink.type).filter((type): type is string => Boolean(type))));
    return types.length > 1 ? ['all', ...types] : types;
  }, [drinkOptions]);

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

  const addDrink = (drink: DrinkOption) => {
    const existingDrinkIndex = selectedDrinks.findIndex((item) => item.drinkOption.id === drink.id);
    if (existingDrinkIndex >= 0) {
      const updatedDrinks = [...selectedDrinks];
      if (updatedDrinks[existingDrinkIndex].quantity < MAX_QUANTITY) {
        updatedDrinks[existingDrinkIndex].quantity += 1;
        onDrinksChange(updatedDrinks);
      }
    } else {
      onDrinksChange([...selectedDrinks, { drinkOption: drink, quantity: 1 }]);
    }
  };

  const removeDrink = (drink: DrinkOption) => {
    const existingDrinkIndex = selectedDrinks.findIndex((item) => item.drinkOption.id === drink.id);
    if (existingDrinkIndex >= 0) {
      const updatedDrinks = [...selectedDrinks];
      if (updatedDrinks[existingDrinkIndex].quantity > 1) {
        updatedDrinks[existingDrinkIndex].quantity -= 1;
        onDrinksChange(updatedDrinks);
      } else {
        updatedDrinks.splice(existingDrinkIndex, 1);
        onDrinksChange(updatedDrinks);
      }
    }
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
        <Pressable onPress={() => refetch()} className="px-4 py-2 bg-[#f0165e] rounded-lg mt-2">
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

  return (
    <View>
      {/* Category Tabs (only if >1 type) */}
      {drinkTypes.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
          {drinkTypes.map((category) => (
            <Pressable
              key={category}
              className={`px-4 py-2 mr-2 rounded-full ${activeCategory === category ? 'bg-[#f0165e]' : 'bg-[#23232b]'}`}
              onPress={() => setActiveCategory(category)}
              accessibilityRole="button"
              accessibilityState={{ selected: activeCategory === category }}
              accessibilityLabel={`Filter drinks by ${DRINK_TYPE_LABELS[category] || category}`}
            >
              <Text className={`font-semibold ${activeCategory === category ? 'text-white' : 'text-gray-300'}`}>{DRINK_TYPE_LABELS[category] || category}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Drink List */}
      <ScrollView style={{ maxHeight: 320 }}>
        {filteredDrinks.map((drink) => {
          const selected = selectedDrinks.find((item) => item.drinkOption.id === drink.id);
          const isSelected = !!selected && selected.quantity > 0;
          return (
            <View
              key={drink.id}
              className={`flex-row items-center justify-between rounded-xl px-4 py-3 mb-3 ${isSelected ? 'bg-[#2a2a35]' : 'bg-[#18181b]'}`}
              accessibilityLabel={`${drink.name || 'Unnamed Drink'}, ${DRINK_TYPE_LABELS[drink.type] || drink.type}, €${drink.price.toFixed(2)}, selected: ${selected?.quantity || 0}`}
            >
              <View className="flex-1">
                <Text className="text-white font-semibold text-base">{drink.name || 'Unnamed Drink'}</Text>
                <Text className="text-gray-400 text-xs mt-0.5">{DRINK_TYPE_LABELS[drink.type] || drink.type}</Text>
              </View>
              <Text className="text-pink-400 font-semibold mr-4">€{drink.price.toFixed(2)}</Text>
              <View className="flex-row items-center">
                <Pressable
                  onPress={() => removeDrink(drink)}
                  className="p-2"
                  accessibilityLabel="Remove one"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !selected || selected.quantity === 0 }}
                  disabled={!selected || selected.quantity === 0}
                >
                  <Minus size={20} color={selected && selected.quantity > 0 ? '#f0165e' : '#555'} />
                </Pressable>
                <Text className="mx-2 text-white min-w-[16px] text-center">{selected?.quantity || 0}</Text>
                <Pressable
                  onPress={() => addDrink(drink)}
                  className="p-2"
                  accessibilityLabel="Add one"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: selected?.quantity === MAX_QUANTITY }}
                  disabled={selected?.quantity === MAX_QUANTITY}
                >
                  <Plus size={20} color={selected?.quantity === MAX_QUANTITY ? '#555' : '#f0165e'} />
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default DrinkSelection;