import { Button } from './Button';
import { Panel } from './Panel';
import { color } from './theme';

interface Props {
  readonly onResume: () => void;
  readonly onRetry: () => void;
  readonly onSettings: () => void;
  readonly onQuit: () => void;
  readonly reduceMotion?: boolean;
}

export function Pause({ onResume, onRetry, onSettings, onQuit, reduceMotion }: Props) {
  return (
    <Panel title="PAUSED" reduceMotion={reduceMotion}>
      <Button label="RESUME" onPress={onResume} />
      <Button label="RETRY" tone="ghost" onPress={onRetry} />
      <Button label="SETTINGS" tone="ghost" onPress={onSettings} />
      <Button label="LEVELS" accessibilityLabel="Quit to levels" tone="ghost" ink={color.magenta} onPress={onQuit} />
    </Panel>
  );
}
