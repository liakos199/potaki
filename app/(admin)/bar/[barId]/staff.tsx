import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StatusBar,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchCustomers, promoteToStaff, fetchBarStaff, removeStaff } from '@/src/features/staff/api';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import type { CustomerProfile, StaffProfile } from '@/src/features/staff/types';

const StaffScreen = (): JSX.Element => {
  const router = useRouter();
  const { barId } = useLocalSearchParams<{ barId: string }>();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [activeTab, setActiveTab] = useState('current'); // 'current' or 'add'

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
      Alert.alert('Staff Removed', 'The staff member has been removed successfully.');
    },
    onError: (err: any) => {
      Alert.alert('Action Failed', err.message || 'Could not remove staff member.');
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
      Alert.alert('Staff Added', 'User has been successfully promoted to staff!');
      setActiveTab('current');
    },
    onError: (err: any) => {
      Alert.alert('Action Failed', err.message || 'Could not promote user to staff.');
    },
  });

  // Authorization check
  if (!profile || profile.role !== 'owner') {
    return (
      <SafeAreaView className="flex-1 bg-[#0f0f13]">
        <StatusBar barStyle="light-content" />
        <View
        
          className="flex-1 items-center justify-center p-6"
        >
          <Image 
            source={{ uri: 'https://cdn.iconscout.com/icon/free/png-256/free-lock-1851503-1569339.png' }} 
            className="w-20 h-20 mb-6"
          />
          <Text className="text-2xl font-bold text-white mb-3">Access Restricted</Text>
          <Text className="text-base text-gray-300 text-center mb-8">
            Only bar owners can access the staff management section.
          </Text>
          <TouchableOpacity
            className="bg-purple-600 py-3 px-6 rounded-xl"
            onPress={() => router.back()}
          >
            <Text className="text-white font-semibold text-base">Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Loading state
  if (loadingStaff) {
    return (
      <SafeAreaView className="flex-1 bg-[#0f0f13]">
        <StatusBar barStyle="light-content" />
        <View className="flex-1 items-center justify-center">
          <View className="bg-[#1c1c24] rounded-2xl p-6 mb-4">
            <ActivityIndicator size="large" color="#a855f7" />
          </View>
          <Text className="text-gray-300 text-base">Loading staff information...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (staffError) {
    return (
      <SafeAreaView className="flex-1 bg-[#0f0f13]">
        <StatusBar barStyle="light-content" />
        <View className="flex-1 items-center justify-center p-6">
          <Image 
            source={{ uri: 'https://cdn.iconscout.com/icon/free/png-256/free-error-2689513-2232392.png' }} 
            className="w-20 h-20 mb-6"
          />
          <Text className="text-2xl font-bold text-red-500 mb-3">Connection Error</Text>
          <Text className="text-base text-gray-300 text-center mb-8">
            We couldn't load your staff data. Please check your connection and try again.
          </Text>
          <TouchableOpacity
            className="bg-purple-600 py-3 px-6 rounded-xl"
            onPress={() => refetchStaff()}
          >
            <Text className="text-white font-semibold text-base">Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Staff item renderer
  const renderStaffItem = (item: StaffProfile) => (
    <View 
      className="flex-row items-center bg-[#1c1c24] rounded-2xl p-4 mb-3 border border-[#2d2d3a]" 
      key={item.id}
    >
      <View className="mr-4">
        <View className="w-[50px] h-[50px] rounded-full bg-purple-900 items-center justify-center">
          <Text className="text-xl font-semibold text-white">
            {(item.name?.[0] || 'S').toUpperCase()}
          </Text>
        </View>
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-white mb-1">
          {item.name || 'Unnamed Staff'}
        </Text>
        <Text className="text-sm text-gray-400">{item.email}</Text>
      </View>
      <TouchableOpacity
        className="bg-red-800 py-2 px-4 rounded-lg"
        onPress={() => {
          Alert.alert(
            'Remove Staff Member',
            `Are you sure you want to remove ${item.name || 'this staff member'}?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Remove', 
                style: 'destructive', 
                onPress: () => removeStaffMutation.mutate({ userId: item.id, barId: barId as string }) 
              },
            ]
          );
        }}
        accessibilityRole="button"
        accessibilityLabel="Remove Staff"
      >
        <Text className="text-white font-medium text-sm">Remove</Text>
      </TouchableOpacity>
    </View>
  );

  // Customer item renderer
  const renderCustomerItem = ({ item }: { item: CustomerProfile }) => (
    <View 
      className="flex-row items-center bg-[#1c1c24] rounded-2xl p-4 mb-3 border border-[#2d2d3a]" 
      key={item.id}
    >
      <View className="mr-4">
        <View className="w-[50px] h-[50px] rounded-full bg-blue-900 items-center justify-center">
          <Text className="text-xl font-semibold text-white">
            {(item.name?.[0] || 'C').toUpperCase()}
          </Text>
        </View>
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-white mb-1">
          {item.name || 'Unnamed Customer'}
        </Text>
        <Text className="text-sm text-gray-400">{item.email}</Text>
      </View>
      <TouchableOpacity
        className="bg-purple-800 py-2 px-4 rounded-lg"
        onPress={() => {
          Alert.alert(
            'Promote to Staff',
            `Are you sure you want to promote ${item.name || 'this user'} to staff?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Promote', 
                style: 'default', 
                onPress: () => promoteMutation.mutate({ userId: item.id, barId: barId as string }) 
              },
            ]
          );
        }}
        accessibilityRole="button"
        accessibilityLabel="Promote to Staff"
      >
        <Text className="text-white font-medium text-sm">Promote</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-[#0f0f13]">
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View

        className="py-6 px-5 rounded-b-[20px]"
      >
        <Text className="text-3xl font-bold text-white mb-1">Staff Management</Text>
        <Text className="text-base text-gray-300 opacity-80">Manage your bar's team members</Text>
      </View>
      
      {/* Tab Navigation */}
      <View className="flex-row px-5 mt-4">
        <TouchableOpacity
          className={`flex-1 py-3 items-center border-b-2 ${
            activeTab === 'current' ? 'border-purple-500' : 'border-transparent'
          }`}
          onPress={() => setActiveTab('current')}
        >
          <Text className={`text-base font-medium ${
            activeTab === 'current' ? 'text-white font-semibold' : 'text-gray-400'
          }`}>
            Current Staff ({staff.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-3 items-center border-b-2 ${
            activeTab === 'add' ? 'border-purple-500' : 'border-transparent'
          }`}
          onPress={() => setActiveTab('add')}
        >
          <Text className={`text-base font-medium ${
            activeTab === 'add' ? 'text-white font-semibold' : 'text-gray-400'
          }`}>
            Add New Staff
          </Text>
        </TouchableOpacity>
      </View>
      
      <ScrollView 
        className="flex-1"
        contentContainerClassName="pb-10"
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'current' ? (
          // Current Staff Tab
          <View className="p-5">
            {staff.length === 0 ? (
              <View className="items-center justify-center bg-[#1c1c24] rounded-2xl p-10 border border-[#2d2d3a]">
                <Image 
                  source={{ uri: 'https://cdn.iconscout.com/icon/free/png-256/free-user-1912186-1617654.png' }} 
                  className="w-[60px] h-[60px] mb-4 opacity-70"
                />
                <Text className="text-xl font-semibold text-white mb-2">No Staff Members</Text>
                <Text className="text-base text-gray-400 text-center mb-6">
                  You haven't added any staff members to your bar yet.
                </Text>
                <TouchableOpacity
                  className="bg-purple-700 py-3 px-6 rounded-xl"
                  onPress={() => setActiveTab('add')}
                >
                  <Text className="text-white font-semibold text-base">Add Staff</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text className="text-xl font-semibold text-white mb-4">Your Team</Text>
                {staff.map(renderStaffItem)}
              </>
            )}
          </View>
        ) : (
          // Add New Staff Tab
          <View className="p-5">
            <Text className="text-xl font-semibold text-white mb-2">Find Customers to Promote</Text>
            <Text className="text-sm text-gray-400 mb-5">
              Search for customers by name or email to promote them to staff members
            </Text>
            
            {/* Search Box */}
            <View className="flex-row mb-6">
              <TextInput
                className="flex-1 bg-[#1c1c24] border border-[#2d2d3a] rounded-xl px-4 py-3.5 text-base text-white mr-3"
                placeholder="Search by name or email"
                placeholderTextColor="#9ca3af"
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
                className={`bg-purple-700 px-5 rounded-xl items-center justify-center ${
                  !search.trim() ? 'opacity-60 bg-gray-600' : ''
                }`}
                onPress={() => setSearchSubmitted(true)}
                disabled={!search.trim()}
                accessibilityRole="button"
                accessibilityLabel="Search"
              >
                <Text className="text-white font-semibold text-base">Search</Text>
              </TouchableOpacity>
            </View>
            
            {/* Search Results */}
            {!searchSubmitted || !search.trim() ? (
              <View className="items-center justify-center bg-[#1c1c24] rounded-2xl p-10 border border-[#2d2d3a]">
                <Image 
                  source={{ uri: 'https://cdn.iconscout.com/icon/free/png-256/free-search-1768073-1502246.png' }} 
                  className="w-[60px] h-[60px] mb-4 opacity-70"
                />
                <Text className="text-base text-gray-400 text-center">
                  Enter a name or email to search for customers
                </Text>
              </View>
            ) : loadingCustomers ? (
              <View className="items-center justify-center bg-[#1c1c24] rounded-2xl p-10 border border-[#2d2d3a]">
                <ActivityIndicator size="large" color="#a855f7" />
                <Text className="text-base text-gray-400 mt-4">Searching for customers...</Text>
              </View>
            ) : customersError ? (
              <View className="items-center justify-center bg-[#1c1c24] rounded-2xl p-10 border border-[#2d2d3a]">
                <Text className="text-xl font-semibold text-red-500 mb-2">Search Failed</Text>
                <Text className="text-base text-gray-400 text-center mb-6">
                  We couldn't complete your search. Please try again.
                </Text>
                <TouchableOpacity
                  className="bg-purple-700 py-3 px-6 rounded-xl"
                  onPress={() => refetchCustomers()}
                >
                  <Text className="text-white font-semibold text-base">Retry Search</Text>
                </TouchableOpacity>
              </View>
            ) : customers.length === 0 ? (
              <View className="items-center justify-center bg-[#1c1c24] rounded-2xl p-10 border border-[#2d2d3a]">
                <Text className="text-xl font-semibold text-white mb-2">No Results Found</Text>
                <Text className="text-base text-gray-400 text-center">
                  No customers found matching "{search}"
                </Text>
              </View>
            ) : (
              <View className="mt-2">
                <Text className="text-base font-medium text-gray-300 mb-4">
                  Found {customers.length} customer{customers.length !== 1 ? 's' : ''}
                </Text>
                {customers.map((item) => renderCustomerItem({ item }))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default StaffScreen;