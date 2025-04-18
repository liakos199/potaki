import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { View, Text, Animated, StyleSheet, TouchableOpacity, PanResponder } from 'react-native';
import { X } from 'lucide-react-native';

// Toast Types
export type ToastType = 'success' | 'error' | 'info' | 'warning';

// Toast Configuration
export interface ToastConfig {
  type: ToastType;
  text1: string;
  text2?: string;
  duration?: number; // milliseconds
  onClose?: () => void;
}

// Context Type
interface ToastContextType {
  show: (config: ToastConfig) => void;
  hide: () => void;
}

// Create Context
const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Get Toast Background Color based on type
const getBackgroundColor = (type: ToastType): string => {
  switch (type) {
    case 'success':
      return '#10b981'; // green-500
    case 'error':
      return '#ef4444'; // red-500
    case 'warning':
      return '#f59e0b'; // amber-500
    case 'info':
      return '#3b82f6'; // blue-500
    default:
      return '#3b82f6'; // blue-500
  }
};

// Get Toast Icon based on type
const getIcon = (type: ToastType): string => {
  switch (type) {
    case 'success':
      return '✓';
    case 'error':
      return '✗';
    case 'warning':
      return '⚠';
    case 'info':
      return 'ℹ';
    default:
      return 'ℹ';
  }
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<ToastConfig>({
    type: 'info',
    text1: '',
    text2: '',
    duration: 3000,
  });
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(-20)).current;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Show toast animation
  const animateIn = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Hide toast animation
  const animateOut = (callback?: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: -20,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      if (callback) callback();
    });
  };

  // Swipe upward to dismiss animation
  const swipeUpToDismiss = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      if (config.onClose) config.onClose();
      
      // Reset position for next toast
      translateYAnim.setValue(-20);
    });
  };

  // Initialize PanResponder for vertical dragging
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        // Only allow upward movement (negative dy values)
        if (gestureState.dy < 0) {
          // Update vertical position based on upward drag
          translateYAnim.setValue(gestureState.dy);
          
          // Reduce opacity as the toast is dragged away
          const maxDistance = 100;
          const dragRatio = Math.min(Math.abs(gestureState.dy) / maxDistance, 1);
          fadeAnim.setValue(1 - dragRatio);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const yThreshold = -60; // Distance threshold to trigger dismiss (negative for upward)
        
        if (gestureState.dy < yThreshold) {
          // Swiped up far enough
          swipeUpToDismiss();
          
          // Clear the timeout since we're dismissing manually
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        } else {
          // Not swiped far enough, bounce back
          Animated.parallel([
            Animated.spring(translateYAnim, {
              toValue: 0,
              friction: 5,
              useNativeDriver: true,
            }),
            Animated.spring(fadeAnim, {
              toValue: 1,
              friction: 5,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;

  // Show toast
  const show = (newConfig: ToastConfig) => {
    // Clear any existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // If a toast is already visible, hide it first
    if (visible) {
      animateOut(() => {
        setConfig({ ...newConfig, duration: newConfig.duration || 3000 });
        setVisible(true);
        animateIn();
        
        // Set timeout to hide toast
        const duration = newConfig.duration || 3000;
        timeoutRef.current = setTimeout(() => {
          animateOut(newConfig.onClose);
        }, duration);
      });
    } else {
      // Show new toast
      setConfig({ ...newConfig, duration: newConfig.duration || 3000 });
      setVisible(true);
      animateIn();
      
      // Set timeout to hide toast
      const duration = newConfig.duration || 3000;
      timeoutRef.current = setTimeout(() => {
        animateOut(newConfig.onClose);
      }, duration);
    }
  };

  // Hide toast
  const hide = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    if (visible) {
      animateOut(config.onClose);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      {visible && (
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ translateY: translateYAnim }],
              backgroundColor: getBackgroundColor(config.type),
            },
          ]}
        >
          <View style={styles.contentContainer}>
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>{getIcon(config.type)}</Text>
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.text1}>{config.text1}</Text>
              {config.text2 ? <Text style={styles.text2}>{config.text2}</Text> : null}
            </View>
          </View>
          <TouchableOpacity onPress={hide} style={styles.closeButton}>
            <X size={16} color="white" />
          </TouchableOpacity>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
};

// Hook to use toast
export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// Styles
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    padding: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 9999,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: 12,
  },
  icon: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  textContainer: {
    flex: 1,
  },
  text1: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  text2: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
  },
  closeButton: {
    padding: 4,
  },
});