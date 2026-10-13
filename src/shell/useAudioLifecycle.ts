import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { AudioEngine } from '../audio';
import type { Save } from '../save';

/**
 * Foreground tracking, menu music, and the save's mix toggles.
 * Backgrounding suspends audio immediately and asks the shell to pause a live run.
 */
export function useAudioLifecycle(
  audio: AudioEngine,
  suspended: boolean,
  onMenu: boolean,
  save: Save | null,
  onBackground: () => void,
): void {
  const foreground = useRef(true);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const onBackgroundRef = useRef(onBackground);
  onBackgroundRef.current = onBackground;

  useEffect(() => {
    audio.active(foreground.current && !suspended);
    if (onMenu) audio.ui('menu-music');
  }, [audio, suspended, onMenu]);

  useEffect(() => {
    if (save) audio.mix({ music: save.music, sfx: save.sfx });
  }, [audio, save?.music, save?.sfx]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      foreground.current = state === 'active';
      if (!foreground.current) {
        audio.active(false);
        onBackgroundRef.current();
      } else {
        audio.active(!suspendedRef.current);
      }
    });
    return () => sub.remove();
  }, [audio]);
}
