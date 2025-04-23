"use client"

import type React from "react"
import { useState, useEffect, createContext, useContext, useRef } from "react"
import { View, Text, Animated, StyleSheet, TouchableOpacity, PanResponder } from "react-native"
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react-native"

// Toast Types
export type ToastType = "success" | "error" | "info" | "warning"

// Toast Configuration
export interface ToastConfig {
  type: ToastType
  text1: string
  text2?: string
  duration?: number // milliseconds
  onClose?: () => void
}

// Context Type
interface ToastContextType {
  show: (config: ToastConfig) => void
  hide: () => void
}

// Create Context
const ToastContext = createContext<ToastContextType | undefined>(undefined)

// Get Toast Background Color based on type
const getBackgroundColor = (type: ToastType): string => {
  switch (type) {
    case "success":
      return "#1f2a27" // dark green
    case "error":
      return "#2a1f27" // dark red
    case "warning":
      return "#2a271f" // dark amber
    case "info":
      return "#1f2027" // dark blue
    default:
      return "#1f1f27" // default dark
  }
}

// Get Toast Accent Color based on type
const getAccentColor = (type: ToastType): string => {
  switch (type) {
    case "success":
      return "#4ecdc4" // teal
    case "error":
      return "#ff4d6d" // pink/red
    case "warning":
      return "#ffb84d" // amber
    case "info":
      return "#4d79ff" // blue
    default:
      return "#4d79ff" // blue
  }
}

// Get Toast Icon based on type
const getIcon = (type: ToastType) => {
  const color = getAccentColor(type)
  const size = 20

  switch (type) {
    case "success":
      return <CheckCircle size={size} color={color} />
    case "error":
      return <AlertCircle size={size} color={color} />
    case "warning":
      return <AlertTriangle size={size} color={color} />
    case "info":
      return <Info size={size} color={color} />
    default:
      return <Info size={size} color={color} />
  }
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false)
  const [config, setConfig] = useState<ToastConfig>({
    type: "info",
    text1: "",
    text2: "",
    duration: 3000,
  })

  const fadeAnim = useRef(new Animated.Value(0)).current
  const translateYAnim = useRef(new Animated.Value(-20)).current
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

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
    ]).start()
  }

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
      setVisible(false)
      if (callback) callback()
    })
  }

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
      setVisible(false)
      if (config.onClose) config.onClose()

      // Reset position for next toast
      translateYAnim.setValue(-20)
    })
  }

  // Initialize PanResponder for vertical dragging
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        // Only allow upward movement (negative dy values)
        if (gestureState.dy < 0) {
          // Update vertical position based on upward drag
          translateYAnim.setValue(gestureState.dy)

          // Reduce opacity as the toast is dragged away
          const maxDistance = 100
          const dragRatio = Math.min(Math.abs(gestureState.dy) / maxDistance, 1)
          fadeAnim.setValue(1 - dragRatio)
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const yThreshold = -60 // Distance threshold to trigger dismiss (negative for upward)

        if (gestureState.dy < yThreshold) {
          // Swiped up far enough
          swipeUpToDismiss()

          // Clear the timeout since we're dismissing manually
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
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
          ]).start()
        }
      },
    }),
  ).current

  // Show toast
  const show = (newConfig: ToastConfig) => {
    // Clear any existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    // If a toast is already visible, hide it first
    if (visible) {
      animateOut(() => {
        setConfig({ ...newConfig, duration: newConfig.duration || 3000 })
        setVisible(true)
        animateIn()

        // Set timeout to hide toast
        const duration = newConfig.duration || 3000
        timeoutRef.current = setTimeout(() => {
          animateOut(newConfig.onClose)
        }, duration)
      })
    } else {
      // Show new toast
      setConfig({ ...newConfig, duration: newConfig.duration || 3000 })
      setVisible(true)
      animateIn()

      // Set timeout to hide toast
      const duration = newConfig.duration || 3000
      timeoutRef.current = setTimeout(() => {
        animateOut(newConfig.onClose)
      }, duration)
    }
  }

  // Hide toast
  const hide = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    if (visible) {
      animateOut(config.onClose)
    }
  }

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const accentColor = getAccentColor(config.type)

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
              borderLeftWidth: 4,
              borderLeftColor: accentColor,
            },
          ]}
        >
          <View style={styles.contentContainer}>
            <View style={styles.iconContainer}>{getIcon(config.type)}</View>
            <View style={styles.textContainer}>
              <Text style={[styles.text1, { color: accentColor }]}>{config.text1}</Text>
              {config.text2 ? <Text style={styles.text2}>{config.text2}</Text> : null}
            </View>
          </View>
          <TouchableOpacity onPress={hide} style={[styles.closeButton, { backgroundColor: `${accentColor}33` }]}>
            <X size={16} color={accentColor} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </ToastContext.Provider>
  )
}

// Hook to use toast
export const useToast = () => {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return context
}

// Styles
const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    zIndex: 9999,
  },
  contentContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  text1: {
    fontWeight: "bold",
    fontSize: 14,
  },
  text2: {
    color: "#e0e0e0",
    fontSize: 12,
    marginTop: 4,
  },
  closeButton: {
    padding: 6,
    borderRadius: 20,
    marginLeft: 8,
  },
})
