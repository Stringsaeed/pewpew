import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { color, font, space } from './theme';

export type Tone = 'primary' | 'ghost' | 'danger';
const TONE: Record<Tone, string> = { primary: color.cyan, ghost: color.dim, danger: color.magenta };
const LABEL: Record<Tone, string> = { primary: color.cyan, ghost: color.textDim, danger: color.magenta };

interface Props {
  readonly label: string;
  readonly onPress: () => void;
  readonly tone?: Tone;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, tone = 'primary', accessibilityLabel, style }: Props) {
  const border = TONE[tone];
  const ink = LABEL[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { borderColor: border, backgroundColor: pressed ? border : 'rgba(255,255,255,0.04)', transform: [{ scale: pressed ? 0.97 : 1 }] },
        tone === 'primary' && { boxShadow: `0 0 18px ${border}73` },
        style,
      ]}
    >
      {({ pressed }) => (
        <Text style={[styles.label, { color: pressed ? color.bg : ink }]}>{label}</Text>
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
