import { useState } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	ActivityIndicator,
	TextInput,
	ScrollView,
	Alert,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/src/lib/supabase";
import { useAuthStore } from "@/src/features/auth/store/auth-store";
import { useToast } from "@/src/components/general/Toast";
import {
	UserPlus,
	UserMinus,
	Search,
	X,
	CheckCircle,
	AlertCircle,
	Users,
	RefreshCw,
	User,
} from "lucide-react-native";
import type { Database } from "@/src/lib/database.types";

type StaffAssignment = Database["public"]["Tables"]["staff_assignments"]["Row"] & {
	staff: {
		id: string;
		name: string | null;
		email: string | null;
		role: string;
	};
};

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export default function StaffScreen() {
	const { barId } = useLocalSearchParams<{ barId: string }>();
	const profile = useAuthStore((s) => s.profile);
	const toast = useToast();
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState<"current" | "add">("current");
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedUser, setSelectedUser] = useState<Profile | null>(null);

	const { data: permissions } = useQuery({
		queryKey: ["bar_permissions", barId, profile?.id],
		queryFn: async () => {
			if (!barId || !profile?.id) return { canManageStaff: false };

			const { data, error } = await supabase
				.from("bars")
				.select("owner_id")
				.eq("id", barId)
				.single();

			if (error) throw error;

			const isOwner = data.owner_id === profile.id || profile.role === "owner";

			return {
				canManageStaff: isOwner,
				isOwner,
			};
		},
		enabled: !!barId && !!profile?.id,
	});

	const canManageStaff = permissions?.canManageStaff || false;

	const {
		data: staffAssignments,
		isLoading: isLoadingStaff,
		error: staffError,
		refetch: refetchStaff,
	} = useQuery({
		queryKey: ["staff_assignments", barId],
		queryFn: async () => {
			if (!barId) return [];
			const { data, error } = await supabase
				.from("staff_assignments")
				.select(
					`
          *,
          staff:profiles!staff_assignments_staff_user_id_fkey(id, name, email, role)
        `
				)
				.eq("bar_id", barId);

			if (error) throw error;
			return data as StaffAssignment[];
		},
		enabled: !!barId && !!profile,
	});

	const {
		data: searchResults,
		isLoading: isSearching,
		error: searchError,
	} = useQuery({
		queryKey: ["profiles_search_customers", searchQuery],
		queryFn: async () => {
			if (!searchQuery || searchQuery.length < 3) return [];

			const { data, error } = await supabase
				.from("profiles")
				.select("*")
				.eq("role", "customer")
				.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
				.limit(5);

			if (error) throw error;

			const filteredData =
				data?.filter((user) => user.id !== profile?.id) || [];
			return filteredData as Profile[];
		},
		enabled: activeTab === "add" && searchQuery.length >= 3 && !!profile?.id,
	});

	const promoteToStaff = useMutation({
		mutationFn: async (userId: string) => {
			if (!barId) throw new Error("Bar ID is required for promotion.");
			if (!canManageStaff)
				throw new Error("You do not have permission to manage staff");

			const { error } = await supabase.rpc("promote_to_staff", {
				target_user_id: userId,
				assigned_bar_id: barId,
			});

			if (error) throw error;
		},
		onSuccess: async () => {
			// Invalidate and then explicitly refetch the staff list, awaiting completion
			await queryClient.invalidateQueries({ queryKey: ["staff_assignments", barId] });
			await queryClient.refetchQueries({ queryKey: ["staff_assignments", barId] });

			// Invalidate search results
			queryClient.invalidateQueries({ queryKey: ["profiles_search_customers", searchQuery] });

			toast.show({ type: "success", text1: "User promoted to staff and assigned" });
			setSelectedUser(null);
			setSearchQuery("");
			setActiveTab("current"); // Switch tab only after refetch is likely complete
		},
		onError: (error) => {
			toast.show({
				type: "error",
				text1: "Failed to promote user",
				text2: error instanceof Error ? error.message : "Unknown error",
			});
		},
	});


	const demoteStaff = useMutation({
		mutationFn: async (userId: string) => {
			if (!barId) throw new Error("Bar ID is required for demotion.");
			if (!canManageStaff)
				throw new Error("You do not have permission to manage staff");

			const { error } = await supabase.rpc("demote_staff", {
				target_user_id: userId,
				bar_id: barId,
			});

			if (error) throw error;
		},
		onSuccess: async () => {
			// Invalidate and refetch immediately after demotion as well
			await queryClient.invalidateQueries({ queryKey: ["staff_assignments", barId] });
			await queryClient.refetchQueries({ queryKey: ["staff_assignments", barId] });
			toast.show({ type: "success", text1: "Staff member demoted" });
		},
		onError: (error) => {
			toast.show({
				type: "error",
				text1: "Failed to demote staff",
				text2: error instanceof Error ? error.message : "Unknown error",
			});
		},
	});

	const handleSearchChange = (text: string) => {
		setSearchQuery(text);
		setSelectedUser(null);
	};

	const handleToggleUserSelection = (user: Profile) => {
		setSelectedUser(selectedUser?.id === user.id ? null : user);
	};

	const handleAssignStaff = () => {
		if (!selectedUser) return;

		const isAlreadyAssigned = staffAssignments?.some(
			(assignment) => assignment.staff_user_id === selectedUser?.id
		);

		if (isAlreadyAssigned) {
			toast.show({
				type: "warning",
				text1: "User already assigned",
				text2: "This user is already assigned to this bar.",
			});
			setSelectedUser(null);
			return;
		}

		Alert.alert(
			"Promote and Assign User",
			`${
				selectedUser.name || selectedUser.email || "This user"
			} is currently a customer. Promote them to staff for this bar and assign them?`,
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
							promoteToStaff.mutate(selectedUser.id);
						}
					},
				},
			]
		);
	};

	const handleDemoteStaff = (assignment: StaffAssignment) => {
		Alert.alert(
			"Demote Staff",
			`Demote ${
				assignment.staff.name || assignment.staff.email || "this staff member"
			}? They will lose staff privileges for this bar and the assignment will be removed.`,
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
			]
		);
	};

	const renderError = (
		error: unknown,
		message: string,
		retryFn?: () => void
	) => (
		<View className="items-center justify-center py-6 px-4 bg-[#2c0b0e] rounded-xl my-2">
			<AlertCircle size={24} color="#f87171" />
			<Text className="mt-2 text-red-400 font-semibold text-base">
				{message}
			</Text>
			<Text className="text-red-500 text-sm mt-1 text-center">
				{error instanceof Error ? error.message : "An unknown error occurred."}
			</Text>
			{retryFn && (
				<TouchableOpacity
					onPress={retryFn}
					className="mt-3 bg-red-950 py-2 px-4 rounded-lg flex-row items-center"
				>
					<RefreshCw size={16} color="#f87171" />
					<Text className="text-red-400 font-medium ml-1.5">Retry</Text>
				</TouchableOpacity>
			)}
		</View>
	);

	const renderCurrentStaffTab = () => {
		if (isLoadingStaff && !staffAssignments) { // Show loading only if data is truly absent initially
			return (
				<View className="items-center justify-center py-10">
					<ActivityIndicator size="large" color="#8b5cf6" />
					<Text className="mt-4 text-zinc-400 text-[15px]">
						Loading staff members...
					</Text>
				</View>
			);
		}

		if (staffError) {
			return renderError(staffError, "Failed to load staff members", refetchStaff);
		}

		if (!staffAssignments || staffAssignments.length === 0) {
			return (
				<View className="items-center justify-center py-10 px-4 bg-[#1e1e1e] rounded-xl">
					<Users size={40} color="#6b7280" />
					<Text className="text-zinc-400 text-center mt-4 text-[15px]">
						No staff members assigned to this bar yet.
						{canManageStaff
							? " Switch to the Add Staff tab to search for customers and promote them."
							: ""}
					</Text>
				</View>
			);
		}

		return (
			<View className="mt-2">
				<Text className="text-base font-semibold text-zinc-400 mb-4">
					Staff Members ({staffAssignments.length})
				</Text>
				{staffAssignments.map((assignment) => (
					<View
						key={assignment.id}
						className="flex-row items-center bg-[#1e1e1e] p-4 rounded-xl mb-3"
						accessibilityLabel={`Staff member: ${
							assignment.staff.name || "Unnamed Staff"
						}`}
					>
						<View className="mr-3">
							<View className="w-10 h-10 rounded-full bg-[#2d2d2d] items-center justify-center">
								<User size={20} color="#8b5cf6" />
							</View>
						</View>
						<View className="flex-1">
							<Text className="font-semibold text-white text-base">
								{assignment.staff.name || "Unnamed Staff"}
							</Text>
							<Text className="text-zinc-400 text-sm mt-0.5">
								{assignment.staff.email || "No email"}
							</Text>
							<View className="flex-row items-center mt-1.5">
								<View className="bg-violet-900 px-2 py-0.5 rounded-full">
									<Text className="text-violet-300 text-xs font-medium">
										{assignment.staff.role}
									</Text>
								</View>
							</View>
						</View>
						{canManageStaff && (
							<TouchableOpacity
								onPress={() => handleDemoteStaff(assignment)}
								className="bg-red-950 py-2 px-3 rounded-lg flex-row items-center"
								accessibilityLabel={`Demote ${
									assignment.staff.name || "staff member"
								}`}
								disabled={demoteStaff.isPending && demoteStaff.variables === assignment.staff_user_id}
							>
								{demoteStaff.isPending &&
								demoteStaff.variables === assignment.staff_user_id ? (
									<ActivityIndicator size="small" color="#f87171" />
								) : (
									<>
										<UserMinus size={16} color="#f87171" />
										<Text className="text-red-400 font-medium text-[13px] ml-1.5">
											Demote
										</Text>
									</>
								)}
							</TouchableOpacity>
						)}
					</View>
				))}
			</View>
		);
	};

	const renderAddStaffTab = () => {
		if (!canManageStaff) {
			return (
				<View className="bg-amber-950 p-4 rounded-xl mb-4">
					<View className="flex-row items-center">
						<AlertCircle size={24} color="#f59e0b" />
						<Text className="ml-2 font-semibold text-amber-500 text-base">
							Permission Required
						</Text>
					</View>
					<Text className="text-amber-400 mt-2 text-sm">
						You don't have permission to add staff members to this bar. Only
						the bar owner can perform these actions.
					</Text>
				</View>
			);
		}

		return (
			<View className="mt-2">
				<View className="flex-row items-center bg-[#2d2d2d] rounded-xl px-4 py-3 mb-4">
					<Search size={18} color="#9ca3af" />
					<TextInput
						className="flex-1 ml-3 text-white h-6 text-[15px]"
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
							className="p-1.5"
							accessibilityLabel="Clear search"
						>
							<X size={16} color="#9ca3af" />
						</TouchableOpacity>
					)}
				</View>

				{searchQuery.length > 0 && searchQuery.length < 3 && (
					<View className="bg-slate-800 p-3 rounded-lg mb-4">
						<Text className="text-blue-300 text-sm text-center">
							Please enter at least 3 characters to search
						</Text>
					</View>
				)}

				{isSearching && (
					<View className="items-center py-6">
						<ActivityIndicator size="small" color="#8b5cf6" />
						<Text className="text-sm text-zinc-400 mt-3">
							Searching customers...
						</Text>
					</View>
				)}

				{searchError && renderError(searchError, "Search failed")}

				{!isSearching &&
					searchResults &&
					searchResults.length === 0 &&
					searchQuery.length >= 3 && (
						<View className="items-center py-6 bg-[#1e1e1e] rounded-xl">
							<Text className="text-zinc-400 text-center mt-4 text-[15px]">
								No customers found matching "{searchQuery}"
							</Text>
						</View>
					)}

				{!isSearching && searchResults && searchResults.length > 0 && (
					<View className="bg-[#1e1e1e] rounded-xl p-4 mb-4 max-h-[320px]">
						<Text className="text-base font-semibold text-white mb-3">
							Search Results
						</Text>
						<ScrollView className="max-h-[280px]" nestedScrollEnabled>
							{searchResults.map((user) => (
								<TouchableOpacity
									key={user.id}
									className={`flex-row items-center p-3 rounded-lg mb-2 ${
										selectedUser?.id === user.id
											? "bg-purple-950"
											: "bg-[#2d2d2d]"
									}`}
									onPress={() => handleToggleUserSelection(user)}
									accessibilityLabel={`Select user: ${
										user.name || user.email || "Unnamed User"
									}`}
								>
									<View className="mr-3">
										<View className="w-8 h-8 rounded-full bg-zinc-600 items-center justify-center">
											<User size={16} color="#8b5cf6" />
										</View>
									</View>
									<View className="flex-1">
										<Text className="font-medium text-white text-[15px]">
											{user.name || "Unnamed User"}
										</Text>
										<Text className="text-zinc-400 text-[13px] mt-0.5">
											{user.email || "No email"}
										</Text>
										<View className="flex-row items-center mt-1">
											<View className="bg-blue-900 px-2 py-0.5 rounded-full">
												<Text className="text-blue-300 text-xs font-medium">
													{user.role}
												</Text>
											</View>
										</View>
									</View>
									{selectedUser?.id === user.id && (
										<View className="p-1">
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
						className={`bg-violet-600 py-3.5 px-4 rounded-xl items-center flex-row justify-center ${
							promoteToStaff.isPending ? "bg-violet-900 opacity-70" : "" // Added opacity for disabled state
						}`}
						onPress={handleAssignStaff}
						disabled={promoteToStaff.isPending}
						accessibilityLabel={`Promote and assign ${
							selectedUser.name || "selected user"
						} as staff`}
					>
						{promoteToStaff.isPending ? (
							<>
								<ActivityIndicator size="small" color="#ffffff" />
								<Text className="text-white font-semibold ml-2 text-[15px]">
									Processing...
								</Text>
							</>
						) : (
							<>
								<UserPlus size={18} color="#ffffff" />
								<Text className="text-white font-semibold ml-2 text-[15px]">
									Promote & Assign as Staff
								</Text>
							</>
						)}
					</TouchableOpacity>
				)}
			</View>
		);
	};

	if (permissions && !permissions.canManageStaff && !isLoadingStaff) {
		return (
			<ScrollView
				className="flex-1 bg-[#121212]"
				contentContainerClassName="p-4 pb-10"
			>
				<View className="mb-5">
					<Text className="text-2xl font-bold text-white">
						Staff Management
					</Text>
				</View>

				<View className="flex-row bg-[#1e1e1e] rounded-xl mb-5 p-1">
					<TouchableOpacity
						className={`flex-1 py-3 items-center rounded-lg ${
							activeTab === "current" ? "bg-[#2d2d2d]" : ""
						}`}
						onPress={() => setActiveTab("current")}
					>
						<Text
							className={`font-semibold ${
								activeTab === "current" ? "text-white" : "text-zinc-400"
							}`}
						>
							Current Staff
						</Text>
					</TouchableOpacity>
					<View className="flex-1 py-3 items-center rounded-lg opacity-50">
						<Text className="text-zinc-500 font-semibold">Add Staff</Text>
					</View>
				</View>

				<View className="bg-amber-950 p-4 rounded-xl mb-4">
					<View className="flex-row items-center">
						<AlertCircle size={24} color="#f59e0b" />
						<Text className="ml-2 font-semibold text-amber-500 text-base">
							Permission Required
						</Text>
					</View>
					<Text className="text-amber-400 mt-2 text-sm">
						You don't have permission to manage staff for this bar. Only the
						bar owner can perform these actions.
					</Text>
				</View>

				{renderCurrentStaffTab()}
			</ScrollView>
		);
	}

	return (
		<ScrollView
			className="flex-1 bg-[#121212]"
			contentContainerClassName="p-4 pb-10"
			keyboardShouldPersistTaps="handled"
		>
			<View className="mb-5">
				<Text className="text-2xl font-bold text-white">Staff Management</Text>
			</View>

			<View className="flex-row bg-[#1e1e1e] rounded-xl mb-5 p-1">
				<TouchableOpacity
					className={`flex-1 py-3 items-center rounded-lg ${
						activeTab === "current" ? "bg-[#2d2d2d]" : ""
					}`}
					onPress={() => setActiveTab("current")}
				>
					<Text
						className={`font-semibold ${
							activeTab === "current" ? "text-white" : "text-zinc-400"
						}`}
					>
						Current Staff
					</Text>
				</TouchableOpacity>
				<TouchableOpacity
					className={`flex-1 py-3 items-center rounded-lg ${
						activeTab === "add" ? "bg-[#2d2d2d]" : ""
					}`}
					onPress={() => setActiveTab("add")}
					disabled={!canManageStaff}
				>
					<Text
						className={`font-semibold ${
							activeTab === "add" ? "text-white" : "text-zinc-400"
						} ${!canManageStaff ? "opacity-50 text-zinc-500" : ""}`}
					>
						Add Staff
					</Text>
				</TouchableOpacity>
			</View>

			{activeTab === "current" ? renderCurrentStaffTab() : renderAddStaffTab()}
		</ScrollView>
	);
}