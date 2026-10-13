import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { loadSave, writeSave, type Save } from '../save';

/** Loads the save once. `commitSave` updates the ref, the React state, and storage, and skips a write when the object is unchanged. */
export function useSave(): {
  readonly save: Save | null;
  readonly saveRef: RefObject<Save | null>;
  readonly commitSave: (next: Save) => void;
} {
  const saveRef = useRef<Save | null>(null);
  const [save, setSave] = useState<Save | null>(null);
  const commitSave = useCallback((next: Save) => {
    if (next === saveRef.current) return;
    saveRef.current = next;
    setSave(next);
    void writeSave(next);
  }, []);

  useEffect(() => {
    let alive = true;
    void loadSave().then((s) => {
      if (!alive) return;
      saveRef.current = s;
      setSave(s);
    });
    return () => { alive = false; };
  }, []);

  return { save, saveRef, commitSave };
}
