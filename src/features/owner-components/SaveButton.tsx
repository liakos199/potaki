import { TouchableOpacity, View, Text, ActivityIndicator } from 'react-native';
import type { FC } from 'react';

type Props = {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export const SaveButton: FC<Props> = ({ onPress, loading, disabled }) => (
  <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50, width: '100%' }}>
    <View style={{ width: '100%' }}>
      <TouchableOpacity
        className={`py-4 bg-green-700 items-center justify-center ${disabled ? 'opacity-60' : ''}`}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Save changes"
        activeOpacity={0.85}
        disabled={disabled || loading}
        style={{ width: '100%', marginHorizontal: '5%', borderRadius: 10}}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-bold text-xl">Save Changes</Text>
        )}
      </TouchableOpacity>
    </View>
  </View>
);

export default SaveButton;
