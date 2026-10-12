import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { color, font, space } from './theme';

export type Tone = 'primary' | 'ghost' | 'danger';
const TONE: Record<Tone, string> = { primary: color.cyan, ghost: color.dim, danger: color.magenta };

interface Props {
  readonly label: string;
  readonly onPress: () => void;
  readonly tone?: Tone;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, tone = 'primary', accessibilityLabel, style }: Props) {
  const c = TONE[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { borderColor: c, backgroundColor: pressed ? c : 'rgba(255,255,255,0.04)', transform: [{ scale: pressed ? 0.97 : 1 }] },
        style,
      ]}
    >
      {({ pressed }) => (
        <Text style={[styles.label, { color: pressed ? color.bg : c }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: 220,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
  },
  label: { fontFamily: font.family, fontSize: 18, fontWeight: '700', letterSpacing: 3 },
});
