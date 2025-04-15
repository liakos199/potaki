import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { BarForm } from '@/src/features/bars/bar-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBar } from '@/src/features/bars/api';
import type { CreateBarInput } from '@/src/features/bars/types';

const CreateBarScreen = (): JSX.Element => {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();

  const createBarMutation = useMutation({
    mutationFn: (input: CreateBarInput) => createBar(input, profile!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-bars', profile?.id] });
      router.replace('/(admin)/admin-panel');
    },
  });

  if (!profile || profile.role !== 'owner') {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-lg">Unauthorized</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 px-4 pt-8 bg-white">
      <Text className="text-2xl font-bold mb-6">Create a New Bar</Text>
      <BarForm
        onSubmit={(data) => createBarMutation.mutate(data)}
        isLoading={createBarMutation.isPending}
      />
    </View>
  );
};

export default CreateBarScreen;
