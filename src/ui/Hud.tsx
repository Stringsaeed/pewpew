import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BOSSES, levelSpec, type LevelNumber } from '../levels';
import type { Hud as HudState } from '../sim';
import { Rocket } from './Rocket';
import { color, font, inset, space } from './theme';

interface Props {
  readonly hud: HudState;
  readonly level: number;
  readonly onPause: () => void;
  /** Dev only: the attract-mode toggle. Absent in release. */
  readonly auto?: { readonly on: boolean; readonly onToggle: () => void };
}

export function Hud({ hud, level, onPause, auto }: Props) {
  const bossId = hud.bossHp === null ? null : levelSpec(level as LevelNumber).boss;
  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View pointerEvents="box-none" style={styles.row}>
        <View style={styles.left}>
          <Text maxFontSizeMultiplier={1.3} accessibilityLabel={`Score ${hud.score}`} style={styles.score}>{String(hud.score).padStart(6, '0')}</Text>
          <View style={styles.livesRow}>
            <View accessible accessibilityLabel={`Lives ${hud.lives}`} style={styles.lives}>
              {Array.from({ length: hud.lives }, (_, i) => <Rocket key={i} />)}
            </View>
            {hud.shield ? <Chip text="SHIELD" tint={color.cyan} /> : null}
            {hud.rapid ? <Chip text="RAPID" tint={color.yellow} /> : null}
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
  );
}

function Chip({ text, tint }: { readonly text: string; readonly tint: string }) {
  return (
    <View accessible accessibilityLabel={`${text} active`} style={[styles.chip, { borderColor: tint }]}>
      <Text maxFontSizeMultiplier={1.3} style={[styles.chipText, { color: tint }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: inset.top - space.sm, paddingHorizontal: space.md, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  left: { gap: space.xs, flexShrink: 1 },
  score: { fontFamily: font.family, fontSize: font.score, fontWeight: '800', color: color.cyan, letterSpacing: 2 },
  livesRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  lives: { flexDirection: 'row', gap: space.xs, height: 18 },
  level: { fontFamily: font.family, fontSize: 13, color: color.textDim, letterSpacing: 2, paddingTop: space.sm },
  pause: { width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: color.cyan, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  pausePressed: { backgroundColor: 'rgba(53,240,255,0.35)' },
  auto: { height: 44, paddingHorizontal: space.sm, borderRadius: 12, borderWidth: 2, borderColor: color.dim, justifyContent: 'center' },
  autoOn: { borderColor: color.yellow, backgroundColor: 'rgba(255,210,63,0.2)' },
  autoText: { fontFamily: font.family, fontSize: 12, fontWeight: '700', letterSpacing: 2, color: color.dim },
  autoTextOn: { color: color.yellow },
  bar: { width: 5, height: 16, borderRadius: 1, backgroundColor: color.cyan },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: color.green },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: space.sm, paddingVertical: 2 },
  chipText: { fontFamily: font.family, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  bossBlock: { gap: space.xs },
  bossName: { fontFamily: font.family, fontSize: 11, fontWeight: '800', letterSpacing: 3, color: color.text },
  boss: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  /** A phase threshold: the boss changes attacks once its bar drains to this mark. */
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: color.text },
});
