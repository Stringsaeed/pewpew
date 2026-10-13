import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
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
  /** Opens this level's Game Center leaderboard. Absent where Game Center does not exist, which hides the button. */
  readonly onRanks?: () => void;
  /** The player's global rank on this level once Game Center has confirmed the submission. Null until then. */
  readonly rank?: { readonly rank: number; readonly total: number } | null;
  readonly reduceMotion?: boolean;
}

const STAR_STAGGER_MS = 280;
const COUNT_UP_MS = 600;

/** Eases a score from 0 to `target` over COUNT_UP_MS, starting together with the first star pop. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const t0 = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / COUNT_UP_MS);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

export function Complete({ level, score, stars, best, onNext, onRetry, onLevels, onRanks, rank, reduceMotion }: Props) {
  const shown = useCountUp(score);
  const pops = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const anim = Animated.stagger(
      STAR_STAGGER_MS,
      pops.slice(0, stars).map((v) => Animated.spring(v, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true })),
    );
    anim.start();
    return () => anim.stop();
  }, [pops, stars]);

  const isBest = score > 0 && score >= best;
  return (
    <Panel title="LEVEL CLEAR" tint={color.green} reduceMotion={reduceMotion}>
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
      <Text accessibilityLabel={`Score ${score}`} style={styles.score}>{String(shown).padStart(6, '0')}</Text>
      {isBest ? (
        <View accessible accessibilityLabel="New best" style={styles.badge}>
          <Text style={styles.badgeText}>NEW BEST</Text>
        </View>
      ) : null}
      <Text style={styles.sub}>{`BEST ${best}`}</Text>
      {rank ? (
        <Reanimated.Text entering={FadeIn.duration(220)} accessibilityLabel={`World rank ${rank.rank} of ${rank.total}`} style={styles.rank}>
          {`WORLD #${rank.rank} OF ${rank.total}`}
        </Reanimated.Text>
      ) : null}
      {level < LEVELS.length ? <Button label="NEXT" onPress={onNext} /> : null}
      <Button label="RETRY" tone="ghost" onPress={onRetry} />
      {onRanks ? <Button label="RANKINGS" tone="ghost" ink={color.yellow} onPress={onRanks} /> : null}
      <Button label="LEVELS" tone="ghost" onPress={onLevels} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', gap: space.sm },
  star: { fontFamily: font.family, fontSize: 56 },
  sub: { fontFamily: font.family, fontSize: font.label, letterSpacing: 4, color: color.textDim },
  badge: { borderWidth: 2, borderColor: color.yellow, borderRadius: 8, paddingHorizontal: space.md, paddingVertical: 2, boxShadow: `0 0 12px ${color.yellow}73` },
  badgeText: { fontFamily: font.family, fontSize: font.label, fontWeight: '800', letterSpacing: 4, color: color.yellow },
  score: { fontFamily: font.family, fontSize: 36, fontWeight: '800', letterSpacing: 3, color: color.text },
  rank: { fontFamily: font.family, fontSize: font.body, fontWeight: '700', letterSpacing: 3, color: color.yellow },
});
