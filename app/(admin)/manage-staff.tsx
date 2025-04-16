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
  const [search, setSearch] = useState('');
  const [searchSubmitted, setSearchSubmitted] = useState(false);

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

  // Fetch owner's bars
  const { data: bars, isLoading: loadingBars, error: barsError } = useQuery({
    queryKey: ['owner-bars', profile?.id],
    queryFn: () => fetchOwnerBars(profile!.id),
    enabled: !!profile?.id,
  });

  // Staff queries for each bar
  const staffQueries = (bars ?? []).map((bar) =>
    useQuery({
      queryKey: ['bar-staff', bar.id],
      queryFn: () => fetchBarStaff(bar.id),
      enabled: !!bar.id,
    })
  );

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
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-lg">Unauthorized</Text>
      </View>
    );
  }

  // Loading state
  if (loadingBars) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  // Error state
  if (barsError) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-red-500">Error loading bars data.</Text>
      </View>
    );
  }

  // Staff item renderer
  const renderStaffItem = (item: StaffProfile, bar: Bar) => (
    <View key={item.id} className="flex-row items-center justify-between py-3 border-b border-gray-100">
      <View>
        <Text className="font-medium">{item.name ? item.name : 'no name'}</Text>
        <Text className="text-xs text-gray-500">{item.email}</Text>
      </View>
      <TouchableOpacity
        className="bg-gray-100 px-3 py-1.5 rounded-md"
        onPress={() => {
          Alert.alert(
            'Remove Staff',
            `Remove ${item.name} from ${bar.name}?`,
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
        accessibilityLabel={`Remove ${item.name} from ${bar.name}`}
        disabled={removeStaffMutation.isPending}
      >
        {removeStaffMutation.isPending ? (
          <ActivityIndicator color="#4f46e5" size="small" />
        ) : (
          <Text className="text-gray-700 font-medium">Remove</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  // Customer item renderer
  const renderCustomerItem = ({ item }: { item: CustomerProfile }) => (
    <View className="mb-4 p-4 bg-gray-50 rounded-lg shadow-sm">
      <View className="flex-row justify-between items-start mb-2">
        <View>
          <Text className="font-semibold">{item.name ? item.name : 'no name'}</Text>
          <Text className="text-xs text-gray-500">{item.email}</Text>
        </View>
      </View>
      
      <View className="mb-3">
        <Text className="text-sm text-gray-500 mb-2">Select bar:</Text>
        <FlatList
          data={bars as Bar[]}
          horizontal
          keyExtractor={(bar) => bar.id}
          renderItem={({ item: bar }) => (
            <TouchableOpacity
              key={bar.id}
              className={`mr-2 px-3 py-1.5 rounded-md ${
                selectedBarId[item.id] === bar.id 
                  ? 'bg-indigo-100 border border-indigo-200' 
                  : 'bg-white border border-gray-200'
              }`}
              onPress={() => setSelectedBarId((prev) => ({ ...prev, [item.id]: bar.id }))}
            >
              <Text className={`${
                selectedBarId[item.id] === bar.id 
                  ? 'text-indigo-700 font-medium' 
                  : 'text-gray-700'
              }`}>
                {bar.name}
              </Text>
            </TouchableOpacity>
          )}
          showsHorizontalScrollIndicator={false}
        />
      </View>
      
      <TouchableOpacity
        className={`py-2 px-4 rounded-md items-center ${
          !selectedBarId[item.id] || promoteMutation.isPending
            ? 'bg-gray-200'
            : 'bg-indigo-600'
        }`}
        onPress={() => promoteMutation.mutate({ userId: item.id, barId: selectedBarId[item.id] })}
        disabled={!selectedBarId[item.id] || promoteMutation.isPending}
        activeOpacity={0.8}
      >
        {promoteMutation.isPending ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text className={`font-medium ${!selectedBarId[item.id] ? 'text-gray-500' : 'text-white'}`}>
            Promote to Staff
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 pt-8 pb-2 border-b border-gray-200">
        <Text className="text-xl font-bold text-gray-800">Manage Staff</Text>
      </View>

      <FlatList
        data={[{ id: 'container' }]} // Dummy data with key for the container
        keyExtractor={item => item.id}
        renderItem={() => null}
        ListHeaderComponent={
          <>
            {/* Staff Section */}
            {(bars ?? []).length > 0 && (
              <View className="px-4 pt-4 pb-6">
                <Text className="text-base font-semibold text-gray-700 mb-3">Current Staff</Text>
                {(bars ?? []).map((bar, idx) => {
                  const staffQuery = staffQueries[idx];
                  const staff = (staffQuery?.data ?? []) as StaffProfile[];
                  
                  return (
                    <View key={bar.id} className="mb-4">
                      <View className="flex-row justify-between items-center mb-2">
                        <Text className="font-medium text-gray-800">{bar.name}</Text>
                        <Text className="text-xs text-gray-500">{staff.length} staff</Text>
                      </View>
                      
                      {staffQuery?.isLoading ? (
                        <ActivityIndicator size="small" color="#4f46e5" />
                      ) : staff.length === 0 ? (
                        <Text className="text-gray-400 text-sm py-2">No staff assigned</Text>
                      ) : (
                        <View className="bg-white rounded-lg">
                          {staff.map(item => renderStaffItem(item, bar))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Search Section */}
            <View className="px-4 py-4 bg-gray-50">
              <Text className="text-base font-semibold text-gray-700 mb-2">Add New Staff</Text>
              <View className="flex-row items-center gap-2 mb-2">
                <TextInput
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 bg-white placeholder:text-gray-500 placeholder:font-medium"
                  placeholder="Search by name or email"
                  placeholderTextColor="#6b7280"
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
                  className="px-4 py-2.5 bg-indigo-600 rounded-lg"
                  onPress={() => setSearchSubmitted(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Search"
                >
                  <Text className="text-white font-medium">Search</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        }
        ListFooterComponent={
          <>
            {/* Results Section */}
            <View className="px-4 py-4">
              {(!searchSubmitted || !search) ? (
                <Text className="text-gray-500 text-center py-8">Enter a search term to find customers</Text>
              ) : loadingCustomers ? (
                <View className="py-8 items-center">
                  <ActivityIndicator size="large" color="#4f46e5" />
                </View>
              ) : customersError ? (
                <Text className="text-red-500 text-center py-8">Error loading customers</Text>
              ) : (
                <FlatList
                  data={customers as CustomerProfile[]}
                  keyExtractor={(item) => item.id}
                  renderItem={renderCustomerItem}
                  ListEmptyComponent={
                    <Text className="text-gray-500 text-center py-8">No customers found</Text>
                  }
                  scrollEnabled={false}
                />
              )}
            </View>
          </>
        }
      />
    </View>
  );
};

export default ManageStaffScreen;