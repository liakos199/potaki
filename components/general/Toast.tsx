import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions } from 'react-native';

type ToastType = 'success' | 'error' | 'info' | 'warning';

type ToastProps = {
  type: ToastType;
  text1: string;
  text2?: string;
  duration?: number;
};

interface ToastStatic {
  show: (props: ToastProps) => void;
}

// Toast animations and state
const toastAnimation = {
  slideValue: new Animated.Value(-100),
  fadeValue: new Animated.Value(0),
  duration: 3000, // default duration
  isVisible: false,
  props: {} as ToastProps,
};

// Styles based on toast type
const getToastStyles = (type: ToastType) => {
  switch (type) {
    case 'success':
      return {
        backgroundColor: '#10B981', // green
        borderColor: '#059669',
      };
    case 'error':
      return {
        backgroundColor: '#EF4444', // red
        borderColor: '#DC2626',
      };
    case 'warning':
      return {
        backgroundColor: '#F59E0B', // amber
        borderColor: '#D97706',
      };
    case 'info':
    default:
      return {
        backgroundColor: '#3B82F6', // blue
        borderColor: '#2563EB',
      };
  }
};

// Singleton toast implementation
const Toast: ToastStatic = {
  show: (props: ToastProps) => {
    // Cancel any existing toast
    if (toastAnimation.isVisible) {
      Animated.timing(toastAnimation.slideValue, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).stop();
      Animated.timing(toastAnimation.fadeValue, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).stop();
    }

    // Update props
    toastAnimation.props = props;
    toastAnimation.duration = props.duration || 3000;
    toastAnimation.isVisible = true;
    
    // Reset animation values
    toastAnimation.slideValue.setValue(-100);
    toastAnimation.fadeValue.setValue(0);
    
    // Start animations
    Animated.parallel([
      Animated.timing(toastAnimation.slideValue, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(toastAnimation.fadeValue, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Hide after duration
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(toastAnimation.slideValue, {
            toValue: -100,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(toastAnimation.fadeValue, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          toastAnimation.isVisible = false;
        });
      }, toastAnimation.duration);
    });
  },
};

// The actual component to render
export const ToastComponent: React.FC = () => {
  const [, forceUpdate] = React.useReducer((c) => c + 1, 0);
  
  // Subscribe to animation updates to force re-renders
  useEffect(() => {
    const id = setInterval(() => {
      if (toastAnimation.isVisible) {
        forceUpdate();
      }
    }, 100);
    
    return () => clearInterval(id);
  }, []);
  
  if (!toastAnimation.isVisible) return null;
  
  const { type, text1, text2 } = toastAnimation.props;
  const styles = getToastStyles(type);
  
  return (
    <Animated.View
      style={[
        toastStyles.container,
        {
          backgroundColor: styles.backgroundColor,
          borderColor: styles.borderColor,
          transform: [{ translateY: toastAnimation.slideValue }],
          opacity: toastAnimation.fadeValue,
        },
      ]}
    >
      <Text style={toastStyles.title}>{text1}</Text>
      {text2 && <Text style={toastStyles.message}>{text2}</Text>}
    </Animated.View>
  );
};

const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 40,
    left: 20,
    right: 20,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  title: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  message: {
    color: 'white',
    marginTop: 4,
    fontSize: 14,
  },
});

export default Toast;
