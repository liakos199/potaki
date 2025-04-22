import 'react-native-gesture-handler'; 
import { useEffect } from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthStore } from "@/src/features/auth/store/auth-store"; 
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; 
import { GestureHandlerRootView } from 'react-native-gesture-handler'; 
import { StyleSheet } from 'react-native';
import "./global.css"; 
import { ToastProvider } from '@/src/components/general/Toast';

const queryClient = new QueryClient();

export default function RootLayout() {
  const restoreSession = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]); 

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.container}>
          <ToastProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </ToastProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});