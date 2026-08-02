// Speech-to-text on the NATIVE build (Expo Go / device): record audio with expo-audio, encode to
// base64, and POST it to the backend /voice/transcribe endpoint (offline faster-whisper). No
// browser APIs. Metro resolves this file on native; web uses useSpeechInput.ts.
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';
import { useCallback, useRef, useState } from 'react';
import { api } from '../api';
import type { Lang } from '../i18n';
import type { SpeechCallbacks, SpeechInput } from './types';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1] ?? 0, b2 = bytes[i + 2] ?? 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}

async function toBase64(uri: string): Promise<string> {
  // Primary: the new expo-file-system File (Blob) API + a self-contained encoder.
  try {
    const buf = await new File(uri).arrayBuffer();
    return bytesToBase64(new Uint8Array(buf));
  } catch { /* fall through */ }
  // Fallback: the legacy readAsStringAsync base64 reader.
  try {
    const legacy: any = require('expo-file-system/legacy');
    return await legacy.readAsStringAsync(uri, { encoding: 'base64' });
  } catch { return ''; }
}

export function useSpeechInput(): SpeechInput {
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);  // small payload for short commands
  const [recording, setRecording] = useState(false);
  const cbsRef = useRef<SpeechCallbacks | null>(null);
  const langRef = useRef<Lang>('en');

  const start = useCallback(async (lang: Lang, cbs: SpeechCallbacks) => {
    cbsRef.current = cbs;
    langRef.current = lang;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) { cbs.onError('permission'); return; }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (e: any) {
      setRecording(false);
      cbs.onError(e?.message || 'record-failed');
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    if (!recording) return;
    setRecording(false);
    const cbs = cbsRef.current;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) { cbs?.onError('no-audio'); return; }
      const b64 = await toBase64(uri);
      if (!b64) { cbs?.onError('no-audio'); return; }
      const sttLang = langRef.current === 'en' ? 'en' : 'ur';
      const r = await api.voiceTranscribe({ voice_b64: b64, lang: sttLang });
      const text = (r?.text || '').trim();
      if (text) cbs?.onResult(text);
      else cbs?.onError('empty');
    } catch (e: any) {
      cbs?.onError(e?.message || 'stt-failed');
    }
  }, [recorder, recording]);

  return { recording, supported: true, start, stop };
}
