import { StyleSheet, Switch, Text, View } from 'react-native';
import { Button } from './Button';
import { Panel } from './Panel';
import { color, font, space } from './theme';

interface Props {
  readonly music: boolean;
  readonly sfx: boolean;
  readonly onMusic: (on: boolean) => void;
  readonly onSfx: (on: boolean) => void;
  readonly onBack: () => void;
}

export function Settings({ music, sfx, onMusic, onSfx, onBack }: Props) {
  return (
    <Panel title="SETTINGS">
      <Row label="MUSIC" value={music} onChange={onMusic} />
      <Row label="SFX" value={sfx} onChange={onSfx} />
      <Button label="BACK" tone="ghost" onPress={onBack} />
    </Panel>
  );
}

function Row({ label, value, onChange }: { readonly label: string; readonly value: boolean; readonly onChange: (on: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: color.dim, true: color.cyan }}
        thumbColor={color.text}
        ios_backgroundColor={color.dim}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: space.sm },
  label: { fontFamily: font.family, fontSize: 18, fontWeight: '700', letterSpacing: 3, color: color.text },
});
