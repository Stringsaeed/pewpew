import { Button } from './Button';
import { Panel } from './Panel';

interface Props {
  readonly onResume: () => void;
  readonly onRetry: () => void;
  readonly onSettings: () => void;
  readonly onQuit: () => void;
}

export function Pause({ onResume, onRetry, onSettings, onQuit }: Props) {
  return (
    <Panel title="PAUSED">
      <Button label="RESUME" onPress={onResume} />
      <Button label="RETRY" tone="ghost" onPress={onRetry} />
      <Button label="SETTINGS" tone="ghost" onPress={onSettings} />
      <Button label="LEVELS" accessibilityLabel="Quit to levels" tone="danger" onPress={onQuit} />
    </Panel>
  );
}
