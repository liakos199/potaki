import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchCustomers, promoteToStaff, fetchBarStaff, removeStaff } from '@/src/features/staff/api';
import { fetchOwnerBars } from '@/src/features/bars/api';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import type { CustomerProfile, StaffProfile } from '@/src/features/staff/types';
import type { Bar } from '@/src/features/bars/types';

const ManageStaffScreen = (): JSX.Element => {
  const profile = useAuthStore((s) => s.profile);

  const queryClient = useQueryClient();
  const [selectedBarId, setSelectedBarId] = useState<{ [userId: string]: string }>({});

  // Search input state
  const [search, setSearch] = useState('');
  const [searchSubmitted, setSearchSubmitted] = useState(false);

  // Search customers only when search is non-empty and submitted
  const {
    data: customers = [],
    isLoading: loadingCustomers,
    error: customersError,
    refetch: refetchCustomers,
  } = useQuery({
    queryKey: ['search-customers', search],
    queryFn: () => searchCustomers(search),
    enabled: !!search && searchSubmitted,
  });

  // Fetch owner's bars
  const { data: bars, isLoading: loadingBars, error: barsError } = useQuery({
    queryKey: ['owner-bars', profile?.id],
    queryFn: () => fetchOwnerBars(profile!.id),
    enabled: !!profile?.id,
  });

  // --- Staff listing & removal ---
  // For each bar, fetch staff list
  const staffQueries = (bars ?? []).map((bar) =>
    useQuery({
      queryKey: ['bar-staff', bar.id],
      queryFn: () => fetchBarStaff(bar.id),
      enabled: !!bar.id,
    })
  );

  const removeStaffMutation = useMutation({
    mutationFn: ({ userId, barId }: { userId: string; barId: string }) => removeStaff(userId, barId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bar-staff', variables.barId] });
      Alert.alert('Success', 'Staff member removed.');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.message || 'Could not remove staff.');
    },
  });

  const promoteMutation = useMutation({
    mutationFn: ({ userId, barId }: { userId: string; barId: string }) => promoteToStaff(userId, barId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      Alert.alert('Success', 'User promoted to staff!');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.message || 'Could not promote user.');
    },
  });

  if (!profile || profile.role !== 'owner') {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-lg">Unauthorized</Text>
      </View>
    );
  }

  if (loadingCustomers || loadingBars) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (customersError || barsError) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-red-500">Error loading data.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 px-4 pt-8 bg-white">
      <Text className="text-2xl font-bold mb-6">Manage Staff</Text>
      {/* --- Staff List for Each Bar --- */}
      {(bars ?? []).length > 0 && (
        <View className="mb-8">
          <Text className="text-lg font-semibold mb-2">Current Staff</Text>
          {(bars ?? []).map((bar, idx) => {
            const staffQuery = staffQueries[idx];
            const staff = (staffQuery?.data ?? []) as StaffProfile[];
            return (
              <View key={bar.id} className="mb-4 p-3 bg-gray-50 rounded">
                <Text className="font-bold mb-2">{bar.name}</Text>
                {staffQuery?.isLoading ? (
                  <ActivityIndicator size="small" color="#6366f1" />
                ) : staff.length === 0 ? (
                  <Text className="text-gray-400">No staff assigned.</Text>
                ) : (
                  <FlatList
                    data={staff}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <View className="flex-row items-center justify-between mb-2 p-2 bg-white rounded">
                        <View>
                          <Text className="font-semibold">{item.name || item.email}</Text>
                          <Text className="text-xs text-gray-500">{item.email}</Text>
                        </View>
                        <TouchableOpacity
                          className="bg-red-600 px-3 py-1 rounded"
                          onPress={() => {
                            Alert.alert(
                              'Remove Staff',
                              `Remove ${item.name || item.email} from ${bar.name}?`,
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Remove',
                                  style: 'destructive',
                                  onPress: () => removeStaffMutation.mutate({ userId: item.id, barId: bar.id }),
                                },
                              ]
                            );
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${item.name || item.email} from ${bar.name}`}
                          disabled={removeStaffMutation.isPending}
                        >
                          {removeStaffMutation.isPending ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text className="text-white font-bold">Remove</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                    ListEmptyComponent={<Text className="text-gray-400">No staff assigned.</Text>}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}
      {/* --- Customer Search & Promote --- */}
      <View className="mb-4">
        <Text className="mb-1 text-base font-semibold">Search for Customer</Text>
        <View className="flex-row items-center gap-2">
          <TextInput
            className="flex-1 border border-gray-300 rounded px-3 py-2 bg-white"
            placeholder="Enter name or email..."
            value={search}
            onChangeText={(text: string) => {
              setSearch(text);
              setSearchSubmitted(false);
            }}
            onSubmitEditing={() => setSearchSubmitted(true)}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search customers"
          />
          <TouchableOpacity
            className="ml-2 px-4 py-2 bg-blue-600 rounded"
            onPress={() => setSearchSubmitted(true)}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Text className="text-white font-bold">Search</Text>
          </TouchableOpacity>
        </View>
      </View>
      {(!searchSubmitted || !search) ? (
        <Text className="text-gray-500 text-center mt-8">Enter a search term to find customers.</Text>
      ) : loadingCustomers ? (
        <ActivityIndicator size="large" color="#6366f1" className="mt-8" />
      ) : (
        <FlatList
          data={customers as CustomerProfile[]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          renderItem={({ item }) => (
            <View className="flex-col mb-4 p-4 bg-gray-100 rounded">
              <Text className="text-base font-semibold mb-1">{item.name || item.email}</Text>
              <Text className="text-xs text-gray-500 mb-2">{item.email}</Text>
              <Text className="text-xs text-gray-500 mb-2">User ID: {item.id}</Text>
              <View className="flex-row items-center gap-2 mb-2">
                <Text className="text-sm mr-2">Assign to bar:</Text>
                <View className="flex-1">
                  <FlatList
                    data={bars as Bar[]}
                    horizontal
                    keyExtractor={(bar) => bar.id}
                    renderItem={({ item: bar }) => (
                      <TouchableOpacity
                        key={bar.id}
                        className={`px-3 py-1 rounded border mr-2 ${selectedBarId[item.id] === bar.id ? 'bg-blue-700 border-blue-800' : 'bg-white border-gray-300'}`}
                        onPress={() => setSelectedBarId((prev) => ({ ...prev, [item.id]: bar.id }))}
                      >
                        <Text className={`${selectedBarId[item.id] === bar.id ? 'text-white font-bold' : 'text-gray-800'}`}>{bar.name}</Text>
                      </TouchableOpacity>
                    )}
                    showsHorizontalScrollIndicator={false}
                  />
                </View>
              </View>
              <TouchableOpacity
                className="bg-green-600 py-2 px-4 rounded items-center mt-2"
                onPress={() => promoteMutation.mutate({ userId: item.id, barId: selectedBarId[item.id] })}
                disabled={!selectedBarId[item.id] || promoteMutation.isPending}
                activeOpacity={0.85}
              >
                {promoteMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-white font-bold">Promote to Staff</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text className="text-gray-400">No customers found.</Text>}
        />
      )}
    </View>
  );
};

export default ManageStaffScreen;
