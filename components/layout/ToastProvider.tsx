import React from 'react';
import { View } from 'react-native';
import { ToastComponent } from '../general/Toast';

type ToastProviderProps = {
  children: React.ReactNode;
};

export default function ToastProvider({ children }: ToastProviderProps) {
  return (
    <View style={{ flex: 1 }}>
      {children}
      <ToastComponent />
    </View>
  );
}
