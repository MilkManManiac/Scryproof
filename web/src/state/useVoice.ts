/*
 * The live call, as a React value. The snapshot comes from the one
 * VoiceSession the store owns; every panel that paints call state (the
 * voice view, the channel list, the member list) reads it through here so
 * they never disagree about who is speaking.
 */

import { useSyncExternalStore } from 'react';

import type { VoiceSnapshot } from '../lib/voice-session';
import { useStore } from './store';

export function useVoice(): VoiceSnapshot {
  const { voice } = useStore();
  return useSyncExternalStore(voice.subscribe, voice.getSnapshot);
}
