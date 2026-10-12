import { createAudio, type AudioEngine } from '../audio';

const SILENT: AudioEngine = { events() {}, ui() {}, mix() {}, active() {} };

/**
 * The real engine, or silence while audio.ts is still the skeleton. Only the skeleton's 'not implemented' selects
 * silence, so a real init failure still surfaces. Once audio lands, import createAudio in App.tsx and delete this file.
 */
export function createAudioOrSilent(): AudioEngine {
  try {
    return createAudio();
  } catch (e) {
    if (e instanceof Error && e.message === 'not implemented') return SILENT;
    throw e;
  }
}
