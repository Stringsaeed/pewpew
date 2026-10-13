import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { color, font, space } from './theme';

interface Props {
  readonly title: string;
  readonly tint?: string;
  /** Three quick 6 px horizontal swings once the panel has landed. */
  readonly shake?: boolean;
  readonly children: ReactNode;
}

const SWING = 6;
const SWING_MS = 45;

export function Panel({ title, tint = color.cyan, shake = false, children }: Props) {
  const x = useSharedValue(0);
  useEffect(() => {
    if (!shake) return;
    const swing = (to: number) => withTiming(to, { duration: SWING_MS });
    x.value = withDelay(220, withSequence(swing(-SWING), swing(SWING), swing(-SWING), swing(SWING), swing(-SWING), swing(SWING), swing(0)));
  }, [shake, x]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(100)} style={styles.scrim}>
      <Animated.View entering={ZoomIn.withInitialValues({ transform: [{ scale: 0.92 }] }).springify().damping(14)}>
        <Animated.View style={[styles.panel, { borderColor: tint, boxShadow: `0 0 18px ${tint}73` }, shakeStyle]}>
          <Text accessibilityRole="header" style={[styles.title, { color: tint, textShadowColor: tint, textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } }]}>{title}</Text>
          {children}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.scrim, alignItems: 'center', justifyContent: 'center' },
  panel: { backgroundColor: color.panel, borderWidth: 2, borderRadius: 20, paddingVertical: space.lg, paddingHorizontal: space.lg, alignItems: 'center', gap: space.md, minWidth: 300 },
  title: { fontFamily: font.family, fontSize: font.title, fontWeight: '900', letterSpacing: 5 },
});
