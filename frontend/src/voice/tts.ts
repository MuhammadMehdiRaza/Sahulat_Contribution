// Text-to-speech for the spoken replies (BO-4's "voice output"). Uses expo-speech, which is
// keyless and works on native (system TTS) and web (speechSynthesis). Same import on both platforms.
import * as Speech from 'expo-speech';

let voiceChecked = false;
let urduVoiceAvailable = true;

async function hasUrduVoice(): Promise<boolean> {
  if (voiceChecked) return urduVoiceAvailable;
  voiceChecked = true;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    // Unknown/empty list -> attempt anyway; otherwise require an actual Urdu voice.
    urduVoiceAvailable = !voices || voices.length === 0
      ? true
      : voices.some((v) => (v.language || '').toLowerCase().startsWith('ur'));
  } catch {
    urduVoiceAvailable = true;
  }
  return urduVoiceAvailable;
}

export function stopSpeaking() {
  try { Speech.stop(); } catch { /* nothing playing */ }
}

/** Speak `text` in `ttsLang` (BCP-47, e.g. 'ur-PK' | 'en-US'). Never throws; degrades to silence. */
export async function speak(text: string, ttsLang: string) {
  if (!text) return;
  stopSpeaking();
  const isUrdu = (ttsLang || '').toLowerCase().startsWith('ur');
  // If no Urdu voice is installed, skip speaking (the on-screen reply still shows) rather than
  // mangling Urdu script through an English voice.
  if (isUrdu && !(await hasUrduVoice())) return;
  try { Speech.speak(text, { language: ttsLang || 'en-US' }); } catch { /* ignore */ }
}
