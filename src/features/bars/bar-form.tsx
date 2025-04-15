import { View, TextInput, Text, Pressable } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { CreateBarInput } from './types';

const createBarSchema = z.object({
  name: z.string().min(2, 'Name is too short'),
});

type Props = {
  onSubmit: (data: CreateBarInput) => void;
  isLoading?: boolean;
};

export const BarForm = ({ onSubmit, isLoading }: Props): JSX.Element => {
  const { control, handleSubmit, formState: { errors } } = useForm<CreateBarInput>({
    resolver: zodResolver(createBarSchema),
    defaultValues: { name: '' },
  });

  return (
    <View className="w-full mt-4 mb-6 px-2">
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className="border border-gray-300 rounded px-3 py-2 mb-1 text-base"
            placeholder="Bar name"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            editable={!isLoading}
            accessibilityLabel="Bar name input"
          />
        )}
      />
      {errors.name && <Text className="text-red-500 mb-2">{errors.name.message}</Text>}
      <Pressable
        className="bg-blue-600 py-2 rounded items-center mt-2"
        onPress={handleSubmit(onSubmit)}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel="Create bar"
      >
        <Text className="text-white font-semibold text-base">{isLoading ? 'Creating...' : 'Create Bar'}</Text>
      </Pressable>
    </View>
  );
};
