import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LEVELS, type LevelNumber } from '../levels';
import type { Stars } from '../sim';
import { Button } from './Button';
import { Panel } from './Panel';
import { color, font, space } from './theme';

interface Props {
  readonly level: LevelNumber;
  readonly score: number;
  readonly stars: Stars;
  readonly best: number;
  readonly onNext: () => void;
  readonly onRetry: () => void;
  readonly onLevels: () => void;
}

const STAR_STAGGER_MS = 280;

export function Complete({ level, score, stars, best, onNext, onRetry, onLevels }: Props) {
  const pops = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const anim = Animated.stagger(
      STAR_STAGGER_MS,
      pops.slice(0, stars).map((v) => Animated.spring(v, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true })),
    );
    anim.start();
    return () => anim.stop();
  }, [pops, stars]);

  return (
    <Panel title="LEVEL CLEAR" tint={color.green}>
      <View accessible accessibilityLabel={`${stars} of 3 stars`} style={styles.stars}>
        {pops.map((v, i) => (
          <Animated.Text
            key={i}
            style={[
              styles.star,
              { color: i < stars ? color.yellow : color.dim, opacity: i < stars ? v : 0.35, transform: [{ scale: i < stars ? v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) : 1 }] },
            ]}
          >
            {i < stars ? '★' : '☆'}
          </Animated.Text>
        ))}
      </View>
      <Text style={styles.sub}>{`LEVEL ${level}`}</Text>
      <Text accessibilityLabel={`Score ${score}`} style={styles.score}>{String(score).padStart(6, '0')}</Text>
      <Text style={styles.sub}>{`BEST ${best}`}</Text>
      {level < LEVELS.length ? <Button label="NEXT" onPress={onNext} /> : null}
      <Button label="RETRY" tone="ghost" onPress={onRetry} />
      <Button label="LEVELS" tone="ghost" onPress={onLevels} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', gap: space.sm },
  star: { fontFamily: font.family, fontSize: 56 },
  sub: { fontFamily: font.family, fontSize: font.label, letterSpacing: 4, color: color.dim },
  score: { fontFamily: font.family, fontSize: 36, fontWeight: '800', letterSpacing: 3, color: color.text },
});
