import { StyleSheet, Text } from 'react-native';
import { Button } from './Button';
import { Panel } from './Panel';
import { color, font, space } from './theme';

interface Props {
  readonly level: number;
  readonly score: number;
  readonly onRetry: () => void;
  readonly onLevels: () => void;
}

export function GameOver({ level, score, onRetry, onLevels }: Props) {
  return (
    <Panel title="GAME OVER" tint={color.magenta}>
      <Text style={styles.sub}>{`LEVEL ${level}`}</Text>
      <Text accessibilityLabel={`Score ${score}`} style={styles.score}>{String(score).padStart(6, '0')}</Text>
      <Button label="RETRY" onPress={onRetry} />
      <Button label="LEVELS" tone="ghost" onPress={onLevels} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  sub: { fontFamily: font.family, fontSize: font.label, letterSpacing: 4, color: color.textDim },
  score: { fontFamily: font.family, fontSize: 36, fontWeight: '800', letterSpacing: 3, color: color.text, marginBottom: space.sm },
});
