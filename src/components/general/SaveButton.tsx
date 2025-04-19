import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';

type SaveButtonProps = {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  title?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

const SaveButton: React.FC<SaveButtonProps> = ({
  onPress,
  loading = false,
  disabled = false,
  title = "Save",
  style,
  textStyle,
}) => {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      className={`
        flex-row justify-center items-center py-2 px-4 rounded-md shadow-sm
        transition-colors duration-150 ease-in-out
        ${isDisabled
          ? 'bg-indigo-300 cursor-not-allowed'
          : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
        }
      `}
      style={style}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={title}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#ffffff" />
      ) : (
        <Text
          className={`
            text-sm font-medium text-center
            ${isDisabled ? 'text-indigo-100' : 'text-white'}
          `}
          style={textStyle}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

export default SaveButton;