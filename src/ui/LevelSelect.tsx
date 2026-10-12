import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LEVELS, type LevelNumber } from '../levels';
import { isUnlocked, type Save } from '../save';
import { Button } from './Button';
import { color, font, inset, space } from './theme';

const COLUMNS = 5;
const GAP = space.sm;
const SIDE = space.md;

interface Props {
  readonly save: Save;
  readonly onPick: (n: LevelNumber) => void;
  readonly onBack: () => void;
  readonly onSettings: () => void;
}

export function LevelSelect({ save, onPick, onBack, onSettings }: Props) {
  const { width } = useWindowDimensions();
  const tile = (width - SIDE * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Button label="BACK" tone="ghost" onPress={onBack} style={styles.small} />
        <Text accessibilityRole="header" style={styles.title}>LEVELS</Text>
        <Button label="SET" accessibilityLabel="Settings" tone="ghost" onPress={onSettings} style={styles.small} />
      </View>
      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {LEVELS.map((spec) => {
          const rec = save.levels[spec.n - 1];
          const open = isUnlocked(save, spec.n);
          return <Tile key={spec.n} n={spec.n} size={tile} stars={rec.stars} best={rec.best} open={open} boss={spec.boss !== null} onPick={onPick} />;
        })}
      </ScrollView>
    </View>
  );
}

interface TileProps {
  readonly n: LevelNumber; readonly size: number; readonly stars: number; readonly best: number;
  readonly open: boolean; readonly boss: boolean; readonly onPick: (n: LevelNumber) => void;
}

function Tile({ n, size, stars, best, open, boss, onPick }: TileProps) {
  const accent = boss ? color.magenta : color.cyan;
  const label = `Level ${n}${boss ? ', boss' : ''}, ${open ? `${stars} of 3 stars${best > 0 ? `, best ${best}` : ''}` : 'locked'}`;
  return (
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
          backgroundColor: pressed && open ? accent : 'rgba(255,255,255,0.04)',
          opacity: open ? 1 : 0.45,
          transform: [{ scale: pressed && open ? 0.95 : 1 }],
        },
      ]}
    >
      <Text maxFontSizeMultiplier={1.3} style={[styles.num, { color: open ? accent : color.dim }]}>{n}</Text>
      {open ? (
        <Text maxFontSizeMultiplier={1.3} style={styles.stars}>
          <Text maxFontSizeMultiplier={1.3} style={styles.earned}>{'★'.repeat(stars)}</Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.empty}>{'☆'.repeat(3 - stars)}</Text>
        </Text>
      ) : <Lock />}
    </Pressable>
  );
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
  root: { flex: 1, paddingTop: inset.top },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SIDE, paddingBottom: space.md },
  title: { fontFamily: font.family, fontSize: font.title, fontWeight: '800', letterSpacing: 4, color: color.cyan },
  small: { minWidth: 0, paddingVertical: space.sm, paddingHorizontal: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: SIDE, paddingBottom: inset.bottom + space.lg },
  tile: { borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 2 },
  num: { fontFamily: font.family, fontSize: 20, fontWeight: '800' },
  stars: { fontFamily: font.family, fontSize: 13, letterSpacing: 1 },
  earned: { color: color.yellow },
  empty: { color: color.dim },
  lock: { alignItems: 'center', height: 16, justifyContent: 'flex-end' },
  shackle: { width: 9, height: 7, borderWidth: 2, borderBottomWidth: 0, borderTopLeftRadius: 5, borderTopRightRadius: 5, borderColor: color.dim },
  lockBody: { width: 14, height: 9, borderRadius: 2, backgroundColor: color.dim },
});
