import { StyleSheet, View } from 'react-native';
import { color } from './theme';

/** A gear built from views, like Rocket and Lock, so the header needs no icon asset. */
export function Gear({ size = 22, tint = color.textDim }: { readonly size?: number; readonly tint?: string }) {
  const tooth = Math.max(3, Math.round(size * 0.2));
  const body = Math.round(size * 0.68);
  const hole = Math.round(size * 0.26);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {[0, 45, 90, 135].map((deg) => (
        <View
          key={deg}
          style={[styles.abs, { width: tooth, height: size, borderRadius: 1, backgroundColor: tint, transform: [{ rotate: `${deg}deg` }] }]}
        />
      ))}
      <View style={{ width: body, height: body, borderRadius: body / 2, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: hole, height: hole, borderRadius: hole / 2, backgroundColor: color.bg }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ abs: { position: 'absolute' } });
