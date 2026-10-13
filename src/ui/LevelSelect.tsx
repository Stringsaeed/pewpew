import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LEVELS, tierOf, type BossId, type LevelNumber } from '../levels';
import { isUnlocked, type Save } from '../save';
import { Button } from './Button';
import { useEdges } from './edges';
import { Gear } from './Gear';
import { color, font, space } from './theme';

const COLUMNS = 5;
const FADE_MS = 160;
const STAGGER_MS = 12;
const STAGGER_CAP_MS = 300;
const GAP = space.sm;
const TIERS = [1, 2, 3] as const;
/** Nebula tints from the audit: each tier's header band and divider. */
const TIER_TINT = { 1: '#2a1450', 2: '#0c3a44', 3: '#3e0c22' } as const;
const TIER_LINE = { 1: '#7a46d6', 2: '#2aa6bf', 3: '#d63a76' } as const;
const BOSS_NAME: Record<BossId, string> = { warden: 'WARDEN', hive: 'HIVE', core: 'CORE' };

interface Props {
  readonly save: Save;
  readonly onPick: (n: LevelNumber) => void;
  readonly onBack: () => void;
  readonly onSettings: () => void;
}

export function LevelSelect({ save, onPick, onBack, onSettings }: Props) {
  const { width } = useWindowDimensions();
  const edges = useEdges();
  /** The first open level without stars: the one the player should tap next. */
  const next = LEVELS.find((l) => isUnlocked(save, l.n) && save.levels[l.n - 1].stars === 0)?.n;
  const tile = (width - edges.left - edges.right - GAP * (COLUMNS - 1)) / COLUMNS;
  const sides = { paddingLeft: edges.left, paddingRight: edges.right };
  return (
    <Animated.View entering={FadeIn.duration(FADE_MS)} exiting={FadeOut.duration(FADE_MS)} style={[styles.root, { paddingTop: edges.top }]}>
      <View style={[styles.header, sides]}>
        <Button label="BACK" tone="ghost" onPress={onBack} style={styles.small} hitSlop={6} />
        <Text accessibilityRole="header" style={styles.title}>LEVELS</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={6}
          onPress={onSettings}
          style={({ pressed }) => [styles.gear, pressed && styles.gearPressed]}
        >
          {({ pressed }) => <Gear tint={pressed ? color.bg : color.textDim} />}
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: edges.bottom + space.lg }]} showsVerticalScrollIndicator={false}>
        {TIERS.map((tier) => {
          const specs = LEVELS.filter((l) => tierOf(l.n) === tier);
          const earned = specs.reduce((sum, l) => sum + save.levels[l.n - 1].stars, 0);
          return (
            <View key={tier} style={styles.tier}>
              <View
                accessible
                accessibilityRole="header"
                accessibilityLabel={`Sector ${tier}, ${earned} of ${specs.length * 3} stars`}
                style={[styles.band, sides, { backgroundColor: TIER_TINT[tier], borderBottomColor: TIER_LINE[tier] }]}
              >
                <Text maxFontSizeMultiplier={1.3} style={styles.bandText}>{`SECTOR ${tier}`}</Text>
                <Text maxFontSizeMultiplier={1.3} style={styles.bandStars}>{`★ ${earned}/${specs.length * 3}`}</Text>
              </View>
              <View style={[styles.grid, sides]}>
                {specs.map((spec) => {
                  const rec = save.levels[spec.n - 1];
                  return (
                    <Tile
                      key={spec.n} n={spec.n} size={tile} stars={rec.stars} best={rec.best}
                      open={isUnlocked(save, spec.n)} next={spec.n === next} boss={spec.boss} onPick={onPick}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

interface TileProps {
  readonly n: LevelNumber; readonly size: number; readonly stars: number; readonly best: number;
  readonly open: boolean; readonly next: boolean; readonly boss: BossId | null; readonly onPick: (n: LevelNumber) => void;
}

function Tile({ n, size, stars, best, open, next, boss, onPick }: TileProps) {
  const accent = boss !== null ? color.magenta : color.cyan;
  const label = `Level ${n}${boss !== null ? `, boss ${BOSS_NAME[boss]}` : ''}, ${open ? `${stars} of 3 stars${best > 0 ? `, best ${best}` : ''}` : 'locked'}`;
  return (
    <Animated.View entering={FadeIn.duration(FADE_MS).delay(Math.min((n - 1) * STAGGER_MS, STAGGER_CAP_MS))}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !open }}
        onPress={open ? () => onPick(n) : undefined}
        style={({ pressed }) => [
          styles.tile,
          {
            width: size, height: size * 1.15,
            borderColor: open ? accent : color.dim,
            borderStyle: open ? 'solid' : 'dashed',
            backgroundColor: pressed && open ? accent : 'rgba(255,255,255,0.04)',
            transform: [{ scale: pressed && open ? 0.95 : 1 }],
          },
        ]}
      >
        <Text maxFontSizeMultiplier={1.3} style={[styles.num, { color: open ? accent : color.textDim }]}>{n}</Text>
        {boss !== null ? <Text maxFontSizeMultiplier={1.3} style={[styles.bossName, { color: open ? accent : color.textDim }]}>{BOSS_NAME[boss]}</Text> : null}
        {open ? (
          <Text maxFontSizeMultiplier={1.3} style={styles.stars}>
            <Text maxFontSizeMultiplier={1.3} style={styles.earned}>{'★'.repeat(stars)}</Text>
            <Text maxFontSizeMultiplier={1.3} style={styles.empty}>{'☆'.repeat(3 - stars)}</Text>
          </Text>
        ) : <Lock />}
        {next ? <Pulse tint={accent} /> : null}
      </Pressable>
    </Animated.View>
  );
}

/** A slow glow ring over the next playable tile. */
function Pulse({ tint }: { readonly tint: string }) {
  const v = useSharedValue(0.2);
  useEffect(() => {
    v.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View pointerEvents="none" style={[styles.pulse, { borderColor: tint, boxShadow: `0 0 14px ${tint}b3` }, style]} />;
}

function Lock() {
  return (
    <View style={styles.lock}>
      <View style={styles.shackle} />
      <View style={styles.lockBody} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: space.md },
  title: { fontFamily: font.family, fontSize: font.title, fontWeight: '800', letterSpacing: 4, color: color.cyan },
  gear: { width: 44, height: 44, borderRadius: 14, borderWidth: 2, borderColor: color.dim, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center' },
  gearPressed: { backgroundColor: color.dim },
  small: { minWidth: 0, minHeight: 44, justifyContent: 'center', paddingVertical: space.sm, paddingHorizontal: space.md },
  content: { gap: space.md },
  tier: { gap: space.sm },
  band: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: 1 },
  bandText: { fontFamily: font.family, fontSize: font.body, fontWeight: '800', letterSpacing: 4, color: color.text },
  bandStars: { fontFamily: font.family, fontSize: font.body, fontWeight: '700', letterSpacing: 2, color: color.yellow },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  bossName: { fontFamily: font.family, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  tile: { borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 2 },
  num: { fontFamily: font.family, fontSize: 20, fontWeight: '800' },
  stars: { fontFamily: font.family, fontSize: 13, letterSpacing: 1 },
  earned: { color: color.yellow },
  empty: { color: color.dim },
  pulse: { position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, borderRadius: 12, borderWidth: 2 },
  lock: { alignItems: 'center', height: 16, justifyContent: 'flex-end' },
  shackle: { width: 9, height: 7, borderWidth: 2, borderBottomWidth: 0, borderTopLeftRadius: 5, borderTopRightRadius: 5, borderColor: color.textDim },
  lockBody: { width: 14, height: 9, borderRadius: 2, backgroundColor: color.textDim },
});
