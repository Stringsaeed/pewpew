import { StyleSheet, View } from 'react-native';
import { color } from './theme';

/** A small rocket built from views, so lives need no image asset. */
export function Rocket({ size = 18, tint = color.cyan }: { readonly size?: number; readonly tint?: string }) {
  const w = size * 0.5;
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View style={[styles.nose, { borderBottomWidth: size * 0.38, borderLeftWidth: w / 2, borderRightWidth: w / 2, borderBottomColor: tint }]} />
      <View style={{ width: w, height: size * 0.5, backgroundColor: tint }} />
      <View style={[styles.fin, { left: 0, width: w / 2, height: size * 0.3, backgroundColor: color.magenta }]} />
      <View style={[styles.fin, { right: 0, width: w / 2, height: size * 0.3, backgroundColor: color.magenta }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  nose: { width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  fin: { position: 'absolute', bottom: 0 },
});
