// app/_layout.tsx
import 'react-native-gesture-handler'; // <-- MUST BE THE FIRST IMPORT
import { useEffect } from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthStore } from "@/src/features/auth/store/auth-store"; // Your existing imports
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; // Your existing imports
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // Import Gesture Handler
import { StyleSheet } from 'react-native'; // Import StyleSheet
import "./global.css"; // Your global NativeWind styles

const queryClient = new QueryClient(); // Your existing setup

export default function RootLayout() {
  const restoreSession = useAuthStore((s) => s.restoreSession); // Your existing logic

  useEffect(() => {
    restoreSession();
  }, [restoreSession]); // Your existing logic

  return (
    // Your existing providers
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        {/* Wrap your Navigator with GestureHandlerRootView */}
        <GestureHandlerRootView style={styles.container}>
          <Stack screenOptions={{ headerShown: false }} />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

// Style for the Gesture Handler wrapper
const styles = StyleSheet.create({
  container: {
    flex: 1, // Crucial for the gesture handler to cover the screen
  },
});