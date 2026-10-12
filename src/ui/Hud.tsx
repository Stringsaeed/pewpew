import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View pointerEvents="box-none" style={styles.row}>
        <View style={styles.left}>
          <Text accessibilityLabel={`Score ${hud.score}`} style={styles.score}>{String(hud.score).padStart(6, '0')}</Text>
          <View accessible accessibilityLabel={`Lives ${hud.lives}`} style={styles.lives}>
            {Array.from({ length: hud.lives }, (_, i) => <Rocket key={i} />)}
          </View>
        </View>
        <Text style={styles.level}>{`LV ${level}`}</Text>
        {auto ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Auto"
            accessibilityState={{ checked: auto.on }}
            hitSlop={8}
            onPress={auto.onToggle}
            style={[styles.auto, auto.on && styles.autoOn]}
          >
            <Text style={[styles.autoText, auto.on && styles.autoTextOn]}>AUTO</Text>
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
      <View accessible accessibilityLabel={`Progress ${hud.progress} percent`} style={styles.track}>
        <View style={[styles.fill, { width: `${hud.progress}%` }]} />
      </View>
      <View style={styles.chips}>
        {hud.shield ? <Chip text="SHIELD" tint={color.cyan} /> : null}
        {hud.rapid ? <Chip text="RAPID" tint={color.yellow} /> : null}
      </View>
      {hud.bossHp !== null ? (
        <View accessible accessibilityLabel={`Boss health ${hud.bossHp} percent`} style={[styles.track, styles.boss]}>
          <View style={[styles.fill, { width: `${hud.bossHp}%`, backgroundColor: color.magenta }]} />
        </View>
      ) : null}
    </View>
  );
}

function Chip({ text, tint }: { readonly text: string; readonly tint: string }) {
  return (
    <View accessible accessibilityLabel={`${text} active`} style={[styles.chip, { borderColor: tint }]}>
      <Text style={[styles.chipText, { color: tint }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: inset.top - space.sm, paddingHorizontal: space.md, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  left: { gap: space.xs },
  score: { fontFamily: font.family, fontSize: font.score, fontWeight: '800', color: color.cyan, letterSpacing: 2 },
  lives: { flexDirection: 'row', gap: space.xs, height: 18 },
  level: { fontFamily: font.family, fontSize: font.label, color: color.dim, letterSpacing: 2, paddingTop: space.sm },
  pause: { width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: color.cyan, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  pausePressed: { backgroundColor: 'rgba(53,240,255,0.35)' },
  auto: { height: 44, paddingHorizontal: space.sm, borderRadius: 12, borderWidth: 2, borderColor: color.dim, justifyContent: 'center' },
  autoOn: { borderColor: color.yellow, backgroundColor: 'rgba(255,210,63,0.2)' },
  autoText: { fontFamily: font.family, fontSize: 12, fontWeight: '700', letterSpacing: 2, color: color.dim },
  autoTextOn: { color: color.yellow },
  bar: { width: 5, height: 16, borderRadius: 1, backgroundColor: color.cyan },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: color.green },
  chips: { flexDirection: 'row', gap: space.sm, minHeight: 22 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: space.sm, paddingVertical: 2 },
  chipText: { fontFamily: font.family, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  boss: { height: 10, borderRadius: 5 },
});
