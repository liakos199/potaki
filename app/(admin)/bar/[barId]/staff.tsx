import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, TextInput, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchCustomers, promoteToStaff, fetchBarStaff, removeStaff } from '@/src/features/staff/api';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import type { CustomerProfile, StaffProfile } from '@/src/features/staff/types';
import type { Bar } from '@/src/features/bars/types';

const StaffScreen = (): JSX.Element => {
  const router = useRouter();
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [searchSubmitted, setSearchSubmitted] = useState(false);

  // Fetch staff for this bar
  const {
    data: staff = [],
    isLoading: loadingStaff,
    error: staffError,
    refetch: refetchStaff,
  } = useQuery({
    queryKey: ['bar-staff', barId],
    queryFn: () => fetchBarStaff(barId as string),
    enabled: !!barId,
  });

  // Search customers query
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

  // Remove staff mutation
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

  // Promote user to staff mutation
  const promoteMutation = useMutation({
    mutationFn: ({ userId, barId }: { userId: string; barId: string }) => promoteToStaff(userId, barId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['bar-staff', variables.barId] });
      setSearch('');
      setSearchSubmitted(false);
      Alert.alert('Success', 'User promoted to staff!');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.message || 'Could not promote user.');
    },
  });

  // Authorization check
  if (!profile || profile.role !== 'owner') {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <StatusBar barStyle="light-content" />
        <Text className="text-lg text-purple-300">Unauthorized</Text>
      </View>
    );
  }

  // Loading state
  if (loadingStaff) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  // Error state
  if (staffError) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <StatusBar barStyle="light-content" />
        <Text className="text-red-400">Error loading staff data.</Text>
      </View>
    );
  }

  // Staff item renderer
  const renderStaffItem = (item: StaffProfile) => (
    <View key={item.id} className="flex-row items-center justify-between py-4 px-3 mb-2 rounded-xl bg-zinc-900 border border-zinc-800">
      <View>
        <Text className="font-medium text-gray-100">{item.name ? item.name : 'no name'}</Text>
        <Text className="text-xs text-gray-400">{item.email}</Text>
      </View>
      <TouchableOpacity
        className="px-3 py-2 bg-red-600 rounded-lg"
        onPress={() => {
          Alert.alert(
            'Remove Staff',
            `Are you sure you want to remove this staff member?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => removeStaffMutation.mutate({ userId: item.id, barId: barId as string }) },
            ]
          );
        }}
        accessibilityRole="button"
        accessibilityLabel="Remove Staff"
      >
        <Text className="text-white font-medium">Remove</Text>
      </TouchableOpacity>
    </View>
  );

  // Customer item renderer
  const renderCustomerItem = ({ item }: { item: CustomerProfile }) => (
    <View key={item.id} className="flex-row items-center justify-between py-4 px-3 mb-2 rounded-xl bg-zinc-900 border border-zinc-800">
      <View>
        <Text className="font-medium text-gray-100">{item.name ? item.name : 'no name'}</Text>
        <Text className="text-xs text-gray-400">{item.email}</Text>
      </View>
      <TouchableOpacity
        className="px-3 py-2 bg-purple-700 rounded-lg"
        onPress={() => {
          Alert.alert(
            'Promote to Staff',
            `Are you sure you want to promote this user to staff?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Promote', style: 'default', onPress: () => promoteMutation.mutate({ userId: item.id, barId: barId as string }) },
            ]
          );
        }}
        accessibilityRole="button"
        accessibilityLabel="Promote to Staff"
      >
        <Text className="text-white font-medium">Promote</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View className="flex-1 bg-black pt-10">
      <StatusBar barStyle="light-content" />
      <Text className="text-2xl font-bold text-center text-purple-200 mb-6">Manage Staff</Text>

      {/* Staff List Section */}
      <View className="px-5 py-5 bg-zinc-900 mx-5 rounded-xl shadow-lg border border-zinc-800 mb-6">
        <View className="flex-row items-center mb-4">
          <View className="h-5 w-1 bg-purple-500 rounded-full mr-2" />
          <Text className="text-lg font-bold text-gray-100">Current Staff</Text>
        </View>
        {staff.length === 0 ? (
          <View className="py-8 items-center">
            <Text className="text-gray-500 text-sm">No staff assigned</Text>
          </View>
        ) : (
          <View>
            {staff.map(renderStaffItem)}
          </View>
        )}
      </View>

      {/* Search Section */}
      <View className="px-5 py-5 bg-zinc-900 mx-5 rounded-xl shadow-lg border border-zinc-800 mb-6">
        <View className="flex-row items-center mb-4">
          <View className="h-5 w-1 bg-purple-500 rounded-full mr-2" />
          <Text className="text-lg font-bold text-gray-100">Add New Staff</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <TextInput
            className="flex-1 border border-zinc-700 rounded-lg px-4 py-3 bg-zinc-800 text-gray-100 placeholder:text-gray-500"
            placeholder="Search by name or email"
            placeholderTextColor="#71717a"
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
            className="px-4 py-3 bg-purple-700 rounded-lg"
            onPress={() => setSearchSubmitted(true)}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Text className="text-white font-medium">Search</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Results Section */}
      <View className="px-5 py-2">
        {(!searchSubmitted || !search) ? (
          <View className="py-8 bg-zinc-900 rounded-xl border border-zinc-800 items-center justify-center">
            <Text className="text-gray-500 text-center">Enter a search term to find customers</Text>
          </View>
        ) : loadingCustomers ? (
          <View className="py-12 items-center bg-zinc-900 rounded-xl border border-zinc-800">
            <ActivityIndicator size="large" color="#a855f7" />
            <Text className="text-gray-400 mt-3">Searching...</Text>
          </View>
        ) : customersError ? (
          <View className="py-8 bg-zinc-900 rounded-xl border border-zinc-800 items-center">
            <Text className="text-red-400 text-center">Error loading customers</Text>
          </View>
        ) : (
          <>
            {customers.length > 0 && (
              <View className="flex-row items-center mb-4">
                <View className="h-5 w-1 bg-purple-500 rounded-full mr-2" />
                <Text className="text-lg font-bold text-gray-100">Search Results</Text>
              </View>
            )}
            <FlatList
              data={customers as CustomerProfile[]}
              keyExtractor={(item) => item.id}
              renderItem={renderCustomerItem}
              ListEmptyComponent={
                <View className="py-8 bg-zinc-900 rounded-xl border border-zinc-800 items-center">
                  <Text className="text-gray-500 text-center">No customers found</Text>
                </View>
              }
              scrollEnabled={false}
            />
          </>
        )}
      </View>
    </View>
  );
};

export default StaffScreen;
