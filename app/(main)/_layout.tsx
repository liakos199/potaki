import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#18181b', // Example dark background
  },
});

export default function MainLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: styles.screen,
          
        }}
      >
        <Stack.Screen name="home" options={{ headerShown: false }} />
        <Stack.Screen name="bar/[barId]" options={{ presentation: 'card' }} />
        <Stack.Screen name="reservation/new" options={{ presentation: 'modal', title: 'New Reservation' }} />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
