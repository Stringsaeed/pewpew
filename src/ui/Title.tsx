import { StyleSheet, Text, View } from 'react-native';
import type { Save } from '../save';
import { Button } from './Button';
import { color, font, space } from './theme';

const GLOW_PAD = 16;

interface Props {
  readonly save: Save;
  readonly onPlay: () => void;
  readonly onSettings: () => void;
}

export function Title({ save, onPlay, onSettings }: Props) {
  const total = save.levels.reduce((sum, r) => sum + r.stars, 0);
  return (
    <View style={styles.root}>
      <View style={styles.logoBlock}>
        <View style={styles.logoBox}>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.logo, styles.logoGhost]}>PEWPEW</Text>
          <Text accessibilityRole="header" accessibilityLabel="PEWPEW" style={styles.logo}>PEWPEW</Text>
        </View>
        <Text style={styles.tag}>30 LEVELS. 3 BOSSES.</Text>
      </View>
      <View style={styles.actions}>
        <Button label="PLAY" onPress={onPlay} />
        <Button label="SETTINGS" tone="ghost" onPress={onSettings} />
      </View>
      <Text accessibilityLabel={`Best total stars ${total} of ${save.levels.length * 3}`} style={styles.total}>
        {`BEST TOTAL  ★ ${total} / ${save.levels.length * 3}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingTop: 140, paddingBottom: 90 },
  logoBlock: { alignItems: 'center', gap: space.sm },
  /** Padding gives the text shadow room so it is not clipped to the glyph box; the negative margin cancels it in layout. */
  logoBox: { margin: -GLOW_PAD },
  logo: {
    padding: GLOW_PAD,
    fontFamily: font.family, fontSize: font.hero, fontWeight: '900', letterSpacing: 6, color: color.cyan,
    textShadowColor: color.cyan, textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 },
  },
  /** The magenta copy sits 3 px down-left behind the cyan logo for a chromatic split. */
  logoGhost: { position: 'absolute', top: 0, left: 0, color: color.magenta, textShadowColor: color.magenta, transform: [{ translateX: -3 }, { translateY: 3 }] },
  tag: { fontFamily: font.family, fontSize: font.label, letterSpacing: 4, color: color.magenta },
  actions: { gap: space.md },
  total: { fontFamily: font.family, fontSize: font.body, letterSpacing: 2, color: color.yellow },
});
