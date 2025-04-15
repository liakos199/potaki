import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema, SignInInput } from '../../src/features/auth/schemas/auth-schema';
import { useAuth } from '../../src/features/auth/hooks/use-auth';
import { useAuthStore } from '../../src/features/auth/store/auth-store';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

const SignInScreen = (): JSX.Element => {
  const { signIn } = useAuth();
  const { control, handleSubmit, formState: { errors } } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
  });
  const isLoading = useAuthStore((s) => s.isLoading);
  const profile = useAuthStore((s) => s.profile);
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);


  const onSubmit = async (data: SignInInput) => {
    setErrorMsg(null);
    try {
      await signIn(data);

      router.replace('/'); // Always go to root, let index.tsx handle role-based redirect
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to sign in');
    }
  };

  return (
    <View className="flex-1 justify-center px-6 bg-white">
      <Text className="text-2xl font-manrope-bold mb-8 text-center">Sign In</Text>
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base"
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            onChangeText={onChange}
            onBlur={onBlur}
            value={value}
            accessible accessibilityLabel="Email"
          />
        )}
      />
      {errors.email && <Text className="text-red-500 mb-2">{errors.email.message}</Text>}
      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base"
            placeholder="Password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            onChangeText={onChange}
            onBlur={onBlur}
            value={value}
            accessible accessibilityLabel="Password"
          />
        )}
      />
      {errors.password && <Text className="text-red-500 mb-2">{errors.password.message}</Text>}
      {errorMsg && <Text className="text-red-500 mb-2">{errorMsg}</Text>}
      <Pressable
        className="w-full py-4 rounded-lg bg-primary-900 items-center mt-2"
        accessibilityRole="button"
        onPress={handleSubmit(onSubmit)}
        disabled={isLoading}
      >
        {isLoading ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-lg font-manrope-semibold">Sign In</Text>}
      </Pressable>
    </View>
  );
};

export default SignInScreen;
