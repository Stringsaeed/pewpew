import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, font, space } from './theme';

export function Panel({ title, tint = color.cyan, children }: { readonly title: string; readonly tint?: string; readonly children: ReactNode }) {
  return (
    <View style={styles.scrim}>
      <View style={[styles.panel, { borderColor: tint }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: tint }]}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.scrim, alignItems: 'center', justifyContent: 'center' },
  panel: { backgroundColor: color.panel, borderWidth: 2, borderRadius: 20, paddingVertical: space.lg, paddingHorizontal: space.lg, alignItems: 'center', gap: space.md, minWidth: 300 },
  title: { fontFamily: font.family, fontSize: font.title, fontWeight: '900', letterSpacing: 5 },
});
