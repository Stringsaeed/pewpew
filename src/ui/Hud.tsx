import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { BOSSES, levelSpec, type LevelNumber } from '../levels';
import type { Hud as HudState } from '../sim';
import { RAPID_WINDOW_MS } from '../shell/loop';
import { useEdges } from './edges';
import { Rocket } from './Rocket';
import { color, font, space } from './theme';

/** How far the top scrim reaches below the safe area. */
const SCRIM_BELOW = 62;

interface Props {
  readonly hud: HudState;
  readonly level: number;
  readonly onPause: () => void;
  /** Dev only: the attract-mode toggle. Absent in release. */
  readonly auto?: { readonly on: boolean; readonly onToggle: () => void };
  /** Rapid window still left, 0..1. The chip drains from here to empty. */
  readonly rapid?: number;
}

export function Hud({ hud, level, onPause, auto, rapid }: Props) {
  const bossId = hud.bossHp === null ? null : levelSpec(level as LevelNumber).boss;
  const slots = useRef(hud.lives);
  slots.current = Math.max(slots.current, hud.lives);
  const prevLives = useRef(hud.lives);
  const hurt = useSharedValue(0);
  useEffect(() => {
    if (hud.lives < prevLives.current) hurt.value = withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: 140 }));
    prevLives.current = hud.lives;
  }, [hud.lives, hurt]);
  const vignette = useAnimatedStyle(() => ({ opacity: hurt.value }));
  const edges = useEdges();
  const safe = { paddingTop: edges.top - space.sm, paddingLeft: edges.left, paddingRight: edges.right };
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.vignette, vignette]} />
      <View pointerEvents="box-none" style={[styles.root, safe]}>
        <View pointerEvents="none" style={[styles.topScrim, { height: edges.top + SCRIM_BELOW }]} />
        <View pointerEvents="box-none" style={styles.row}>
          <View style={styles.left}>
            <Score score={hud.score} />
            <View style={styles.livesRow}>
              <View accessible accessibilityLabel={`Lives ${hud.lives}`} style={styles.lives}>
                {Array.from({ length: slots.current }, (_, i) => <LifeSlot key={i} alive={i < hud.lives} />)}
              </View>
              {hud.shield ? <Chip text="SHIELD" tint={color.cyan} /> : null}
              {hud.rapid ? <Chip text="RAPID" tint={color.yellow} drain={rapid ?? 0} /> : null}
            </View>
          </View>
          <Text maxFontSizeMultiplier={1.3} style={styles.level}>{`LV ${level}`}</Text>
          {auto ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Auto"
              accessibilityState={{ checked: auto.on }}
              hitSlop={8}
              onPress={auto.onToggle}
              style={[styles.auto, auto.on && styles.autoOn]}
            >
              <Text maxFontSizeMultiplier={1.3} style={[styles.autoText, auto.on && styles.autoTextOn]}>AUTO</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pause"
            hitSlop={8}
            onPress={onPause}
            style={({ pressed }) => [styles.pause, pressed && styles.pausePressed]}
          >
            <View style={styles.bar} />
            <View style={styles.bar} />
          </Pressable>
        </View>
        {hud.bossHp !== null ? (
          <View accessible accessibilityLabel={`${bossId ?? 'Boss'} health ${hud.bossHp} percent`} style={styles.bossBlock}>
            <Text maxFontSizeMultiplier={1.3} style={styles.bossName}>{bossId === null ? 'BOSS' : bossId.toUpperCase()}</Text>
            <View style={styles.boss}>
              <View style={[styles.fill, { width: `${hud.bossHp}%`, backgroundColor: color.threat }]} />
              {bossId === null ? null : BOSSES[bossId].phases.slice(1).map((p) => (
                <View key={p.atHpFraction} style={[styles.tick, { left: `${p.atHpFraction * 100}%` }]} />
              ))}
            </View>
          </View>
        ) : (
          <View accessible accessibilityLabel={`Progress ${hud.progress} percent`} style={styles.track}>
            <View style={[styles.fill, { width: `${hud.progress}%` }]} />
          </View>
        )}
      </View>
    </View>
  );
}

const SLOT_W = 22;

/** One life. When it is lost the rocket turns threat-colored, shrinks away, then its slot collapses. */
function LifeSlot({ alive }: { readonly alive: boolean }) {
  const scale = useSharedValue(1);
  const width = useSharedValue(SLOT_W);
  useEffect(() => {
    if (alive) {
      scale.value = 1;
      width.value = SLOT_W;
    } else {
      scale.value = withTiming(0, { duration: 240 });
      width.value = withDelay(240, withTiming(0, { duration: 120 }));
    }
  }, [alive, scale, width]);
  const style = useAnimatedStyle(() => ({ width: width.value, transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.slot, style]}>
      <Rocket tint={alive ? color.cyan : color.threat} />
    </Animated.View>
  );
}

const POP_SCALE = 1.12;
const POP_GAP_MS = 150;

/** Six digits: leading zeros dim, significant digits cyan. A 1.12x pop on each increase, at most one per 150 ms. */
function Score({ score }: { readonly score: number }) {
  const scale = useSharedValue(1);
  const prev = useRef(score);
  const lastPop = useRef(0);
  useEffect(() => {
    const rose = score > prev.current;
    prev.current = score;
    const now = Date.now();
    if (!rose || now - lastPop.current < POP_GAP_MS) return;
    lastPop.current = now;
    scale.value = withSequence(withTiming(POP_SCALE, { duration: 60 }), withTiming(1, { duration: 120 }));
  }, [score, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const digits = String(score).padStart(6, '0');
  const zeros = Math.min(/^0*/.exec(digits)![0].length, digits.length - 1);
  return (
    <Animated.View style={[styles.scoreBox, style]}>
      <Text maxFontSizeMultiplier={1.3} accessibilityLabel={`Score ${score}`} style={styles.score}>
        <Text style={styles.zeros}>{digits.slice(0, zeros)}</Text>
        {digits.slice(zeros)}
      </Text>
    </Animated.View>
  );
}

function Chip({ text, tint, drain }: { readonly text: string; readonly tint: string; readonly drain?: number }) {
  const scale = useSharedValue(drain ?? 0);
  useEffect(() => {
    if (drain === undefined) return;
    scale.value = drain;
    scale.value = withTiming(0, { duration: drain * RAPID_WINDOW_MS });
  }, [drain, scale]);
  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: scale.value }] }));
  return (
    <View accessible accessibilityLabel={`${text} active`} style={[styles.chip, { borderColor: tint }]}>
      <Text maxFontSizeMultiplier={1.3} style={[styles.chipText, { color: tint }]}>{text}</Text>
      {drain === undefined ? null : (
        <View style={styles.drainTrack}>
          <Animated.View style={[styles.drain, { backgroundColor: tint }, bar]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Darkens the top band so hazards passing under the score and buttons stay readable. */
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, experimental_backgroundImage: 'linear-gradient(rgba(5,5,15,0.75), transparent)' },
  root: { position: 'absolute', top: 0, left: 0, right: 0, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  left: { gap: space.xs, flexShrink: 1 },
  scoreBox: { alignSelf: 'flex-start', transformOrigin: 'left center' },
  zeros: { color: color.textDim },
  score: { fontFamily: font.family, fontSize: font.score, fontWeight: '800', color: color.cyan, letterSpacing: 2 },
  livesRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  lives: { flexDirection: 'row', height: 18 },
  slot: { height: 18, overflow: 'visible' },
  vignette: { boxShadow: `inset 0 0 60px ${color.threat}` },
  level: { fontFamily: font.family, fontSize: 13, color: color.textDim, letterSpacing: 2, paddingTop: space.sm },
  pause: { width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: color.cyan, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  pausePressed: { backgroundColor: 'rgba(53,240,255,0.35)' },
  auto: { height: 44, paddingHorizontal: space.sm, borderRadius: 12, borderWidth: 2, borderColor: color.dim, justifyContent: 'center' },
  autoOn: { borderColor: color.yellow, backgroundColor: 'rgba(255,210,63,0.2)' },
  autoText: { fontFamily: font.family, fontSize: 12, fontWeight: '700', letterSpacing: 2, color: color.textDim },
  autoTextOn: { color: color.yellow },
  bar: { width: 5, height: 16, borderRadius: 1, backgroundColor: color.cyan },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: color.green },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: space.sm, paddingVertical: 2 },
  chipText: { fontFamily: font.family, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  drainTrack: { height: 2, marginTop: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  drain: { height: 2, width: '100%', transformOrigin: 'left center' },
  bossBlock: { gap: space.xs },
  bossName: { fontFamily: font.family, fontSize: 11, fontWeight: '800', letterSpacing: 3, color: color.text },
  boss: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  /** A phase threshold: the boss changes attacks once its bar drains to this mark. */
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: color.text },
});
