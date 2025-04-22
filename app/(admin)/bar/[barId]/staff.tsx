import { useState } from "react"
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, ScrollView, Alert, StyleSheet } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/src/lib/supabase"
import { useAuthStore } from "@/src/features/auth/store/auth-store"
import { useToast } from "@/src/components/general/Toast"
import { UserPlus, UserMinus, Search, X, CheckCircle, AlertCircle, Users, RefreshCw, User } from "lucide-react-native"
import type { Database } from "@/src/lib/database.types"

type StaffAssignment = Database["public"]["Tables"]["staff_assignments"]["Row"] & {
  staff: {
    id: string
    name: string | null
    email: string | null
    role: string
  }
}

type Profile = Database["public"]["Tables"]["profiles"]["Row"]

export default function StaffScreen() {
  const { barId } = useLocalSearchParams<{ barId: string }>()
  const profile = useAuthStore((s) => s.profile)
  const toast = useToast()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<"current" | "add">("current")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)

  // Check if current user has permission to manage staff
  const { data: permissions } = useQuery({
    queryKey: ["bar_permissions", barId, profile?.id],
    queryFn: async () => {
      if (!barId || !profile?.id) return { canManageStaff: false }

      const { data, error } = await supabase.from("bars").select("owner_id").eq("id", barId).single()

      if (error) throw error

      // Check if user is the owner or has owner role
      const isOwner = data.owner_id === profile.id || profile.role === "owner"

      return {
        canManageStaff: isOwner,
        isOwner,
      }
    },
    enabled: !!barId && !!profile?.id,
  })

  const canManageStaff = permissions?.canManageStaff || false

  const {
    data: staffAssignments,
    isLoading: isLoadingStaff,
    error: staffError,
    refetch: refetchStaff,
  } = useQuery({
    queryKey: ["staff_assignments", barId],
    queryFn: async () => {
      if (!barId) return []
      const { data, error } = await supabase
        .from("staff_assignments")
        .select(`
          *,
          staff:profiles!staff_assignments_staff_user_id_fkey(id, name, email, role)
        `)
        .eq("bar_id", barId)

      if (error) throw error
      return data as StaffAssignment[]
    },
    enabled: !!barId && !!profile,
  })

  const {
    data: searchResults,
    isLoading: isSearching,
    error: searchError,
  } = useQuery({
    queryKey: ["profiles_search_customers", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 3) return []

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "customer")
        .or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .limit(5)

      if (error) throw error

      const filteredData = data?.filter((user) => user.id !== profile?.id) || []
      return filteredData as Profile[]
    },
    enabled: activeTab === "add" && searchQuery.length >= 3 && !!profile?.id,
  })

  const promoteToStaff = useMutation({
    mutationFn: async (userId: string) => {
      if (!barId) throw new Error("Bar ID is required for promotion.")
      if (!canManageStaff) throw new Error("You do not have permission to manage staff")

      const { error } = await supabase.rpc("promote_to_staff", {
        target_user_id: userId,
        assigned_bar_id: barId,
      })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff_assignments", barId] })
      queryClient.invalidateQueries({ queryKey: ["profiles_search_customers", searchQuery] })
      toast.show({ type: "success", text1: "User promoted to staff and assigned" })
      setSelectedUser(null)
      setSearchQuery("")
      setActiveTab("current")
    },
    onError: (error) => {
      toast.show({
        type: "error",
        text1: "Failed to promote user",
        text2: error instanceof Error ? error.message : "Unknown error",
      })
    },
  })

  const demoteStaff = useMutation({
    mutationFn: async (userId: string) => {
      if (!barId) throw new Error("Bar ID is required for demotion.")
      if (!canManageStaff) throw new Error("You do not have permission to manage staff")

      const { error } = await supabase.rpc("demote_staff", {
        target_user_id: userId,
        bar_id: barId,
      })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff_assignments", barId] })
      toast.show({ type: "success", text1: "Staff member demoted" })
    },
    onError: (error) => {
      toast.show({
        type: "error",
        text1: "Failed to demote staff",
        text2: error instanceof Error ? error.message : "Unknown error",
      })
    },
  })

  const handleSearchChange = (text: string) => {
    setSearchQuery(text)
    setSelectedUser(null)
  }

  const handleToggleUserSelection = (user: Profile) => {
    setSelectedUser(selectedUser?.id === user.id ? null : user)
  }

  const handleAssignStaff = () => {
    if (!selectedUser) return

    const isAlreadyAssigned = staffAssignments?.some((assignment) => assignment.staff_user_id === selectedUser?.id)

    if (isAlreadyAssigned) {
      toast.show({
        type: "warning",
        text1: "User already assigned",
        text2: "This user is already assigned to this bar.",
      })
      setSelectedUser(null)
      return
    }

    Alert.alert(
      "Promote and Assign User",
      `${selectedUser.name || selectedUser.email || "This user"} is currently a customer. Promote them to staff for this bar and assign them?`,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => setSelectedUser(null),
        },
        {
          text: "Promote & Assign",
          onPress: () => {
            if (selectedUser) {
              promoteToStaff.mutate(selectedUser.id)
            }
          },
        },
      ],
    )
  }

  const handleDemoteStaff = (assignment: StaffAssignment) => {
    Alert.alert(
      "Demote Staff",
      `Demote ${assignment.staff.name || assignment.staff.email || "this staff member"}? They will lose staff privileges for this bar and the assignment will be removed.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Demote",
          style: "destructive",
          onPress: () => demoteStaff.mutate(assignment.staff_user_id),
        },
      ],
    )
  }

  const renderError = (error: unknown, message: string, retryFn?: () => void) => (
    <View style={styles.errorContainer}>
      <AlertCircle size={24} color="#f87171" />
      <Text style={styles.errorTitle}>{message}</Text>
      <Text style={styles.errorMessage}>{error instanceof Error ? error.message : "An unknown error occurred."}</Text>
      {retryFn && (
        <TouchableOpacity onPress={retryFn} style={styles.retryButton}>
          <RefreshCw size={16} color="#f87171" />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  )

  const renderCurrentStaffTab = () => {
    if (isLoadingStaff) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Loading staff members...</Text>
        </View>
      )
    }

    if (staffError) {
      return renderError(staffError, "Failed to load staff members", refetchStaff)
    }

    if (!staffAssignments || staffAssignments.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Users size={40} color="#6b7280" />
          <Text style={styles.emptyText}>
            No staff members assigned to this bar yet.
            {canManageStaff ? " Switch to the Add Staff tab to search for customers and promote them." : ""}
          </Text>
        </View>
      )
    }

    return (
      <View style={styles.staffListContainer}>
        <Text style={styles.staffCountText}>Staff Members ({staffAssignments.length})</Text>
        {staffAssignments.map((assignment) => (
          <View
            key={assignment.id}
            style={styles.staffCard}
            accessibilityLabel={`Staff member: ${assignment.staff.name || "Unnamed Staff"}`}
          >
            <View style={styles.staffAvatarContainer}>
              <View style={styles.staffAvatar}>
                <User size={20} color="#8b5cf6" />
              </View>
            </View>
            <View style={styles.staffInfo}>
              <Text style={styles.staffName}>{assignment.staff.name || "Unnamed Staff"}</Text>
              <Text style={styles.staffEmail}>{assignment.staff.email || "No email"}</Text>
              <View style={styles.badgeContainer}>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{assignment.staff.role}</Text>
                </View>
              </View>
            </View>
            {canManageStaff && (
              <TouchableOpacity
                onPress={() => handleDemoteStaff(assignment)}
                style={styles.demoteButton}
                accessibilityLabel={`Demote ${assignment.staff.name || "staff member"}`}
                disabled={demoteStaff.isPending}
              >
                {demoteStaff.isPending && demoteStaff.variables === assignment.staff_user_id ? (
                  <ActivityIndicator size="small" color="#f87171" />
                ) : (
                  <>
                    <UserMinus size={16} color="#f87171" />
                    <Text style={styles.demoteButtonText}>Demote</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    )
  }

  const renderAddStaffTab = () => {
    if (!canManageStaff) {
      return (
        <View style={styles.permissionWarning}>
          <View style={styles.permissionWarningHeader}>
            <AlertCircle size={24} color="#f59e0b" />
            <Text style={styles.permissionWarningTitle}>Permission Required</Text>
          </View>
          <Text style={styles.permissionWarningText}>
            You don't have permission to add staff members to this bar. Only the bar owner can perform these actions.
          </Text>
        </View>
      )
    }

    return (
      <View style={styles.addStaffContainer}>
        <View style={styles.searchInputContainer}>
          <Search size={18} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search customers by name or email..."
            placeholderTextColor="#6b7280"
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never"
            accessibilityLabel="Search customers input"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => handleSearchChange("")}
              style={styles.clearButton}
              accessibilityLabel="Clear search"
            >
              <X size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>

        {searchQuery.length > 0 && searchQuery.length < 3 && (
          <View style={styles.searchHintContainer}>
            <Text style={styles.searchHintText}>Please enter at least 3 characters to search</Text>
          </View>
        )}

        {isSearching && (
          <View style={styles.searchingContainer}>
            <ActivityIndicator size="small" color="#8b5cf6" />
            <Text style={styles.searchingText}>Searching customers...</Text>
          </View>
        )}

        {searchError && renderError(searchError, "Search failed")}

        {!isSearching && searchResults && searchResults.length === 0 && searchQuery.length >= 3 && (
          <View style={styles.noResultsContainer}>
            <Text style={styles.noResultsText}>No customers found matching "{searchQuery}"</Text>
          </View>
        )}

        {!isSearching && searchResults && searchResults.length > 0 && (
          <View style={styles.resultsContainer}>
            <Text style={styles.resultsTitle}>Search Results</Text>
            <ScrollView style={styles.resultsScrollView} nestedScrollEnabled>
              {searchResults.map((user) => (
                <TouchableOpacity
                  key={user.id}
                  style={[styles.resultItem, selectedUser?.id === user.id && styles.selectedResultItem]}
                  onPress={() => handleToggleUserSelection(user)}
                  accessibilityLabel={`Select user: ${user.name || user.email || "Unnamed User"}`}
                >
                  <View style={styles.resultAvatarContainer}>
                    <View style={styles.resultAvatar}>
                      <User size={16} color="#8b5cf6" />
                    </View>
                  </View>
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultName}>{user.name || "Unnamed User"}</Text>
                    <Text style={styles.resultEmail}>{user.email || "No email"}</Text>
                    <View style={styles.resultBadgeContainer}>
                      <View style={styles.customerRoleBadge}>
                        <Text style={styles.customerRoleBadgeText}>{user.role}</Text>
                      </View>
                    </View>
                  </View>
                  {selectedUser?.id === user.id && (
                    <View style={styles.selectedCheckmark}>
                      <CheckCircle size={20} color="#8b5cf6" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {selectedUser && (
          <TouchableOpacity
            style={[styles.promoteButton, promoteToStaff.isPending && styles.promoteButtonDisabled]}
            onPress={handleAssignStaff}
            disabled={promoteToStaff.isPending}
            accessibilityLabel={`Promote and assign ${selectedUser.name || "selected user"} as staff`}
          >
            {promoteToStaff.isPending ? (
              <>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.promoteButtonText}>Processing...</Text>
              </>
            ) : (
              <>
                <UserPlus size={18} color="#ffffff" />
                <Text style={styles.promoteButtonText}>Promote & Assign as Staff</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    )
  }

  // Show permission error if user can't manage staff and we're on the current staff tab
  if (permissions && !permissions.canManageStaff && !isLoadingStaff && activeTab === "current") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Staff Management</Text>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === "current" && styles.activeTabButton]}
            onPress={() => setActiveTab("current")}
          >
            <Text style={[styles.tabButtonText, activeTab === "current" && styles.activeTabButtonText]}>
              Current Staff
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === "add" && styles.activeTabButton]}
            onPress={() => setActiveTab("add")}
          >
            <Text style={[styles.tabButtonText, activeTab === "add" && styles.activeTabButtonText]}>Add Staff</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.permissionWarning}>
          <View style={styles.permissionWarningHeader}>
            <AlertCircle size={24} color="#f59e0b" />
            <Text style={styles.permissionWarningTitle}>Permission Required</Text>
          </View>
          <Text style={styles.permissionWarningText}>
            You don't have permission to manage staff for this bar. Only the bar owner can perform these actions.
          </Text>
        </View>

        {renderCurrentStaffTab()}
      </ScrollView>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Staff Management</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "current" && styles.activeTabButton]}
          onPress={() => setActiveTab("current")}
        >
          <Text style={[styles.tabButtonText, activeTab === "current" && styles.activeTabButtonText]}>
            Current Staff
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "add" && styles.activeTabButton]}
          onPress={() => setActiveTab("add")}
        >
          <Text style={[styles.tabButtonText, activeTab === "add" && styles.activeTabButtonText]}>Add Staff</Text>
        </TouchableOpacity>
      </View>

      {activeTab === "current" ? renderCurrentStaffTab() : renderAddStaffTab()}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212", // Dark background
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ffffff",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#1e1e1e",
    borderRadius: 12,
    marginBottom: 20,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
  },
  activeTabButton: {
    backgroundColor: "#2d2d2d",
  },
  tabButtonText: {
    color: "#a1a1aa",
    fontWeight: "600",
  },
  activeTabButtonText: {
    color: "#ffffff",
  },
  staffListContainer: {
    marginTop: 8,
  },
  staffCountText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#a1a1aa",
    marginBottom: 16,
  },
  staffCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e1e1e",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  staffAvatarContainer: {
    marginRight: 12,
  },
  staffAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2d2d2d",
    alignItems: "center",
    justifyContent: "center",
  },
  staffInfo: {
    flex: 1,
  },
  staffName: {
    fontWeight: "600",
    color: "#ffffff",
    fontSize: 16,
  },
  staffEmail: {
    color: "#a1a1aa",
    fontSize: 14,
    marginTop: 2,
  },
  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  roleBadge: {
    backgroundColor: "#4c1d95",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  roleBadgeText: {
    color: "#c4b5fd",
    fontSize: 12,
    fontWeight: "500",
  },
  demoteButton: {
    backgroundColor: "#450a0a",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  demoteButtonText: {
    color: "#f87171",
    fontWeight: "500",
    fontSize: 13,
    marginLeft: 6,
  },
  addStaffContainer: {
    marginTop: 8,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2d2d2d",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    color: "#ffffff",
    height: 24,
    fontSize: 15,
  },
  clearButton: {
    padding: 6,
  },
  searchHintContainer: {
    backgroundColor: "#1e293b",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  searchHintText: {
    color: "#93c5fd",
    fontSize: 14,
    textAlign: "center",
  },
  searchingContainer: {
    alignItems: "center",
    paddingVertical: 24,
  },
  searchingText: {
    fontSize: 14,
    color: "#a1a1aa",
    marginTop: 12,
  },
  noResultsContainer: {
    alignItems: "center",
    paddingVertical: 24,
    backgroundColor: "#1e1e1e",
    borderRadius: 12,
  },
  noResultsText: {
    color: "#a1a1aa",
    textAlign: "center",
    marginTop: 16,
    fontSize: 15,
  },
  resultsContainer: {
    backgroundColor: "#1e1e1e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    maxHeight: 320,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 12,
  },
  resultsScrollView: {
    maxHeight: 280,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#2d2d2d",
  },
  selectedResultItem: {
    backgroundColor: "#3b0764",
  },
  resultAvatarContainer: {
    marginRight: 12,
  },
  resultAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#3f3f46",
    alignItems: "center",
    justifyContent: "center",
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontWeight: "500",
    color: "#ffffff",
    fontSize: 15,
  },
  resultEmail: {
    color: "#a1a1aa",
    fontSize: 13,
    marginTop: 2,
  },
  resultBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  customerRoleBadge: {
    backgroundColor: "#1e3a8a",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  customerRoleBadgeText: {
    color: "#93c5fd",
    fontSize: 12,
    fontWeight: "500",
  },
  selectedCheckmark: {
    padding: 4,
  },
  promoteButton: {
    backgroundColor: "#7c3aed",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  promoteButtonDisabled: {
    backgroundColor: "#4c1d95",
  },
  promoteButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    marginLeft: 8,
    fontSize: 15,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    color: "#a1a1aa",
    fontSize: 15,
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: "#2c0b0e",
    borderRadius: 12,
    marginVertical: 8,
  },
  errorTitle: {
    marginTop: 8,
    color: "#f87171",
    fontWeight: "600",
    fontSize: 16,
  },
  errorMessage: {
    color: "#ef4444",
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 12,
    backgroundColor: "#450a0a",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  retryText: {
    color: "#f87171",
    fontWeight: "500",
    marginLeft: 6,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 16,
    backgroundColor: "#1e1e1e",
    borderRadius: 12,
  },
  emptyText: {
    color: "#a1a1aa",
    textAlign: "center",
    marginTop: 16,
    fontSize: 15,
  },
  permissionWarning: {
    backgroundColor: "#422006",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  permissionWarningHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  permissionWarningTitle: {
    marginLeft: 8,
    fontWeight: "600",
    color: "#f59e0b",
    fontSize: 16,
  },
  permissionWarningText: {
    color: "#fbbf24",
    marginTop: 8,
    fontSize: 14,
  },
})
