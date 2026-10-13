import { StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { color, font, space } from './theme';

interface Props {
  readonly sector: number;
  readonly level: number;
  /** Boss levels lead with WARNING. The sector line stays, in the threat color. */
  readonly warning: boolean;
}

/** Centered run title. The shell mounts it for 1.2 s; the exit fade plays as it unmounts. */
export function LevelIntro({ sector, level, warning }: Props) {
  const tint = warning ? color.threat : color.cyan;
  const glow = { color: tint, textShadowColor: tint };
  return (
    <Animated.View pointerEvents="none" entering={FadeIn.duration(160)} exiting={FadeOut.duration(400)} style={styles.card}>
      {warning ? <Text style={[styles.warn, glow]}>WARNING</Text> : null}
      <Text style={[styles.line, glow]}>{`SECTOR ${sector} · LEVEL ${level}`}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', top: '38%', left: 0, right: 0, alignItems: 'center', gap: space.sm },
  warn: {
    fontFamily: font.family, fontSize: font.label, fontWeight: '800', letterSpacing: 6,
    textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 },
  },
  line: {
    fontFamily: font.family, fontSize: font.title, fontWeight: '900', letterSpacing: 3,
    textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 },
  },
});
