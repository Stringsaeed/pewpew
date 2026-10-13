import { StyleSheet, Text } from 'react-native';
import { Button } from './Button';
import { Panel } from './Panel';
import { color, font, space } from './theme';

interface Props {
  readonly level: number;
  readonly score: number;
  /** The best score for this level. // TODO(W3): App passes save.levels[level - 1].best; absent hides the line. */
  readonly best?: number;
  readonly onRetry: () => void;
  readonly onLevels: () => void;
}

export function GameOver({ level, score, best, onRetry, onLevels }: Props) {
  return (
    <Panel title="GAME OVER" tint={color.magenta} shake>
      <Text style={styles.sub}>{`LEVEL ${level}`}</Text>
      <Text accessibilityLabel={`Score ${score}`} style={styles.score}>{String(score).padStart(6, '0')}</Text>
      {best !== undefined ? <Text style={styles.sub}>{`BEST ${best}`}</Text> : null}
      <Button label="RETRY" onPress={onRetry} />
      <Button label="LEVELS" tone="ghost" onPress={onLevels} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  sub: { fontFamily: font.family, fontSize: font.label, letterSpacing: 4, color: color.textDim },
  score: { fontFamily: font.family, fontSize: 36, fontWeight: '800', letterSpacing: 3, color: color.text, marginBottom: space.sm },
});
