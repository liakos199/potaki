// src/components/myModal.tsx
import React, { useEffect, ReactNode } from 'react';
import {
  Modal,
  View, // Using standard View for NativeWind styling
  useWindowDimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

// --- Configuration Constants ---
const CLOSE_THRESHOLD_VELOCITY = 800; // Velocity needed to trigger close
const CLOSE_THRESHOLD_TRANSLATE_Y = 0.3; // Drag distance needed (30% of screen height)
const SPRING_CONFIG = { // Animation physics for snapping back
  damping: 50,
  stiffness: 400,
  mass: 0.5,
};
// --- End Configuration Constants ---

interface myModalProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode; // Content for the modal
}

// Create an Animated version of View for applying animated styles
const AnimatedView = Animated.createAnimatedComponent(View);

const myModal: React.FC<myModalProps> = ({
  visible,
  onClose,
  children,
}) => {
  const { height: screenHeight } = useWindowDimensions();
  // Shared value to track vertical translation (animated)
  const translateY = useSharedValue(0);
  // Shared value to store the starting position of the drag
  const context = useSharedValue({ y: 0 });

  // Calculate the pixel threshold for closing based on screen height
  const closeThresholdY = screenHeight * CLOSE_THRESHOLD_TRANSLATE_Y;

  // Reset modal position when visibility changes
  useEffect(() => {
    if (visible) {
      // Start at the top when becoming visible (Modal's animation handles entry)
      translateY.value = 0;
    } else {
      // Reset immediately when closed externally or before next open
       translateY.value = 0;
       context.value = { y: 0 };
    }
  }, [visible, screenHeight, translateY, context]);

  // --- Pan Gesture Definition ---
  const panGesture = Gesture.Pan()
    .onStart(() => {
      // Store the current Y position when drag starts
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      // Update translateY based on drag, but prevent dragging upwards past the initial top position
      translateY.value = Math.max(0, context.value.y + event.translationY);
    })
    .onEnd((event) => {
      // Check if drag distance or velocity meets the threshold to close
      const shouldClose =
        event.translationY > closeThresholdY ||
        event.velocityY > CLOSE_THRESHOLD_VELOCITY;

      if (shouldClose) {
        // Animate slightly further down quickly *before* calling onClose
        // This avoids conflicting with the Modal's own closing animation
        translateY.value = withTiming(screenHeight * 0.4, { duration: 150 }, () => {
            // Safely call the JavaScript onClose function from the UI thread
            runOnJS(onClose)();
        });
      } else {
        // Drag didn't meet threshold, snap back to the top with a spring animation
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });
  // --- End Pan Gesture Definition ---

  // --- Animated Style Definition ---
  // This style object reacts to changes in the `translateY` shared value
  const animatedModalStyle = useAnimatedStyle(() => {
    return {
      // Apply the vertical translation
      transform: [{ translateY: translateY.value }],
    };
  });
  // --- End Animated Style Definition ---

  return (
    <Modal
      transparent={true} // Essential for the animated view underneath to be visible
      visible={visible}
      onRequestClose={onClose} // Handles Android back button press
      animationType="slide" // Use the standard slide-up animation for entry
    >
      {/* Conditionally render StatusBar style change */}
      {visible && <StatusBar barStyle="light-content" />}

      {/* Attach the pan gesture handler */}
      <GestureDetector gesture={panGesture}>
        {/* This AnimatedView is the main visual container that gets dragged */}
        <AnimatedView
          // Apply static styles via NativeWind + dynamic transform via style prop
          style={[{ height: screenHeight }, animatedModalStyle]} // Combine height and animated transform
          className={`
            flex-1 justify-end /* Push content towards bottom initially if needed, though flex-1 handles it */
            ${Platform.OS === 'ios' ? 'bg-neutral-100' : 'bg-white'} /* iOS sheet-like bg */
            rounded-t-2xl /* Rounded top corners */
            shadow-lg shadow-black/20 /* Add shadow */
            android:elevation-10 /* Android specific elevation */
          `}
        >
          {/* Drag Handle Indicator */}
          <View
            className="items-center pt-3 pb-2 rounded-t-2xl" // Center handle, add padding
          >
            <View
              className="w-10 h-[5px] bg-gray-400 rounded-full" // Style the handle bar
            />
          </View>

          {/* Content Area */}
          <View className="flex-1 overflow-hidden">
            {/* The content passed from the parent component goes here */}
            {children}
          </View>
        </AnimatedView>
      </GestureDetector>
    </Modal>
  );
};

export default myModal;