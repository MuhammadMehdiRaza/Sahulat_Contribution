// Small reusable mic button that turns speech into text and hands it back via onText().
// Used for voice-search on Home and voice dictation in Chat (works on web + native).
import React from 'react';
import { TouchableOpacity } from 'react-native';
import Icon from '../Icon';
import { useApp } from '../state';
import { colors } from '../theme';
import { useSpeechInput } from './useSpeechInput';

export default function MicButton({ onText, size = 20, style }: { onText: (text: string) => void; size?: number; style?: any }) {
  const { language, showToast, t } = useApp();
  const speech = useSpeechInput();
  // Voice outputs Urdu script (no reliable Roman-Latin STT), so no mic in Roman-Urdu mode.
  if (language === 'roman_ur') return null;

  const toggle = () => {
    if (speech.recording) { speech.stop(); return; }
    if (!speech.supported) { showToast(t('voiceUnsupported')); return; }
    speech.start(language, {
      onResult: (txt) => onText(txt),
      onError: (code) => showToast(
        code === 'permission' ? t('voiceMicDenied')
          : code === 'empty' || code === 'no-audio' ? t('voiceNoSpeech')
          : code === 'demo' ? t('voiceUnavailableLang')
          : code === 'unsupported' ? t('voiceUnsupported')
          : t('voiceError'),
      ),
    });
  };

  return (
    <TouchableOpacity onPress={toggle} style={style} accessibilityRole="button" accessibilityLabel={t('voiceTapSpeak')}>
      <Icon name={speech.recording ? 'stop' : 'mic'} size={size} color={speech.recording ? colors.red : colors.green} />
    </TouchableOpacity>
  );
}
