import { useAuthStore } from '@/src/features/auth/store/auth-store';
import { useState } from 'react';
import { Button, ActivityIndicator } from 'react-native';

const LogoutButton = () => {
  const signOut = useAuthStore((s) => s.signOut);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      // Optionally, navigate to the login screen or perform other actions
    } catch (error) {
      console.error('Logout failed', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <>
      {isLoggingOut ? (
        <ActivityIndicator />
      ) : (
        <Button title="Logout" onPress={handleLogout} />
      )}
    </>
  );
};

export default LogoutButton;