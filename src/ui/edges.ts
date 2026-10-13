import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from './theme';

/**
 * Safe-area insets with a floor on each edge. The iPhone Duo's outer display reports a zero top inset and puts its
 * camera in an 84 pt right inset, so content needs both a minimum top clearance and the real side insets.
 */
export function useEdges() {
  const i = useSafeAreaInsets();
  return {
    top: Math.max(i.top, space.lg),
    bottom: i.bottom,
    left: Math.max(i.left, space.md),
    right: Math.max(i.right, space.md),
  };
}
