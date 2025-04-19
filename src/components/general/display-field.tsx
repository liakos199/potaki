import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Edit3 } from 'lucide-react-native';

type DisplayFieldProps = {
  label: string;
  value: string | number | boolean | null | undefined;
  onEditPress: () => void;
  isEditable?: boolean;
  formatValue?: (value: string | number | boolean | null | undefined) => string;
};

const DisplayField: React.FC<DisplayFieldProps> = ({
  label,
  value,
  onEditPress,
  isEditable = true,
  formatValue,
}) => {
  const displayValue = React.useMemo((): string => {
    if (formatValue) {
      return formatValue(value);
    }
    if (value === null || value === undefined || value === '') {
      return 'Not set';
    }
    if (typeof value === 'boolean') {
      return value ? 'Live' : 'Not Live';
    }
    return String(value);
  }, [value, formatValue]);

  return (
    <View className="mb-4 flex-row justify-between items-start">
      <View className="flex-1 mr-2">
        <Text className="text-xs text-gray-500 mb-0.5">{label}</Text>
        <Text className="text-sm text-gray-900 leading-snug">{displayValue}</Text>
      </View>

      {isEditable && (
        <TouchableOpacity
          onPress={onEditPress}
          className="p-2 rounded-md hover:bg-gray-100 active:bg-gray-200 -mr-1 mt-1"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={`Edit ${label}`}
        >
          <Edit3 size={16} className="text-indigo-600" />
        </TouchableOpacity>
      )}
    </View>
  );
};

export default DisplayField;